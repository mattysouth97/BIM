// src/lib/cad/line-stitcher.ts
// Stitch loose LINE segments into closed polygon rings.
//
// Real architectural drawings frequently draw the building outline as
// individual LINE entities rather than one closed LWPOLYLINE. This module
// reassembles those segments into rings by matching endpoints within a
// tolerance derived from the drawing extent, so the footprint extractor can
// treat the result exactly like a closed polyline.
//
// Pure module — no React, no DOM APIs.

export interface Segment2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A closed ring of points (first vertex NOT repeated at the end). */
export type Ring2D = Array<{ x: number; y: number }>;

/**
 * Endpoint-match tolerance as a fraction of the segment set's bbox diagonal.
 * 1e-3 of a 25 m drawing ≈ 2.5 cm — forgiving of sloppy snapping while far
 * smaller than any real wall length, so distinct corners never merge.
 */
const TOLERANCE_DIAG_FRACTION = 1e-3;

/** Combinatorial safety cap — layers with more segments are skipped. */
export const MAX_SEGMENTS_PER_LAYER = 20_000;

/**
 * Assemble closed rings from an unordered set of segments.
 *
 * Greedy endpoint walk: each endpoint is quantized onto a tolerance grid;
 * from an unused segment we repeatedly follow the unique unused segment
 * sharing the current endpoint cell (or one of its 8 neighbors). A walk that
 * returns to its start with ≥3 vertices emits a ring; a dead end discards
 * the walk. O(n) with a hash map — no pairwise scans.
 */
export function stitchSegmentsIntoRings(segments: Segment2D[]): Ring2D[] {
  if (segments.length < 3 || segments.length > MAX_SEGMENTS_PER_LAYER) {
    return [];
  }

  // Tolerance from overall extent.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (!Number.isFinite(diag) || diag <= 0) return [];
  const tol = diag * TOLERANCE_DIAG_FRACTION;

  const cellOf = (x: number, y: number): string =>
    `${Math.round(x / tol)},${Math.round(y / tol)}`;

  // endpoint cell → list of [segment index, which end (0|1)]
  const endpointIndex = new Map<string, Array<[number, 0 | 1]>>();
  const register = (cell: string, entry: [number, 0 | 1]) => {
    const list = endpointIndex.get(cell);
    if (list) list.push(entry);
    else endpointIndex.set(cell, [entry]);
  };
  segments.forEach((s, i) => {
    register(cellOf(s.x1, s.y1), [i, 0]);
    register(cellOf(s.x2, s.y2), [i, 1]);
  });

  /** Find an unused segment with an endpoint near (x, y); checks the 9
   *  surrounding grid cells so quantization boundaries can't split a match. */
  const findNext = (
    x: number,
    y: number,
    usedA: Set<number>,
    usedB: Set<number>,
  ): [number, 0 | 1] | null => {
    const cx = Math.round(x / tol);
    const cy = Math.round(y / tol);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = endpointIndex.get(`${cx + dx},${cy + dy}`);
        if (!list) continue;
        for (const [idx, end] of list) {
          if (usedA.has(idx) || usedB.has(idx)) continue;
          const s = segments[idx];
          const ex = end === 0 ? s.x1 : s.x2;
          const ey = end === 0 ? s.y1 : s.y2;
          if (Math.hypot(ex - x, ey - y) <= tol * 1.5) return [idx, end];
        }
      }
    }
    return null;
  };

  const used = new Set<number>();
  const rings: Ring2D[] = [];

  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;

    const s0 = segments[start];
    const walkUsed = new Set<number>([start]);
    const ring: Ring2D = [{ x: s0.x1, y: s0.y1 }];
    const startX = s0.x1;
    const startY = s0.y1;
    let curX = s0.x2;
    let curY = s0.y2;
    let closed = false;

    while (true) {
      // Back at the start (with enough vertices) → closed ring.
      if (ring.length >= 3 && Math.hypot(curX - startX, curY - startY) <= tol * 1.5) {
        closed = true;
        break;
      }
      const next = findNext(curX, curY, used, walkUsed);
      if (!next) break;
      const [idx, end] = next;
      walkUsed.add(idx);
      ring.push({ x: curX, y: curY });
      const s = segments[idx];
      // Continue from the segment's other end.
      if (end === 0) {
        curX = s.x2;
        curY = s.y2;
      } else {
        curX = s.x1;
        curY = s.y1;
      }
    }

    if (closed) {
      for (const idx of walkUsed) used.add(idx);
      rings.push(ring);
    }
    // Dead-ended walks leave their segments unused so another start point
    // can still try them in a different direction.
  }

  return rings;
}
