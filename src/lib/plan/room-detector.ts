import type { WallSegment } from "@/store/plan-store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Snap tolerance: endpoints within this distance are merged to the same vertex */
const SNAP_EPS = 0.05;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WallGraph {
  /** Map from vertex key → [x, z] coordinate */
  vertices: Map<string, [number, number]>;
  /** Map from vertex key → list of neighboring vertex keys */
  adjacency: Map<string, string[]>;
}

// ---------------------------------------------------------------------------
// buildWallGraph
// ---------------------------------------------------------------------------

/**
 * Convert a list of WallSegments into a graph of vertices and edges.
 * Endpoints within SNAP_EPS of each other are merged to the same vertex.
 */
export function buildWallGraph(walls: WallSegment[]): WallGraph {
  const vertices = new Map<string, [number, number]>();
  const adjacency = new Map<string, string[]>();

  // Collect all raw endpoints
  const rawPoints: [number, number][] = [];
  for (const w of walls) {
    rawPoints.push(w.start);
    rawPoints.push(w.end);
  }

  // Merge nearby endpoints: for each point, find or create a canonical vertex
  const canonicalKey: string[] = new Array(rawPoints.length).fill("");

  for (let i = 0; i < rawPoints.length; i++) {
    if (canonicalKey[i]) continue; // already assigned

    // Find all points within SNAP_EPS of rawPoints[i]
    const [px, pz] = rawPoints[i];
    const key = `${i}`;
    vertices.set(key, [px, pz]);
    canonicalKey[i] = key;

    for (let j = i + 1; j < rawPoints.length; j++) {
      if (canonicalKey[j]) continue;
      const [qx, qz] = rawPoints[j];
      const dx = px - qx;
      const dz = pz - qz;
      if (Math.sqrt(dx * dx + dz * dz) <= SNAP_EPS) {
        canonicalKey[j] = key;
      }
    }
  }

  // Initialize adjacency for all vertices
  for (const [key] of vertices) {
    adjacency.set(key, []);
  }

  // Build edges from walls
  for (let wi = 0; wi < walls.length; wi++) {
    const startKey = canonicalKey[wi * 2];
    const endKey = canonicalKey[wi * 2 + 1];

    if (startKey === endKey) continue; // degenerate wall

    // Bidirectional edge
    const startNeighbors = adjacency.get(startKey)!;
    if (!startNeighbors.includes(endKey)) {
      startNeighbors.push(endKey);
    }

    const endNeighbors = adjacency.get(endKey)!;
    if (!endNeighbors.includes(startKey)) {
      endNeighbors.push(startKey);
    }
  }

  return { vertices, adjacency };
}

// ---------------------------------------------------------------------------
// polygonArea (Shoelace formula)
// ---------------------------------------------------------------------------

/**
 * Compute the area of a polygon using the shoelace formula.
 * Returns the absolute (unsigned) area.
 */
export function polygonArea(pts: [number, number][]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % n];
    area += x1 * z2 - x2 * z1;
  }
  return Math.abs(area) / 2;
}

/**
 * Compute the signed area of a polygon (positive = CCW, negative = CW).
 */
function signedArea(pts: [number, number][]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % n];
    area += x1 * z2 - x2 * z1;
  }
  return area / 2;
}

// ---------------------------------------------------------------------------
// polygonCentroid
// ---------------------------------------------------------------------------

/**
 * Compute the centroid of a polygon as the arithmetic mean of its vertices.
 */
export function polygonCentroid(pts: [number, number][]): [number, number] {
  if (pts.length === 0) return [0, 0];
  let sx = 0;
  let sz = 0;
  for (const [x, z] of pts) {
    sx += x;
    sz += z;
  }
  return [sx / pts.length, sz / pts.length];
}

// ---------------------------------------------------------------------------
// projectOntoWall
// ---------------------------------------------------------------------------

/**
 * Project point (px, pz) onto the wall segment from (ax, az) to (bx, bz).
 * Returns the parametric position t (clamped to [0,1]), the projected point,
 * and the distance from the point to the wall line.
 */
export function projectOntoWall(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { t: number; wx: number; wz: number; dist: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;

  if (lenSq === 0) {
    // Degenerate wall
    const dist = Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
    return { t: 0, wx: ax, wz: az, dist };
  }

  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const wx = ax + t * dx;
  const wz = az + t * dz;
  const dist = Math.sqrt((px - wx) ** 2 + (pz - wz) ** 2);

  return { t, wx, wz, dist };
}

// ---------------------------------------------------------------------------
// detectRooms — minimal face extraction via "most clockwise next edge"
// ---------------------------------------------------------------------------

/**
 * Detect enclosed room polygons from a wall graph.
 *
 * Algorithm: For each directed edge (u→v), find the minimal face by always
 * turning as far clockwise as possible at each vertex. This enumerates all
 * minimal cycles in the planar graph. The "most clockwise" traversal produces
 * interior faces with CW winding (negative signed area) and the outer
 * boundary as one large CCW polygon (positive signed area). We keep all CW
 * faces (interior rooms) and discard the CCW outer face.
 */
export function detectRooms(graph: WallGraph): Array<{
  polygon: [number, number][];
  area: number;
  centroid: [number, number];
}> {
  const { vertices, adjacency } = graph;

  if (vertices.size === 0) return [];

  // Track which directed edges have been used as face starters
  const usedEdges = new Set<string>();
  const faces: [number, number][][] = [];

  // Iterate over all directed edges (u→v)
  for (const [uKey, neighbors] of adjacency) {
    for (const vKey of neighbors) {
      const edgeId = `${uKey}→${vKey}`;
      if (usedEdges.has(edgeId)) continue;

      const face = traceFace(uKey, vKey, vertices, adjacency, usedEdges);
      if (face && face.length >= 3) {
        faces.push(face);
      }
    }
  }

  // The "most clockwise" traversal produces interior faces with CW winding
  // (negative signed area from shoelace in XZ coordinates) and the outer
  // boundary as a large CCW polygon. Keep CW faces, discard CCW.
  const results: Array<{ polygon: [number, number][]; area: number; centroid: [number, number] }> = [];

  for (const face of faces) {
    const sa = signedArea(face);
    if (sa < 0) {
      // CW winding = interior room face
      const absArea = Math.abs(sa);
      results.push({
        polygon: face,
        area: absArea,
        centroid: polygonCentroid(face),
      });
    }
    // CCW faces (sa >= 0) are the outer boundary — skip
  }

  return results;
}

/**
 * Trace a minimal face starting from directed edge (startKey → nextKey).
 * At each vertex, pick the next edge that is "most clockwise" relative to
 * the incoming direction.
 */
function traceFace(
  startKey: string,
  nextKey: string,
  vertices: Map<string, [number, number]>,
  adjacency: Map<string, string[]>,
  usedEdges: Set<string>
): [number, number][] | null {
  const maxSteps = vertices.size + 2;
  const polygon: [number, number][] = [];
  const edgesUsedInThisFace: string[] = [];

  let prevKey = startKey;
  let currKey = nextKey;

  // Add starting vertex
  const startVtx = vertices.get(startKey);
  if (!startVtx) return null;
  polygon.push(startVtx);

  for (let step = 0; step < maxSteps; step++) {
    const edgeId = `${prevKey}→${currKey}`;
    edgesUsedInThisFace.push(edgeId);

    const currVtx = vertices.get(currKey);
    if (!currVtx) return null;

    if (currKey === startKey) {
      // Closed the face
      break;
    }

    polygon.push(currVtx);

    const prevVtx = vertices.get(prevKey)!;

    // Incoming direction vector
    const inDx = currVtx[0] - prevVtx[0];
    const inDz = currVtx[1] - prevVtx[1];

    // Choose the most clockwise next edge (excluding going back)
    const neighbors = adjacency.get(currKey) ?? [];
    let bestKey: string | null = null;
    let bestAngle = Infinity;

    for (const neighborKey of neighbors) {
      if (neighborKey === prevKey) continue; // don't go back unless no choice

      const neighborVtx = vertices.get(neighborKey)!;
      const outDx = neighborVtx[0] - currVtx[0];
      const outDz = neighborVtx[1] - currVtx[1];

      // Angle of turn: positive = CCW, negative = CW
      // We want most clockwise turn = most negative angle
      const cross = inDx * outDz - inDz * outDx;
      const dot = inDx * outDx + inDz * outDz;
      const angle = Math.atan2(cross, dot); // range (-pi, pi]

      if (angle < bestAngle) {
        bestAngle = angle;
        bestKey = neighborKey;
      }
    }

    if (bestKey === null) {
      // Dead end — try to go back
      if (neighbors.includes(prevKey)) {
        bestKey = prevKey;
      } else {
        return null; // truly stuck
      }
    }

    prevKey = currKey;
    currKey = bestKey;
  }

  if (polygon.length < 3) return null;

  // Mark all edges in this face as used
  for (const eid of edgesUsedInThisFace) {
    usedEdges.add(eid);
  }

  return polygon;
}
