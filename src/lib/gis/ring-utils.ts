// src/lib/gis/ring-utils.ts
// Small helpers for footprint polygon rings ([x, y] vertex lists, open or
// closed). Used to keep every generator on one coordinate frame: the scene
// centers its local projection on the ring's bbox midpoint, and bbox-derived
// elements (column grid, roof furniture) test containment against the ring.

/**
 * Midpoint of the ring's bounding box.
 *
 * Deliberately NOT the vertex average: a closed ring double-counts the
 * closing vertex and vertex-dense edges pull the average sideways, which
 * would shift the projected shell away from the origin-centered frame the
 * rectangular generators (roof box, column grid) build in.
 */
export function ringBboxCenter(ring: number[][]): [number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/**
 * Ray-casting point-in-polygon test against a single ring.
 *
 * Works for open and closed rings alike: the duplicated closing vertex only
 * adds a degenerate zero-length edge, which never toggles the crossing count.
 * Points exactly on an edge may land on either side — callers placing
 * geometry should keep a margin rather than rely on boundary behavior.
 */
/**
 * Above this, a miter join is clamped rather than followed exactly — the
 * standard fix for the fact that 1/sin(interior-angle/2) diverges as a
 * corner sharpens toward a spike (5° interior angle -> 22.9x the requested
 * distance). 4 matches the conventional SVG/Canvas/Cairo default, i.e. joins
 * sharper than ~29° (2*asin(1/4)) bevel instead of mitering to a point.
 * Building footprints from GIS outlines and CAD traces do contain
 * near-degenerate spikes, so this is not optional polish on the fix below —
 * without it, correcting the 1/√2 under-inset turns a 0.037 m cosmetic
 * error into unbounded geometry on any acute corner.
 */
export const RING_INSET_MITER_LIMIT = 4;

/**
 * Inset an open or closed ring by `distance` metres toward its interior.
 * Used so a roof deck sits on the inner face of the wall/parapet instead of
 * overlapping the cladding.
 *
 * Each vertex moves along its (unit) angle bisector by
 * `distance / cos(half the angle between the two edge normals)` — the
 * standard miter-join correction, clamped at RING_INSET_MITER_LIMIT. Before
 * this, the vertex moved by exactly `distance` along the bisector with no
 * correction, which is only right for a straight (180°) run: at a 90°
 * corner it landed 1/√2 (~70.7%) of the requested distance in, and the
 * existing test's bounds were loose enough (0 to 0.15 accepted for a
 * requested 0.1) to tolerate that 29.3% error without failing.
 */
export function insetRing(
  ring: [number, number][],
  distance: number,
): [number, number][] {
  if (distance === 0 || ring.length < 3) return ring.map(([x, z]) => [x, z] as [number, number]);

  const pts: [number, number][] = ring.map(([x, z]) => [x, z]);
  if (
    pts.length > 1 &&
    Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-6 &&
    Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-6
  ) {
    pts.pop();
  }
  if (pts.length < 3) return ring.map(([x, z]) => [x, z] as [number, number]);

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    area += x0 * z1 - x1 * z0;
  }
  // CCW (area > 0): interior is to the left of each edge. Inset = left normal.
  const sign = area < 0 ? -1 : 1;

  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const d0x = cur[0] - prev[0];
    const d0z = cur[1] - prev[1];
    const d1x = next[0] - cur[0];
    const d1z = next[1] - cur[1];
    const l0 = Math.hypot(d0x, d0z);
    const l1 = Math.hypot(d1x, d1z);
    const n0x = l0 > 1e-8 ? (-d0z / l0) * sign : 0;
    const n0z = l0 > 1e-8 ? (d0x / l0) * sign : 0;
    const n1x = l1 > 1e-8 ? (-d1z / l1) * sign : 0;
    const n1z = l1 > 1e-8 ? (d1x / l1) * sign : 0;
    const nx = n0x + n1x;
    const nz = n0z + n1z;
    const nl = Math.hypot(nx, nz);
    let ox: number;
    let oz: number;
    if (nl < 1e-8) {
      // Near-180° reflex corner: the two edge normals nearly cancel, so the
      // bisector direction and cos(half-angle) are both ill-conditioned.
      // Fall back to the incoming edge's own normal, as before.
      ox = n0x * distance;
      oz = n0z * distance;
    } else {
      // cos(half the angle between n0 and n1) = |n0 + n1| / 2, by the
      // half-angle identity for two unit vectors — so nl/2 here, no extra
      // trig call needed. Applying 1/cosHalfAngle to the RAW (unnormalized)
      // sum in one step (distance * 2 / nl^2) is algebraically the same as
      // normalizing to a unit bisector first and then scaling by
      // distance/cosHalfAngle; this just avoids a second division per axis.
      const cosHalfAngle = nl / 2;
      const miterScale = Math.min(1 / cosHalfAngle, RING_INSET_MITER_LIMIT);
      const scale = (distance * miterScale) / nl;
      ox = nx * scale;
      oz = nz * scale;
    }
    out.push([cur[0] + ox, cur[1] + oz]);
  }
  return out;
}

export function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}
