// src/lib/generative/geom/polygon.ts
//
// The polygon half of the geometry kernel: winding, predicates, booleans,
// offsets, and the rect fits the space solver asks of a non-rectangular plate.
//
// UNITS    metres, everywhere. No millimetres cross this boundary.
// PLANE    XZ. A point is `[x, z]`, matching `BuildingRecipe.footprintPolygon`
//          and everything in `generate/`.
// WINDING  outer ring counter-clockwise, holes clockwise, where "counter-
//          clockwise" means a POSITIVE shoelace sum with z in the role of y —
//          the earcut convention `generate/massing.ts` already emits.
// RINGS    are OPEN: the closing edge from the last vertex back to the first is
//          implied and never stored. Callers that hand us a closed ring get the
//          duplicate dropped rather than an error.
//
// `Ring`/`Polygon` here are structurally identical to the ones in
// `generate/massing.ts`, so values pass both ways without conversion.

// polygon-clipping's ESM build exposes only a default export object; named
// imports type-check against its .d.ts but fail Turbopack's static analysis.
import polygonClipping, {
  type MultiPolygon as ClipMultiPolygon,
  type Polygon as ClipPolygon,
} from "polygon-clipping";

const {
  difference: clipDifference,
  intersection: clipIntersection,
  union: clipUnion,
  xor: clipXor,
} = polygonClipping;

export type Vec2 = [number, number];
export type Ring = Vec2[];
/** `[outerRing, ...holeRings]` — one connected area, possibly with voids. */
export type Polygon = Ring[];
/** Boolean results are disjoint in general, so they are always a set. */
export type MultiPolygon = Polygon[];

/** Axis-aligned rectangle by extents; structurally the `Rect` of `generate/types.ts`. */
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Default "same point" distance, metres. One nanometre: small enough that no
 * real coordinate is within it by accident, large enough to absorb the float
 * error of a few dozen adds. Every predicate takes it as an explicit argument;
 * this is only the default.
 */
export const GEOM_EPS_M = 1e-9;

/** Below this a ring is not a shape, it is round-off. Square metres. */
const AREA_EPS_SQM = 1e-12;

/* ------------------------------------------------------------------ */
/* Small vector helpers                                                */
/* ------------------------------------------------------------------ */

export const vecAdd = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const vecSub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const vecScale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const vecDot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
/** 2D cross product — the z-component of the 3D cross, i.e. a signed area. */
export const vecCross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const vecLength = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const vecDistance = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Unit vector, or `[0, 0]` when the input has no direction to report. */
export function vecNormalize(a: Vec2): Vec2 {
  const len = vecLength(a);
  return len > 0 ? [a[0] / len, a[1] / len] : [0, 0];
}

export const vecLerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

export const vecEquals = (a: Vec2, b: Vec2, toleranceM = GEOM_EPS_M): boolean =>
  Math.abs(a[0] - b[0]) <= toleranceM && Math.abs(a[1] - b[1]) <= toleranceM;

/* ------------------------------------------------------------------ */
/* Winding and area                                                    */
/* ------------------------------------------------------------------ */

/**
 * Shoelace area WITH sign: positive for counter-clockwise (outer rings),
 * negative for clockwise (holes). The sign is the winding test — never compare
 * vertex order directly.
 */
export function signedRingArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/** Unsigned shoelace area of a ring. Matches `massing.ringArea`. */
export const ringArea = (ring: Ring): number => Math.abs(signedRingArea(ring));

/** Net area: outer ring minus every hole. Matches `massing.polygonArea`. */
export function polygonArea(polygon: Polygon): number {
  if (polygon.length === 0) return 0;
  return polygon.reduce(
    (area, ring, index) => (index === 0 ? ringArea(ring) : area - ringArea(ring)),
    0,
  );
}

export const multiPolygonArea = (multi: MultiPolygon): number =>
  multi.reduce((sum, polygon) => sum + polygonArea(polygon), 0);

export const isRingCCW = (ring: Ring): boolean => signedRingArea(ring) > 0;

/**
 * Return `ring` wound as asked. The input is returned unchanged when it already
 * matches, so this is free on the common path and never mutates.
 */
export function ensureWinding(ring: Ring, ccw: boolean): Ring {
  if (ring.length < 3) return ring;
  return isRingCCW(ring) === ccw ? ring : ring.slice().reverse();
}

/** Outer ring counter-clockwise, every hole clockwise. */
export function ensurePolygonWinding(polygon: Polygon): Polygon {
  return polygon.map((ring, index) => ensureWinding(ring, index === 0));
}

/** Largest-area polygon of a boolean result, or null when the result is empty. */
export function largestPolygon(multi: MultiPolygon): Polygon | null {
  let best: Polygon | null = null;
  let bestArea = -Infinity;
  for (const polygon of multi) {
    const area = polygonArea(polygon);
    if (area > bestArea) {
      bestArea = area;
      best = polygon;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Drop consecutive duplicate vertices and any explicit closing vertex. Rings
 * are open by convention, so a caller-supplied closed ring is normalised here
 * rather than rejected.
 */
export function dedupeRing(ring: Ring, toleranceM = GEOM_EPS_M): Ring {
  const out: Ring = [];
  for (const point of ring) {
    const last = out[out.length - 1];
    if (last !== undefined && vecEquals(last, point, toleranceM)) continue;
    out.push([point[0], point[1]]);
  }
  while (out.length >= 2 && vecEquals(out[0], out[out.length - 1], toleranceM)) out.pop();
  return out;
}

/* ------------------------------------------------------------------ */
/* Bounds                                                              */
/* ------------------------------------------------------------------ */

/** Null for a ring with no vertices — an empty extent is not a rect of zeroes. */
export function ringBounds(ring: Ring): Rect | null {
  if (ring.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Holes are inside the outer ring by definition, so only the outer ring counts. */
export const polygonBounds = (polygon: Polygon): Rect | null =>
  polygon.length === 0 ? null : ringBounds(polygon[0]);

/**
 * Extents measured along axes rotated `rotationRad` from world X/Z — i.e. the
 * bounds of the polygon seen from a frame with that rotation, expressed in that
 * frame's coordinates. Equivalent to `ringBounds(rotateRing(outer, -rotation))`.
 */
export function polygonBoundsRotated(polygon: Polygon, rotationRad: number): Rect | null {
  if (polygon.length === 0 || polygon[0].length === 0) return null;
  const cos = Math.cos(-rotationRad);
  const sin = Math.sin(-rotationRad);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of polygon[0]) {
    const rx = x * cos - z * sin;
    const rz = x * sin + z * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (rz < minZ) minZ = rz;
    if (rz > maxZ) maxZ = rz;
  }
  return { minX, maxX, minZ, maxZ };
}

/* ------------------------------------------------------------------ */
/* Rects                                                               */
/* ------------------------------------------------------------------ */

export const rectWidth = (rect: Rect): number => rect.maxX - rect.minX;
export const rectDepth = (rect: Rect): number => rect.maxZ - rect.minZ;
export const rectArea = (rect: Rect): number =>
  Math.max(0, rectWidth(rect)) * Math.max(0, rectDepth(rect));
export const rectCentre = (rect: Rect): Vec2 => [
  (rect.minX + rect.maxX) / 2,
  (rect.minZ + rect.maxZ) / 2,
];

/** Counter-clockwise corner ring, starting at (minX, minZ). */
export const rectToRing = (rect: Rect): Ring => [
  [rect.minX, rect.minZ],
  [rect.maxX, rect.minZ],
  [rect.maxX, rect.maxZ],
  [rect.minX, rect.maxZ],
];

export const rectToPolygon = (rect: Rect): Polygon => [rectToRing(rect)];

/** Shrink towards the centre; a rect thinner than `2 * by` collapses to its centre line. */
function insetRect(rect: Rect, by: number): Rect {
  const [cx, cz] = rectCentre(rect);
  return {
    minX: Math.min(rect.minX + by, cx),
    maxX: Math.max(rect.maxX - by, cx),
    minZ: Math.min(rect.minZ + by, cz),
    maxZ: Math.max(rect.maxZ - by, cz),
  };
}

/* ------------------------------------------------------------------ */
/* Point predicates                                                    */
/* ------------------------------------------------------------------ */

/** Perpendicular distance from `p` to segment `a`–`b`, clamped to the segment. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return vecDistance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * abz));
}

/** Is the point within `toleranceM` of the ring's boundary (closing edge included)? */
export function pointOnRing(point: Vec2, ring: Ring, toleranceM = GEOM_EPS_M): boolean {
  if (ring.length === 0) return false;
  if (ring.length === 1) return vecDistance(point, ring[0]) <= toleranceM;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (distanceToSegment(point, a, b) <= toleranceM) return true;
  }
  return false;
}

/** Crossing-number test. Boundary results are UNDEFINED — callers use `pointInRing`. */
function pointInRingStrict(point: Vec2, ring: Ring): boolean {
  if (ring.length < 3) return false;
  const [x, z] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z) {
      const xAt = xi + ((z - zi) / (zj - zi)) * (xj - xi);
      if (x < xAt) inside = !inside;
    }
  }
  return inside;
}

/**
 * Containment with an explicit boundary band: a point within `toleranceM` of the
 * ring counts as inside. Winding is irrelevant — this asks about the enclosed
 * area, not the direction it was drawn in.
 */
export function pointInRing(point: Vec2, ring: Ring, toleranceM = GEOM_EPS_M): boolean {
  if (pointOnRing(point, ring, toleranceM)) return true;
  return pointInRingStrict(point, ring);
}

/**
 * Containment in `[outer, ...holes]`. A point strictly inside a hole is OUT; a
 * point on a hole's edge is IN, because that edge is material the polygon owns.
 */
export function pointInPolygon(
  point: Vec2,
  polygon: Polygon,
  toleranceM = GEOM_EPS_M,
): boolean {
  if (polygon.length === 0) return false;
  for (const ring of polygon) {
    if (pointOnRing(point, ring, toleranceM)) return true;
  }
  if (!pointInRingStrict(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRingStrict(point, polygon[i])) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Segment intersection                                                */
/* ------------------------------------------------------------------ */

/**
 * The single point where `a0`–`a1` meets `b0`–`b1`, endpoints included, or null.
 *
 * Parallel and collinear-overlapping pairs return null: they meet in a segment,
 * not a point, and inventing a representative point from one would be a lie.
 * Use `segmentsOverlapCollinear` when that case matters.
 *
 * `toleranceM` widens each segment's parameter range by that distance, so a
 * near-miss at an endpoint still reports the crossing.
 */
export function segmentIntersection(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
  toleranceM = GEOM_EPS_M,
): Vec2 | null {
  const r = vecSub(a1, a0);
  const s = vecSub(b1, b0);
  const denom = vecCross(r, s);
  const rLen = vecLength(r);
  const sLen = vecLength(s);
  if (rLen === 0 || sLen === 0) return null;
  // Relative degeneracy test: `denom` is an area, so it must be compared
  // against one, not against a bare epsilon.
  if (Math.abs(denom) <= 1e-12 * rLen * sLen) return null;

  const qp = vecSub(b0, a0);
  const t = vecCross(qp, s) / denom;
  const u = vecCross(qp, r) / denom;
  const tSlack = toleranceM / rLen;
  const uSlack = toleranceM / sLen;
  if (t < -tSlack || t > 1 + tSlack) return null;
  if (u < -uSlack || u > 1 + uSlack) return null;
  return [a0[0] + t * r[0], a0[1] + t * r[1]];
}

/** True when the two segments are collinear AND share more than a point. */
export function segmentsOverlapCollinear(
  a0: Vec2,
  a1: Vec2,
  b0: Vec2,
  b1: Vec2,
  toleranceM = GEOM_EPS_M,
): boolean {
  const r = vecSub(a1, a0);
  const rLen = vecLength(r);
  if (rLen === 0) return false;
  const dir = vecScale(r, 1 / rLen);
  const offB0 = Math.abs(vecCross(dir, vecSub(b0, a0)));
  const offB1 = Math.abs(vecCross(dir, vecSub(b1, a0)));
  if (offB0 > toleranceM || offB1 > toleranceM) return false;

  const t0 = vecDot(vecSub(b0, a0), dir);
  const t1 = vecDot(vecSub(b1, a0), dir);
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return Math.min(hi, rLen) - Math.max(lo, 0) > toleranceM;
}

/**
 * Does any pair of non-adjacent edges cross? Adjacent edges are skipped because
 * they legitimately share an endpoint. O(n²) — rings here are schematic-scale.
 */
export function ringSelfIntersects(ring: Ring, toleranceM = GEOM_EPS_M): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a0 = ring[i];
    const a1 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      // Skip the shared-endpoint pairs: j === i + 1, and the wrap pair (0, n-1).
      if (j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      const b0 = ring[j];
      const b1 = ring[(j + 1) % n];
      if (segmentIntersection(a0, a1, b0, b1, toleranceM) !== null) return true;
      if (segmentsOverlapCollinear(a0, a1, b0, b1, toleranceM)) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Booleans                                                            */
/* ------------------------------------------------------------------ */
//
// `polygon-clipping` (Martinez sweep-line, MIT, two small deps) does the real
// work. It is wrapped here so its closed-ring, GeoJSON-ordered format never
// reaches a caller: everything in and out of these functions is an open ring in
// the engine's winding.

/** Closed rings, as the clipper expects them. Degenerate rings are dropped. */
function toClipperPolygon(polygon: Polygon): ClipPolygon | null {
  const rings: ClipPolygon = [];
  for (const ring of polygon) {
    const open = dedupeRing(ring);
    if (open.length < 3) continue;
    if (ringArea(open) <= AREA_EPS_SQM) continue;
    rings.push([...open.map((p): Vec2 => [p[0], p[1]]), [open[0][0], open[0][1]]]);
  }
  return rings.length === 0 ? null : rings;
}

function fromClipperResult(result: ClipMultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const polygon of result) {
    const rings: Polygon = [];
    for (const ring of polygon) {
      const open = dedupeRing(ring.map((p): Vec2 => [p[0], p[1]]));
      if (open.length < 3) continue;
      if (ringArea(open) <= AREA_EPS_SQM) continue;
      rings.push(open);
    }
    if (rings.length === 0) continue;
    out.push(ensurePolygonWinding(rings));
  }
  return out;
}

type ClipOp = (geom: ClipPolygon, ...geoms: ClipPolygon[]) => ClipMultiPolygon;

/**
 * The clipper throws on a handful of pathological inputs (exactly-coincident
 * vertex chains, mostly). An empty result is the honest report of "this clip
 * produced nothing usable" and is what every caller here already handles —
 * propagating the throw would take down a whole generation over one bad plate.
 */
function runClip(op: ClipOp, subject: Polygon, clips: Polygon[]): MultiPolygon {
  const subjectGeom = toClipperPolygon(subject);
  if (subjectGeom === null) return [];
  const clipGeoms: ClipPolygon[] = [];
  for (const clip of clips) {
    const geom = toClipperPolygon(clip);
    if (geom !== null) clipGeoms.push(geom);
  }
  try {
    return fromClipperResult(op(subjectGeom, ...clipGeoms));
  } catch {
    return [];
  }
}

/** Self-union: repairs winding, removes self-intersections, splits into parts. */
export const normalisePolygon = (polygon: Polygon): MultiPolygon =>
  runClip(clipUnion as ClipOp, polygon, []);

export const polygonUnion = (a: Polygon, b: Polygon): MultiPolygon =>
  runClip(clipUnion as ClipOp, a, [b]);

export const polygonIntersection = (a: Polygon, b: Polygon): MultiPolygon =>
  runClip(clipIntersection as ClipOp, a, [b]);

/** `a` minus `b`. Holes appear in the result when `b` sits wholly inside `a`. */
export const polygonDifference = (a: Polygon, b: Polygon): MultiPolygon =>
  runClip(clipDifference as ClipOp, a, [b]);

export const polygonXor = (a: Polygon, b: Polygon): MultiPolygon =>
  runClip(clipXor as ClipOp, a, [b]);

export function unionAll(polygons: Polygon[]): MultiPolygon {
  if (polygons.length === 0) return [];
  return runClip(clipUnion as ClipOp, polygons[0], polygons.slice(1));
}

export function intersectAll(polygons: Polygon[]): MultiPolygon {
  if (polygons.length === 0) return [];
  return runClip(clipIntersection as ClipOp, polygons[0], polygons.slice(1));
}

export function differenceAll(subject: Polygon, clips: Polygon[]): MultiPolygon {
  if (clips.length === 0) return normalisePolygon(subject);
  return runClip(clipDifference as ClipOp, subject, clips);
}

/* ------------------------------------------------------------------ */
/* Offset                                                              */
/* ------------------------------------------------------------------ */

export interface OffsetOptions {
  /**
   * Mitre length cap as a multiple of |distance|. A corner sharper than this
   * would shoot off to infinity, so it is bevelled instead.
   */
  miterLimit?: number;
  /** Vertices closer together than this are welded before offsetting. */
  weldToleranceM?: number;
}

/**
 * Mitred parallel offset of a single ring. POSITIVE grows the enclosed area,
 * NEGATIVE shrinks it, regardless of the ring's stored winding; the result is
 * returned in the winding it arrived in.
 *
 * Returns null — never throws — when the offset destroys the ring: collapsed
 * area, flipped winding, or a self-intersection. That is the common case for an
 * inward offset larger than the shape's narrowest half-width, and the caller's
 * only correct response is to use a smaller distance, so a null says exactly
 * what happened.
 *
 * CAVEAT: this is a mitre offset, not a full straight-skeleton one. It cannot
 * split a ring into two, so a shape that pinches into two lobes under an inward
 * offset reports null rather than returning both lobes. `offsetPolygon` inherits
 * the same limit.
 */
export function offsetRing(
  ring: Ring,
  distanceM: number,
  options: OffsetOptions = {},
): Ring | null {
  const weld = options.weldToleranceM ?? GEOM_EPS_M;
  const miterLimit = options.miterLimit ?? 4;

  const clean = dedupeRing(ring, weld);
  if (clean.length < 3) return null;
  if (distanceM === 0) return ensureWinding(clean, isRingCCW(ring));

  const wasCCW = isRingCCW(clean);
  const work = wasCCW ? clean : clean.slice().reverse();
  const n = work.length;

  // Outward normal of edge i for a CCW ring: rotate the unit direction by -90°.
  const dirs: Vec2[] = [];
  const normals: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const dir = vecNormalize(vecSub(work[(i + 1) % n], work[i]));
    dirs.push(dir);
    normals.push([dir[1], -dir[0]]);
  }

  // seams[i] is what the junction between edge i and edge i+1 contributes: one
  // mitred vertex, or the two ends of a bevel.
  const seams: Vec2[][] = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    // Vertex work[j] is where edge i ends and edge j begins.
    const endOfI: Vec2 = vecAdd(work[j], vecScale(normals[i], distanceM));
    const startOfJ: Vec2 = vecAdd(work[j], vecScale(normals[j], distanceM));
    const cross = vecCross(dirs[i], dirs[j]);

    if (Math.abs(cross) <= 1e-12) {
      // Straight-through or a 180° spike: no mitre exists, use the offset point.
      seams.push([endOfI]);
      continue;
    }

    const hit = segmentIntersectionOfLines(endOfI, dirs[i], startOfJ, dirs[j]);
    if (hit === null) {
      seams.push([endOfI]);
      continue;
    }
    if (vecDistance(hit, work[j]) > miterLimit * Math.abs(distanceM)) {
      // Bevel: walk off the end of edge i and onto the start of edge j.
      seams.push([endOfI, startOfJ]);
      continue;
    }
    seams.push([hit]);
  }

  // An offset that over-shoots turns the ring inside out, and for a convex ring
  // that is a POINT REFLECTION — signed area stays positive, so the sign test
  // below cannot see it. What does see it is an edge that now runs backwards:
  // edge i spans the seam before it to the seam after it, and its direction must
  // still agree with the original edge's.
  for (let i = 0; i < n; i += 1) {
    const before = seams[(i - 1 + n) % n];
    const tail = before[before.length - 1];
    const head = seams[i][0];
    if (vecDot(vecSub(head, tail), dirs[i]) < 0) return null;
  }

  // The first emitted vertex belongs to the seam between edge 0 and edge 1, so
  // the ring is rotated by one vertex — harmless, rings have no start.
  const out: Ring = [];
  for (const seam of seams) for (const point of seam) out.push(point);
  const result = dedupeRing(out, weld);
  if (result.length < 3) return null;
  const area = signedRingArea(result);
  if (area <= AREA_EPS_SQM) return null;
  if (ringSelfIntersects(result, weld)) return null;

  return ensureWinding(result, wasCCW);
}

/** Intersection of two infinite lines given a point and a direction each. */
function segmentIntersectionOfLines(p: Vec2, dp: Vec2, q: Vec2, dq: Vec2): Vec2 | null {
  const denom = vecCross(dp, dq);
  if (denom === 0) return null;
  const t = vecCross(vecSub(q, p), dq) / denom;
  return [p[0] + t * dp[0], p[1] + t * dp[1]];
}

/**
 * Offset every ring of `[outer, ...holes]` consistently: POSITIVE grows the
 * material, so the outer ring moves out and every hole shrinks. A hole the
 * material closes over is dropped; if the OUTER ring collapses the whole
 * polygon is gone and null is returned.
 */
export function offsetPolygon(
  polygon: Polygon,
  distanceM: number,
  options: OffsetOptions = {},
): Polygon | null {
  if (polygon.length === 0) return null;
  const outer = offsetRing(ensureWinding(polygon[0], true), distanceM, options);
  if (outer === null) return null;

  const result: Polygon = [outer];
  for (let i = 1; i < polygon.length; i += 1) {
    // A hole is the material's boundary seen from the other side, so it takes
    // the opposite sign. Offsetting it as CCW keeps one code path.
    const asCCW = ensureWinding(polygon[i], true);
    const moved = offsetRing(asCCW, -distanceM, options);
    if (moved === null) continue;
    result.push(ensureWinding(moved, false));
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Rect ↔ polygon predicates (what the space solver needs)             */
/* ------------------------------------------------------------------ */

/**
 * Liang–Barsky: does the segment have a portion of POSITIVE length strictly
 * inside `rect`? Touching an edge is not being inside it.
 */
function segmentCrossesRectInterior(p0: Vec2, p1: Vec2, rect: Rect): boolean {
  const dx = p1[0] - p0[0];
  const dz = p1[1] - p0[1];
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, p0[0] - rect.minX)) return false;
  if (!clip(dx, rect.maxX - p0[0])) return false;
  if (!clip(-dz, p0[1] - rect.minZ)) return false;
  if (!clip(dz, rect.maxZ - p0[1])) return false;
  return t1 - t0 > 0;
}

function anyEdgeCrossesRectInterior(polygon: Polygon, rect: Rect): boolean {
  if (rect.maxX <= rect.minX || rect.maxZ <= rect.minZ) return false;
  for (const ring of polygon) {
    const n = ring.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i += 1) {
      if (segmentCrossesRectInterior(ring[i], ring[(i + 1) % n], rect)) return true;
    }
  }
  return false;
}

/**
 * Does the axis-aligned rect lie WHOLLY inside the polygon, holes respected?
 *
 * A predicate, not a clip — `rectPolygonIntersection` returns the geometry. It
 * is the fit test the space solver runs per candidate room, so it avoids the
 * boolean engine: no polygon edge may cut the rect's interior (shrunk by
 * `toleranceM`, so a rect flush against the perimeter still passes), and the
 * centre must be inside. Those two together are exact for any simple polygon —
 * if the boundary misses the interior, the rect is wholly on one side of it.
 */
export function clipRectToPolygon(
  rect: Rect,
  polygon: Polygon,
  toleranceM = GEOM_EPS_M,
): boolean {
  if (polygon.length === 0) return false;
  if (rectWidth(rect) < 0 || rectDepth(rect) < 0) return false;
  const inner = insetRect(rect, toleranceM);
  if (anyEdgeCrossesRectInterior(polygon, inner)) return false;
  return pointInPolygon(rectCentre(rect), polygon, toleranceM);
}

/** Do the rect and the polygon share area of more than tolerance-scale size? */
export function rectPolygonOverlap(
  rect: Rect,
  polygon: Polygon,
  toleranceM = GEOM_EPS_M,
): boolean {
  if (polygon.length === 0) return false;
  if (rectWidth(rect) < 0 || rectDepth(rect) < 0) return false;
  const inner = insetRect(rect, toleranceM);
  // A boundary through the rect's interior puts material on the inside of it.
  if (anyEdgeCrossesRectInterior(polygon, inner)) return true;
  return pointInPolygon(rectCentre(rect), polygon, toleranceM);
}

/** The actual geometry of rect ∩ polygon, for when the predicate is not enough. */
export const rectPolygonIntersection = (rect: Rect, polygon: Polygon): MultiPolygon =>
  polygonIntersection(rectToPolygon(rect), polygon);

/* ------------------------------------------------------------------ */
/* Largest inscribed rect                                              */
/* ------------------------------------------------------------------ */

export interface InscribedRectOptions {
  /** Grow the grid answer back out by binary search on each side. Default true. */
  refine?: boolean;
  /** Fit tolerance handed to `clipRectToPolygon`. */
  toleranceM?: number;
  /** Guard against a fine step on a large plate; the step is coarsened to fit. */
  maxCells?: number;
}

const REFINE_STEPS = 24;

/**
 * Approximate largest axis-aligned rectangle that fits inside the polygon,
 * holes respected.
 *
 * Grid-sample then maximal-rectangle-in-a-binary-matrix, then (by default) grow
 * each side back out by binary search. APPROXIMATE by construction: the answer
 * is a lower bound on the true largest rect, off by up to one grid step per side
 * before refinement. It is deterministic, which matters more here than optimal —
 * the solver uses it to find allocatable regions, not to prove a bound.
 *
 * Rotated plates: rotate the polygon into a `LocalFrame` first (`frame.ts`) and
 * rotate the answer back; "axis-aligned" here means aligned to the argument.
 */
export function largestInscribedAxisAlignedRect(
  polygon: Polygon,
  gridStepM: number,
  options: InscribedRectOptions = {},
): Rect | null {
  const tolerance = options.toleranceM ?? GEOM_EPS_M;
  const maxCells = options.maxCells ?? 250_000;
  const refine = options.refine ?? true;

  const bounds = polygonBounds(polygon);
  if (bounds === null) return null;
  const width = rectWidth(bounds);
  const depth = rectDepth(bounds);
  if (!(width > 0) || !(depth > 0) || !(gridStepM > 0)) return null;

  let cols = Math.max(1, Math.ceil(width / gridStepM));
  let rows = Math.max(1, Math.ceil(depth / gridStepM));
  if (cols * rows > maxCells) {
    const scale = Math.sqrt((cols * rows) / maxCells);
    cols = Math.max(1, Math.floor(cols / scale));
    rows = Math.max(1, Math.floor(rows / scale));
  }
  const stepX = width / cols;
  const stepZ = depth / rows;

  // A cell is free only when the WHOLE cell fits, so any rectangle of free
  // cells fits too — that is what makes the grid answer a valid rect, not just
  // a plausible one.
  const free: boolean[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const row: boolean[] = new Array<boolean>(cols);
    const minZ = bounds.minZ + r * stepZ;
    for (let c = 0; c < cols; c += 1) {
      const minX = bounds.minX + c * stepX;
      row[c] = clipRectToPolygon(
        { minX, maxX: minX + stepX, minZ, maxZ: minZ + stepZ },
        polygon,
        tolerance,
      );
    }
    free.push(row);
  }

  const heights = new Array<number>(cols).fill(0);
  let bestCells = 0;
  let best: { c0: number; c1: number; r0: number; r1: number } | null = null;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) heights[c] = free[r][c] ? heights[c] + 1 : 0;

    const stack: { index: number; height: number }[] = [];
    for (let c = 0; c <= cols; c += 1) {
      const h = c === cols ? 0 : heights[c];
      let start = c;
      while (stack.length > 0 && stack[stack.length - 1].height > h) {
        const top = stack.pop() as { index: number; height: number };
        const cells = top.height * (c - top.index);
        if (cells > bestCells) {
          bestCells = cells;
          best = { c0: top.index, c1: c, r0: r - top.height + 1, r1: r + 1 };
        }
        start = top.index;
      }
      if (h > 0) stack.push({ index: start, height: h });
    }
  }

  if (best === null || bestCells === 0) return null;

  let rect: Rect = {
    minX: bounds.minX + best.c0 * stepX,
    maxX: bounds.minX + best.c1 * stepX,
    minZ: bounds.minZ + best.r0 * stepZ,
    maxZ: bounds.minZ + best.r1 * stepZ,
  };
  if (!refine) return rect;

  // Grow one side at a time; each side keeps whatever it wins, so the order is
  // part of the answer and is therefore fixed.
  const sides: ("minX" | "maxX" | "minZ" | "maxZ")[] = ["minX", "maxX", "minZ", "maxZ"];
  const limitFor = (side: (typeof sides)[number]) =>
    side === "minX"
      ? bounds.minX
      : side === "maxX"
        ? bounds.maxX
        : side === "minZ"
          ? bounds.minZ
          : bounds.maxZ;

  for (const side of sides) {
    let lo = rect[side];
    let hi = limitFor(side);
    for (let step = 0; step < REFINE_STEPS; step += 1) {
      const mid = (lo + hi) / 2;
      if (clipRectToPolygon({ ...rect, [side]: mid }, polygon, tolerance)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    rect = { ...rect, [side]: lo };
  }

  return rect;
}
