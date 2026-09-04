// scripts/lib/ifc-openings.mjs
//
// Glazing and exterior-door aperture, per opening, attributed to the wall the
// opening sits in, and binned by that wall's compass sector.
//
// Why aperture rather than a ratio: a window-to-wall ratio is the thing an
// energy model actually consumes, and until now this project has carried it as
// ONE assumed ratio printed against a measured wall split — four per-orientation
// rows that look measured and are not. Aperture measured per opening and binned
// by its host wall's own sector makes each row true independently.
//
// Three kinds of opening, three measures, all stated per row in `areaBasis`:
//
//   IfcWindow / IfcDoor   `OverallWidth × OverallHeight` — the frame opening,
//                         which is what the wall loses. On the Clinic this is
//                         the IfcOpeningElement's own profile to the millimetre
//                         (58 windows 100.63 m², 12 doors 31.89 m², both ways).
//                         It is NOT the glazed pane: glass is smaller than its
//                         frame, and the two must not be confused when a
//                         U-value is applied later.
//   IfcCurtainWall        The projected union of its plates and mullions in its
//                         own plane, rasterised at 1 cm — the area the wall
//                         plane gives up to the glazing system, mullions
//                         included, gable voids excluded. IfcCurtainWall itself
//                         emits NO mesh; its geometry lives in parts reached
//                         through IfcRelAggregates. Two other figures are kept
//                         per element so a reader can see what the definition
//                         costs: `plateSqm` (the glass plates alone, what a
//                         per-plate sum gives) and `bboxSqm` (the bounding
//                         rectangle, which a gable overstates by 60 %).
//   Doors inside a curtain wall are door rows, not glazing, whatever their name
//   says about glass: the file types them IfcDoor, and a door is aperture.
//
// ATTRIBUTION. IfcRelFillsElement → IfcOpeningElement → IfcRelVoidsElement →
// host wall is the chain, and it resolves 58/58 windows and 244/254 doors on
// the Clinic (Revit). It does not resolve on Schependomlaan (ArchiCAD): the
// inner leaf carries ZERO IfcOpeningElements, because each frame is its own
// `kozijn` element standing in the wall line between two wall segments, and
// 37 of 77 windows fill no opening at all. So a second route exists and says
// so in `hostBasis`: an exterior wall in the same plane (same thin axis,
// centre within 0.6 m) whose plan and height bands overlap or come within
// 0.3 m of the opening's — "adjacent", because a wall split around a frame
// touches the frame with a 1 cm overlap rather than spanning it.
//
// ENVELOPE. `IsExternal` is read and REPORTED per row and never used as a
// filter. It has failed as an envelope filter on every building in this
// repository: both cavity leaves carry it on Schependomlaan, party and
// foundation walls carry it on the Duplex, and here the Clinic's second-floor
// screens onto its interior two-storey atrium carry it too — 83.63 m² of
// plate that faces a room on one side and a conditioned void on the other.
// To an authoring tool it means "not an interior partition"; it never means
// "bounds conditioned space against outdoor air". The envelope test used
// instead is geometric and uses the file's own rooms: a probe on each side
// of the opening, at four distances (0.3–1.4 m) and three heights, against
// the conditioned IfcSpace solids. A conditioned space on BOTH sides is an
// interior screen. That test removed exactly the 5 atrium screens, the 8
// "Storefront - Interior" walls and nothing else; the two chain-link fences
// go by name (stated in the building config), and the mirrored pair #879/#881
// by coincidence of bounds. Where a file has no usable space solids — the
// apartment has 6 of 100 — the probe is reported as unavailable, not as
// "exterior".

import { num, refId, str } from "./ifc-reader.mjs";
import { elementTriangles, netFaceArea } from "./ifc-face-area.mjs";

/** Same eight sectors, same order, as `orientWalls`. */
const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Sector of an outward normal, computed exactly as `orientWalls` does it:
 * clockwise from north, north being world −Z after web-ifc's Y-up conversion,
 * rotated by the file's stated true north. Kept here rather than imported so a
 * change to one is a visible change to both.
 */
function sectorOf(nx, nz, trueNorthDeg) {
  const rotation = ((trueNorthDeg ?? 0) * Math.PI) / 180;
  let az = (Math.atan2(nx, -nz) - rotation) * (180 / Math.PI);
  az = ((az % 360) + 360) % 360;
  return SECTORS[Math.round(az / 45) % 8];
}

/** `IsExternal` from any IfcPropertySet, keyed by element expressID. Reported, never filtered on. */
export function readIsExternal(file, webIfc) {
  const out = new Map();
  for (const rel of file.byType(webIfc.IFCRELDEFINESBYPROPERTIES)) {
    const def = file.deref(rel.RelatingPropertyDefinition);
    if (!def || file.typeName(def) !== "IfcPropertySet") continue;
    for (const p of def.HasProperties ?? []) {
      const prop = file.deref(p);
      if (!prop || str(prop.Name) !== "IsExternal") continue;
      const v = prop.NominalValue;
      const raw = v && typeof v === "object" && "value" in v ? v.value : v;
      const bool = raw === true || raw === "T" || raw === ".T." || raw === 1;
      for (const o of rel.RelatedObjects ?? []) {
        const id = refId(o);
        if (id !== null) out.set(id, bool);
      }
    }
  }
  return out;
}

function boundsOf(tris) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (const p of t) {
      for (let a = 0; a < 3; a += 1) {
        if (p[a] < lo[a]) lo[a] = p[a];
        if (p[a] > hi[a]) hi[a] = p[a];
      }
    }
  }
  return { lo, hi };
}

function mergeBounds(a, b) {
  return {
    lo: a.lo.map((v, i) => Math.min(v, b.lo[i])),
    hi: a.hi.map((v, i) => Math.max(v, b.hi[i])),
  };
}

/**
 * Conditioned space solids, for the both-sides probe.
 *
 * `accept(expressID)` keeps only spaces that count as conditioned volume, so a
 * ROOF or MECH. YARD "space" on the outside of a window does not read as a
 * room. The count returned against the count asked for is what tells a caller
 * the probe is usable at all.
 */
export function collectSpaceSolids(api, webIfc, modelId, accept) {
  const out = new Map();
  api.StreamAllMeshesWithTypes(modelId, [webIfc.IFCSPACE], (mesh) => {
    if (!accept(mesh.expressID)) return;
    const tris = elementTriangles(api, modelId, mesh);
    if (tris.length === 0) return;
    const prev = out.get(mesh.expressID);
    if (prev) {
      for (const t of tris) prev.tris.push(t);
      const b = mergeBounds(prev, boundsOf(tris));
      prev.lo = b.lo;
      prev.hi = b.hi;
    } else {
      out.set(mesh.expressID, { tris, ...boundsOf(tris) });
    }
  });
  return out;
}

/** Ray +Y parity test against one closed solid. */
function pointInSolid(p, solid) {
  const { lo, hi } = solid;
  if (p[0] < lo[0] || p[0] > hi[0] || p[1] < lo[1] || p[1] > hi[1] || p[2] < lo[2] || p[2] > hi[2]) {
    return false;
  }
  let crossings = 0;
  for (const [a, b, c] of solid.tris) {
    const d1 = (p[0] - b[0]) * (a[2] - b[2]) - (a[0] - b[0]) * (p[2] - b[2]);
    const d2 = (p[0] - c[0]) * (b[2] - c[2]) - (b[0] - c[0]) * (p[2] - c[2]);
    const d3 = (p[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (p[2] - a[2]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (neg && pos) continue;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (Math.abs(ny) < 1e-12) continue;
    const y = a[1] - (nx * (p[0] - a[0]) + nz * (p[2] - a[2])) / ny;
    if (y > p[1]) crossings += 1;
  }
  return crossings % 2 === 1;
}

const PROBE_DISTANCES_M = [0.3, 0.6, 1.0, 1.4];
const PROBE_HEIGHTS = [0.35, 0.5, 0.65];

/**
 * Conditioned spaces found on one side of an opening.
 *
 * Several probe points rather than one: a single 0.5 m probe at mid-height
 * missed the CONSULT. room behind screen #873 on the Clinic and would have
 * published an atrium screen as 26.88 m² of exterior glazing. 1.4 m is the
 * cap because beyond it a probe can cross into the room of a neighbouring
 * wing at a re-entrant corner.
 */
function spacesBeside(b, axis, sign, solids) {
  const found = new Map();
  const h = b.hi[1] - b.lo[1];
  for (const d of PROBE_DISTANCES_M) {
    for (const f of PROBE_HEIGHTS) {
      const p = [(b.lo[0] + b.hi[0]) / 2, b.lo[1] + h * f, (b.lo[2] + b.hi[2]) / 2];
      p[axis] += sign * ((b.hi[axis] - b.lo[axis]) / 2 + d);
      for (const [id, s] of solids) {
        if (pointInSolid(p, s)) found.set(id, Math.min(found.get(id) ?? Infinity, d));
      }
    }
  }
  return [...found].map(([id, atM]) => ({ id, atM }));
}

/**
 * Union area of triangles projected onto the plane normal to `axis` (0 = X,
 * 2 = Z), rasterised on a `cell`-metre grid. Exact enough at 1 cm: on the
 * Clinic's 15 exterior storefronts it reproduces an independent 2 mm scanline
 * measurement to 0.01 m² per element.
 */
export function projectedUnionArea(tris, axis, cell = 0.01) {
  if (tris.length === 0) return 0;
  const u = axis === 0 ? 2 : 0;
  const b = boundsOf(tris);
  const w = Math.ceil((b.hi[u] - b.lo[u]) / cell) + 1;
  const h = Math.ceil((b.hi[1] - b.lo[1]) / cell) + 1;
  const grid = new Uint8Array(w * h);
  for (const t of tris) {
    const P = t.map((p) => [(p[u] - b.lo[u]) / cell, (p[1] - b.lo[1]) / cell]);
    const [A, B, C] = P;
    const area2 = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
    if (Math.abs(area2) < 1e-9) continue;
    const s = Math.sign(area2);
    const minx = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
    const maxx = Math.min(w - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const miny = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
    const maxy = Math.min(h - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let y = miny; y <= maxy; y += 1) {
      for (let x = minx; x <= maxx; x += 1) {
        const px = x + 0.5, py = y + 0.5;
        const d1 = (B[0] - A[0]) * (py - A[1]) - (B[1] - A[1]) * (px - A[0]);
        const d2 = (C[0] - B[0]) * (py - B[1]) - (C[1] - B[1]) * (px - B[0]);
        const d3 = (A[0] - C[0]) * (py - C[1]) - (A[1] - C[1]) * (px - C[0]);
        if (d1 * s >= -1e-9 && d2 * s >= -1e-9 && d3 * s >= -1e-9) grid[y * w + x] = 1;
      }
    }
  }
  let n = 0;
  for (let i = 0; i < grid.length; i += 1) n += grid[i];
  return n * cell * cell;
}

/** The wall→opening half of the chain: opening expressID → host expressID. */
function openingHosts(file, webIfc) {
  const hosts = new Map();
  for (const rel of file.byType(webIfc.IFCRELVOIDSELEMENT)) {
    const host = refId(rel.RelatingBuildingElement);
    const opening = refId(rel.RelatedOpeningElement);
    if (host !== null && opening !== null) hosts.set(opening, host);
  }
  return hosts;
}

const ADJACENT_PLANE_M = 0.6;
const ADJACENT_GAP_M = 0.3;
/** An opening thicker than this in plan is not a flat opening in a wall (a corner, a splay, a roof dome). */
const FLAT_OPENING_MAX_THICKNESS_M = 0.3;

/**
 * The exterior wall in the same plane as an opening, touching or within
 * 0.3 m of it in plan and height. Overlap wins over gap, nearer wins over
 * farther; the gaps are returned so a borderline call is visible in its row.
 */
function adjacentWall(b, axis, exteriorWalls) {
  const other = axis === 0 ? 2 : 0;
  const c = (b.lo[axis] + b.hi[axis]) / 2;
  let best = null;
  for (const w of exteriorWalls.values()) {
    if ((w.thinAxis === "x" ? 0 : 2) !== axis) continue;
    const d = Math.abs(c - (w.boundsMin[axis] + w.boundsMax[axis]) / 2);
    if (d > ADJACENT_PLANE_M) continue;
    const planGap = Math.max(w.boundsMin[other] - b.hi[other], b.lo[other] - w.boundsMax[other]);
    const heightGap = Math.max(w.boundsMin[1] - b.hi[1], b.lo[1] - w.boundsMax[1]);
    if (planGap > ADJACENT_GAP_M || heightGap > ADJACENT_GAP_M) continue;
    const score = Math.max(planGap, 0) + Math.max(heightGap, 0) + d * 0.1;
    if (!best || score < best.score) {
      best = { id: w.expressID, name: w.name, planeDistanceM: d, planGapM: planGap, heightGapM: heightGap, score };
    }
  }
  return best;
}

/** Names of walls (any type) in an opening's plane, for the reason text of an unresolved row. */
function wallNamesInPlane(b, axis, wallBounds) {
  const found = new Map();
  for (const w of wallBounds.values()) {
    if (w.axis !== axis) continue;
    const c = (b.lo[axis] + b.hi[axis]) / 2;
    if (Math.abs(c - (w.lo[axis] + w.hi[axis]) / 2) > ADJACENT_PLANE_M) continue;
    const other = axis === 0 ? 2 : 0;
    if (Math.max(w.lo[other] - b.hi[other], b.lo[other] - w.hi[other]) > ADJACENT_GAP_M) continue;
    if (Math.max(w.lo[1] - b.hi[1], b.lo[1] - w.hi[1]) > ADJACENT_GAP_M) continue;
    found.set(w.name, (found.get(w.name) ?? 0) + 1);
  }
  return [...found].map(([name, n]) => `${name}${n > 1 ? ` ×${n}` : ""}`);
}

function sameBounds(a, b, tol = 0.02) {
  return a.lo.every((v, i) => Math.abs(v - b.lo[i]) < tol) && a.hi.every((v, i) => Math.abs(v - b.hi[i]) < tol);
}

const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Every opening, resolved, measured and judged, plus what could not be.
 *
 * @param opts.exteriorWalls   Map from `netFaceAreasByElement`, after any stated-area substitution.
 * @param opts.sectorByHost    host expressID → sector, from `orientWalls`.
 * @param opts.buildingCentre  from `orientWalls`, for a curtain wall with no room on either side.
 * @param opts.trueNorthDeg    the file's stated true north, or null.
 * @param opts.spaceSolids     conditioned space solids from `collectSpaceSolids` (may be empty).
 * @param opts.conditionedSpaceCount how many conditioned spaces the file has, so the note can say "6 of 100".
 * @param opts.spaceName       expressID → display name, for reasons.
 * @param opts.isExteriorWallName / opts.isExcludedWallName  the building's own wall predicates.
 * @param opts.curtainWallExclude  [{ match, reason }] — name-matched exclusions, each with its stated reason.
 * @param opts.subFrameNames   names of sub-frame elements that are not openings of their own (ArchiCAD `stelkozijn`).
 */
export function openingApertures(api, file, webIfc, opts) {
  const {
    exteriorWalls,
    sectorByHost = new Map(),
    buildingCentre = [0, 0, 0],
    trueNorthDeg = null,
    spaceSolids = new Map(),
    conditionedSpaceCount = 0,
    spaceName = new Map(),
    isExteriorWallName = () => false,
    isExcludedWallName = () => false,
    curtainWallExclude = [],
    subFrameNames = [],
  } = opts;
  const toM = file.units?.lengthToMetres ?? 1;
  const isExternal = readIsExternal(file, webIfc);
  const hosts = openingHosts(file, webIfc);
  const fillOf = new Map();
  for (const rel of file.byType(webIfc.IFCRELFILLSELEMENT)) {
    const filler = refId(rel.RelatedBuildingElement);
    const opening = refId(rel.RelatingOpeningElement);
    if (filler !== null && opening !== null) fillOf.set(filler, opening);
  }

  // Curtain-wall parts, through IfcRelAggregates.
  const parentOf = new Map();
  const partsOf = new Map();
  for (const rel of file.byType(webIfc.IFCRELAGGREGATES)) {
    const parent = file.deref(rel.RelatingObject);
    if (!parent || file.typeName(parent) !== "IfcCurtainWall") continue;
    for (const o of rel.RelatedObjects ?? []) {
      const id = refId(o);
      if (id === null) continue;
      parentOf.set(id, parent.expressID);
      partsOf.set(parent.expressID, (partsOf.get(parent.expressID) ?? []).concat(id));
    }
  }

  // One geometry pass: bounds for every window, door and wall; triangles only
  // for curtain-wall parts, which are the only things rasterised.
  const bounds = new Map();
  const partTris = new Map();
  const wallBounds = new Map();
  api.StreamAllMeshesWithTypes(
    file.modelId,
    [webIfc.IFCWINDOW, webIfc.IFCDOOR, webIfc.IFCPLATE, webIfc.IFCMEMBER, webIfc.IFCWALL, webIfc.IFCWALLSTANDARDCASE],
    (mesh) => {
      const tris = elementTriangles(api, file.modelId, mesh);
      if (tris.length === 0) return;
      const line = file.line(mesh.expressID);
      const type = file.typeName(line);
      const b = boundsOf(tris);
      if (type === "IfcWall" || type === "IfcWallStandardCase") {
        const span = [b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]];
        wallBounds.set(mesh.expressID, { ...b, name: str(line?.Name) ?? "", axis: span[0] <= span[2] ? 0 : 2 });
        return;
      }
      const prev = bounds.get(mesh.expressID);
      bounds.set(mesh.expressID, prev ? mergeBounds(prev, b) : b);
      if (parentOf.has(mesh.expressID)) {
        partTris.set(mesh.expressID, (partTris.get(mesh.expressID) ?? []).concat(tris));
      }
    },
  );

  const probeUsable = spaceSolids.size > 0;
  const probeComplete = conditionedSpaceCount > 0 && spaceSolids.size >= 0.9 * conditionedSpaceCount;
  const nameOf = (id) => spaceName.get(id) ?? `space #${id}`;
  const rows = [];
  const unresolved = [];
  const wallName = (id) => {
    const l = file.line(id);
    return l ? `${file.typeName(l)} "${str(l.Name) ?? ""}"` : `#${id}`;
  };

  /** Both-sides verdict for a flat opening; null when the probe cannot be run. */
  function envelopeVerdict(b, axis) {
    if (!probeUsable) return { verdict: null, basis: `no conditioned space solids to probe (${spaceSolids.size} of ${conditionedSpaceCount} have geometry)`, outward: null };
    const pos = spacesBeside(b, axis, +1, spaceSolids);
    const neg = spacesBeside(b, axis, -1, spaceSolids);
    const say = (xs) => xs.map((s) => `${nameOf(s.id)} at ${s.atM} m`).join(", ");
    if (pos.length > 0 && neg.length > 0) {
      return { verdict: "interior", basis: `conditioned space on both sides: +${say(pos)} | -${say(neg)}`, outward: null };
    }
    if (pos.length > 0) return { verdict: "exterior", basis: `room on one side only (${say(pos)}), nothing on the other`, outward: -1 };
    if (neg.length > 0) return { verdict: "exterior", basis: `room on one side only (${say(neg)}), nothing on the other`, outward: +1 };
    const c = (b.lo[axis] + b.hi[axis]) / 2;
    // "Nothing on either side" means one thing when every room has a solid
    // and nothing at all when most do not. The apartment has 6 of 100.
    return {
      verdict: "exterior",
      basis: probeComplete
        ? "no conditioned space on either side; outward taken as the side away from the building centre"
        : `probe inconclusive (only ${spaceSolids.size} of ${conditionedSpaceCount} conditioned spaces have solids); exterior by its host wall, outward taken as the side away from the building centre`,
      outward: c - buildingCentre[axis] > 0 ? +1 : -1,
    };
  }

  // ── Windows and doors ─────────────────────────────────────────────────
  for (const typeCode of [webIfc.IFCWINDOW, webIfc.IFCDOOR]) {
    for (const el of file.byType(typeCode)) {
      const id = el.expressID;
      const type = file.typeName(el);
      const name = str(el.Name) ?? "";
      const kind = type === "IfcWindow" ? "glazing" : "door";
      const width = num(el.OverallWidth);
      const height = num(el.OverallHeight);
      const b = bounds.get(id) ?? null;
      const base = { id, type, name, kind, isExternal: isExternal.get(id) ?? null, ref: file.ref(id) };
      const span = b ? [b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]] : null;
      const footprint = span ? { widthM: r2(Math.max(span[0], span[2])), depthM: r2(Math.min(span[0], span[2])), heightM: r2(span[1]), bottomM: r2(b.lo[1]) } : null;

      if (subFrameNames.some((s) => name.toLowerCase().includes(s.toLowerCase()))) {
        rows.push({ ...base, included: false, reason: `sub-frame (${name}): a frame component, not an opening of its own; it states no OverallWidth/OverallHeight`, areaSqm: null, footprint });
        continue;
      }
      if (width === null || height === null) {
        unresolved.push({ ...base, reason: "OverallWidth or OverallHeight is absent", areaSqm: null, footprint });
        continue;
      }
      const widthM = width * toM;
      const heightM = height * toM;
      const areaSqm = widthM * heightM;
      const measured = { widthM: r3(widthM), heightM: r3(heightM), areaSqm: r3(areaSqm), areaBasis: "OverallWidth × OverallHeight", footprint };

      // A door that is a curtain-wall part belongs to that wall's row below.
      const parent = parentOf.get(id);
      if (parent !== undefined) {
        rows.push({ ...base, ...measured, hostExpressID: parent, hostName: wallName(parent), hostBasis: "curtain-wall part", pendingCurtainWall: parent });
        continue;
      }

      // Host through the chain, or by adjacency.
      const openingId = fillOf.get(id);
      const chainHost = openingId === undefined ? null : hosts.get(openingId) ?? null;
      let host = null;
      let hostBasis = null;
      let hostDetail = null;
      if (chainHost !== null && exteriorWalls.has(chainHost)) {
        host = chainHost;
        hostBasis = "fills";
      } else if (chainHost !== null) {
        const hl = file.line(chainHost);
        const hType = file.typeName(hl);
        const hName = str(hl?.Name) ?? "";
        const isWall = hType === "IfcWall" || hType === "IfcWallStandardCase";
        if (isWall && !isExcludedWallName(hName) && !isExteriorWallName(hName)) {
          rows.push({ ...base, ...measured, hostExpressID: chainHost, hostName: wallName(chainHost), hostBasis: "fills", included: false, reason: `host ${wallName(chainHost)} is not in the exterior-wall set` });
          continue;
        }
        hostDetail = `fills host ${wallName(chainHost)} is not in the exterior-wall set`;
      }
      if (host === null) {
        if (!b) {
          unresolved.push({ ...base, ...measured, reason: `${hostDetail ?? "fills no opening"}; no mesh to place it by` });
          continue;
        }
        const axis = span[0] <= span[2] ? 0 : 2;
        if (span[axis] > FLAT_OPENING_MAX_THICKNESS_M) {
          unresolved.push({ ...base, ...measured, reason: `${hostDetail ?? "fills no opening"}; plan footprint ${footprint.widthM} × ${footprint.depthM} m is not a flat opening in a cardinal wall (corner, splayed or roof)` });
          continue;
        }
        const adj = adjacentWall(b, axis, exteriorWalls);
        if (!adj) {
          const near = wallNamesInPlane(b, axis, wallBounds);
          if (near.length > 0) {
            // A fact about where it sits, not a verdict on what it is: the
            // apartment's flat entrance doors sit between `binnenwand`
            // partitions and its dormer windows between `knieschot` knee
            // walls, and both read the same way here. The names say which.
            rows.push({ ...base, ...measured, hostBasis: null, included: false, outsideWallSet: true, reason: `${hostDetail ?? "fills no opening"}; sits in the plane of walls outside the exterior-wall set (${near.join(", ")})` });
          } else {
            unresolved.push({ ...base, ...measured, reason: `${hostDetail ?? "fills no opening"}; no wall mesh in its plane at all` });
          }
          continue;
        }
        host = adj.id;
        hostBasis = "adjacent";
        hostDetail = `${hostDetail ? hostDetail + "; " : ""}exterior wall ${adj.planGapM <= 0 ? "overlapping" : `${r2(adj.planGapM)} m away`} in plan, ${adj.heightGapM <= 0 ? "overlapping" : `${r2(adj.heightGapM)} m away`} in height, plane offset ${r2(adj.planeDistanceM)} m`;
      }

      const sector = sectorByHost.get(host) ?? null;
      let envelope = { verdict: "exterior", basis: "host is an exterior wall; no mesh to probe" };
      if (b) {
        const axis = span[0] <= span[2] ? 0 : 2;
        const v = envelopeVerdict(b, axis);
        envelope = { verdict: v.verdict ?? "exterior", basis: v.verdict === null ? `host is an exterior wall; ${v.basis}` : v.basis };
      }
      const included = envelope.verdict !== "interior";
      rows.push({
        ...base,
        ...measured,
        hostExpressID: host,
        hostName: wallName(host),
        hostBasis,
        hostDetail,
        sector,
        envelope,
        included,
        reason: included ? null : `interior: ${envelope.basis}`,
      });
    }
  }

  // ── Curtain walls ──────────────────────────────────────────────────────
  const cwRows = [];
  for (const cw of file.byType(webIfc.IFCCURTAINWALL)) {
    const id = cw.expressID;
    const name = str(cw.Name) ?? "";
    const base = { id, type: "IfcCurtainWall", name, kind: "glazing", isExternal: isExternal.get(id) ?? null, ref: file.ref(id) };
    const parts = partsOf.get(id) ?? [];
    const partCounts = {};
    const glazingTris = [];
    const allTris = [];
    let plateSqm = 0;
    const doorIds = [];
    for (const pid of parts) {
      const type = file.typeName(file.line(pid));
      partCounts[type] = (partCounts[type] ?? 0) + 1;
      const tris = partTris.get(pid) ?? [];
      for (const t of tris) allTris.push(t);
      if (type === "IfcDoor") doorIds.push(pid);
      else for (const t of tris) glazingTris.push(t);
      if (type === "IfcPlate" && tris.length) plateSqm += netFaceArea(tris).netFaceAreaSqm;
    }
    if (allTris.length === 0) {
      unresolved.push({ ...base, partCounts, reason: parts.length === 0 ? "aggregates no parts, and IfcCurtainWall itself emits no mesh" : `${parts.length} parts, none with geometry` });
      continue;
    }
    const b = boundsOf(allTris);
    const span = [b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]];
    const horizontal = span[1] < span[0] && span[1] < span[2];
    const axis = span[0] <= span[2] ? 0 : 2;
    const other = axis === 0 ? 2 : 0;
    const outlineSqm = horizontal ? null : projectedUnionArea(glazingTris, axis);
    const measured = {
      widthM: r3(span[other]),
      heightM: r3(span[1]),
      areaSqm: outlineSqm === null ? null : r3(outlineSqm),
      areaBasis: "projected union of plates and mullions in the wall's plane (1 cm raster)",
      plateSqm: r3(plateSqm),
      bboxSqm: r3(span[other] * span[1]),
      partCounts,
      bottomM: r2(b.lo[1]),
      topM: r2(b.hi[1]),
    };
    const excluded = curtainWallExclude.find((x) => name.includes(x.match));
    if (excluded) {
      cwRows.push({ ...base, ...measured, doorIds, included: false, reason: excluded.reason, bounds: b, axis });
      continue;
    }
    if (horizontal) {
      unresolved.push({ ...base, ...measured, reason: "flatter than it is wide — a rooflight, not wall glazing; not measured here" });
      continue;
    }
    const v = envelopeVerdict(b, axis);
    const verdict = v.verdict ?? "exterior";
    const outward = v.outward ?? ((b.lo[axis] + b.hi[axis]) / 2 - buildingCentre[axis] > 0 ? +1 : -1);
    const sector = sectorOf(axis === 0 ? outward : 0, axis === 2 ? outward : 0, trueNorthDeg);
    cwRows.push({
      ...base,
      ...measured,
      hostExpressID: id,
      hostName: "itself (a curtain wall is its own wall segment)",
      hostBasis: "self",
      sector,
      envelope: { verdict, basis: v.verdict === null ? `no probe: ${v.basis}` : v.basis },
      doorIds,
      included: verdict !== "interior",
      reason: verdict === "interior" ? `interior: ${v.basis}` : null,
      bounds: b,
      axis,
    });
  }
  // A mirrored pair exported twice is one opening. Bounds within 2 cm, same plane.
  for (let i = 0; i < cwRows.length; i += 1) {
    if (!cwRows[i].included) continue;
    for (let j = i + 1; j < cwRows.length; j += 1) {
      const a = cwRows[i], c = cwRows[j];
      if (!c.included || a.axis !== c.axis || !sameBounds(a.bounds, c.bounds)) continue;
      c.included = false;
      c.reason = `coincident with #${a.id} (same bounds within 2 cm): a mirrored pair exported twice, counted once`;
    }
  }
  for (const r of cwRows) {
    const { bounds: _b, axis: _a, doorIds, ...rest } = r;
    rows.push({ ...rest, doorIds });
  }
  // Doors inside curtain walls inherit the wall's verdict and sector.
  const cwById = new Map(cwRows.map((r) => [r.id, r]));
  for (const r of rows) {
    if (r.pendingCurtainWall === undefined) continue;
    const cw = cwById.get(r.pendingCurtainWall);
    delete r.pendingCurtainWall;
    r.sector = cw?.sector ?? null;
    r.envelope = cw?.envelope ?? { verdict: "excluded", basis: "parent curtain wall unresolved" };
    r.included = Boolean(cw?.included);
    r.reason = r.included ? null : `its curtain wall #${r.hostExpressID} is not counted: ${cw?.reason ?? "unresolved"}`;
  }
  // The same door exported twice — one aggregated into its curtain wall, one loose.
  const doorRows = rows.filter((r) => r.type === "IfcDoor" || r.type === "IfcWindow");
  for (let i = 0; i < doorRows.length; i += 1) {
    const a = doorRows[i];
    const ba = bounds.get(a.id);
    if (!ba) continue;
    for (let j = i + 1; j < doorRows.length; j += 1) {
      const c = doorRows[j];
      const bc = bounds.get(c.id);
      if (!bc || a.type !== c.type || a.name !== c.name || !sameBounds(ba, bc)) continue;
      const loser = a.hostBasis === "curtain-wall part" || c.hostBasis !== "curtain-wall part" ? c : a;
      const keeper = loser === c ? a : c;
      const idx = unresolved.findIndex((u) => u.id === loser.id);
      if (idx >= 0) unresolved.splice(idx, 1);
      loser.included = false;
      loser.reason = `coincident with #${keeper.id} (same name, same bounds within 2 cm): exported twice, counted once`;
    }
  }
  // Rows that ended up in `unresolved` but were then marked duplicates are already removed above;
  // rows never pushed to `rows` (unresolved) that duplicate an included row are handled by name+bounds too.
  for (let i = unresolved.length - 1; i >= 0; i -= 1) {
    const u = unresolved[i];
    const bu = bounds.get(u.id);
    if (!bu) continue;
    const twin = rows.find((r) => r.type === u.type && r.name === u.name && bounds.get(r.id) && sameBounds(bounds.get(r.id), bu));
    if (!twin) continue;
    unresolved.splice(i, 1);
    rows.push({ ...u, included: false, reason: `coincident with #${twin.id} (same name, same bounds within 2 cm): exported twice, counted once` });
  }

  return {
    rows,
    unresolved,
    probe: {
      usable: probeUsable,
      complete: probeComplete,
      spaceSolids: spaceSolids.size,
      conditionedSpaces: conditionedSpaceCount,
    },
  };
}

/** Totals, the per-sector split, and the exclusions, from `openingApertures`. */
export function summariseApertures({ rows, unresolved, probe }) {
  const byOrientation = Object.fromEntries(SECTORS.map((s) => [s, 0]));
  const doorsByOrientation = Object.fromEntries(SECTORS.map((s) => [s, 0]));
  const included = rows.filter((r) => r.included && r.areaSqm != null);
  const glazing = included.filter((r) => r.kind === "glazing");
  const doors = included.filter((r) => r.kind === "door");
  let unsectoredSqm = 0;
  for (const r of glazing) {
    if (r.sector && r.sector in byOrientation) byOrientation[r.sector] += r.areaSqm;
    else unsectoredSqm += r.areaSqm;
  }
  for (const r of doors) {
    if (r.sector && r.sector in doorsByOrientation) doorsByOrientation[r.sector] += r.areaSqm;
  }
  const sum = (xs) => xs.reduce((t, r) => t + r.areaSqm, 0);
  const windows = glazing.filter((r) => r.type === "IfcWindow");
  const curtain = glazing.filter((r) => r.type === "IfcCurtainWall");
  const excluded = rows.filter((r) => !r.included);
  const roundMap = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r2(v)]));
  const tally = (xs) => ({ count: xs.length, sqm: r2(sum(xs.filter((r) => r.areaSqm != null))) });
  const interiorCurtainWalls = excluded.filter((r) => r.type === "IfcCurtainWall" && /^interior:/.test(r.reason ?? ""));
  const outside = rows.filter((r) => r.outsideWallSet);
  // What `IsExternal` claims for doors, against what the host-wall test
  // confirms. The property is reported per row and never filtered on; this
  // is the reconciliation a reader will want, in numbers rather than in a
  // sentence about the property's meaning.
  const isExternalDoors = [...rows, ...unresolved].filter(
    (r) => r.type === "IfcDoor" && r.isExternal === true && !/^sub-frame/.test(r.reason ?? ""),
  );
  return {
    interiorCurtainWalls: tally(interiorCurtainWalls),
    hostedInInteriorWalls: tally(excluded.filter((r) => /not in the exterior-wall set$/.test(r.reason ?? ""))),
    outsideWallSetWindows: tally(outside.filter((r) => r.type === "IfcWindow")),
    outsideWallSetDoors: tally(outside.filter((r) => r.type === "IfcDoor")),
    subFrames: excluded.filter((r) => /^sub-frame/.test(r.reason ?? "")).length,
    hostBasis: Object.fromEntries(
      ["fills", "adjacent", "self", "curtain-wall part"].map((k) => [k, included.filter((r) => r.hostBasis === k).length]),
    ),
    isExternalDoors: {
      total: isExternalDoors.length,
      counted: isExternalDoors.filter((r) => r.included).length,
      notCounted: isExternalDoors
        .filter((r) => !r.included)
        .map((r) => ({ id: r.id, name: r.name, areaSqm: r.areaSqm ?? null, reason: r.reason })),
    },
    glazingApertureSqm: r2(sum(glazing)),
    glazingByOrientationSqm: roundMap(byOrientation),
    exteriorDoorSqm: r2(sum(doors)),
    exteriorDoorByOrientationSqm: roundMap(doorsByOrientation),
    windowCount: windows.length,
    windowSqm: r2(sum(windows)),
    curtainWallCount: curtain.length,
    curtainWallSqm: r2(sum(curtain)),
    /** The alternative definition, for the record: glass plates alone, mullions left out. */
    curtainWallPlateSqm: r2(curtain.reduce((t, r) => t + (r.plateSqm ?? 0), 0)),
    curtainWallBboxSqm: r2(curtain.reduce((t, r) => t + (r.bboxSqm ?? 0), 0)),
    doorCount: doors.length,
    // Glazing whose host has no sector cannot appear in the split, so the
    // split and the total would silently disagree. Counted, not hidden.
    unsectoredSqm: r2(unsectoredSqm),
    excluded: excluded.map((r) => ({ id: r.id, type: r.type, name: r.name, areaSqm: r.areaSqm ?? null, reason: r.reason })),
    unresolved,
    unresolvedSqm: r2(unresolved.reduce((t, u) => t + (u.areaSqm ?? 0), 0)),
    probe,
  };
}
