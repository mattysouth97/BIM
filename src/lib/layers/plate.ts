// src/lib/layers/plate.ts
//
// The MEP generators used to treat every building as an origin-centred
// rectangle of footprintWidth × footprintDepth. A schematic plate is often
// an L, a courtyard, or an offset wing — the bbox of that plate includes
// empty air. This module is the single plate the generators should ask.
//
// Pure: no React. THREE is imported only for Shape construction.

import * as THREE from "three";
import { insetRing, pointInRing } from "@/lib/gis/ring-utils";
import type { BuildingRecipe } from "@/lib/procedural/types";

export type PlateRing = [number, number][];

export function plateRings(recipe: BuildingRecipe): PlateRing[] {
  const polygon = recipe.footprintPolygon;
  if (polygon && polygon[0] && polygon[0].length >= 3) {
    return polygon.map((ring) => ring.map(([x, z]) => [x, z] as [number, number]));
  }
  const hw = recipe.footprintWidth / 2;
  const hd = recipe.footprintDepth / 2;
  return [
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ],
  ];
}

export function plateBounds(rings: PlateRing[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const outer = rings[0] ?? [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of outer) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
  return { minX, maxX, minZ, maxZ };
}

/** True when (x, z) is on the solid plate — inside the outer ring, outside holes. */
export function pointInPlate(
  x: number,
  z: number,
  rings: PlateRing[],
): boolean {
  const [outer, ...holes] = rings;
  if (!outer || outer.length < 3) return false;
  if (!pointInRing(x, z, outer)) return false;
  for (const hole of holes) {
    if (hole.length >= 3 && pointInRing(x, z, hole)) return false;
  }
  return true;
}

/**
 * Conservative inset test: the point and a small cross around it must sit on
 * the plate, so fixtures don't land on the facade or in a courtyard.
 */
export function pointInPlateInset(
  x: number,
  z: number,
  rings: PlateRing[],
  insetM: number,
): boolean {
  if (insetM <= 0) return pointInPlate(x, z, rings);
  if (!pointInPlate(x, z, rings)) return false;
  return (
    pointInPlate(x + insetM, z, rings) &&
    pointInPlate(x - insetM, z, rings) &&
    pointInPlate(x, z + insetM, rings) &&
    pointInPlate(x, z - insetM, rings)
  );
}

/** Shoelace centroid of the outer ring. Holes are ignored (good enough for mounting). */
export function plateCentroid(rings: PlateRing[]): { x: number; z: number } {
  const outer = rings[0];
  if (!outer || outer.length < 3) return { x: 0, z: 0 };
  let twiceArea = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < outer.length; i += 1) {
    const [x0, z0] = outer[i];
    const [x1, z1] = outer[(i + 1) % outer.length];
    const cross = x0 * z1 - x1 * z0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cz += (z0 + z1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const b = plateBounds(rings);
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  }
  return { x: cx / (3 * twiceArea), z: cz / (3 * twiceArea) };
}

/**
 * If (x, z) is off the plate, walk it toward the centroid until it lands.
 * Used so a rear-wall default computed from the bbox is pulled out of a
 * courtyard or the missing arm of an L.
 */
export function keepOnPlate(
  x: number,
  z: number,
  rings: PlateRing[],
  insetM = 0.5,
): { x: number; z: number } {
  if (pointInPlateInset(x, z, rings, insetM)) return { x, z };
  const c = plateCentroid(rings);
  for (const t of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
    const nx = x + (c.x - x) * t;
    const nz = z + (c.z - z) * t;
    if (pointInPlateInset(nx, nz, rings, insetM)) return { x: nx, z: nz };
  }
  // Courtyard plates have their centroid in the hole. Walk out in 8
  // directions until we hit solid, then fall back to a coarse scan.
  const b = plateBounds(rings);
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 1);
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (let step = 1; step <= 12; step += 1) {
    const dist = (span / 12) * step;
    for (const [dx, dz] of dirs) {
      const nx = c.x + dx * dist;
      const nz = c.z + dz * dist;
      if (pointInPlateInset(nx, nz, rings, insetM)) return { x: nx, z: nz };
    }
  }
  return { x, z };
}

/** Grid of points that sit on the solid plate, inset from the edge. */
export function samplePlateGrid(
  recipe: BuildingRecipe,
  spacing: number,
  insetM = 0.8,
): { x: number; z: number }[] {
  const rings = plateRings(recipe);
  const b = plateBounds(rings);
  const step = Math.max(0.5, spacing);
  const points: { x: number; z: number }[] = [];
  const startX = b.minX + insetM;
  const startZ = b.minZ + insetM;
  for (let x = startX; x <= b.maxX - insetM + 1e-6; x += step) {
    for (let z = startZ; z <= b.maxZ - insetM + 1e-6; z += step) {
      if (pointInPlateInset(x, z, rings, insetM * 0.5)) {
        points.push({ x, z });
      }
    }
  }
  return points;
}

/**
 * THREE.Shape in XY with z negated, matching energy-heatmap / overlay
 * convention. Extrude along +Z then rotateX(-π/2) to stand it in XZ.
 */
export function createPlateShape(rings: PlateRing[]): THREE.Shape {
  const [outer, ...holes] = rings;
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) {
    if (hole.length < 3) continue;
    shape.holes.push(
      new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))),
    );
  }
  return shape;
}

/** Inset the outer ring toward the interior (and expand holes) for wall clearance. */
export function insetPlate(rings: PlateRing[], distance: number): PlateRing[] {
  if (distance === 0) return rings;
  return rings.map((ring, i) =>
    insetRing(ring, i === 0 ? distance : -distance),
  );
}
