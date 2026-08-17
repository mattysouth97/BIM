// src/lib/generative/generate/structure.ts
//
// Structural grid → columns, beams, slabs.
//
// METRES in the engine's local XZ frame, origin at the footprint centre (see
// generate/types.ts). The spec is millimetres, so every read of
// `spec.structure` divides by 1000 here and nowhere downstream.
//
// Nothing in this module is stochastic and no `Rng` is threaded through it on
// purpose: a frame is a *consequence* of the grid and the plate, not a choice.
// Jittering a column would only make the building harder to build.

import type { BuildingSpec } from "../spec/building-spec";
import { polygonArea, type Polygon, type Ring } from "./massing";
import type {
  GeneratedBeam,
  GeneratedColumn,
  GeneratedGridLine,
  GeneratedLevel,
  GeneratedSlab,
  Rect,
} from "./types";

const mmToM = (mm: number) => mm / 1000;

/**
 * 1 µm. End grid lines land exactly on the plate edge by construction, so the
 * containment tests must not evict them over float noise in the last bit.
 */
const ON_EDGE_TOLERANCE_M = 1e-6;

/** Round to a step, then normalise — `Math.round(0.35/0.05)*0.05` is 0.35000000000000003. */
function roundTo(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(6));
}

/* ------------------------------------------------------------------ */
/* Grid                                                                */
/* ------------------------------------------------------------------ */

/**
 * Spreadsheet-style label: A…Z, AA, AB… Buildings up to 400 m wide on a 3 m
 * grid reach 134 lines, so single letters are not enough.
 */
function gridLetter(index: number): string {
  let remaining = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

/**
 * Positions of the grid lines along one axis, symmetric about the plate centre
 * so the two end bays are equal.
 *
 * Bay count FLOORS rather than rounds: rounding up would push the end lines
 * past the plate edge, and "column outside floor plate" is a hard validation
 * failure downstream. The heuristic provider snaps plate sizes to the grid
 * (`plateFromArea`), so the ordinary case divides exactly and the end lines
 * land precisely on the plate edges with no overhang to trim.
 */
function axisOffsets(minimum: number, maximum: number, spacingM: number): number[] {
  const span = maximum - minimum;
  if (!(span > 0) || !(spacingM > 0)) return [minimum];

  const bays = Math.floor(span / spacingM + 1e-9);
  // A plate narrower than a single bay still needs a column line on each edge;
  // honouring the spec spacing there would put both lines outside the building.
  if (bays < 1) return [minimum, maximum];

  const centre = (minimum + maximum) / 2;
  const start = centre - (bays * spacingM) / 2;
  return Array.from({ length: bays + 1 }, (_, i) => start + i * spacingM);
}

export function generateGrid(input: { spec: BuildingSpec; plate: Rect }): GeneratedGridLine[] {
  const { spec, plate } = input;

  const xOffsets = axisOffsets(plate.minX, plate.maxX, mmToM(spec.structure.gridXMm.value));
  const zOffsets = axisOffsets(plate.minZ, plate.maxZ, mmToM(spec.structure.gridZMm.value));

  // Lettered lines run along X, numbered lines along Z — the drafting
  // convention every structural sheet uses, so "B-3" reads the same here as it
  // does on paper.
  const lines: GeneratedGridLine[] = xOffsets.map((offset, index) => ({
    id: `grid:x:${index}`,
    name: gridLetter(index),
    axis: "x" as const,
    offset,
  }));

  zOffsets.forEach((offset, index) => {
    lines.push({
      id: `grid:z:${index}`,
      name: String(index + 1),
      axis: "z" as const,
      offset,
    });
  });

  return lines;
}

/* ------------------------------------------------------------------ */
/* Containment                                                         */
/* ------------------------------------------------------------------ */

/** Perpendicular distance from a point to a segment, clamped to the segment. */
function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Is the point on the ring's outline (within tolerance)? */
function isOnRing(ring: Ring, x: number, z: number): boolean {
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    if (distanceToSegment(x, z, ax, az, bx, bz) <= ON_EDGE_TOLERANCE_M) return true;
  }
  return false;
}

/** Even-odd crossing test. Boundary results are undefined — check `isOnRing` first. */
function isInsideRing(ring: Ring, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Does this grid intersection carry floor?
 *
 * Tested against the plate rect AND the level's own outline. The rect alone is
 * not enough: an L-shape's bounding box covers the quadrant that was removed,
 * a courtyard's covers the void, and a stepped tower's upper plates are
 * smaller than the shared plate. A column in any of those places is a
 * validation failure, so it is never created (requirement 5).
 */
function carriesFloor(x: number, z: number, plate: Rect, polygon: Polygon | undefined): boolean {
  if (
    x < plate.minX - ON_EDGE_TOLERANCE_M ||
    x > plate.maxX + ON_EDGE_TOLERANCE_M ||
    z < plate.minZ - ON_EDGE_TOLERANCE_M ||
    z > plate.maxZ + ON_EDGE_TOLERANCE_M
  ) {
    return false;
  }

  if (!polygon || polygon.length === 0) return true;
  const [outer, ...holes] = polygon;
  if (!isInsideRing(outer, x, z) && !isOnRing(outer, x, z)) return false;

  // A column standing ON a courtyard edge is fine — it is the edge beam's
  // support. Only the void interior is off-plate.
  return !holes.some((hole) => isInsideRing(hole, x, z) && !isOnRing(hole, x, z));
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

export function generateStructure(input: {
  spec: BuildingSpec;
  levels: GeneratedLevel[];
  grids: GeneratedGridLine[];
  plate: Rect;
}): { columns: GeneratedColumn[]; beams: GeneratedBeam[]; slabs: GeneratedSlab[] } {
  const { spec, levels, grids, plate } = input;

  const xLines = grids.filter((g) => g.axis === "x").sort((a, b) => a.offset - b.offset);
  const zLines = grids.filter((g) => g.axis === "z").sort((a, b) => a.offset - b.offset);

  const columnSizeM = mmToM(spec.structure.columnMm.value);
  const beamDepthM = mmToM(spec.structure.beamDepthMm.value);
  // Half the depth is the ordinary early-stage proportion; snapped to 50 mm so
  // the section reads as a real member size rather than a computed decimal.
  const beamWidthM = roundTo(beamDepthM / 2, 0.05);
  const slabThicknessM = mmToM(spec.structure.slabThicknessMm.value);

  const columns: GeneratedColumn[] = [];
  const beams: GeneratedBeam[] = [];
  const slabs: GeneratedSlab[] = [];

  for (const level of levels) {
    // Occupancy lattice for THIS level. Beams may only span pairs that were
    // actually placed, otherwise a stepped or courtyard plate grows beams
    // flying through open air.
    const placed: boolean[][] = xLines.map(() => zLines.map(() => false));

    // Columns are per-storey elements: each level carries its own set, so the
    // frame can change as the plate steps back.
    for (let xi = 0; xi < xLines.length; xi += 1) {
      for (let zi = 0; zi < zLines.length; zi += 1) {
        const x = xLines[xi].offset;
        const z = zLines[zi].offset;
        if (!carriesFloor(x, z, plate, level.polygon)) continue;

        placed[xi][zi] = true;
        const gridRef = `${xLines[xi].name}-${zLines[zi].name}`;
        columns.push({
          id: `COL-L${level.floorNo}-${gridRef}`,
          floorNo: level.floorNo,
          x,
          z,
          sizeM: columnSizeM,
          gridRef,
        });
      }
    }

    let beamIndex = 0;
    const pushBeam = (start: [number, number], end: [number, number]) => {
      beams.push({
        id: `BEAM-L${level.floorNo}-${beamIndex}`,
        floorNo: level.floorNo,
        start,
        end,
        depthM: beamDepthM,
        widthM: beamWidthM,
      });
      beamIndex += 1;
    };

    // Spans along X, between adjacent lettered lines on the same numbered line.
    for (let zi = 0; zi < zLines.length; zi += 1) {
      for (let xi = 0; xi < xLines.length - 1; xi += 1) {
        if (!placed[xi][zi] || !placed[xi + 1][zi]) continue;
        pushBeam(
          [xLines[xi].offset, zLines[zi].offset],
          [xLines[xi + 1].offset, zLines[zi].offset],
        );
      }
    }

    // Spans along Z, between adjacent numbered lines on the same lettered line.
    for (let xi = 0; xi < xLines.length; xi += 1) {
      for (let zi = 0; zi < zLines.length - 1; zi += 1) {
        if (!placed[xi][zi] || !placed[xi][zi + 1]) continue;
        pushBeam(
          [xLines[xi].offset, zLines[zi].offset],
          [xLines[xi].offset, zLines[zi + 1].offset],
        );
      }
    }

    // One slab per level, following that level's own plate — not the shared
    // footprint, which is only the largest plate.
    slabs.push({
      id: `SLAB-L${level.floorNo}`,
      floorNo: level.floorNo,
      polygon: level.polygon,
      thicknessM: slabThicknessM,
      areaSqm: polygonArea(level.polygon),
    });
  }

  return { columns, beams, slabs };
}
