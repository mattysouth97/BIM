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
