// scripts/lib/ifc-horizontal.mjs
//
// Roofs and ground slabs: the two horizontal envelope areas, from element
// geometry, with the rule for each written down beside the measurement.
//
// Both rules were settled against the Clinic's committed figures and then run
// on Schependomlaan, and each building broke one obvious approach:
//
//   ROOFS. "Σ area × n_y over the upward faces" is the textbook projection
//   and is 2.000× wrong on the Clinic's standing-seam roofs, whose surface
//   models present both sheets wound upward. The measurement is the plan
//   SHADOW instead — `ifc-plan-shadow.mjs` explains. Schependomlaan then types
//   its flat roof decks (`dakvloer`, `plat dak`, `lifttop`) as IfcSlab FLOOR,
//   so a type-only rule finds a four-storey block with 136 m² of roof. A
//   building may therefore declare roof slab NAMES in addition to the types,
//   and every row says which basis put it in the list.
//
//   GROUND. `IsExternal` is false on the Clinic's exterior paving and true on
//   Schependomlaan's structural ground floor, so it cannot decide. The rule is
//   physical instead: a slab is ground envelope when a CONDITIONED space
//   stands on it. Two routes establish that, because each file supports only
//   one — the Clinic's spaces have solids but its slabs are in another file
//   (no space boundary can cross files); Schependomlaan's slabs share a file
//   with its spaces, but 94 of its 100 spaces have no solid, only a 2D
//   FootPrint curve. So: plan overlap with a conditioned space footprint
//   (solid shadow, or FootPrint curve when there is no solid), OR an
//   IfcRelSpaceBoundary naming the slab as bounding one. A slab neither route
//   can place under a heated room is excluded WITH that sentence, never
//   silently.

import { num, refId, str } from "./ifc-reader.mjs";
import { elementTriangles } from "./ifc-face-area.mjs";
import { planShadow, unionShadows, overlapSqm } from "./ifc-plan-shadow.mjs";
import polygonClipping from "polygon-clipping";

/** Plan overlap below this is float dust, not a room standing on a slab. */
const OVERLAP_NOISE_SQM = 0.01;

// ── Placements ──────────────────────────────────────────────────────────

const normalise = (v) => {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : null;
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** 4×4 column-major matrix of an IfcAxis2Placement3D, translation in metres. */
function axisPlacementMatrix(file, placement, toM) {
  const location = file.deref(placement?.Location);
  const t = (location?.Coordinates ?? []).map((c) => (num(c) ?? 0) * toM);
  const axisLine = file.deref(placement?.Axis);
  const refLine = file.deref(placement?.RefDirection);
  const z = normalise((axisLine?.DirectionRatios ?? [0, 0, 1]).map((c) => num(c) ?? 0)) ?? [0, 0, 1];
  let x = normalise((refLine?.DirectionRatios ?? [1, 0, 0]).map((c) => num(c) ?? 0)) ?? [1, 0, 0];
  // RefDirection need not be orthogonal to Axis; IFC projects it.
  const dot = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
  x = normalise([x[0] - dot * z[0], x[1] - dot * z[1], x[2] - dot * z[2]]) ?? [1, 0, 0];
  const y = cross(z, x);
  return [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    z[0], z[1], z[2], 0,
    t[0] ?? 0, t[1] ?? 0, t[2] ?? 0, 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * World matrix of an element's `ObjectPlacement`, IFC frame (Z up), metres.
 *
 * Walks `IfcLocalPlacement.PlacementRelTo` to the root and composes outermost
 * first. Written here because web-ifc exposes placements only through the
 * meshes it emits, and a space with no solid emits none.
 */
export function placementMatrix(file, placementRef) {
  const toM = file.units?.lengthToMetres ?? 1;
  const chain = [];
  let placement = file.deref(placementRef);
  let guard = 0;
  while (placement && guard < 64) {
    chain.push(axisPlacementMatrix(file, file.deref(placement.RelativePlacement), toM));
    placement = file.deref(placement.PlacementRelTo);
    guard += 1;
  }
  let matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let i = chain.length - 1; i >= 0; i -= 1) matrix = multiply(matrix, chain[i]);
  return matrix;
}

/**
 * IFC's Z-up frame to web-ifc's Y-up world: (x, y, z) → (x, z, −y). This is
 * the conversion every tessellated mesh has already been through, so a
 * FootPrint transformed this way lands in the same plan as the slab shadows.
 * Verified on Schependomlaan (2026-09-04): the 29 FootPrint-derived
 * ground-storey rooms have a mean footprint/stated-area ratio of 0.9999,
 * and the union of all 32 ground-storey footprints (302.24 m²) falls
 * 100.0 % inside the union of the ground slabs' shadows (345.81 m²).
 */
const ifcToWorld = ([x, y, z]) => [x, z, -y];

function applyMatrix(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ── Space footprints ──────────────────────────────────────────────────────

/**
 * Plan footprint of every listed space: its solid's shadow where it has
 * one, else its `FootPrint` representation (an `IfcGeometricCurveSet` of
 * `IfcPolyline`s in the space's own placement), else nothing — and the
 * source is recorded per space.
 */
export function spaceFootprints(api, webIfc, file, spaces) {
  const wanted = new Map(spaces.map((s) => [s.expressID, s]));
  const out = new Map();

  api.StreamAllMeshesWithTypes(file.modelId, [webIfc.IFCSPACE], (mesh) => {
    if (!wanted.has(mesh.expressID)) return;
    const shadow = planShadow(elementTriangles(api, file.modelId, mesh));
    if (shadow.projectedSqm > 0) {
      out.set(mesh.expressID, {
        multiPolygon: shadow.multiPolygon,
        areaSqm: shadow.projectedSqm,
        source: "solid",
      });
    }
  });

  const toM = file.units?.lengthToMetres ?? 1;
  for (const space of spaces) {
    if (out.has(space.expressID)) continue;
    const line = file.line(space.expressID);
    const representation = file.deref(line?.Representation);
    const rings = [];
    let unreadable = 0;
    for (const slot of representation?.Representations ?? []) {
      const shape = file.deref(slot);
      if (str(shape?.RepresentationIdentifier) !== "FootPrint") continue;
      const matrix = placementMatrix(file, line.ObjectPlacement);
      for (const itemSlot of shape.Items ?? []) {
        const item = file.deref(itemSlot);
        const curves = file.typeName(item) === "IfcGeometricCurveSet" ? (item.Elements ?? []) : [itemSlot];
        for (const curveSlot of curves) {
          const curve = file.deref(curveSlot);
          if (file.typeName(curve) !== "IfcPolyline" || !Array.isArray(curve.Points)) {
            unreadable += 1;
            continue;
          }
          const ring = [];
          for (const pointSlot of curve.Points) {
            const coords = file.deref(pointSlot)?.Coordinates;
            if (!Array.isArray(coords) || coords.length < 2) continue;
            const local = [
              (num(coords[0]) ?? 0) * toM,
              (num(coords[1]) ?? 0) * toM,
              (num(coords[2]) ?? 0) * toM,
            ];
            const [wx, , wz] = ifcToWorld(applyMatrix(matrix, local));
            ring.push([wx, wz]);
          }
          if (ring.length < 3) continue;
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-9) ring.push([first[0], first[1]]);
          rings.push([ring]);
        }
      }
    }
    if (rings.length === 0) {
      if (unreadable > 0) out.set(space.expressID, { multiPolygon: [], areaSqm: 0, source: "footprint-unreadable" });
      continue;
    }
    // A single union normalises winding and merges a multi-curve footprint.
    let multiPolygon;
    try {
      multiPolygon = polygonClipping.union(...rings);
    } catch {
      out.set(space.expressID, { multiPolygon: [], areaSqm: 0, source: "footprint-unreadable" });
      continue;
    }
    const areaSqm = unionShadows([multiPolygon]).areaSqm;
    out.set(space.expressID, { multiPolygon, areaSqm, source: "footprint" });
  }
  return out;
}

// ── Relations ─────────────────────────────────────────────────────────────

/** element expressID → Set of space expressIDs it bounds, per IfcRelSpaceBoundary. */
export function spaceBoundaryIndex(file, webIfc) {
  const index = new Map();
  for (const rel of file.byType(webIfc.IFCRELSPACEBOUNDARY)) {
    const element = refId(rel.RelatedBuildingElement);
    const space = refId(rel.RelatingSpace);
    if (element === null || space === null) continue;
    if (!index.has(element)) index.set(element, new Set());
    index.get(element).add(space);
  }
  return index;
}

/** part expressID → aggregate parent expressID (IfcRelAggregates). */
function aggregateParents(file, webIfc) {
  const parents = new Map();
  for (const rel of file.byType(webIfc.IFCRELAGGREGATES)) {
    const parent = refId(rel.RelatingObject);
    for (const child of rel.RelatedObjects ?? []) {
      const id = refId(child);
      if (id !== null) parents.set(id, parent);
    }
  }
  return parents;
}

// ── Collection ────────────────────────────────────────────────────────────

/**
 * Every IfcRoof, IfcSlab and IfcCovering that produces geometry in one file,
 * with its plan shadow, storey, predefined type and aggregate parent.
 *
 * `IfcRoof` in IFC2x3 carries `ShapeType` where IFC4 says `PredefinedType`;
 * both are read. A Revit `IfcRoof` is usually an empty shell aggregating
 * `IfcSlab ROOF` parts that hold the geometry, so a roof with no mesh is
 * counted (`geometrylessRoofs`) rather than reported as 0 m².
 */
export function collectHorizontalElements(api, webIfc, file, storeys) {
  const storeyByExpressID = new Map(storeys.map((s) => [s.expressID, s]));
  const storeyOf = new Map();
  for (const rel of file.byType(webIfc.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const storey = storeyByExpressID.get(refId(rel.RelatingStructure));
    if (!storey) continue;
    for (const child of rel.RelatedElements ?? []) {
      const id = refId(child);
      if (id !== null) storeyOf.set(id, storey);
    }
  }
  const parents = aggregateParents(file, webIfc);
  const rows = [];
  const withGeometry = new Set();
  api.StreamAllMeshesWithTypes(
    file.modelId,
    [webIfc.IFCROOF, webIfc.IFCSLAB, webIfc.IFCCOVERING],
    (mesh) => {
      const line = file.line(mesh.expressID);
      if (!line) return;
      withGeometry.add(mesh.expressID);
      const triangles = elementTriangles(api, file.modelId, mesh);
      const shadow = planShadow(triangles);
      const parentId = parents.get(mesh.expressID) ?? null;
      const parent = parentId !== null ? file.line(parentId) : null;
      rows.push({
        expressID: mesh.expressID,
        globalId: str(line.GlobalId),
        typeName: file.typeName(line),
        name: str(line.Name) ?? "",
        predefinedType: str(line.PredefinedType) ?? str(line.ShapeType) ?? null,
        // Contained directly, or through the aggregate that contains it.
        storey: storeyOf.get(mesh.expressID) ?? (parentId !== null ? storeyOf.get(parentId) : null) ?? null,
        partOf: parent && file.typeName(parent) === "IfcRoof" ? { expressID: parentId, ref: file.ref(parentId), name: str(parent.Name) ?? "" } : null,
        shadow,
        triangleCount: triangles.length,
        file,
        ref: file.ref(mesh.expressID),
      });
    },
  );
  const geometrylessRoofs = file.byType(webIfc.IFCROOF).filter((r) => !withGeometry.has(r.expressID)).length;
  return { rows, geometrylessRoofs };
}

/**
 * The same element present in two discipline files (same GlobalId) is one
 * element. Files are visited in the order given; the first with geometry wins.
 */
export function dedupeByGlobalId(rowSets) {
  const seen = new Map();
  let duplicates = 0;
  for (const rows of rowSets) {
    for (const row of rows) {
      const key = row.globalId ?? `#${row.file.fileName}:${row.expressID}`;
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.set(key, row);
    }
  }
  return { rows: [...seen.values()], duplicates };
}

// ── Roofs ─────────────────────────────────────────────────────────────────

/** A Revit family name is the element name without its trailing instance id. */
export const roofFamily = (name) => String(name ?? "").replace(/:\d+$/, "");

/**
 * Which rows are roof, and on what basis.
 *
 * `nameMatch` is the per-building list of slab names that ARE roof although
 * the file types them FLOOR. Case-insensitive substring, like
 * `exteriorWallMatch`.
 */
export function classifyRoofs(rows, { nameMatch = [] } = {}) {
  const matchers = nameMatch.map((m) => String(m).toLowerCase());
  const out = [];
  for (const row of rows) {
    const type = row.typeName;
    const pdt = row.predefinedType;
    let basis = null;
    if (type === "IfcRoof") basis = "IfcRoof";
    else if (type === "IfcSlab" && pdt === "ROOF") basis = "IfcSlab.PredefinedType=ROOF";
    else if (type === "IfcCovering" && pdt === "ROOFING") basis = "IfcCovering.PredefinedType=ROOFING";
    else if (
      type === "IfcSlab" &&
      matchers.some((m) => row.name.toLowerCase().includes(m))
    ) {
      basis = "declared roof slab name";
    }
    if (basis) out.push({ ...row, basis });
  }
  return out;
}

const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * Three roof totals, because they answer three questions and differ on
 * real buildings:
 *
 *   `byFamilySqm`    plan coverage of each roof TYPE — the union of that
 *                    family's element shadows. What a per-type U-value
 *                    multiplies. On the Clinic the five standing-seam
 *                    sections telescope ~1.8 m along the spine, so their
 *                    union (384.44) is 48 m² less than their sum (432.66);
 *                    the sum counts the overhang strips twice.
 *   `projectedSqm`   Σ of those family unions — the envelope roof area.
 *   `elementSumSqm`  Σ of every element's own shadow — what a per-element
 *                    table adds up to.
 *   `unionSqm`       one union over everything — what the sky sees. Less
 *                    than `projectedSqm` where one roof type sits above
 *                    another (the Clinic's low barrel over its second-floor
 *                    EPDM deck: 74.55 m²).
 */
/**
 * The true one-sheet surface of a roof element — what heat crosses. A flat
 * deck's surface is its shadow; a pitched roof's is larger by 1/cos(tilt).
 *
 * Three cases, told apart by two facts of the mesh: whether any face points
 * down, and how many times the upward faces cover the element's own shadow
 * (`coverage` = Σ area × n_y over n_y > 0, divided by the shadow):
 *
 *   - closed solid, coverage ≈ 1  → Σ area of the faces with n_y > 0.
 *   - no downward face, coverage ≈ 2 → both sheets of a surface model are
 *     wound upward (the Clinic's standing seam), so the upward faces are
 *     two copies of the roof: ÷ 2. The vertical fascia strips (n_y = 0) are
 *     left out, as they are in the first case.
 *   - closed solids, coverage > 1 → the element's parts cover its shadow
 *     more than once: a build-up exported as stacked layer solids
 *     (Schependomlaan's sporenkap, up to three deep) or two deck pieces
 *     overlapping at a seam. ÷ coverage. Exact for parallel parts of one
 *     extent, a mean where their extents or tilts differ.
 *
 * All three are one formula — upward true area × shadow ÷ upward projected
 * area — which is the identity for a single consistently wound solid, ÷ 2
 * for the doubled sheets, and ÷ k for k stacked layers. The basis label
 * records which of the three the mesh was.
 */
function roofSurface(shadow) {
  const { upFacingSqm, downFacingSqm, upFacingProjectedSqm, projectedSqm } = shadow;
  if (!(projectedSqm > 0) || !(upFacingSqm > 0)) {
    return { surfaceSqm: 0, surfaceBasis: "no upward face" };
  }
  const coverage = upFacingProjectedSqm / projectedSqm;
  // "No downward face" is relative: a closed solid's downward faces are about
  // as large as its upward ones, while the Clinic's smallest barrel (#2278)
  // carries one sliver a hair below horizontal that an absolute zero test
  // mistook for a closed solid.
  const noDownwardFace = downFacingSqm < upFacingSqm * 0.01;
  if (noDownwardFace && coverage > 1.5) {
    return {
      surfaceSqm: upFacingSqm / 2,
      surfaceBasis: "upward faces ÷ 2: surface model with no downward face, both sheets wound upward",
    };
  }
  if (noDownwardFace) {
    return { surfaceSqm: upFacingSqm, surfaceBasis: "upward faces: open surface, one sheet" };
  }
  if (coverage > 1.01) {
    return {
      surfaceSqm: upFacingSqm / coverage,
      surfaceBasis: `upward faces ÷ ${coverage.toFixed(2)}: the element's parts cover its shadow ${coverage.toFixed(2)}× over (stacked layer solids or overlapping pieces)`,
    };
  }
  return { surfaceSqm: upFacingSqm, surfaceBasis: "upward faces of a closed solid" };
}

export function measureRoofs(roofRows) {
  const familyShadows = new Map();
  const familySurface = new Map();
  const rows = roofRows.map((row) => {
    const family = roofFamily(row.name);
    if (!familyShadows.has(family)) familyShadows.set(family, []);
    familyShadows.get(family).push(row.shadow.multiPolygon);
    const surface = roofSurface(row.shadow);
    familySurface.set(family, (familySurface.get(family) ?? 0) + surface.surfaceSqm);
    return Object.freeze({
      id: `roof-${row.expressID}`,
      name: row.name,
      family,
      elementType: row.typeName,
      predefinedType: row.predefinedType,
      basis: row.basis,
      storeyId: row.storey?.id ?? null,
      /** Plan shadow of the element — see ifc-plan-shadow.mjs. */
      projectedSqm: r2(row.shadow.projectedSqm),
      /**
       * Σ area × n_y over the upward faces. Equals `projectedSqm` for a
       * consistently wound solid; a multiple of it when the mesh presents
       * its top face more than once (two sheets both wound up, or a
       * multi-layer build-up exported as stacked solids).
       */
      upFacingProjectedSqm: r2(row.shadow.upFacingProjectedSqm),
      /** Area-weighted mean tilt of the upward faces, degrees from horizontal. */
      tiltDeg: r1(row.shadow.tiltDeg),
      /** True one-sheet surface — what heat crosses. ≥ `projectedSqm`; equal for a flat deck. */
      surfaceSqm: r2(surface.surfaceSqm),
      surfaceBasis: surface.surfaceBasis,
      partOf: row.partOf ? row.partOf.ref : null,
      ref: row.ref,
    });
  });
  const familyUnions = [...familyShadows.entries()].map(([family, shadows]) => [
    family,
    unionShadows(shadows).areaSqm,
  ]);
  const elementSumSqm = roofRows.reduce((sum, r) => sum + r.shadow.projectedSqm, 0);
  const projectedSqm = familyUnions.reduce((sum, [, v]) => sum + v, 0);
  const union = unionShadows(roofRows.map((r) => r.shadow.multiPolygon));
  return {
    rows,
    projectedSqm: r2(projectedSqm),
    elementSumSqm: r2(elementSumSqm),
    byFamilySqm: Object.fromEntries(
      familyUnions.sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r2(v)]),
    ),
    familyCount: familyUnions.length,
    unionSqm: r2(union.areaSqm),
    /**
     * Σ surface per family, and over all. A SUM, because surfaces cannot be
     * unioned: where elements of one family overlap in plan (the telescoping
     * standing-seam sections) their overlap strips are in here twice, just
     * as they are in `elementSumSqm`.
     */
    surfaceSqm: r2([...familySurface.values()].reduce((s, v) => s + v, 0)),
    surfaceByFamilySqm: Object.fromEntries(
      [...familySurface.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r2(v)]),
    ),
    /**
     * Rows whose upward-face sum exceeds their own shadow by more than 5 %:
     * the mesh presents its top face more than once. Two causes seen so far
     * — a surface model with both sheets wound upward (the Clinic's five
     * standing-seam roofs, exactly 2×) and a multi-layer build-up exported as
     * stacked solids (Schependomlaan's `sporenkap`). Either way the shadow is
     * the plan area and the sum is not.
     */
    upFacingExceedsShadowCount: roofRows.filter(
      (r) => r.shadow.projectedSqm > 0 && r.shadow.upFacingProjectedSqm > r.shadow.projectedSqm * 1.05,
    ).length,
    /** Elements whose shadow needed a vertex grid coarser than 1 µm to union. */
    snappedCount: roofRows.filter((r) => r.shadow.snapM > 1e-6).length,
  };
}

// ── Ground ────────────────────────────────────────────────────────────────

/**
 * Ground slabs and the exposed perimeter of their union outline.
 *
 * @param rows        horizontal rows (already deduped across files)
 * @param groundStorey the lowest storey that holds rooms (from the space file)
 * @param conditionedSpaces spaces on that storey that count as conditioned volume
 * @param footprints  Map<space expressID, {multiPolygon, source}>
 * @param boundaries  Map<file, Map<element expressID, Set<space expressID>>>
 */
export function measureGroundSlabs(rows, { groundStorey, conditionedSpaces, footprints, boundaries }) {
  const conditionedIds = new Set(conditionedSpaces.map((s) => s.expressID));
  const candidates = rows.filter(
    (row) =>
      row.typeName === "IfcSlab" &&
      row.predefinedType !== "ROOF" &&
      row.predefinedType !== "LANDING" &&
      row.storey &&
      row.storey.elevationM <= groundStorey.elevationM + 1e-6,
  );
  const footprintList = [...footprints.entries()].filter(([id, f]) => conditionedIds.has(id) && f.multiPolygon.length > 0);

  const measured = candidates.map((row) => {
    let overlap = 0;
    let overlapSpaces = 0;
    for (const [, f] of footprintList) {
      const o = overlapSqm(row.shadow.multiPolygon, f.multiPolygon);
      if (o > OVERLAP_NOISE_SQM) {
        overlap += o;
        overlapSpaces += 1;
      }
    }
    const bounded = boundaries.get(row.file)?.get(row.expressID) ?? new Set();
    const boundedConditioned = [...bounded].filter((id) => conditionedIds.has(id)).length;
    const counts = overlap > OVERLAP_NOISE_SQM || boundedConditioned > 0;
    const evidence = [];
    if (overlap > OVERLAP_NOISE_SQM) evidence.push(`${r2(overlap)} m² under ${overlapSpaces} conditioned space footprint(s)`);
    if (boundedConditioned > 0) evidence.push(`bounds ${boundedConditioned} conditioned space(s) per IfcRelSpaceBoundary`);
    return { row, counts, overlap, evidence };
  });

  const included = measured.filter((m) => m.counts);
  const union = unionShadows(included.map((m) => m.row.shadow.multiPolygon));
  const sumSqm = included.reduce((s, m) => s + m.row.shadow.projectedSqm, 0);

  return {
    rows: measured.map(({ row, counts, evidence }) =>
      Object.freeze({
        id: `slab-${row.expressID}`,
        name: row.name,
        elementType: row.typeName,
        predefinedType: row.predefinedType,
        storeyId: row.storey?.id ?? null,
        projectedSqm: r2(row.shadow.projectedSqm),
        countsAsGround: counts,
        evidence: counts ? evidence.join("; ") : null,
        excludedReason: counts
          ? null
          : "no conditioned space stands on it: no conditioned ground-storey footprint overlaps its shadow and no IfcRelSpaceBoundary names it",
        ref: row.ref,
      }),
    ),
    candidateCount: candidates.length,
    includedCount: included.length,
    /** Union of the included slabs' shadows — stacked layers counted once. */
    groundSlabSqm: r2(union.areaSqm),
    /** Σ per-slab shadows, so a reader can see how much was layering. */
    groundSlabSumSqm: r2(sumSqm),
    /** Outer rings of the union outline. */
    groundPerimeterM: r2(union.outerPerimeterM),
    /** Hole rings (a lift pit, a shaft, a courtyard) — reported, not added. */
    groundHolePerimeterM: r2(union.perimeterM - union.outerPerimeterM),
    outlinePolygons: union.polygons,
    outlineHoles: union.holes,
    footprintSources: footprintList.reduce((acc, [, f]) => {
      acc[f.source] = (acc[f.source] ?? 0) + 1;
      return acc;
    }, {}),
    conditionedSpaceCount: conditionedSpaces.length,
    footprintedSpaceCount: footprintList.length,
  };
}
