// src/lib/cad-reconstruction/geometry.ts
//
// Pure ring maths in millimetres. Every function here is total: it returns a
// defensible value or an explicit null, and never throws on degenerate input,
// because the reconstruction pipeline runs on evidence that is routinely
// incomplete.

import type { PointMm, RingMm } from "./types";

const MM2_PER_M2 = 1_000_000;

/** Signed area in mm². Positive = counter-clockwise. */
export function signedAreaMm2(ring: RingMm): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

export function areaSqm(ring: RingMm): number {
  return Math.abs(signedAreaMm2(ring)) / MM2_PER_M2;
}

export function perimeterMm(ring: RingMm): number {
  if (ring.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += Math.hypot(x1 - x0, y1 - y0);
  }
  return sum;
}

/** Area-weighted centroid; falls back to the vertex mean for degenerate rings. */
export function centroid(ring: RingMm): PointMm {
  const a = signedAreaMm2(ring);
  if (ring.length < 3 || Math.abs(a) < 1e-6) {
    if (ring.length === 0) return [0, 0];
    const sx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const sy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return [sx, sy];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const cross = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export interface BBoxMm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthMm: number;
  heightMm: number;
}

export function bbox(ring: RingMm): BBoxMm {
  if (ring.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, widthMm: 0, heightMm: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, widthMm: maxX - minX, heightMm: maxY - minY };
}

/** Counter-clockwise winding, so inward offsets have a consistent sign. */
export function toCounterClockwise(ring: RingMm): RingMm {
  return signedAreaMm2(ring) < 0 ? [...ring].reverse() : ring;
}

export function translate(ring: RingMm, dx: number, dy: number): RingMm {
  return ring.map(([x, y]) => [x + dx, y + dy] as PointMm);
}

/** Uniform scale about a pivot (defaults to the ring's own centroid). */
export function scaleAbout(ring: RingMm, k: number, pivot?: PointMm): RingMm {
  const [px, py] = pivot ?? centroid(ring);
  return ring.map(([x, y]) => [px + (x - px) * k, py + (y - py) * k] as PointMm);
}

export function roundRing(ring: RingMm): RingMm {
  return ring.map(([x, y]) => [Math.round(x), Math.round(y)] as PointMm);
}

/**
 * Drop vertices closer than `tolMm` and merge runs that are collinear within
 * `angleTolDeg`. GIS outlines routinely carry survey noise that would become
 * fake architectural steps if it were drawn as-is.
 */
export function simplifyRing(
  ring: RingMm,
  tolMm = 150,
  angleTolDeg = 4,
): RingMm {
  if (ring.length < 4) return ring;

  const deduped: RingMm = [];
  for (const p of ring) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > tolMm) {
      deduped.push(p);
    }
  }
  // The wrap-around pair can also be a duplicate.
  while (
    deduped.length > 3 &&
    Math.hypot(
      deduped[0][0] - deduped[deduped.length - 1][0],
      deduped[0][1] - deduped[deduped.length - 1][1],
    ) <= tolMm
  ) {
    deduped.pop();
  }
  if (deduped.length < 4) return deduped;

  const angleTol = (angleTolDeg * Math.PI) / 180;
  const kept: RingMm = [];
  for (let i = 0; i < deduped.length; i++) {
    const prev = deduped[(i - 1 + deduped.length) % deduped.length];
    const cur = deduped[i];
    const next = deduped[(i + 1) % deduped.length];
    const a = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]);
    const b = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
    let turn = Math.abs(b - a);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > angleTol) kept.push(cur);
  }
  return kept.length >= 3 ? kept : deduped;
}

function segmentsProperlyIntersect(
  p1: PointMm,
  p2: PointMm,
  p3: PointMm,
  p4: PointMm,
): boolean {
  const d = (a: PointMm, b: PointMm, c: PointMm) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** True when any two non-adjacent edges cross. O(n²) — rings here are small. */
export function isSelfIntersecting(ring: RingMm): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export function pointInRing(pt: PointMm, ring: RingMm): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Axis-aligned rectangle ring, counter-clockwise, centred on `c`. */
export function rectRing(
  c: PointMm,
  widthMm: number,
  heightMm: number,
): RingMm {
  const hw = widthMm / 2;
  const hh = heightMm / 2;
  return [
    [c[0] - hw, c[1] - hh],
    [c[0] + hw, c[1] - hh],
    [c[0] + hw, c[1] + hh],
    [c[0] - hw, c[1] + hh],
  ];
}

/**
 * Inward parallel offset of a convex-ish ring by `distMm`, computed by
 * intersecting offset edge lines. Returns null when the offset collapses the
 * ring (a wall thicker than the plate is a real failure, not a value to clamp).
 */
export function offsetRingInward(ring: RingMm, distMm: number): RingMm | null {
  const ccw = toCounterClockwise(ring);
  const n = ccw.length;
  if (n < 3) return null;

  type Line = { px: number; py: number; dx: number; dy: number };
  const lines: Line[] = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ccw[i];
    const [x1, y1] = ccw[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) return null;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    // Inward normal of a CCW ring is the edge direction rotated +90°.
    const nx = -dy;
    const ny = dx;
    lines.push({ px: x0 + nx * distMm, py: y0 + ny * distMm, dx, dy });
  }

  const out: RingMm = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n];
    const b = lines[i];
    const det = a.dx * -b.dy - -b.dx * a.dy;
    if (Math.abs(det) < 1e-9) {
      out.push([b.px, b.py]);
      continue;
    }
    const rhs0 = b.px - a.px;
    const rhs1 = b.py - a.py;
    const t = (rhs0 * -b.dy - -b.dx * rhs1) / det;
    out.push([a.px + a.dx * t, a.py + a.dy * t]);
  }

  if (isSelfIntersecting(out)) return null;
  if (areaSqm(out) <= 0.5) return null;
  return out;
}

/** Longest edge index of a ring — the default street-facing guess. */
export function longestEdgeIndex(ring: RingMm): number {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best;
}

/** Compass direction an edge's outward normal points, for a CCW ring. */
export function edgeFacing(
  ring: RingMm,
  index: number,
): "north" | "east" | "south" | "west" {
  const ccw = toCounterClockwise(ring);
  const [x0, y0] = ccw[index % ccw.length];
  const [x1, y1] = ccw[(index + 1) % ccw.length];
  // Outward normal of a CCW ring is the edge direction rotated -90°.
  const nx = y1 - y0;
  const ny = -(x1 - x0);
  return Math.abs(nx) > Math.abs(ny)
    ? nx > 0
      ? "east"
      : "west"
    : ny > 0
      ? "north"
      : "south";
}
