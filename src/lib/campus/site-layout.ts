// src/lib/campus/site-layout.ts
// Pure functions for computing a campus site layout from CampusData.

import * as THREE from "three";
import type { CampusBuilding, CampusData } from "./campus-types";

export interface SiteBuildingEntry {
  building: CampusBuilding;
  /** World-space position in Three.js coordinates (Y=0 at ground) */
  position: THREE.Vector3;
  /** Optional footprint vertices in world space (XZ plane, Y=0) */
  footprintVertices?: THREE.Vector2[];
}

export interface SiteExtents {
  width: number;
  depth: number;
}

export interface SiteLayout {
  buildings: SiteBuildingEntry[];
  extents: SiteExtents;
  /** The campus centroid in the original (un-centered) coordinate space — Three.js origin maps here */
  center: THREE.Vector3;
}

/**
 * Convert GeoJSON polygon coordinates (lon/lat pairs relative to campus origin in meters)
 * to Three.js XZ plane Vector2 vertices.
 */
function polygonToVertices(
  coords: number[][][],
  offsetX: number,
  offsetZ: number
): THREE.Vector2[] {
  const ring = coords[0]; // outer ring only
  // Drop the closing duplicate vertex (last === first in GeoJSON)
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  return pts.map((p) => new THREE.Vector2(p[0] - offsetX, p[1] - offsetZ));
}

/**
 * Compute the centered site layout for a campus.
 *
 * Buildings whose `position` is undefined are placed at the campus center (origin).
 * All positions are expressed in meters relative to the campus centroid
 * so that Three.js world origin = center of the campus.
 */
export function computeSiteLayout(campusData: CampusData): SiteLayout {
  if (campusData.buildings.length === 0) {
    return {
      buildings: [],
      extents: { width: 0, depth: 0 },
      center: new THREE.Vector3(0, 0, 0),
    };
  }

  // Gather raw positions (x = east, y = north → mapped to Three.js x, z)
  const rawPositions = campusData.buildings.map((b) => ({
    x: b.position?.x ?? 0,
    z: b.position?.y ?? 0, // campus "y" (north) → Three.js z
  }));

  // Compute centroid of all building positions
  const sumX = rawPositions.reduce((s, p) => s + p.x, 0);
  const sumZ = rawPositions.reduce((s, p) => s + p.z, 0);
  const centroidX = sumX / rawPositions.length;
  const centroidZ = sumZ / rawPositions.length;

  // Compute centered positions and collect extents
  const entries: SiteBuildingEntry[] = campusData.buildings.map((b, i) => {
    const rawX = rawPositions[i].x;
    const rawZ = rawPositions[i].z;
    const centeredX = rawX - centroidX;
    const centeredZ = rawZ - centroidZ;

    const footprintVertices = b.footprint
      ? polygonToVertices(b.footprint.coordinates, centroidX, centroidZ)
      : undefined;

    return {
      building: b,
      position: new THREE.Vector3(centeredX, 0, centeredZ),
      footprintVertices,
    };
  });

  // Compute extents from all centered positions
  const allX = entries.map((e) => e.position.x);
  const allZ = entries.map((e) => e.position.z);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minZ = Math.min(...allZ);
  const maxZ = Math.max(...allZ);

  // Add a generous padding so the outermost buildings don't sit on the edge
  const BUILDING_FOOTPRINT_ESTIMATE = 30; // meters, conservative fallback
  const width = Math.max(maxX - minX + BUILDING_FOOTPRINT_ESTIMATE * 2, BUILDING_FOOTPRINT_ESTIMATE * 2);
  const depth = Math.max(maxZ - minZ + BUILDING_FOOTPRINT_ESTIMATE * 2, BUILDING_FOOTPRINT_ESTIMATE * 2);

  return {
    buildings: entries,
    extents: { width, depth },
    center: new THREE.Vector3(centroidX, 0, centroidZ),
  };
}
