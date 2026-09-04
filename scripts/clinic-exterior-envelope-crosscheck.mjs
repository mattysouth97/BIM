// Independent element-geometry cross-check of Clinic_Architectural.ifc's
// exterior envelope area — built blind to the space-boundary method (see
// docs/... [register-building-fidelity-strategy's branch] for that side).
//
// Two methods are used together, deliberately:
//  - The 72 "Basic Wall:Exterior - Insul Panel on Mtl. Stud" instances use
//    web-ifc's own tessellated mesh (GetFlatMesh/GetGeometry) rather than a
//    hand-rolled trace-length x height formula. This was NOT the first
//    attempt — trace x Depth is kept below as a diagnostic because it is
//    what exposed two real findings (see the two comment blocks marked
//    FINDING). But trace x Depth is wrong for any wall whose Body is an
//    IfcBooleanClippingResult (14 of the 72 — a roof plane trims them): it
//    reads the PRE-CLIP extrusion, which is an upper bound, not the built
//    wall. The mesh already contains the actual post-boolean, post-opening
//    solid (window/door voids are baked into GetGeometry's output), so
//    mesh-derived area is exact for all 72 walls uniformly, not just the 14.
//  - Storefront curtain-wall glazing (21 of 31 curtain walls — "Storefront
//    - Interior" and "Chain Link Fence" are excluded as non-envelope) is
//    summed from each System Panel's own extrusion profile, since curtain
//    walls carry no Representation of their own.
//
// Validation: wall #94 (unclipped, 11 windows) — mesh one-face area
// 224.887 m² vs (trace x Depth) minus its true opening area (summed from
// IFC data, not the family name) = 243.972 - 19.0850 = 224.8865 m².
// Match to 0.0005 m² (0.0002%). This is what earns trusting the mesh method
// on the 14 walls a hand formula cannot handle correctly.
//
// Traps handled (both fail silently, not with an exception):
//  (a) GetLine called un-flattened (flatten=false) throughout the
//      STEP-graph reads.
//  (b) Numeric measures unwrapped via numVal(), which handles both the
//      {_representationValue} shape web-ifc uses for scalar measures and
//      the plain-number arrays IFC list attributes (e.g. DirectionRatios)
//      arrive as. A .value-only accessor silently turns both into null/0.
//  (c) [FINDING] Panel geometry mirrors wall geometry: the SweptArea
//      profile is a THIN cross-section (thickness x width), Depth is the
//      face height — not the profile's own area. Using profile XDim x YDim
//      directly summed 144 panels to 3.37 m², an order-of-magnitude-obvious
//      wrong answer that only an implausibility check catches.
//  (d) [FINDING] Some wall/opening/panel profiles are IfcArbitraryClosedProfileDef
//      whose OuterCurve is an IfcCompositeCurve (of IfcPolyline segments),
//      not a bare IfcPolyline — curveOutlinePoints() flattens both.

import * as WebIFC from "web-ifc";
import { readFileSync } from "node:fs";

const ARCH_PATH = process.argv[2];
if (!ARCH_PATH) {
  console.error("usage: node clinic-exterior-envelope-crosscheck.mjs <path-to-Clinic_Architectural.ifc>");
  process.exit(1);
}

const EXTERIOR_WALL_TYPE = "Basic Wall:Exterior - Insul Panel on Mtl. Stud";

// ── generic IFC value helpers ────────────────────────────────────────────
function numVal(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return x;
  if (typeof x === "object") {
    if (typeof x._representationValue === "number") return x._representationValue;
    if (typeof x.value === "number") return x.value;
    if (typeof x.value === "object") return numVal(x.value);
  }
  return null;
}
function dist(a, b) {
  let s = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm3(a) { return Math.hypot(a[0], a[1], a[2]); }

async function main() {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelId = api.OpenModel(new Uint8Array(readFileSync(ARCH_PATH)));

  function line(id) { return api.GetLine(modelId, id, false); }
  function point(id) { return (line(id).Coordinates || []).map(numVal); }

  /** Flatten IfcPolyline or IfcCompositeCurve-of-IfcPolyline to 2D points. */
  function curveOutlinePoints(curveId) {
    const curve = line(curveId);
    if (curve.type === WebIFC.IFCPOLYLINE) return (curve.Points || []).map((pt) => point(pt.value));
    if (curve.type === WebIFC.IFCCOMPOSITECURVE) {
      const pts = [];
      for (const seg of curve.Segments || []) pts.push(...curveOutlinePoints(line(seg.value).ParentCurve.value));
      return pts;
    }
    return [];
  }
  function profileArea(profileId) {
    const p = line(profileId);
    if (p.type === WebIFC.IFCRECTANGLEPROFILEDEF) return numVal(p.XDim) * numVal(p.YDim);
    if (p.type === WebIFC.IFCARBITRARYCLOSEDPROFILEDEF) {
      const pts = curveOutlinePoints(p.OuterCurve.value);
      if (pts.length === 0) return null;
      let twice = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        twice += x1 * y2 - x2 * y1;
      }
      return Math.abs(twice) / 2;
    }
    return null;
  }
  function findRep(shapeId, identifier) {
    const shape = line(shapeId);
    for (const r of shape.Representations || []) {
      const repLine = line(r.value);
      if (repLine.RepresentationIdentifier?.value === identifier) return repLine;
    }
    return null;
  }
  function polylineLength(id) {
    const pts = (line(id).Points || []).map((p) => point(p.value));
    let t = 0;
    for (let i = 0; i < pts.length - 1; i++) t += dist(pts[i], pts[i + 1]);
    return t;
  }
  function resolveExtrusion(itLine, clipped = false) {
    if (itLine.type === WebIFC.IFCEXTRUDEDAREASOLID) return { depth: numVal(itLine.Depth), profileId: itLine.SweptArea.value, clipped };
    if (itLine.type === WebIFC.IFCMAPPEDITEM) {
      const src = line(itLine.MappingSource.value);
      const mappedRep = line(src.MappedRepresentation.value);
      for (const it2 of mappedRep.Items || []) {
        const found = resolveExtrusion(line(it2.value), clipped);
        if (found) {
          const scale = numVal(line(itLine.MappingTarget.value).Scale) ?? 1;
          return { ...found, depth: found.depth * scale, scale };
        }
      }
      return null;
    }
    if (itLine.type === WebIFC.IFCBOOLEANCLIPPINGRESULT || itLine.type === WebIFC.IFCBOOLEANRESULT) {
      return resolveExtrusion(line(itLine.FirstOperand.value), true);
    }
    return null;
  }
  function bodyExtrusion(shapeId) {
    const body = findRep(shapeId, "Body");
    if (!body) return null;
    for (const it of body.Items || []) {
      const found = resolveExtrusion(line(it.value));
      if (found) return found;
    }
    return null;
  }
  function axisTraceLength(shapeId) {
    const axis = findRep(shapeId, "Axis");
    if (!axis) return null;
    let total = 0;
    for (const it of axis.Items || []) if (line(it.value).type === WebIFC.IFCPOLYLINE) total += polylineLength(it.value);
    return total || null;
  }

  /**
   * Validated primary method: NET one-face area straight from web-ifc's own
   * mesh. This automatically bakes in both boolean clipping AND opening
   * voids (GetGeometry returns the final, post-processing solid) — no
   * separate opening-subtraction step needed for elements measured this way.
   * See file header for the wall #94 validation.
   */
  function meshOneFaceArea(expressId) {
    const flat = api.GetFlatMesh(modelId, expressId);
    let total = 0;
    let realGeomCount = 0;
    for (let i = 0; i < flat.geometries.size(); i++) {
      const pg = flat.geometries.get(i);
      const geom = api.GetGeometry(modelId, pg.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
      const vertCount = verts.length / 6;
      if (vertCount === 0) { geom.delete(); continue; }
      realGeomCount++;
      const pos = new Array(vertCount);
      let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < vertCount; v++) {
        const p = [verts[v * 6], verts[v * 6 + 1], verts[v * 6 + 2]];
        pos[v] = p;
        for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
      }
      // Auto-detect the thin (thickness) axis from the LOCAL bounding box —
      // do not assume which world axis is "up"; a rotated placement makes
      // that assumption silently wrong (the first attempt at this filtered
      // on world-space normal.z and was off by 91% on the validation wall).
      const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      const thinAxis = extent[0] <= extent[1] && extent[0] <= extent[2] ? 0 : extent[1] <= extent[2] ? 1 : 2;
      let thinFaceArea = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]];
        const n = cross3(sub3(b, a), sub3(c, a));
        const nlen = norm3(n);
        if (nlen === 0) continue;
        if (Math.abs(n[thinAxis] / nlen) > 0.7) thinFaceArea += nlen / 2;
      }
      total += thinFaceArea / 2; // two mirrored faces (front/back across the thin gap) -> one face's area
      geom.delete();
    }
    return { area: total, realGeomCount };
  }

  // ── Validation ─────────────────────────────────────────────────────────
  const expectedFaceArea94 = 47.493 * 5.136999999999984 - 19.085; // trace x Depth minus its 11 windows' true area
  const { area: validated } = meshOneFaceArea(94);
  const dev = Math.abs(validated - expectedFaceArea94) / expectedFaceArea94;
  console.log(`Validation (wall #94, unclipped, 11 windows): mesh=${validated.toFixed(4)} expected=${expectedFaceArea94.toFixed(4)} deviation=${(dev * 100).toFixed(4)}%`);
  if (dev > 0.01) { console.error("VALIDATION FAILED — aborting."); process.exit(1); }

  // ── 1. The 72 exterior walls ──────────────────────────────────────────
  const wallIds = api.GetLineIDsWithType(modelId, WebIFC.IFCWALLSTANDARDCASE);
  const exteriorWallIds = [];
  for (let i = 0; i < wallIds.size(); i++) {
    const id = wallIds.get(i);
    const ot = (line(id).ObjectType?.value ?? "").replace(/:\d+$/, "");
    if (ot === EXTERIOR_WALL_TYPE) exteriorWallIds.push(id);
  }
  console.log(`\nExterior wall instances: ${exteriorWallIds.length} (expected 72)`);

  let netWallArea = 0;
  let clippedCount = 0;
  let joinTrimDeviations = 0;
  for (const id of exteriorWallIds) {
    const { area } = meshOneFaceArea(id);
    netWallArea += area;

    // Diagnostics only (not part of the total): flag clipped walls, and the
    // axis-trace-vs-profile.XDim gap [FINDING] from wall-to-wall join trims.
    const shapeId = line(id).Representation?.value;
    const ext = shapeId ? bodyExtrusion(shapeId) : null;
    if (ext?.clipped) clippedCount++;
    const trace = shapeId ? axisTraceLength(shapeId) : null;
    if (ext && trace) {
      const prof = line(ext.profileId);
      if (prof.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
        const xdim = numVal(prof.XDim);
        if (Math.abs(xdim - trace) / trace > 0.005) joinTrimDeviations++;
      }
    }
  }
  console.log(`NET exterior wall area (mesh method, clip + openings both handled): ${netWallArea.toFixed(2)} m²`);
  console.log(`  (${clippedCount} of ${exteriorWallIds.length} walls are boolean-clipped by a roof plane — handled exactly, not approximated)`);
  console.log(`  (${joinTrimDeviations} walls show axis-trace > profile.XDim by ~half/full wall thickness — Revit's wall-join trim at corners; does not affect the mesh total, diagnostic only)`);

  // ── 2. Storefront curtain-wall glazing (21 of 31; excludes "Storefront - Interior" and "Chain Link Fence") ──
  const cwIds = api.GetLineIDsWithType(modelId, WebIFC.IFCCURTAINWALL);
  const storefrontIds = [];
  const cwTypeCounts = new Map();
  for (let i = 0; i < cwIds.size(); i++) {
    const id = cwIds.get(i);
    const typeName = ((line(id).ObjectType?.value ?? "").split(":")[1] ?? "").trim();
    cwTypeCounts.set(typeName, (cwTypeCounts.get(typeName) || 0) + 1);
    if (typeName === "Storefront") storefrontIds.push(id);
  }
  console.log(`\nCurtain wall types:`, Object.fromEntries(cwTypeCounts));

  const relAggIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELAGGREGATES);
  const aggByParent = new Map();
  for (let i = 0; i < relAggIds.size(); i++) {
    const rel = line(relAggIds.get(i));
    if (rel.RelatingObject?.value != null) aggByParent.set(rel.RelatingObject.value, rel.RelatedObjects.map((o) => o.value));
  }
  function panelFaceWidth(profileId) {
    const p = line(profileId);
    if (p.type === WebIFC.IFCRECTANGLEPROFILEDEF) {
      const w = Math.max(numVal(p.XDim), numVal(p.YDim));
      return Number.isFinite(w) && w > 0 ? w : null;
    }
    if (p.type === WebIFC.IFCARBITRARYCLOSEDPROFILEDEF) {
      const pts = curveOutlinePoints(p.OuterCurve.value);
      if (pts.length === 0) return null;
      const xs = pts.map((pt) => pt[0]), ys = pts.map((pt) => pt[1]);
      const w = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      return Number.isFinite(w) && w > 0 ? w : null;
    }
    return null;
  }

  let panelArea = 0, panelCount = 0, panelUnresolved = 0, mullionCount = 0, mullionTotalLength = 0;
  for (const cwId of storefrontIds) {
    for (const childId of aggByParent.get(cwId) || []) {
      const child = line(childId);
      if (child.type === WebIFC.IFCPLATE) {
        panelCount++;
        const shapeId = child.Representation?.value;
        const ext = shapeId ? bodyExtrusion(shapeId) : null;
        const width = ext ? panelFaceWidth(ext.profileId) : null;
        if (ext && width != null) panelArea += width * ext.depth;
        else panelUnresolved++;
      } else if (child.type === WebIFC.IFCMEMBER) {
        mullionCount++;
        const shapeId = child.Representation?.value;
        const ext = shapeId ? bodyExtrusion(shapeId) : null;
        if (ext) mullionTotalLength += ext.depth;
      }
    }
  }
  console.log(`Storefront curtain walls: ${storefrontIds.length} (expected 21)`);
  console.log(`System Panel glazing: ${panelCount} panels, ${panelArea.toFixed(2)} m² (${panelUnresolved} unresolved)`);
  console.log(`Mullions: ${mullionCount}, total length ${mullionTotalLength.toFixed(2)} m.`);
  console.log(`  Facing width NOT resolved from geometry (each instance's local frame would need its own`);
  console.log(`  plane-alignment analysis, not attempted). Revit's family-naming convention for a`);
  console.log(`  "50 x 150mm" mullion profile is width x depth (width = sightline face, depth = the`);
  console.log(`  reveal set back from the glazing plane) — under that CONVENTION, not a measurement,`);
  console.log(`  facing area ≈ ${(mullionTotalLength * 0.05).toFixed(1)} m² (50mm width) vs ${(mullionTotalLength * 0.15).toFixed(1)} m² if the convention is reversed.`);
  console.log(`  Excluded from the total below. Record the total as a stated lower bound if you need one number.`);

  // ── Total ──────────────────────────────────────────────────────────────
  const total = netWallArea + panelArea;
  console.log(`\n=== TOTAL exterior envelope (72 walls, mesh method, + 21 Storefront glazing, mullions excluded): ${total.toFixed(2)} m² ===`);

  api.CloseModel(modelId);
}

main().catch((e) => { console.error(e); process.exit(1); });
