/**
 * Snap engine — pure functions for grid, vertex, and edge snapping.
 *
 * This module is intentionally dependency-free (no store imports, no Three.js)
 * so it can be unit-tested in isolation and reused across any drawing tool.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnapType = "grid" | "vertex" | "edge" | "none";

export type AxisConstraint = "none" | "x" | "z" | "auto";

export interface AlignmentGuide {
  axis: "x" | "z";             // which axis the alignment is on
  value: number;                // the X or Z coordinate of the alignment
  fromPoint: [number, number];  // the current point
  toPoint: [number, number];    // the existing wall endpoint it aligns with
}

export interface SnapResult {
  type: SnapType;
  point: [number, number]; // snapped x, z
  sourceId?: string;       // wall id for vertex/edge snaps
  distance: number;        // distance from raw point to snap point
}

export interface SnapConfig {
  enabled: boolean;
  gridSnap: boolean;
  vertexSnap: boolean;
  edgeSnap: boolean;
  gridSize: number;           // meters (0.1, 0.5, 1.0)
  proximityTolerance: number; // meters, default 0.3
}

/** Minimal wall shape — only fields needed by the snap engine */
export interface SnapWall {
  id: string;
  start: [number, number];
  end: [number, number];
}

// ---------------------------------------------------------------------------
// snapToGrid
// ---------------------------------------------------------------------------

/**
 * Round x and z to nearest gridSize multiple.
 * Always returns a SnapResult (never misses).
 */
export function snapToGrid(
  x: number,
  z: number,
  gridSize: number
): SnapResult {
  const snappedX = Math.round(x / gridSize) * gridSize;
  const snappedZ = Math.round(z / gridSize) * gridSize;
  const dx = snappedX - x;
  const dz = snappedZ - z;
  return {
    type: "grid",
    point: [snappedX, snappedZ],
    distance: Math.sqrt(dx * dx + dz * dz),
  };
}

// ---------------------------------------------------------------------------
// snapToVertex
// ---------------------------------------------------------------------------

/**
 * Find the closest wall endpoint (start or end) within tolerance.
 * Returns null if no endpoint is within tolerance.
 */
export function snapToVertex(
  x: number,
  z: number,
  walls: SnapWall[],
  tolerance: number
): SnapResult | null {
  let bestDist = tolerance;
  let bestPoint: [number, number] | null = null;
  let bestId: string | undefined;

  for (const wall of walls) {
    for (const endpoint of [wall.start, wall.end] as [number, number][]) {
      const dx = endpoint[0] - x;
      const dz = endpoint[1] - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = endpoint;
        bestId = wall.id;
      }
    }
  }

  if (!bestPoint) return null;

  return {
    type: "vertex",
    point: bestPoint,
    sourceId: bestId,
    distance: bestDist,
  };
}

// ---------------------------------------------------------------------------
// snapToEdge (inline projectOntoWall — keeps snap-engine dependency-free)
// ---------------------------------------------------------------------------

/**
 * Project point (px, pz) onto wall segment (ax, az)→(bx, bz).
 * Returns the projected point, parametric t, and distance.
 */
function projectOntoSegment(
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

/**
 * Find the closest point on any wall edge within tolerance.
 * Excludes the endpoints (those are covered by snapToVertex).
 * Returns null if no edge projection is within tolerance.
 */
export function snapToEdge(
  x: number,
  z: number,
  walls: SnapWall[],
  tolerance: number
): SnapResult | null {
  let bestDist = tolerance;
  let bestPoint: [number, number] | null = null;
  let bestId: string | undefined;

  for (const wall of walls) {
    const proj = projectOntoSegment(
      x,
      z,
      wall.start[0],
      wall.start[1],
      wall.end[0],
      wall.end[1]
    );

    // Skip projections that are at the endpoints (t ~0 or ~1)
    // Those will be caught by snapToVertex with better precision.
    if (proj.t < 0.001 || proj.t > 0.999) continue;

    if (proj.dist < bestDist) {
      bestDist = proj.dist;
      bestPoint = [proj.wx, proj.wz];
      bestId = wall.id;
    }
  }

  if (!bestPoint) return null;

  return {
    type: "edge",
    point: bestPoint,
    sourceId: bestId,
    distance: bestDist,
  };
}

// ---------------------------------------------------------------------------
// computeSnap — main entry point
// ---------------------------------------------------------------------------

/**
 * Compute the best snap result for the given raw cursor position.
 *
 * Priority: vertex (highest) > edge > grid > none.
 *
 * When snap is disabled or nothing matches, returns {type:"none"}.
 */
export function computeSnap(
  x: number,
  z: number,
  walls: SnapWall[],
  config: SnapConfig
): SnapResult {
  const noSnap: SnapResult = { type: "none", point: [x, z], distance: 0 };

  if (!config.enabled) return noSnap;

  // 1. Vertex snap (highest priority)
  if (config.vertexSnap && walls.length > 0) {
    const vSnap = snapToVertex(x, z, walls, config.proximityTolerance);
    if (vSnap) return vSnap;
  }

  // 2. Edge snap
  if (config.edgeSnap && walls.length > 0) {
    const eSnap = snapToEdge(x, z, walls, config.proximityTolerance);
    if (eSnap) return eSnap;
  }

  // 3. Grid snap (always succeeds when enabled)
  if (config.gridSnap) {
    return snapToGrid(x, z, config.gridSize);
  }

  return noSnap;
}

// ---------------------------------------------------------------------------
// applyAxisConstraint — constrain cursor to X or Z axis from a start point
// ---------------------------------------------------------------------------

/**
 * Apply axis constraint to a cursor position relative to a drawing start point.
 *
 * - "none"  → return currentPoint unchanged
 * - "x"     → lock Z to startPoint[1], allow X movement
 * - "z"     → lock X to startPoint[0], allow Z movement
 * - "auto"  → detect dominant axis (whichever delta is larger) and apply accordingly
 */
export function applyAxisConstraint(
  startPoint: [number, number],
  currentPoint: [number, number],
  constraint: AxisConstraint
): [number, number] {
  if (constraint === "none") return currentPoint;
  if (constraint === "x") return [currentPoint[0], startPoint[1]];
  if (constraint === "z") return [startPoint[0], currentPoint[1]];
  // "auto": pick the dominant axis
  const dx = Math.abs(currentPoint[0] - startPoint[0]);
  const dz = Math.abs(currentPoint[1] - startPoint[1]);
  if (dx >= dz) {
    // Dominant = X axis: lock Z
    return [currentPoint[0], startPoint[1]];
  } else {
    // Dominant = Z axis: lock X
    return [startPoint[0], currentPoint[1]];
  }
}

// ---------------------------------------------------------------------------
// detectAlignments — find wall endpoints collinear with the given point
// ---------------------------------------------------------------------------

/**
 * Detect alignment guides: existing wall endpoints that share an X or Z
 * coordinate with the given point within the given tolerance.
 *
 * Returns one guide per unique axis+value pair (closest endpoint wins).
 */
export function detectAlignments(
  point: [number, number],
  walls: SnapWall[],
  tolerance = 0.05
): AlignmentGuide[] {
  // Collect all unique endpoints
  const endpoints: [number, number][] = [];
  for (const wall of walls) {
    endpoints.push(wall.start, wall.end);
  }

  // Maps to track best (closest) guide per axis+value key
  const bestX = new Map<number, { dist: number; endpoint: [number, number] }>();
  const bestZ = new Map<number, { dist: number; endpoint: [number, number] }>();

  for (const ep of endpoints) {
    const fullDist = Math.sqrt((ep[0] - point[0]) ** 2 + (ep[1] - point[1]) ** 2);
    // Skip the point itself
    if (fullDist < 1e-6) continue;

    // Check X-axis alignment: same X coordinate (vertical guide line)
    const dxAbs = Math.abs(ep[0] - point[0]);
    if (dxAbs < tolerance) {
      const key = Math.round(ep[0] * 1000); // bucket by millimeter precision
      const existing = bestX.get(key);
      if (!existing || dxAbs < existing.dist) {
        bestX.set(key, { dist: dxAbs, endpoint: ep });
      }
    }

    // Check Z-axis alignment: same Z coordinate (horizontal guide line)
    const dzAbs = Math.abs(ep[1] - point[1]);
    if (dzAbs < tolerance) {
      const key = Math.round(ep[1] * 1000);
      const existing = bestZ.get(key);
      if (!existing || dzAbs < existing.dist) {
        bestZ.set(key, { dist: dzAbs, endpoint: ep });
      }
    }
  }

  const guides: AlignmentGuide[] = [];

  for (const [key, { endpoint }] of bestX.entries()) {
    const xValue = key / 1000;
    guides.push({
      axis: "x",
      value: xValue,
      fromPoint: point,
      toPoint: endpoint,
    });
  }

  for (const [key, { endpoint }] of bestZ.entries()) {
    const zValue = key / 1000;
    guides.push({
      axis: "z",
      value: zValue,
      fromPoint: point,
      toPoint: endpoint,
    });
  }

  return guides;
}
