// src/lib/cad/dxf-parser.ts
// Parse DXF text into footprint polygon candidates for the CAD upload workflow.
//
// Extracts closed LWPOLYLINE and POLYLINE entities, converts their vertices to
// world meters (using the DXF $INSUNITS header), maps DXF XY → world XZ,
// centers each polygon at its bounding-box origin, and ranks candidates by area.
//
// Pure module — no React, no DOM APIs.

import DxfParser, {
  type IDxf,
  type ILwpolylineEntity,
  type IPolylineEntity,
} from "dxf-parser";

/** LWPOLYLINE vertex — IVertex is not re-exported at the package root, so
 *  we pin the minimal shape we actually read.  bulge encodes arc segments. */
type PolylineVertex = { x: number; y: number; bulge?: number };

// ---------------------------------------------------------------------------
// Arc tessellation helpers
// ---------------------------------------------------------------------------

/**
 * Number of chords used per arc segment (fixed, deterministic).
 * 16 chords per arc gives sagitta error well below 1% of radius for
 * arcs up to 180°, and area error below 2% for a full semicircle.
 */
const ARC_CHORDS = 16;

/**
 * Tessellate one DXF arc segment defined by bulge value between two vertices.
 *
 * DXF bulge = tan(θ/4) where θ is the included angle of the arc (signed:
 * positive = counter-clockwise). Returns intermediate points (excludes start,
 * includes end).
 *
 * Reference: DXF reference §ENTITIES section, LWPOLYLINE bulge field.
 */
function tessellateArc(
  x0: number, y0: number,
  x1: number, y1: number,
  bulge: number,
): Array<{ x: number; y: number }> {
  // θ = 4 * atan(bulge)  — included angle, signed
  const theta = 4 * Math.atan(bulge);
  const chordLen = Math.hypot(x1 - x0, y1 - y0);
  if (chordLen < 1e-10) return [{ x: x1, y: y1 }];

  // Radius: R = chordLen / (2 · sin(θ/2))
  const sinHalf = Math.sin(theta / 2);
  if (Math.abs(sinHalf) < 1e-10) {
    // Degenerate (nearly straight) — return end point only
    return [{ x: x1, y: y1 }];
  }
  const R = chordLen / (2 * Math.abs(sinHalf));

  // Perpendicular direction to the chord (rotated 90° CCW)
  const dx = x1 - x0;
  const dy = y1 - y0;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;

  // Distance from chord midpoint to arc centre
  const d = R * Math.cos(theta / 2);

  // For positive bulge (CCW arc), centre is to the left of the chord direction
  const sign = bulge > 0 ? 1 : -1;
  const perpLen = Math.hypot(dx, dy);
  const cx = midX - sign * (dy / perpLen) * d;
  const cy = midY + sign * (dx / perpLen) * d;

  // Start and end angles
  const startAngle = Math.atan2(y0 - cy, x0 - cx);
  const endAngle   = Math.atan2(y1 - cy, x1 - cx);

  // Sweep angle (positive = CCW, negative = CW, matching bulge sign)
  let sweep = theta; // already signed
  // Clamp sweep to avoid floating-point drift beyond ±2π
  if (Math.abs(sweep) > 2 * Math.PI + 1e-6) {
    sweep = Math.sign(sweep) * 2 * Math.PI;
  }
  // Verify start angle consistency (adjust for wrap-around)
  void endAngle; // not used directly — we parameterise by sweep

  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= ARC_CHORDS; i++) {
    const t = i / ARC_CHORDS;
    const angle = startAngle + sweep * t;
    pts.push({ x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
  }
  return pts;
}

/** GeoJSON-style 2D point: [x, z] in world meters (DXF Y → world Z). */
export type Point2D = [number, number];

/** Single-ring polygon in world meters, bbox-centered at origin. */
export type Polygon2D = Point2D[];

/** A candidate footprint polyline extracted from the DXF. */
export interface FootprintCandidate {
  /** DXF layer this polyline lives on. */
  layer: string;
  /** Number of vertices in the polyline. */
  vertexCount: number;
  /** Polygon area in square meters after unit conversion. */
  areaSqm: number;
  /** [x, z] pairs in meters, centered at bbox origin. */
  polygon: Polygon2D;
}

/** Result of parsing a DXF text payload. */
export interface ParsedDxf {
  /** Candidates sorted by areaSqm descending. Empty array if none found. */
  candidates: FootprintCandidate[];
  /** Multiplier applied to raw DXF coordinates so output is meters. */
  unitScaleToMeters: number;
  /** Non-fatal messages (unitless DXF, degenerate entities, etc.). */
  warnings: string[];
}

/**
 * DXF `$INSUNITS` group-70 codes → meter multipliers.
 * Source: AutoCAD DXF reference, INSUNITS system variable.
 * Only values we actually need are mapped; anything else falls back to 1.0
 * with a warning.
 */
const INSUNITS_TO_METERS: Record<number, number> = {
  0: 1,        // Unitless — assume meters, emit warning
  1: 0.0254,   // Inches
  2: 0.3048,   // Feet
  4: 0.001,    // Millimeters
  5: 0.01,     // Centimeters
  6: 1,        // Meters
  7: 1000,     // Kilometers
  8: 0.0000254, // Microinches
  9: 0.0000000254, // Mils (pointless but listed)
  10: 0.9144,  // Yards
  11: 1e-10,   // Angstroms
  12: 1e-9,    // Nanometers
  13: 1e-6,    // Microns
  14: 0.1,     // Decimeters
  15: 10,      // Decameters
  16: 100,     // Hectometers
  17: 1e9,     // Gigameters
};

/** Minimum accepted area (m²) — filters noise blocks, title bars, etc. */
const MIN_AREA_SQM = 10;

/** Reject absurdly huge footprints (likely scale misread). */
const MAX_REASONABLE_AREA_SQM = 10_000_000; // 10 km²

/**
 * Reserved DXF layer name for the building outline.
 *
 * When a candidate matches this pattern (case-insensitive, optional
 * hyphen/underscore), it is promoted above area-ranked peers so the upload UI
 * can skip the layer picker. Matches: BIM_OUTLINE, bim_outline, BIM-OUTLINE,
 * BIMOUTLINE.
 */
export const BIM_OUTLINE_PATTERN = /^bim[_-]?outline$/i;

/**
 * Parse a DXF text payload and extract footprint polygon candidates.
 *
 * @param text - DXF file contents as a string.
 * @returns ParsedDxf with ranked candidates plus metadata. Never throws;
 *          malformed input returns an empty candidate list with warnings.
 */
export function parseDxfText(text: string): ParsedDxf {
  const warnings: string[] = [];

  let dxf: IDxf | null = null;
  try {
    const parser = new DxfParser();
    dxf = parser.parseSync(text);
  } catch (err) {
    warnings.push(
      `DXF parse failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { candidates: [], unitScaleToMeters: 1, warnings };
  }

  if (!dxf) {
    warnings.push("DXF parser returned null — file may be empty or invalid.");
    return { candidates: [], unitScaleToMeters: 1, warnings };
  }

  // --- Resolve unit scale -------------------------------------------------

  const rawInsUnits = dxf.header?.["$INSUNITS"];
  const insUnits =
    typeof rawInsUnits === "number" && Number.isFinite(rawInsUnits)
      ? rawInsUnits
      : 0;

  let unitScaleToMeters = INSUNITS_TO_METERS[insUnits];
  if (unitScaleToMeters === undefined) {
    warnings.push(
      `Unknown $INSUNITS=${insUnits} — assuming meters (scale=1).`
    );
    unitScaleToMeters = 1;
  }
  if (insUnits === 0) {
    warnings.push("Unitless DXF — assuming meters.");
  }

  // --- Collect closed polylines ------------------------------------------

  const rawCandidates: Array<{
    layer: string;
    pointsRaw: Array<{ x: number; y: number }>;
  }> = [];

  for (const entity of dxf.entities ?? []) {
    if (entity.type === "LWPOLYLINE") {
      const lw = entity as ILwpolylineEntity;
      // `shape` in dxf-parser maps DXF group 70 bit 1 = Closed.
      if (!lw.shape) continue;
      // Minimum 2 raw vertices needed; arc tessellation can produce ≥3 expanded points.
      if (!Array.isArray(lw.vertices) || lw.vertices.length < 2) continue;

      // P2-11: tessellate bulge arcs; strip NaN vertices before processing.
      const verts = lw.vertices as PolylineVertex[];
      const cleanVerts = verts.filter(
        (v) => Number.isFinite(v.x) && Number.isFinite(v.y)
      );
      // Need at least 2 vertices; arcs can expand to ≥3 points after tessellation.
      if (cleanVerts.length < 2) continue;

      const expanded: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < cleanVerts.length; i++) {
        const v = cleanVerts[i];
        expanded.push({ x: v.x, y: v.y });
        const bulge = typeof (v as PolylineVertex).bulge === "number"
          ? (v as PolylineVertex).bulge!
          : 0;
        if (bulge !== 0) {
          const next = cleanVerts[(i + 1) % cleanVerts.length];
          // tessellateArc includes the end point; exclude it here to avoid
          // duplication (the loop will push next.x/y on the next iteration,
          // or the closing edge is implicitly handled by the polygon ring).
          const arcPts = tessellateArc(v.x, v.y, next.x, next.y, bulge);
          // Push all but the last point (the endpoint is pushed as the next vertex)
          for (let j = 0; j < arcPts.length - 1; j++) {
            expanded.push(arcPts[j]);
          }
        }
      }

      if (expanded.length < 3) continue;
      rawCandidates.push({ layer: lw.layer ?? "0", pointsRaw: expanded });
      continue;
    }

    // P2-11: closed CIRCLE entity — tessellate into a polygon ring.
    if (entity.type === "CIRCLE") {
      const circle = entity as unknown as {
        layer?: string;
        center?: { x: number; y: number; z?: number };
        radius?: number;
      };
      const cx = circle.center?.x;
      const cy = circle.center?.y;
      const r  = circle.radius;
      if (
        typeof cx !== "number" || !Number.isFinite(cx) ||
        typeof cy !== "number" || !Number.isFinite(cy) ||
        typeof r  !== "number" || !Number.isFinite(r) || r <= 0
      ) continue;

      // 32 chords gives area error < 0.5% — well within the 2% spec.
      const CIRCLE_CHORDS = 32;
      const circlePts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < CIRCLE_CHORDS; i++) {
        const angle = (2 * Math.PI * i) / CIRCLE_CHORDS;
        circlePts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
      rawCandidates.push({ layer: circle.layer ?? "0", pointsRaw: circlePts });
      continue;
    }

    if (entity.type === "POLYLINE") {
      const pl = entity as IPolylineEntity;
      // 2D polylines don't expose a direct closed flag in dxf-parser 1.1.2.
      // Treat as closed if first & last vertex coincide (within 1e-6).
      if (!Array.isArray(pl.vertices) || pl.vertices.length < 3) continue;
      if (pl.is3dPolyline || pl.is3dPolygonMesh || pl.isPolyfaceMesh) continue;
      // P2-11: strip NaN vertices before any comparison or push.
      const cleanPl = (pl.vertices as PolylineVertex[]).filter(
        (v) => Number.isFinite(v.x) && Number.isFinite(v.y)
      );
      if (cleanPl.length < 3) continue;
      const first = cleanPl[0];
      const last = cleanPl[cleanPl.length - 1];
      const coincides =
        Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
      const pts = cleanPl.map((v: PolylineVertex) => ({ x: v.x, y: v.y }));
      if (!coincides) {
        // Heuristic: treat as closed anyway if the last edge is short relative
        // to bbox diagonal — DXF polylines often omit the final vertex.
        const bbox = computeBbox(pts);
        const diag = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
        const gap = Math.hypot(first.x - last.x, first.y - last.y);
        if (gap > diag * 0.01) continue;
      }
      rawCandidates.push({
        layer: pl.layer ?? "0",
        // Drop duplicate closing vertex if present so the polygon is a clean ring.
        pointsRaw: coincides ? pts.slice(0, -1) : pts,
      });
    }
  }

  // --- Convert + center each candidate ------------------------------------

  const candidates: FootprintCandidate[] = [];

  for (const rc of rawCandidates) {
    // Convert to meters; drop any stray NaN/Infinity that slipped through
    // (P2-11: closes the NaN-vertex filter hole at the conversion stage).
    const scaled = rc.pointsRaw
      .map((p) => ({
        x: p.x * unitScaleToMeters,
        y: p.y * unitScaleToMeters,
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (scaled.length < 3) continue;

    // Bounding box.
    const bbox = computeBbox(scaled);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;

    // Center at bbox origin; map DXF XY → world XZ so DXF Y becomes world Z.
    // (Three.js world: +X right, +Y up, +Z toward viewer — building footprints
    //  lie on the XZ plane.)
    const polygon: Polygon2D = scaled.map((p) => [p.x - cx, p.y - cy]);

    const areaSqm = Math.abs(signedArea(polygon));
    if (areaSqm < MIN_AREA_SQM) continue;
    if (areaSqm > MAX_REASONABLE_AREA_SQM) {
      warnings.push(
        `Skipped layer '${rc.layer}' candidate with implausibly large area ${areaSqm.toFixed(0)} m² — check DXF units.`
      );
      continue;
    }

    candidates.push({
      layer: rc.layer,
      vertexCount: polygon.length,
      areaSqm,
      polygon,
    });
  }

  // Rank by BIM_OUTLINE layer convention first (case-insensitive, optional
  // hyphen/underscore), then by area descending for ties and non-BIM layers.
  // A well-authored DXF names its building outline `BIM_OUTLINE` so the
  // upload-stage can skip the layer picker entirely.
  candidates.sort((a, b) => {
    const aIsOutline = BIM_OUTLINE_PATTERN.test(a.layer);
    const bIsOutline = BIM_OUTLINE_PATTERN.test(b.layer);
    if (aIsOutline && !bIsOutline) return -1;
    if (bIsOutline && !aIsOutline) return 1;
    return b.areaSqm - a.areaSqm;
  });

  return { candidates, unitScaleToMeters, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBbox(points: { x: number; y: number }[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Shoelace formula — signed area of a simple 2D polygon. */
function signedArea(ring: Polygon2D): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
