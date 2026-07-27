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
