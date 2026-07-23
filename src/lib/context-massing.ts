// src/lib/context-massing.ts
// P2-26 — Pure projection + filtering utilities for neighbor context massing.
// No 'use client' directive (AFF-1 — this is a pure server/shared module).

import { createSceneProjection } from "@/lib/gis/gis-transform";

/** Estimated floor-to-floor height in meters when no measured height is available. */
export const ESTIMATED_FLOOR_HEIGHT_M = 3.3;

/** Default neighbor height in meters when both measured height and floor count are unavailable. */
export const DEFAULT_NEIGHBOR_HEIGHT_M = 6;

/**
 * Resolve the display height for a neighbor building.
 *
 * Fallback chain (per brief):
 *   1. Measured `height` (buld_hg) — when positive finite
 *   2. `groundFloors * ESTIMATED_FLOOR_HEIGHT_M` — when groundFloors is a positive integer
 *   3. `DEFAULT_NEIGHBOR_HEIGHT_M` — unconditional fallback
 */
export function resolveNeighborHeight(
  height: number | null,
  groundFloors: number | null
): number {
  if (height !== null && Number.isFinite(height) && height > 0) {
    return height;
  }
  if (groundFloors !== null && Number.isFinite(groundFloors) && groundFloors > 0) {
    return groundFloors * ESTIMATED_FLOOR_HEIGHT_M;
  }
  return DEFAULT_NEIGHBOR_HEIGHT_M;
}

/**
 * Ray-cast point-in-polygon test (WGS84 coordinates, [lng, lat] pairs).
 * Returns true if the point lies strictly inside the ring (exclusive of boundary).
 */
function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  const [px, py] = point;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute the vertex centroid of a WGS84 ring as [lng, lat].
 */
function ringCentroid(ring: number[][]): [number, number] {
  const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [lng, lat];
}

/** One item in the neighbor array coming from the /api/vworld/footprint contextMode response. */
export interface NeighborFeature {
  pnu: string;
  polygon: number[][][];
  height: number | null;
  groundFloors: number | null;
}

/** One projected neighbor ready for Three.js rendering. */
export interface LocalNeighbor {
  /** Local [x, z] meter coordinates of the outer ring vertices. */
  points: [number, number][];
  /** Height in meters (resolved via resolveNeighborHeight). */
  height: number;
}

/**
 * Project neighbor polygons into local scene coordinates, excluding the subject building.
 *
 * @param neighbors - Raw neighbor features from the contextMode API response.
 * @param centerLng - Scene origin longitude (WGS84, centroid of subject outer ring).
 * @param centerLat - Scene origin latitude (WGS84, centroid of subject outer ring).
 * @param subjectOuterRing - WGS84 outer ring of the subject building ([lng, lat] pairs).
 *   Any neighbor whose outer-ring centroid lies inside this ring is excluded (it is the
 *   subject building itself, re-returned by the bbox query).
 * @returns Array of projected neighbors, subject excluded.
 */
export function toLocalNeighbors(
  neighbors: NeighborFeature[],
  centerLng: number,
  centerLat: number,
  subjectOuterRing: [number, number][]
): LocalNeighbor[] {
  let proj: ReturnType<typeof createSceneProjection>;
  try {
    proj = createSceneProjection(centerLng, centerLat);
  } catch {
    // If projection setup fails (e.g. out-of-Korea coords in tests), return empty
    return [];
  }

  const result: LocalNeighbor[] = [];

  for (const neighbor of neighbors) {
    const outerRing = neighbor.polygon[0];
    if (!outerRing || outerRing.length < 3) continue;

    // Exclude the subject building: its centroid falls inside its own ring.
    const centroid = ringCentroid(outerRing);
    if (pointInPolygon(centroid as [number, number], subjectOuterRing)) {
      continue;
    }

    // Project outer ring to local [x, z] meters
    const points: [number, number][] = outerRing.map(([lng, lat]) => {
      try {
        return proj.project(lng, lat) as [number, number];
      } catch {
        return [0, 0] as [number, number];
      }
    });

    result.push({
      points,
      height: resolveNeighborHeight(neighbor.height, neighbor.groundFloors),
    });
  }

  return result;
}
