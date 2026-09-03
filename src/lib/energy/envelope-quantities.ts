// Envelope quantities derived from a BuildingRecipe.
// CAD / VWorld rings drive envelope surfaces. Official totArea (when > 0)
// is the intensity denominator for grade / demandPerSqm (AFF-6: 0 = unavailable).
//
// P2-30: the stack is summed per storey rather than extruded from its base.
// A building that steps — which 층별개요 states, floor by floor — was priced
// wrong twice in opposite directions before: the widest perimeter was charged
// for the full height, and every setback terrace (a horizontal surface with a
// roof U-value) was missing entirely.

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

export type EnvelopeSource = "polygon" | "bbox";

export interface EnvelopeQuantities {
  source: EnvelopeSource;
  /** Plan area of the lowest above-grade storey, m². Ground-contact area. */
  planAreaSqm: number;
  /**
   * Exterior wall length including courtyard rings, m.
   * On a stepped stack this is the lowest above-grade storey's perimeter —
   * `grossWallAreaSqm` is the summed quantity, not this × height.
   */
  wallLengthM: number;
  /** Σ over above-grade storeys of perimeter × storey height, m². */
  grossWallAreaSqm: number;
  /** Top plate + every exposed setback terrace, m². */
  roofAreaSqm: number;
  /** Σ over above-grade storeys of plate area × storey height, m³. */
  volumeM3: number;
  /** Σ over every storey of its own plate area — used when totArea is unavailable. */
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

interface PlateMetrics {
  areaSqm: number;
  perimeterM: number;
}

/** Outer ring minus holes for area; outer plus holes for wetted perimeter. */
function metricsOf(rings: [number, number][][]): PlateMetrics {
  const [outer, ...holes] = rings;
  const holeArea = holes.reduce((sum, hole) => sum + ringAreaAbs(hole), 0);
  const holeLength = holes.reduce((sum, hole) => sum + ringLength(hole), 0);
  return {
    areaSqm: Math.max(0, ringAreaAbs(outer) - holeArea),
    perimeterM: ringLength(outer) + holeLength,
  };
}

/**
 * Envelope surfaces follow the CAD/VWorld ring when present, and each storey's
 * own plate when the reconstruction resolved one.
 *
 * Courtyard holes shrink plan area and add to wall length. A storey with no
 * plate of its own falls back to the building footprint, so a prism produces
 * byte-identical numbers to the pre-P2-30 formula.
 */
export function envelopeQuantities(recipe: BuildingRecipe): EnvelopeQuantities {
  const height = recipe.totalHeight;

  // The building-level fallback plate, in the same shape a FloorSpec carries.
  let source: EnvelopeSource = "bbox";
  let basePlate: [number, number][][];
  if (isUsablePolygon(recipe.footprintPolygon)) {
    basePlate = recipe.footprintPolygon;
    source = "polygon";
  } else {
    const hw = recipe.footprintWidth / 2;
    const hd = recipe.footprintDepth / 2;
    basePlate = [
      [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ],
    ];
  }
  const baseMetrics = metricsOf(basePlate);

  const plateOf = (floor: FloorSpec): PlateMetrics =>
    isUsablePolygon(floor.plate) ? metricsOf(floor.plate) : baseMetrics;

  const above = recipe.floors.filter((f) => f.type !== "below");

  // Gross floor area counts every storey the register lists, basements
  // included — it is the intensity denominator, not an envelope quantity.
  const derivedFloorAreaSqm = recipe.floors.reduce(
    (sum, floor) => sum + plateOf(floor).areaSqm,
    0,
  );

  // Basements are recorded but not extruded: their envelope is ground-coupled,
  // not the above-grade wall/roof this function prices.
  let grossWallAreaSqm = 0;
  let volumeM3 = 0;
  for (const floor of above) {
    const { areaSqm, perimeterM } = plateOf(floor);
    grossWallAreaSqm += perimeterM * floor.height;
    volumeM3 += areaSqm * floor.height;
  }

  // Roof = the top plate, plus every terrace a setback exposes. A storey that
  // is WIDER than the one below overhangs; that contributes no roof, so the
  // difference is clamped at zero rather than subtracted.
  let roofAreaSqm = 0;
  if (above.length > 0) {
    roofAreaSqm += plateOf(above[above.length - 1]).areaSqm;
    for (let i = 0; i < above.length - 1; i++) {
      const here = plateOf(above[i]).areaSqm;
      const next = plateOf(above[i + 1]).areaSqm;
      roofAreaSqm += Math.max(0, here - next);
    }
  }

  const groundPlate = above.length > 0 ? plateOf(above[0]) : baseMetrics;

  // A stack with no above-grade storeys still reports the base extrusion, so
  // callers that price a bare footprint keep working.
  if (above.length === 0) {
    grossWallAreaSqm = baseMetrics.perimeterM * height;
    volumeM3 = baseMetrics.areaSqm * height;
    roofAreaSqm = baseMetrics.areaSqm;
  }

  const official = recipe.officialFloorAreaSqm;
  const intensityFloorAreaSqm =
    official != null && official > 0 ? official : derivedFloorAreaSqm;

  return {
    source,
    planAreaSqm: groundPlate.areaSqm,
    wallLengthM: groundPlate.perimeterM,
    grossWallAreaSqm,
    roofAreaSqm,
    volumeM3,
    derivedFloorAreaSqm,
    intensityFloorAreaSqm,
  };
}
