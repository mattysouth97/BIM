// src/lib/generative/geom/curves.ts
//
// PlanCurve: the curve vocabulary a schematic can be drawn in, and the
// tessellation that turns it into the rings the rest of the engine understands.
//
// UNITS metres, PLANE XZ, points are `[x, z]` — as everywhere in `geom/`.
//
// PARAMETERISATION is per kind and is NOT arc length everywhere. Pretending it
// were would mean hiding a sampling tolerance inside `evaluate`, and a curve
// kernel whose point-at-t depends on an invisible constant is not deterministic
// in any useful sense. So:
//   line      t is arc length (exact).
//   arc       t maps linearly onto the swept angle, which for a circle IS arc
//             length (exact).
//   polyline  t maps onto cumulative chord length (exact).
//   bezier    t is the Bernstein parameter. NOT arc length.
//   spline    t maps onto the segment index: u = t · segmentCount. NOT arc length.
// `curvePointAtDistance` is the arc-length accessor, and it takes its tolerance
// as an argument.
//
// SPLINES are CENTRIPETAL Catmull-Rom (α = 0.5), converted segment-by-segment to
// cubic Béziers. Centripetal rather than uniform because uniform Catmull-Rom
// loops and cusps when control points bunch up, which is exactly what a traced
// or hand-drawn schematic does. `tension` scales the derived handles; 1 is
// standard Catmull-Rom, 0 gives straight segments.

import {
  dedupeRing,
  ensureWinding,
  vecDistance,
  vecLength,
  vecNormalize,
  vecSub,
  type Ring,
  type Vec2,
} from "./polygon";

/** Default tessellation tolerance, metres. 1 mm — below any drafting tolerance. */
export const DEFAULT_CURVE_TOLERANCE_M = 0.001;

/** Hard cap so a pathological radius/tolerance ratio cannot allocate forever. */
const MAX_SEGMENTS = 4096;
/** Recursion cap for adaptive Bézier flattening. */
const MAX_BEZIER_DEPTH = 18;

export interface LineCurve {
  kind: "line";
  start: Vec2;
  end: Vec2;
}

/**
 * Circular arc. `endAngleRad - startAngleRad` is the SWEEP: its sign gives the
 * direction (positive is counter-clockwise in the XZ sign convention) and its
 * magnitude may exceed 2π for a multi-turn arc. Angles are never normalised,
 * because normalising them would throw the sweep away.
 */
export interface ArcCurve {
  kind: "arc";
  centre: Vec2;
  radiusM: number;
  startAngleRad: number;
  endAngleRad: number;
}

export interface PolylineCurve {
  kind: "polyline";
  points: Vec2[];
  /** When true the closing edge back to `points[0]` is part of the curve. */
  closed?: boolean;
}

export interface BezierCurve {
  kind: "bezier";
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
}

export interface SplineCurve {
  kind: "spline";
  points: Vec2[];
  /** Handle scale; 1 = standard Catmull-Rom, 0 = polyline. Default 1. */
  tension?: number;
  closed?: boolean;
}

export type PlanCurve = LineCurve | ArcCurve | PolylineCurve | BezierCurve | SplineCurve;

/* ------------------------------------------------------------------ */
/* Constructors                                                        */
/* ------------------------------------------------------------------ */

export const line = (start: Vec2, end: Vec2): LineCurve => ({ kind: "line", start, end });

export const arc = (
  centre: Vec2,
  radiusM: number,
  startAngleRad: number,
  endAngleRad: number,
): ArcCurve => ({ kind: "arc", centre, radiusM, startAngleRad, endAngleRad });

export const polyline = (points: Vec2[], closed = false): PolylineCurve => ({
  kind: "polyline",
  points,
  closed,
});

export const bezier = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): BezierCurve => ({
  kind: "bezier",
  p0,
  p1,
  p2,
  p3,
});

export const spline = (points: Vec2[], tension = 1, closed = false): SplineCurve => ({
  kind: "spline",
  points,
  tension,
  closed,
});

/* ------------------------------------------------------------------ */
/* Cubic Bézier primitives                                             */
/* ------------------------------------------------------------------ */

type Cubic = [Vec2, Vec2, Vec2, Vec2];

function cubicAt(c: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0],
    a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1],
  ];
}

function cubicDerivative(c: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const d = 3 * t * t;
  return [
    a * (c[1][0] - c[0][0]) + b * (c[2][0] - c[1][0]) + d * (c[3][0] - c[2][0]),
    a * (c[1][1] - c[0][1]) + b * (c[2][1] - c[1][1]) + d * (c[3][1] - c[2][1]),
  ];
}

/** Greatest control-point deviation from the chord — the flatness measure. */
function cubicFlatness(c: Cubic): number {
  const chord = vecSub(c[3], c[0]);
  const len = vecLength(chord);
  if (len === 0) return Math.max(vecDistance(c[1], c[0]), vecDistance(c[2], c[0]));
  const nx = chord[1] / len;
  const nz = -chord[0] / len;
  const d1 = Math.abs((c[1][0] - c[0][0]) * nx + (c[1][1] - c[0][1]) * nz);
  const d2 = Math.abs((c[2][0] - c[0][0]) * nx + (c[2][1] - c[0][1]) * nz);
  return Math.max(d1, d2);
}

function splitCubic(c: Cubic, t = 0.5): [Cubic, Cubic] {
  const lerp = (a: Vec2, b: Vec2): Vec2 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  const p01 = lerp(c[0], c[1]);
  const p12 = lerp(c[1], c[2]);
  const p23 = lerp(c[2], c[3]);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const mid = lerp(p012, p123);
  return [
    [c[0], p01, p012, mid],
    [mid, p123, p23, c[3]],
  ];
}

/** Adaptive flattening. Emits interior + end points; the caller supplies the start. */
function flattenCubic(c: Cubic, toleranceM: number, depth: number, out: Vec2[]): void {
  if (depth >= MAX_BEZIER_DEPTH || cubicFlatness(c) <= toleranceM) {
    out.push([c[3][0], c[3][1]]);
    return;
  }
  const [a, b] = splitCubic(c);
  flattenCubic(a, toleranceM, depth + 1, out);
  flattenCubic(b, toleranceM, depth + 1, out);
}

/* ------------------------------------------------------------------ */
/* Catmull-Rom → Bézier                                                */
/* ------------------------------------------------------------------ */

const CENTRIPETAL_ALPHA = 0.5;

/**
 * Centripetal Catmull-Rom segment p1→p2 as a cubic Bézier, with p0/p3 as the
 * neighbouring control points. Zero-length knot spacings fall back to 1 so a
 * repeated control point degrades to a straight handle instead of a NaN.
 */
function catmullRomSegment(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  tension: number,
): Cubic {
  const pow = (d: number) => (d > 0 ? Math.pow(d, CENTRIPETAL_ALPHA) : 1);
  const d1 = pow(vecDistance(p0, p1));
  const d2 = pow(vecDistance(p1, p2));
  const d3 = pow(vecDistance(p2, p3));

  const b1x =
    (d1 * d1 * p2[0] - d2 * d2 * p0[0] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[0]) /
    (3 * d1 * (d1 + d2));
  const b1z =
    (d1 * d1 * p2[1] - d2 * d2 * p0[1] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[1]) /
    (3 * d1 * (d1 + d2));
  const b2x =
    (d3 * d3 * p1[0] - d2 * d2 * p3[0] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[0]) /
    (3 * d3 * (d3 + d2));
  const b2z =
    (d3 * d3 * p1[1] - d2 * d2 * p3[1] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[1]) /
    (3 * d3 * (d3 + d2));

  return [
    p1,
    [p1[0] + (b1x - p1[0]) * tension, p1[1] + (b1z - p1[1]) * tension],
    [p2[0] + (b2x - p2[0]) * tension, p2[1] + (b2z - p2[1]) * tension],
    p2,
  ];
}

/** The cubic segments a spline decomposes into, in order. Empty when undefined. */
function splineSegments(curve: SplineCurve): Cubic[] {
  const pts = curve.points;
  const n = pts.length;
  if (n < 2) return [];
  const tension = curve.tension ?? 1;
  const closed = curve.closed === true;

  const at = (i: number): Vec2 => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[Math.max(0, Math.min(n - 1, i))];
  };

  const segments: Cubic[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    segments.push(catmullRomSegment(at(i - 1), at(i), at(i + 1), at(i + 2), tension));
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export function curveStart(curve: PlanCurve): Vec2 {
  switch (curve.kind) {
    case "line":
      return [curve.start[0], curve.start[1]];
    case "arc":
      return anglePoint(curve, curve.startAngleRad);
    case "polyline":
    case "spline":
      return curve.points.length > 0 ? [curve.points[0][0], curve.points[0][1]] : [0, 0];
    case "bezier":
      return [curve.p0[0], curve.p0[1]];
  }
}

export function curveEnd(curve: PlanCurve): Vec2 {
  switch (curve.kind) {
    case "line":
      return [curve.end[0], curve.end[1]];
    case "arc":
      return anglePoint(curve, curve.endAngleRad);
    case "polyline":
    case "spline": {
      const pts = curve.points;
      if (pts.length === 0) return [0, 0];
      if (curve.closed === true) return [pts[0][0], pts[0][1]];
      return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
    }
    case "bezier":
      return [curve.p3[0], curve.p3[1]];
  }
}

const anglePoint = (curve: ArcCurve, angleRad: number): Vec2 => [
  curve.centre[0] + curve.radiusM * Math.cos(angleRad),
  curve.centre[1] + curve.radiusM * Math.sin(angleRad),
];

/* ------------------------------------------------------------------ */
/* Length                                                              */
/* ------------------------------------------------------------------ */

function polylinePoints(curve: PolylineCurve): Vec2[] {
  const pts = curve.points.map((p): Vec2 => [p[0], p[1]]);
  if (curve.closed === true && pts.length >= 2) pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

function chainLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += vecDistance(points[i - 1], points[i]);
  return total;
}

/**
 * Exact for line, arc and polyline. Béziers and splines have no closed form, so
 * their length is the length of the tessellation at `toleranceM` — it converges
 * from below, and is deterministic for a given tolerance.
 */
export function curveLength(
  curve: PlanCurve,
  toleranceM = DEFAULT_CURVE_TOLERANCE_M,
): number {
  switch (curve.kind) {
    case "line":
      return vecDistance(curve.start, curve.end);
    case "arc":
      return Math.abs(curve.radiusM) * Math.abs(curve.endAngleRad - curve.startAngleRad);
    case "polyline":
      return chainLength(polylinePoints(curve));
    case "bezier":
    case "spline":
      return chainLength(tessellateCurve(curve, toleranceM));
  }
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Point at parameter `t ∈ [0, 1]`, clamped. See the header for what `t` means. */
export function evaluateCurve(curve: PlanCurve, t: number): Vec2 {
  const u = clamp01(t);
  switch (curve.kind) {
    case "line":
      return [
        curve.start[0] + (curve.end[0] - curve.start[0]) * u,
        curve.start[1] + (curve.end[1] - curve.start[1]) * u,
      ];
    case "arc":
      return anglePoint(
        curve,
        curve.startAngleRad + (curve.endAngleRad - curve.startAngleRad) * u,
      );
    case "polyline": {
      const pts = polylinePoints(curve);
      if (pts.length === 0) return [0, 0];
      if (pts.length === 1) return [pts[0][0], pts[0][1]];
      const target = chainLength(pts) * u;
      let travelled = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const segLen = vecDistance(pts[i - 1], pts[i]);
        if (travelled + segLen >= target || i === pts.length - 1) {
          const local = segLen > 0 ? (target - travelled) / segLen : 0;
          const k = clamp01(local);
          return [
            pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
            pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
          ];
        }
        travelled += segLen;
      }
      return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
    }
    case "bezier":
      return cubicAt([curve.p0, curve.p1, curve.p2, curve.p3], u);
    case "spline": {
      const segments = splineSegments(curve);
      if (segments.length === 0) return curveStart(curve);
      const scaled = u * segments.length;
      const index = Math.min(segments.length - 1, Math.floor(scaled));
      return cubicAt(segments[index], scaled - index);
    }
  }
}

/**
 * Unit tangent at `t`, in the direction of increasing `t`. A curve with no
 * direction to report (zero-length line, zero-radius arc, a spline of one point)
 * returns `[0, 0]` rather than an invented axis.
 */
export function curveTangent(curve: PlanCurve, t: number): Vec2 {
  const u = clamp01(t);
  switch (curve.kind) {
    case "line":
      return vecNormalize(vecSub(curve.end, curve.start));
    case "arc": {
      const sweep = curve.endAngleRad - curve.startAngleRad;
      if (sweep === 0 || curve.radiusM === 0) return [0, 0];
      const angle = curve.startAngleRad + sweep * u;
      const sign = sweep > 0 ? 1 : -1;
      return vecNormalize([-Math.sin(angle) * sign, Math.cos(angle) * sign]);
    }
    case "polyline": {
      const pts = polylinePoints(curve);
      if (pts.length < 2) return [0, 0];
      const total = chainLength(pts);
      if (total === 0) return [0, 0];
      const target = total * u;
      let travelled = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const segLen = vecDistance(pts[i - 1], pts[i]);
        if (travelled + segLen >= target || i === pts.length - 1) {
          return vecNormalize(vecSub(pts[i], pts[i - 1]));
        }
        travelled += segLen;
      }
      return [0, 0];
    }
    case "bezier":
      return vecNormalize(cubicDerivative([curve.p0, curve.p1, curve.p2, curve.p3], u));
    case "spline": {
      const segments = splineSegments(curve);
      if (segments.length === 0) return [0, 0];
      const scaled = u * segments.length;
      const index = Math.min(segments.length - 1, Math.floor(scaled));
      return vecNormalize(cubicDerivative(segments[index], scaled - index));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tessellation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Segment count for an arc held to a SAGITTA tolerance: the chord of a segment
 * subtending θ sits `r(1 − cos(θ/2))` below the arc, so θ = 2·acos(1 − tol/r)
 * is the largest step that stays within `toleranceM` of the true curve. A fixed
 * segment count would over-tessellate a door swing and under-tessellate a
 * building-scale sweep by the same factor.
 */
export function arcSegmentCount(
  radiusM: number,
  sweepRad: number,
  toleranceM: number,
): number {
  const r = Math.abs(radiusM);
  const sweep = Math.abs(sweepRad);
  if (sweep === 0) return 0;
  if (!(r > 0) || !(toleranceM > 0)) return 1;
  if (toleranceM >= 2 * r) return 1;
  const maxStep = 2 * Math.acos(1 - toleranceM / r);
  if (!(maxStep > 0)) return MAX_SEGMENTS;
  return Math.max(1, Math.min(MAX_SEGMENTS, Math.ceil(sweep / maxStep)));
}

/**
 * Polyline approximation of the curve, INCLUDING both endpoints, never closed:
 * a closed polyline or spline ends with a point equal to its first, which
 * `curveLoopToRing` drops. Every point is within `toleranceM` of the true curve.
 */
export function tessellateCurve(curve: PlanCurve, toleranceM: number): Vec2[] {
  const tol = toleranceM > 0 ? toleranceM : DEFAULT_CURVE_TOLERANCE_M;
  switch (curve.kind) {
    case "line":
      return [
        [curve.start[0], curve.start[1]],
        [curve.end[0], curve.end[1]],
      ];
    case "arc": {
      const sweep = curve.endAngleRad - curve.startAngleRad;
      const count = arcSegmentCount(curve.radiusM, sweep, tol);
      if (count === 0) return [anglePoint(curve, curve.startAngleRad)];
      const out: Vec2[] = [];
      for (let i = 0; i <= count; i += 1) {
        out.push(anglePoint(curve, curve.startAngleRad + (sweep * i) / count));
      }
      return out;
    }
    case "polyline":
      return polylinePoints(curve);
    case "bezier": {
      const out: Vec2[] = [[curve.p0[0], curve.p0[1]]];
      flattenCubic([curve.p0, curve.p1, curve.p2, curve.p3], tol, 0, out);
      return out;
    }
    case "spline": {
      const segments = splineSegments(curve);
      if (segments.length === 0) return curve.points.map((p): Vec2 => [p[0], p[1]]);
      const out: Vec2[] = [[segments[0][0][0], segments[0][0][1]]];
      for (const segment of segments) flattenCubic(segment, tol, 0, out);
      return out;
    }
  }
}

/**
 * Point at `distanceM` along the curve, measured on the tessellation at
 * `toleranceM`. This is the arc-length accessor `evaluateCurve` deliberately is
 * not; distances outside the curve clamp to its ends.
 */
export function curvePointAtDistance(
  curve: PlanCurve,
  distanceM: number,
  toleranceM = DEFAULT_CURVE_TOLERANCE_M,
): Vec2 {
  const pts = tessellateCurve(curve, toleranceM);
  if (pts.length === 0) return [0, 0];
  if (pts.length === 1 || distanceM <= 0) return [pts[0][0], pts[0][1]];
  let travelled = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const segLen = vecDistance(pts[i - 1], pts[i]);
    if (travelled + segLen >= distanceM) {
      const k = segLen > 0 ? (distanceM - travelled) / segLen : 0;
      return [
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
      ];
    }
    travelled += segLen;
  }
  const last = pts[pts.length - 1];
  return [last[0], last[1]];
}

/* ------------------------------------------------------------------ */
/* Loop → Ring                                                         */
/* ------------------------------------------------------------------ */

export interface CurveLoopOptions {
  /** Winding of the returned ring. Default true (outer-ring convention). */
  ccw?: boolean;
  /** Endpoints within this distance are one point. Defaults to `toleranceM`. */
  joinToleranceM?: number;
}

/**
 * Tessellate a closed chain of curves into one open Ring.
 *
 * The chain must already be in order and head-to-tail; a shared endpoint is
 * welded rather than duplicated, and the final point is dropped when it closes
 * back onto the first, because rings here never store their closing vertex.
 * Returns null when fewer than three distinct points survive — an unclosed or
 * degenerate loop is not a ring, and returning a two-point "ring" would push the
 * failure downstream into earcut.
 *
 * The chain is NOT reordered or reversed to make it close: that is
 * `cleanup.detectClosedLoops`'s job, and doing it silently here would hide a
 * genuinely broken schematic.
 */
export function curveLoopToRing(
  curves: PlanCurve[],
  toleranceM: number,
  options: CurveLoopOptions = {},
): Ring | null {
  const join = options.joinToleranceM ?? toleranceM;
  const ccw = options.ccw ?? true;

  const points: Vec2[] = [];
  for (const curve of curves) {
    for (const point of tessellateCurve(curve, toleranceM)) {
      const last = points[points.length - 1];
      if (last !== undefined && vecDistance(last, point) <= join) continue;
      points.push([point[0], point[1]]);
    }
  }

  const ring = dedupeRing(points, join);
  if (ring.length < 3) return null;
  return ensureWinding(ring, ccw);
}
