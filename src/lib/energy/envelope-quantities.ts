// Envelope quantities derived from a BuildingRecipe.
// CAD / VWorld rings drive envelope surfaces. Official totArea (when > 0)
// is the intensity denominator for grade / demandPerSqm (AFF-6: 0 = unavailable).

import type { BuildingRecipe } from "@/lib/procedural/types";

export type EnvelopeSource = "polygon" | "bbox";

export interface EnvelopeQuantities {
  source: EnvelopeSource;
  /** Plan area of one storey (outer − holes), m². */
  planAreaSqm: number;
  /** Exterior wall length including courtyard rings, m. */
  wallLengthM: number;
  /** Gross wall area = wallLengthM × totalHeight, m². */
  grossWallAreaSqm: number;
  /** Roof / ground-floor plan area (same as planAreaSqm). */
  roofAreaSqm: number;
  /** Conditioned volume = planAreaSqm × totalHeight, m³. */
  volumeM3: number;
  /** planAreaSqm × floor count — used when totArea is unavailable. */
  derivedFloorAreaSqm: number;
  /**
   * Denominator for kWh/m² and grade.
   * Ledger totArea when > 0; otherwise derivedFloorAreaSqm.
   */
  intensityFloorAreaSqm: number;
}

function ringAreaAbs(ring: [number, number][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

function ringLength(ring: [number, number][]): number {
  if (!Array.isArray(ring) || ring.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    len += Math.hypot(x2 - x1, y2 - y1);
  }
  return len;
}

function isUsablePolygon(rings: [number, number][][] | undefined): rings is [number, number][][] {
  return Array.isArray(rings) && rings.length > 0 && rings[0].length >= 3;
}

/**
 * Envelope surfaces follow the CAD/VWorld ring when present.
 * Courtyard holes shrink plan area and add to wall length.
 */
export function envelopeQuantities(recipe: BuildingRecipe): EnvelopeQuantities {
  const floors = recipe.floors.length;
  const height = recipe.totalHeight;
  let source: EnvelopeSource = "bbox";
  let planAreaSqm = recipe.footprintWidth * recipe.footprintDepth;
  let wallLengthM = 2 * (recipe.footprintWidth + recipe.footprintDepth);

  if (isUsablePolygon(recipe.footprintPolygon)) {
    const [outer, ...holes] = recipe.footprintPolygon;
    const holeArea = holes.reduce((sum, hole) => sum + ringAreaAbs(hole), 0);
    const holeLength = holes.reduce((sum, hole) => sum + ringLength(hole), 0);
    planAreaSqm = Math.max(0, ringAreaAbs(outer) - holeArea);
    wallLengthM = ringLength(outer) + holeLength;
    source = "polygon";
  }

  const derivedFloorAreaSqm = planAreaSqm * Math.max(floors, 0);
  const official = recipe.officialFloorAreaSqm;
  const intensityFloorAreaSqm =
    official != null && official > 0 ? official : derivedFloorAreaSqm;

  return {
    source,
    planAreaSqm,
    wallLengthM,
    grossWallAreaSqm: wallLengthM * height,
    roofAreaSqm: planAreaSqm,
    volumeM3: planAreaSqm * height,
    derivedFloorAreaSqm,
    intensityFloorAreaSqm,
  };
}
