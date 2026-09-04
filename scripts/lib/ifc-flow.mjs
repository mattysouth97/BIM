// scripts/lib/ifc-flow.mjs
//
// The routed service network, as a DIRECTED graph, taken from what the model
// states rather than from what a plausible building would do.
//
// IFC carries connectivity in ports: every distribution element owns
// `IfcDistributionPort`s (`IfcRelConnectsPortToElement`), and a connection is
// an `IfcRelConnectsPorts` joining two of them. Each port declares a
// `FlowDirection` — SOURCE, SINK or SOURCEANDSINK — so a SOURCE→SINK pair is a
// direction the model asserts, not one inferred from geometry.
//
// What the Clinic's three discipline models actually contain, measured:
//
//   HVAC        7,390 ports, 3,695 SOURCE + 3,695 SINK -> 3,695 directed
//               edges, zero ambiguous, zero unresolved. A complete air network.
//   Plumbing    13,058 ports, 11,150 of them SOURCEANDSINK. Only 954 of its
//               6,529 connections carry a direction; the model declares the
//               pipe runs bidirectional and nothing here overrules it.
//   Electrical  NO ports at all, zero connections. There is no circuit
//               topology in that file — it is panelboards and fixtures as
//               placed objects, and this module cannot invent one.
//
// That spread is the point. Flow is worth drawing only where direction is
// sourced; where it is not, the honest output is fewer lines and a stated
// reason, which is what `bidirectionalEdges` and `reason` carry to the UI.

const SOURCE = "SOURCE";
const SINK = "SINK";

/** Unwrap web-ifc's `{ value }` boxes, including the reference form. */
const unwrap = (v) =>
  v && typeof v === "object" && "value" in v ? v.value : (v ?? null);

/**
 * Bounding-box centres for a set of elements, in world metres.
 *
 * One streaming pass keeping only min/max: the plumbing model tessellates to
 * 3.2M triangles and 238 MB, so nothing here may retain vertices.
 */
function elementCentres(api, wanted, modelID) {
  const centres = new Map();
  api.StreamAllMeshes(modelID, (mesh) => {
    if (!wanted.has(mesh.expressID)) return;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const placed = mesh.geometries;
    for (let i = 0; i < placed.size(); i += 1) {
      const part = placed.get(i);
      const geometry = api.GetGeometry(modelID, part.geometryExpressID);
      const verts = api.GetVertexArray(
        geometry.GetVertexData(),
        geometry.GetVertexDataSize(),
      );
      const m = part.flatTransformation;
      for (let v = 0; v < verts.length; v += 6) {
        const x = verts[v];
        const y = verts[v + 1];
        const z = verts[v + 2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (wx < min[0]) min[0] = wx;
        if (wx > max[0]) max[0] = wx;
        if (wy < min[1]) min[1] = wy;
        if (wy > max[1]) max[1] = wy;
        if (wz < min[2]) min[2] = wz;
        if (wz > max[2]) max[2] = wz;
      }
    }
    if (!Number.isFinite(min[0])) return;
    centres.set(mesh.expressID, [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
  });
  return centres;
}

/**
 * Read the directed service network out of one discipline model.
 *
 * Returns a network with no segments — and a `reason` — when the model states
 * no usable connectivity. That is a real answer about the file, not an error:
 * the Clinic's electrical model is exactly that case, and reporting it is more
 * informative than drawing a network nobody authored.
 */
export function collectFlowNetwork(api, webIfc, modelID) {
  const portToElement = new Map();
  const relIds = api.GetLineIDsWithType(
    modelID,
    webIfc.IFCRELCONNECTSPORTTOELEMENT,
  );
  for (let i = 0; i < relIds.size(); i += 1) {
    const rel = api.GetLine(modelID, relIds.get(i), false);
    portToElement.set(unwrap(rel.RelatingPort), unwrap(rel.RelatedElement));
  }

  const portDirection = new Map();
  const portIds = api.GetLineIDsWithType(modelID, webIfc.IFCDISTRIBUTIONPORT);
  for (let i = 0; i < portIds.size(); i += 1) {
    const port = api.GetLine(modelID, portIds.get(i), false);
    portDirection.set(portIds.get(i), String(unwrap(port.FlowDirection)));
  }

  const edges = [];
  let bidirectional = 0;
  let unresolved = 0;
  const connIds = api.GetLineIDsWithType(modelID, webIfc.IFCRELCONNECTSPORTS);
  for (let i = 0; i < connIds.size(); i += 1) {
    const rel = api.GetLine(modelID, connIds.get(i), false);
    const a = unwrap(rel.RelatingPort);
    const b = unwrap(rel.RelatedPort);
    const ea = portToElement.get(a);
    const eb = portToElement.get(b);
    if (!ea || !eb || ea === eb) {
      unresolved += 1;
      continue;
    }
    const da = portDirection.get(a);
    const db = portDirection.get(b);
    if (da === SOURCE && db === SINK) edges.push([ea, eb]);
    else if (da === SINK && db === SOURCE) edges.push([eb, ea]);
    // Anything else — overwhelmingly SOURCEANDSINK at both ends — is a
    // connection the model declines to give a direction. Counted, not drawn.
    else bidirectional += 1;
  }

  const base = {
    portCount: portIds.size(),
    connectionCount: connIds.size(),
    directedEdges: edges.length,
    bidirectionalEdges: bidirectional,
    unresolvedConnections: unresolved,
  };

  if (edges.length === 0) {
    return {
      ...base,
      nodes: [],
      nodeTypes: [],
      edges: [],
      drawnEdges: 0,
      ungeometried: 0,
      reason:
        portIds.size() === 0
          ? "The model declares no distribution ports, so it states no network to trace."
          : "Every connection the model declares is bidirectional, so it states no direction of flow.",
    };
  }

  const wanted = new Set(edges.flatMap(([a, b]) => [a, b]));
  const centres = elementCentres(api, wanted, modelID);

  // Element type per node, so supply can be told from return by where a path
  // BEGINS rather than by reading duct names.
  const typeOf = new Map();
  for (const id of wanted) {
    const line = api.GetLine(modelID, id, false);
    typeOf.set(id, line ? api.GetNameFromTypeCode(line.type) : "?");
  }

  const placed = [...wanted].filter((id) => centres.has(id));
  const indexOf = new Map(placed.map((id, i) => [id, i]));
  const kept = edges.filter(([a, b]) => indexOf.has(a) && indexOf.has(b));

  return {
    ...base,
    nodes: placed.map((id) => centres.get(id)),
    nodeTypes: placed.map((id) => typeOf.get(id)),
    edges: kept.map(([a, b]) => [indexOf.get(a), indexOf.get(b)]),
    drawnEdges: kept.length,
    // Elements the connectivity names but the geometry stream never placed.
    // Reported rather than absorbed: a rise here means the two halves of the
    // extraction have started to disagree about what is in the model.
    ungeometried: edges.length - kept.length,
    reason: null,
  };
}

/**
 * Distance along the network from the nearest origin, and which kind of origin
 * it was.
 *
 * The shader's `lineProgress` is that distance in metres divided by a fixed
 * wavelength, so pulse spacing is a physical length rather than a fraction of
 * the building. Two buildings of different sizes then animate at the same
 * apparent speed, and a long duct run reads as long.
 *
 * Supply and return are separated by REACHABILITY FROM PLANT, not by which
 * root a run happens to start at. An air system is a loop — return grille →
 * duct → air handling unit → duct → supply diffuser — so the whole thing is
 * one connected directed graph, and 205 return grilles sitting upstream as
 * roots swamp 6 fans if you propagate from the nearest root instead. That
 * first attempt labelled 3,674 of 3,695 segments "return", which is the kind
 * of wrong that still renders beautifully.
 *
 * Downstream of a fan or pump is supply; everything else is on its way back.
 * Both the direction and the plant are things the model states, so this
 * survives a model that names its ducts differently — or, as here, declares no
 * systems at all.
 */
export function annotateFlow(network, { wavelengthM = 26 } = {}) {
  const { nodes, edges, nodeTypes } = network;
  if (!nodes.length || !edges.length) {
    return { ...network, segments: [], supplySegments: 0, returnSegments: 0, relaxationCapHit: false, unreachedEdges: 0, plantNodes: 0 };
  }

  const outgoing = new Map();
  const indegree = new Array(nodes.length).fill(0);
  for (const [a, b] of edges) {
    if (!outgoing.has(a)) outgoing.set(a, []);
    outgoing.get(a).push(b);
    indegree[b] += 1;
  }

  const PLANT = new Set([
    "IfcFlowMovingDevice",
    "IfcEnergyConversionDevice",
    "IfcFlowStorageDevice",
    "IfcFlowTreatmentDevice",
  ]);

  // Supply first, as its own forward sweep from every plant item.
  const supply = new Array(nodes.length).fill(false);
  const plantQueue = [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (PLANT.has(nodeTypes[i])) plantQueue.push(i);
  }
  const plantCount = plantQueue.length;
  while (plantQueue.length) {
    const a = plantQueue.pop();
    for (const b of outgoing.get(a) ?? []) {
      if (supply[b]) continue;
      supply[b] = true;
      plantQueue.push(b);
    }
  }

  const distance = new Array(nodes.length).fill(Infinity);
  const queue = [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (indegree[i] !== 0) continue;
    distance[i] = 0;
    queue.push(i);
  }

  const length = (a, b) =>
    Math.hypot(
      nodes[a][0] - nodes[b][0],
      nodes[a][1] - nodes[b][1],
      nodes[a][2] - nodes[b][2],
    );

  // The graph is a forest of routed runs, so a plain relaxation sweep settles
  // it. The visit cap is a cycle guard, not a tuning knob — a real network can
  // contain a ring main, and an unguarded relaxation on one never terminates.
  let visits = 0;
  const cap = edges.length * 8 + nodes.length * 8;
  while (queue.length && visits < cap) {
    const a = queue.shift();
    visits += 1;
    for (const b of outgoing.get(a) ?? []) {
      const via = distance[a] + length(a, b);
      if (via < distance[b] - 1e-6) {
        distance[b] = via;
        queue.push(b);
      }
    }
  }

  const segments = [];
  let unreached = 0;
  for (const [a, b] of edges) {
    if (!Number.isFinite(distance[a]) || !Number.isFinite(distance[b])) {
      unreached += 1;
      continue;
    }
    segments.push({
      a: nodes[a],
      b: nodes[b],
      pa: distance[a] / wavelengthM,
      pb: distance[b] / wavelengthM,
      supply: supply[b] ? 1 : 0,
    });
  }

  return {
    ...network,
    segments,
    wavelengthM,
    plantNodes: plantCount,
    relaxationCapHit: visits >= cap,
    unreachedEdges: unreached,
    supplySegments: segments.filter((s) => s.supply === 1).length,
    returnSegments: segments.filter((s) => s.supply === 0).length,
  };
}

/**
 * The compact wire form.
 *
 * Coordinates round to the millimetre and progress to 1e-4 of a wavelength:
 * this is a committed artifact a browser fetches, and full float64 text would
 * multiply its size for precision no pixel can show.
 */
export function serialiseFlow(annotated) {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const r4 = (n) => Math.round(n * 10000) / 10000;
  return {
    kind: "bimfit_flow_network",
    schemaVersion: 1,
    wavelengthM: annotated.wavelengthM ?? null,
    counts: {
      ports: annotated.portCount,
      connections: annotated.connectionCount,
      directedEdges: annotated.directedEdges,
      drawnEdges: annotated.drawnEdges ?? 0,
      bidirectionalEdges: annotated.bidirectionalEdges,
      unresolvedConnections: annotated.unresolvedConnections,
      ungeometried: annotated.ungeometried ?? 0,
      unreachedEdges: annotated.unreachedEdges ?? 0,
      plantNodes: annotated.plantNodes ?? 0,
      supplySegments: annotated.supplySegments ?? 0,
      returnSegments: annotated.returnSegments ?? 0,
    },
    reason: annotated.reason,
    /** [ax, ay, az, bx, by, bz, progressA, progressB, isSupply] */
    segments: (annotated.segments ?? []).map((s) => [
      r3(s.a[0]),
      r3(s.a[1]),
      r3(s.a[2]),
      r3(s.b[0]),
      r3(s.b[1]),
      r3(s.b[2]),
      r4(s.pa),
      r4(s.pb),
      s.supply,
    ]),
  };
}
