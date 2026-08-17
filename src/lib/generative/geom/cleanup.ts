// src/lib/generative/geom/cleanup.ts
//
// Repair for schematic input: imported DXF layers, traced PDFs, and lines drawn
// by hand in the CAD viewer. What arrives is a SEGMENT SOUP — unordered, with
// endpoints that nearly but do not quite meet, doubled lines, and hairline
// stubs. What the engine needs is rings.
//
// UNITS metres, PLANE XZ.
//
// TOLERANCES are always arguments. There is no module-level "good enough"
// constant, because the right value depends entirely on where the geometry came
// from: a DXF exported in millimetres and a finger-drawn line on a tablet are
// three orders of magnitude apart, and a hidden default would silently weld a
// real 5 mm reveal shut on one and leave a 50 mm gap open on the other.
//
// Every function here is deterministic: clusters are keyed off a lexicographic
// sort, never off input order or a hash walk.

import {
  distanceToSegment,
  ensureWinding,
  segmentIntersection,
  signedRingArea,
  vecCross,
  vecDistance,
  vecNormalize,
  vecSub,
  type Ring,
  type Vec2,
} from "./polygon";

export interface Segment {
  start: Vec2;
  end: Vec2;
}

export const segmentLength = (segment: Segment): number =>
  vecDistance(segment.start, segment.end);

const copy = (p: Vec2): Vec2 => [p[0], p[1]];

/* ------------------------------------------------------------------ */
/* Endpoint welding                                                    */
/* ------------------------------------------------------------------ */

/**
 * Weld endpoints that lie within `toleranceM` of each other onto one shared
 * coordinate, so that "nearly touching" becomes "connected" for every later
 * step. No segments are added or removed.
 *
 * The representative of a cluster is its LEXICOGRAPHICALLY SMALLEST member, not
 * its centroid: a centroid moves as the cluster grows, which makes the result
 * depend on the order points were absorbed and makes a second pass move the
 * geometry again. A fixed representative is idempotent.
 */
export function snapEndpoints(segments: Segment[], toleranceM: number): Segment[] {
  if (toleranceM <= 0) return segments.map((s) => ({ start: copy(s.start), end: copy(s.end) }));

  const points: Vec2[] = [];
  for (const segment of segments) points.push(segment.start, segment.end);

  const order = points
    .map((_, index) => index)
    .sort((a, b) => points[a][0] - points[b][0] || points[a][1] - points[b][1] || a - b);

  const representative = new Array<Vec2>(points.length);
  // Cluster reps are kept in the same sorted order, so the scan back only needs
  // to reach as far as the x-window the tolerance allows.
  const reps: Vec2[] = [];
  for (const index of order) {
    const point = points[index];
    let found: Vec2 | null = null;
    for (let r = reps.length - 1; r >= 0; r -= 1) {
      const rep = reps[r];
      if (point[0] - rep[0] > toleranceM) break;
      if (vecDistance(point, rep) <= toleranceM) {
        found = rep;
        break;
      }
    }
    if (found === null) {
      found = copy(point);
      reps.push(found);
    }
    representative[index] = found;
  }

  return segments.map((_, i) => ({
    start: copy(representative[i * 2]),
    end: copy(representative[i * 2 + 1]),
  }));
}

/** Drop segments shorter than `toleranceM` — drafting slop, not geometry. */
export const removeZeroLength = (segments: Segment[], toleranceM: number): Segment[] =>
  segments.filter((segment) => segmentLength(segment) > toleranceM);

/**
 * Drop segments that duplicate one already kept, in either direction. Doubled
 * lines are the single most common artefact of a traced drawing and they break
 * face traversal, which assumes one edge per node pair.
 */
export function removeDuplicateSegments(
  segments: Segment[],
  toleranceM: number,
): Segment[] {
  const kept: Segment[] = [];
  for (const segment of segments) {
    const duplicate = kept.some(
      (other) =>
        (vecDistance(other.start, segment.start) <= toleranceM &&
          vecDistance(other.end, segment.end) <= toleranceM) ||
        (vecDistance(other.start, segment.end) <= toleranceM &&
          vecDistance(other.end, segment.start) <= toleranceM),
    );
    if (!duplicate) kept.push({ start: copy(segment.start), end: copy(segment.end) });
  }
  return kept;
}

/* ------------------------------------------------------------------ */
/* Collinear merging                                                   */
/* ------------------------------------------------------------------ */

/**
 * Remove ring vertices that sit within `toleranceM` of the straight line
 * between their neighbours. Repeated until stable, because removing one vertex
 * can bring its neighbours into line with each other.
 */
export function mergeCollinear(ring: Ring, toleranceM: number): Ring {
  let current = ring.map(copy);
  let changed = true;
  while (changed && current.length > 3) {
    changed = false;
    const next: Ring = [];
    const n = current.length;
    for (let i = 0; i < n; i += 1) {
      const prev = next.length > 0 ? next[next.length - 1] : current[n - 1];
      const point = current[i];
      const after = current[(i + 1) % n];
      // Dropping this vertex must leave at least a triangle behind.
      const survivors = next.length + (n - i);
      if (survivors > 3 && distanceToSegment(point, prev, after) <= toleranceM) {
        changed = true;
        continue;
      }
      next.push(point);
    }
    current = next;
  }
  return current;
}

/** Same rule for an OPEN chain: the two endpoints are always kept. */
export function mergeCollinearPolyline(points: Vec2[], toleranceM: number): Vec2[] {
  if (points.length <= 2) return points.map(copy);
  const out: Vec2[] = [copy(points[0])];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const after = points[i + 1];
    if (distanceToSegment(points[i], prev, after) <= toleranceM) continue;
    out.push(copy(points[i]));
  }
  out.push(copy(points[points.length - 1]));
  return out;
}

/**
 * Fuse consecutive segments that continue each other: shared endpoint, and
 * directions within `angleToleranceRad`. Order-dependent by nature, so the
 * input is sorted first and the result is independent of how it arrived.
 */
export function mergeCollinearSegments(
  segments: Segment[],
  angleToleranceRad: number,
  joinToleranceM: number,
): Segment[] {
  const sorted = segments
    .map((s) => ({ start: copy(s.start), end: copy(s.end) }))
    .sort(
      (a, b) =>
        a.start[0] - b.start[0] ||
        a.start[1] - b.start[1] ||
        a.end[0] - b.end[0] ||
        a.end[1] - b.end[1],
    );

  const used = new Array<boolean>(sorted.length).fill(false);
  const out: Segment[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    const run = sorted[i];
    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < sorted.length; j += 1) {
        if (used[j]) continue;
        const candidate = sorted[j];
        const dirRun = vecNormalize(vecSub(run.end, run.start));
        for (const [tail, head] of [
          [candidate.start, candidate.end],
          [candidate.end, candidate.start],
        ] as [Vec2, Vec2][]) {
          if (vecDistance(run.end, tail) > joinToleranceM) continue;
          const dirNext = vecNormalize(vecSub(head, tail));
          const cross = Math.abs(vecCross(dirRun, dirNext));
          const dot = dirRun[0] * dirNext[0] + dirRun[1] * dirNext[1];
          if (dot <= 0 || Math.asin(Math.min(1, cross)) > angleToleranceRad) continue;
          run.end = copy(head);
          used[j] = true;
          extended = true;
          break;
        }
        if (extended) break;
      }
    }
    out.push(run);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Gap closing                                                         */
/* ------------------------------------------------------------------ */

const nodeKey = (p: Vec2): string => `${p[0]}|${p[1]}`;

/**
 * Rotate a ring to begin at its lexicographically smallest vertex. A ring has
 * no start, but an ARRAY does, and face traversal picks whichever half-edge came
 * first — so without this the same geometry compares unequal depending on the
 * order the segments were handed in.
 */
function canonicaliseStart(ring: Ring): Ring {
  let pivot = 0;
  for (let i = 1; i < ring.length; i += 1) {
    if (ring[i][0] < ring[pivot][0]) pivot = i;
    else if (ring[i][0] === ring[pivot][0] && ring[i][1] < ring[pivot][1]) pivot = i;
  }
  if (pivot === 0) return ring;
  return [...ring.slice(pivot), ...ring.slice(0, pivot)];
}

/**
 * Bridge visible gaps: every endpoint that nothing else meets is paired with its
 * nearest equally-lonely partner within `toleranceM`, and a real segment is
 * inserted between them.
 *
 * Distinct from `snapEndpoints` on purpose. Snapping MOVES geometry and suits
 * gaps small enough to be float noise; bridging ADDS geometry and suits gaps big
 * enough to see, where moving a wall by that much would be a lie about where the
 * user drew it. Run snapping first with a tight tolerance, then this with a
 * loose one.
 *
 * Pairs are chosen shortest-first with a lexicographic tie-break, so the result
 * never depends on input order.
 */
export function closeSmallGaps(segments: Segment[], toleranceM: number): Segment[] {
  const out = segments.map((s) => ({ start: copy(s.start), end: copy(s.end) }));
  if (toleranceM <= 0) return out;

  const degree = new Map<string, number>();
  for (const segment of out) {
    for (const point of [segment.start, segment.end]) {
      const key = nodeKey(point);
      degree.set(key, (degree.get(key) ?? 0) + 1);
    }
  }

  const dangling: Vec2[] = [];
  const seen = new Set<string>();
  for (const segment of out) {
    for (const point of [segment.start, segment.end]) {
      const key = nodeKey(point);
      if ((degree.get(key) ?? 0) !== 1 || seen.has(key)) continue;
      seen.add(key);
      dangling.push(copy(point));
    }
  }
  dangling.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const candidates: { a: number; b: number; distance: number }[] = [];
  for (let i = 0; i < dangling.length; i += 1) {
    for (let j = i + 1; j < dangling.length; j += 1) {
      const distance = vecDistance(dangling[i], dangling[j]);
      if (distance > 0 && distance <= toleranceM) candidates.push({ a: i, b: j, distance });
    }
  }
  candidates.sort((p, q) => p.distance - q.distance || p.a - q.a || p.b - q.b);

  const matched = new Set<number>();
  for (const { a, b } of candidates) {
    if (matched.has(a) || matched.has(b)) continue;
    matched.add(a);
    matched.add(b);
    out.push({ start: copy(dangling[a]), end: copy(dangling[b]) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Planarisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Split every segment at each point where another segment meets or crosses it,
 * so the result is a planar graph: edges touch only at shared endpoints. Without
 * this a drawn X is two segments that never meet at a node, and no loop through
 * it can be found.
 *
 * O(n²) in the segment count — schematic-scale input, not a mesh.
 */
export function planarizeSegments(segments: Segment[], toleranceM: number): Segment[] {
  const out: Segment[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    const { start, end } = segments[i];
    const length = vecDistance(start, end);
    if (length <= toleranceM) continue;
    const dir = vecNormalize(vecSub(end, start));

    const cuts: number[] = [0, length];
    for (let j = 0; j < segments.length; j += 1) {
      if (i === j) continue;
      const other = segments[j];
      const hit = segmentIntersection(start, end, other.start, other.end, toleranceM);
      if (hit === null) continue;
      const t = (hit[0] - start[0]) * dir[0] + (hit[1] - start[1]) * dir[1];
      if (t > toleranceM && t < length - toleranceM) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);

    for (let k = 1; k < cuts.length; k += 1) {
      if (cuts[k] - cuts[k - 1] <= toleranceM) continue;
      out.push({
        start: [start[0] + dir[0] * cuts[k - 1], start[1] + dir[1] * cuts[k - 1]],
        end: [start[0] + dir[0] * cuts[k], start[1] + dir[1] * cuts[k]],
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Loop detection                                                      */
/* ------------------------------------------------------------------ */

export interface LoopOptions {
  /** Loops smaller than this are drafting noise, not rooms. Default 0. */
  minAreaSqm?: number;
  /** Collapse near-collinear vertices in the result. Default 0 (keep them all). */
  collinearToleranceM?: number;
}

/**
 * Find every enclosed region in a segment soup, as counter-clockwise rings.
 *
 * The method is planar FACE TRAVERSAL, not cycle search: after snapping,
 * planarising and pruning dead-end spurs, each face of the graph is walked by
 * always taking the next edge clockwise from the one you came in on. That
 * enumerates each minimal enclosed region exactly once and yields the unbounded
 * outer face with a negative signed area, which is how it is identified and
 * dropped — no "largest ring is the outside" guesswork.
 *
 * LIMIT: results are minimal faces. Two disjoint squares give two rings; a
 * square inside an unconnected larger square gives both squares, NOT an
 * annulus — nothing connects them, so nothing says which is a hole in which.
 * Pair the result with `polygonDifference` when nesting matters.
 *
 * Rings come back sorted by descending area, then lexicographically, so the
 * order is a function of the geometry and not of the input array.
 */
export function detectClosedLoops(
  segments: Segment[],
  toleranceM: number,
  options: LoopOptions = {},
): Ring[] {
  const minArea = options.minAreaSqm ?? 0;
  const collinear = options.collinearToleranceM ?? 0;

  const prepared = removeDuplicateSegments(
    removeZeroLength(
      snapEndpoints(
        planarizeSegments(
          removeZeroLength(snapEndpoints(segments, toleranceM), toleranceM),
          toleranceM,
        ),
        toleranceM,
      ),
      toleranceM,
    ),
    toleranceM,
  );

  /* --- node table --- */
  const nodeIndex = new Map<string, number>();
  const nodes: Vec2[] = [];
  const nodeFor = (p: Vec2): number => {
    const key = nodeKey(p);
    const existing = nodeIndex.get(key);
    if (existing !== undefined) return existing;
    nodeIndex.set(key, nodes.length);
    nodes.push(copy(p));
    return nodes.length - 1;
  };

  let edges: [number, number][] = [];
  const edgeKeys = new Set<string>();
  for (const segment of prepared) {
    const a = nodeFor(segment.start);
    const b = nodeFor(segment.end);
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push([a, b]);
  }

  /* --- prune spurs: a degree-1 node cannot be on a cycle --- */
  for (;;) {
    const degree = new Map<number, number>();
    for (const [a, b] of edges) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    const kept = edges.filter(
      ([a, b]) => (degree.get(a) ?? 0) > 1 && (degree.get(b) ?? 0) > 1,
    );
    if (kept.length === edges.length) break;
    edges = kept;
  }
  if (edges.length === 0) return [];

  /* --- half-edges: 2k = edges[k] forwards, 2k+1 = backwards --- */
  const halfCount = edges.length * 2;
  const from = (h: number) => (h % 2 === 0 ? edges[h >> 1][0] : edges[h >> 1][1]);
  const to = (h: number) => (h % 2 === 0 ? edges[h >> 1][1] : edges[h >> 1][0]);
  const twin = (h: number) => h ^ 1;

  const outgoing: number[][] = nodes.map(() => []);
  for (let h = 0; h < halfCount; h += 1) outgoing[from(h)].push(h);
  const angleOf = (h: number): number => {
    const a = nodes[from(h)];
    const b = nodes[to(h)];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  for (const list of outgoing) list.sort((p, q) => angleOf(p) - angleOf(q) || p - q);
  const slot = new Map<number, number>();
  for (const list of outgoing) list.forEach((h, i) => slot.set(h, i));

  // Arriving on `h`, leave on the edge one step CLOCKWISE from the way back.
  // That traverses interior faces counter-clockwise and the outer face
  // clockwise, which is exactly the sign test used below.
  const nextHalf = (h: number): number => {
    const list = outgoing[to(h)];
    const i = slot.get(twin(h)) ?? 0;
    return list[(i - 1 + list.length) % list.length];
  };

  const visited = new Array<boolean>(halfCount).fill(false);
  const rings: Ring[] = [];
  for (let start = 0; start < halfCount; start += 1) {
    if (visited[start]) continue;
    const face: number[] = [];
    let h = start;
    let guard = 0;
    do {
      visited[h] = true;
      face.push(from(h));
      h = nextHalf(h);
      guard += 1;
    } while (h !== start && guard <= halfCount);
    if (h !== start) continue;

    let ring: Ring = face.map((n): Vec2 => copy(nodes[n]));
    if (collinear > 0) ring = mergeCollinear(ring, collinear);
    if (ring.length < 3) continue;
    const area = signedRingArea(ring);
    if (area <= 0 || area < minArea) continue;
    rings.push(canonicaliseStart(ensureWinding(ring, true)));
  }

  rings.sort((a, b) => {
    const areaDiff = signedRingArea(b) - signedRingArea(a);
    if (areaDiff !== 0) return areaDiff;
    return a[0][0] - b[0][0] || a[0][1] - b[0][1];
  });
  return rings;
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export interface CleanupOptions {
  /** Endpoints this close are welded onto one point. */
  snapToleranceM: number;
  /** Segments this short are dropped. Defaults to `snapToleranceM`. */
  minLengthM?: number;
  /** Lonely endpoints this far apart get a bridging segment. Default: no bridging. */
  gapToleranceM?: number;
  /** Collinear runs within this angle are fused. Default: no fusing. */
  collinearAngleRad?: number;
}

/**
 * The usual order for imported geometry: weld, drop stubs, de-duplicate, bridge
 * visible gaps, then fuse collinear runs. Each step is exported on its own so a
 * caller with a different source can pick a different order.
 */
export function cleanupSegments(segments: Segment[], options: CleanupOptions): Segment[] {
  const minLength = options.minLengthM ?? options.snapToleranceM;
  let work = snapEndpoints(segments, options.snapToleranceM);
  work = removeZeroLength(work, minLength);
  work = removeDuplicateSegments(work, options.snapToleranceM);
  if (options.gapToleranceM !== undefined && options.gapToleranceM > 0) {
    work = closeSmallGaps(work, options.gapToleranceM);
    work = snapEndpoints(work, options.snapToleranceM);
  }
  if (options.collinearAngleRad !== undefined && options.collinearAngleRad > 0) {
    work = mergeCollinearSegments(work, options.collinearAngleRad, options.snapToleranceM);
  }
  return work;
}
