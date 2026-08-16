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
 * Inset an open or closed ring by `distance` metres toward its interior.
 * Used so a roof deck sits on the inner face of the wall/parapet instead of
 * overlapping the cladding. Tight corners use a simple averaged inward
 * normal — good enough for the 0.1–0.3 m wall half-thickness we pass.
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
    let nx = n0x + n1x;
    let nz = n0z + n1z;
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-8) {
      nx = n0x;
      nz = n0z;
    } else {
      nx /= nl;
      nz /= nl;
    }
    out.push([cur[0] + nx * distance, cur[1] + nz * distance]);
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
