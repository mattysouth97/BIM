// src/lib/structural-codes.ts
// KBC 2016 structural analysis constants and calculation functions.
// Used by the structural analysis layer (Layer 15) for load path visualization.

import type { BuildingRecipe } from "@/lib/procedural/types";

// ---------------------------------------------------------------------------
// Load tables — KBC 2016 (Korean Building Code)
// ---------------------------------------------------------------------------

/**
 * Dead loads per floor area by building use code (kN/m²).
 * Includes structural self-weight + superimposed dead load.
 * Source: KBC 2016 Table 4-1
 */
export const KBC_2016_DEAD_LOADS: Record<string, number> = {
  "01000": 5.0, // Single-family residential
  "02000": 5.0, // Multi-family residential
  "14000": 6.0, // Commercial / retail
  "10000": 6.0, // Educational
  "default": 5.0,
};

/**
 * Live loads per floor area by building use code (kN/m²).
 * Source: KBC 2016 Table 4-2
 */
export const KBC_2016_LIVE_LOADS: Record<string, number> = {
  "01000": 2.0,  // Single-family residential
  "02000": 2.0,  // Multi-family residential
  "14000": 2.5,  // Commercial / retail
  "10000": 4.0,  // Educational (assembly areas)
  "roof": 1.0,   // Roof (maintenance load)
  "default": 2.0,
};

// ---------------------------------------------------------------------------
// Column sizing table — KBC 2016 standard RC column dimensions
// ---------------------------------------------------------------------------

export interface ColumnSizingEntry {
  maxLoad: number;   // Maximum cumulative axial load this size can handle (kN)
  dimension: number; // Square section dimension (mm)
}

/**
 * Column sizing lookup table sorted in ascending maxLoad order.
 * Based on simplified KBC 2016 RC column capacity for f'c = 25 MPa.
 */
export const KBC_COLUMN_SIZING: ColumnSizingEntry[] = [
  { maxLoad: 200,      dimension: 300 },
  { maxLoad: 500,      dimension: 400 },
  { maxLoad: 1000,     dimension: 500 },
  { maxLoad: 2000,     dimension: 600 },
  { maxLoad: Infinity, dimension: 700 },
];

// ---------------------------------------------------------------------------
// Column position helper
// ---------------------------------------------------------------------------

type FootprintPoint = { x: number; z: number };

const GEOMETRY_EPSILON = 1e-7;

function pointOnSegment(
  point: FootprintPoint,
  start: FootprintPoint,
  end: FootprintPoint,
): boolean {
  const cross =
    (point.z - start.z) * (end.x - start.x) -
    (point.x - start.x) * (end.z - start.z);
  if (Math.abs(cross) > GEOMETRY_EPSILON) return false;

  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.z - start.z) * (end.z - start.z);
  if (dot < -GEOMETRY_EPSILON) return false;

  const squaredLength =
    (end.x - start.x) ** 2 + (end.z - start.z) ** 2;
  return dot <= squaredLength + GEOMETRY_EPSILON;
}

function pointInRing(point: FootprintPoint, ring: [number, number][]): boolean {
  let inside = false;
  const count =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.length - 1
      : ring.length;

  for (let i = 0, j = count - 1; i < count; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (
      pointOnSegment(
        point,
        { x: xj, z: zj },
        { x: xi, z: zi },
      )
    ) {
      return true;
    }
    const crosses =
      zi > point.z !== zj > point.z &&
      point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(
  first: FootprintPoint,
  second: FootprintPoint,
  third: FootprintPoint,
): number {
  return (
    (second.x - first.x) * (third.z - first.z) -
    (second.z - first.z) * (third.x - first.x)
  );
}

function segmentsIntersect(
  firstStart: FootprintPoint,
  firstEnd: FootprintPoint,
  secondStart: FootprintPoint,
  secondEnd: FootprintPoint,
): boolean {
  const o1 = orientation(firstStart, firstEnd, secondStart);
  const o2 = orientation(firstStart, firstEnd, secondEnd);
  const o3 = orientation(secondStart, secondEnd, firstStart);
  const o4 = orientation(secondStart, secondEnd, firstEnd);

  if (
    ((o1 > GEOMETRY_EPSILON && o2 < -GEOMETRY_EPSILON) ||
      (o1 < -GEOMETRY_EPSILON && o2 > GEOMETRY_EPSILON)) &&
    ((o3 > GEOMETRY_EPSILON && o4 < -GEOMETRY_EPSILON) ||
      (o3 < -GEOMETRY_EPSILON && o4 > GEOMETRY_EPSILON))
  ) {
    return true;
  }

  return (
    (Math.abs(o1) <= GEOMETRY_EPSILON &&
      pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (Math.abs(o2) <= GEOMETRY_EPSILON &&
      pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (Math.abs(o3) <= GEOMETRY_EPSILON &&
      pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (Math.abs(o4) <= GEOMETRY_EPSILON &&
      pointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function ringEdges(ring: [number, number][]): [FootprintPoint, FootprintPoint][] {
  const count =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.length - 1
      : ring.length;
  const edges: [FootprintPoint, FootprintPoint][] = [];
  for (let index = 0; index < count; index++) {
    const [startX, startZ] = ring[index];
    const [endX, endZ] = ring[(index + 1) % count];
    edges.push([
      { x: startX, z: startZ },
      { x: endX, z: endZ },
    ]);
  }
  return edges;
}

/**
 * Test whether a complete axis-aligned rectangle fits inside a footprint.
 * Corners alone are insufficient for concave footprints: a courtyard or notch
 * can cross the rectangle between probe points. Boundary/edge intersection and
 * contained polygon vertices are therefore checked as well.
 */
export function axisAlignedRectangleFitsFootprint(
  center: FootprintPoint,
  halfWidth: number,
  halfDepth: number,
  footprintPolygon?: [number, number][][],
): boolean {
  if (!footprintPolygon?.[0]?.length) return true;
  const corners: FootprintPoint[] = [
    { x: center.x - halfWidth, z: center.z - halfDepth },
    { x: center.x + halfWidth, z: center.z - halfDepth },
    { x: center.x + halfWidth, z: center.z + halfDepth },
    { x: center.x - halfWidth, z: center.z + halfDepth },
  ];
  const outerRing = footprintPolygon[0];
  const holes = footprintPolygon.slice(1);

  if (!corners.every((corner) => pointInRing(corner, outerRing))) return false;
  if (holes.some((hole) => corners.some((corner) => pointInRing(corner, hole)))) {
    return false;
  }

  const rectangleEdges = corners.map(
    (corner, index) =>
      [corner, corners[(index + 1) % corners.length]] as [
        FootprintPoint,
        FootprintPoint,
      ],
  );
  const rectangleContains = (point: FootprintPoint) =>
    point.x >= center.x - halfWidth - GEOMETRY_EPSILON &&
    point.x <= center.x + halfWidth + GEOMETRY_EPSILON &&
    point.z >= center.z - halfDepth - GEOMETRY_EPSILON &&
    point.z <= center.z + halfDepth + GEOMETRY_EPSILON;

  for (const ring of footprintPolygon) {
    for (const [ringStart, ringEnd] of ringEdges(ring)) {
      if (
        rectangleEdges.some(([rectStart, rectEnd]) =>
          segmentsIntersect(rectStart, rectEnd, ringStart, ringEnd),
        )
      ) {
        return false;
      }
      if (rectangleContains(ringStart)) return false;
    }
  }

  return true;
}

function columnFitsFootprint(
  point: FootprintPoint,
  size: number,
  footprintPolygon?: [number, number][][],
): boolean {
  const half = size / 2;
  return axisAlignedRectangleFitsFootprint(
    point,
    half,
    half,
    footprintPolygon,
  );
}

/**
 * Returns the structural column grid positions for a given building recipe.
 * Mirrors the exact logic used in structure-generator.ts (lines 64-85) to
 * prevent position drift between the structural overlay and actual columns.
 *
 * @param recipe - BuildingRecipe with footprint and column config
 * @returns Array of {x, z} positions in local building coordinates
 */
export function getColumnPositions(
  recipe: BuildingRecipe
): { x: number; z: number }[] {
  const { footprintWidth, footprintDepth, column } = recipe;

  const margin = column.inset;
  const innerW = footprintWidth - margin * 2;
  const innerD = footprintDepth - margin * 2;

  const columnPositions: { x: number; z: number }[] = [];

  if (innerW >= column.spacing && innerD >= column.spacing) {
    const colsX = Math.max(2, Math.round(innerW / column.spacing) + 1);
    const colsZ = Math.max(2, Math.round(innerD / column.spacing) + 1);
    const spacingX = colsX > 1 ? innerW / (colsX - 1) : 0;
    const spacingZ = colsZ > 1 ? innerD / (colsZ - 1) : 0;

    for (let ix = 0; ix < colsX; ix++) {
      for (let iz = 0; iz < colsZ; iz++) {
        const position = {
          x: colsX > 1 ? -innerW / 2 + ix * spacingX : 0,
          z: colsZ > 1 ? -innerD / 2 + iz * spacingZ : 0,
        };
        if (columnFitsFootprint(position, column.size, recipe.footprintPolygon)) {
          columnPositions.push(position);
        }
      }
    }
  }

  return columnPositions;
}

// ---------------------------------------------------------------------------
// Calculation functions
// ---------------------------------------------------------------------------

/**
 * Calculate cumulative axial load per floor column (kN).
 * Returns an array with one entry per floor (index 0 = ground floor).
 * Each value represents the total load the column at that floor carries
 * (i.e., it supports the weight of all floors above it).
 *
 * Load per floor = (deadLoad + liveLoad) * tributaryArea
 * tributaryArea = totalFootprintArea / columnCount
 *
 * @param recipe - BuildingRecipe
 * @param columnCount - Number of columns (use getColumnPositions().length)
 * @returns Per-floor cumulative load array (kN), index 0 = bottom floor
 */
export function calcColumnLoad(
  recipe: BuildingRecipe,
  columnCount: number
): number[] {
  const { footprintWidth, footprintDepth, floors, mainPurpsCd } = recipe;

  const deadLoad = KBC_2016_DEAD_LOADS[mainPurpsCd] ?? KBC_2016_DEAD_LOADS["default"];
  const liveLoad = KBC_2016_LIVE_LOADS[mainPurpsCd] ?? KBC_2016_LIVE_LOADS["default"];

  const totalArea = footprintWidth * footprintDepth;
  const tributaryArea = totalArea / Math.max(1, columnCount);
  const floorLoad = (deadLoad + liveLoad) * tributaryArea;

  const totalFloors = floors.length;

  return floors.map((_, index) => {
    // Number of floors above (including this one): totalFloors - index
    const floorsAbove = totalFloors - index;
    return floorLoad * floorsAbove;
  });
}

/**
 * Calculate simplified RC column axial capacity per KBC 2016 (kN).
 *
 * Formula: Pu = φ × 0.80 × [0.85 × f'c × Ag] / 1000
 * where:
 *   φ = 0.65 (strength reduction factor for compression)
 *   f'c = 25 MPa (standard KBC 2016 concrete strength)
 *   Ag = gross cross-sectional area (mm²) = (size_mm)²
 *
 * @param recipe - BuildingRecipe with column.size in meters
 * @returns Column axial capacity in kN
 */
export function calcColumnCapacity(recipe: BuildingRecipe): number {
  const sizeMm = recipe.column.size * 1000; // meters → millimeters
  const Ag = sizeMm * sizeMm;               // mm²
  const fc = 25;                             // MPa — KBC 2016 standard

  // ACI/KBC simplified tied column:
  // Pu = 0.65 * 0.80 * 0.85 * fc * Ag / 1000  (kN)
  const Pu = 0.65 * 0.80 * 0.85 * fc * Ag / 1000;
  return Pu;
}

/**
 * Look up recommended column size for a given cumulative axial load.
 * Returns standard KBC RC column dimension string.
 *
 * @param loadKN - Axial load in kN
 * @returns String like "400x400mm RC column"
 */
export function getRecommendedColumnSize(loadKN: number): string {
  const entry = KBC_COLUMN_SIZING.find((e) => loadKN <= e.maxLoad);
  // Always finds a match since last entry is Infinity
  const dimension = entry!.dimension;
  return `${dimension}x${dimension}mm RC column`;
}

// ---------------------------------------------------------------------------
// Stress color coding
// ---------------------------------------------------------------------------

/**
 * Returns a hex color number for a given utilization ratio.
 *
 * Thresholds per user decision (stress color gradient):
 *   ratio < 0.60  → green  0x22c55e (safe)
 *   ratio < 0.85  → yellow 0xeab308 (caution)
 *   ratio >= 0.85 → red    0xef4444 (overstressed)
 *
 * @param ratio - Utilization ratio (actualLoad / capacity), 0.0 to 1.0+
 * @returns Hex color as a number
 */
export function getStressColor(ratio: number): number {
  if (ratio < 0.6) return 0x22c55e;  // green — safe
  if (ratio < 0.85) return 0xeab308; // yellow — caution
  return 0xef4444;                    // red — overstressed
}
