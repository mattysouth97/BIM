// src/components/generative/energy-delta.ts
//
// Design-to-design energy comparison for the studio's delta strip.
//
// A generated design has no measured history and no ledger twin, so the only
// honest baseline for "did this edit help?" is the design it was edited FROM.
// Both sides are run through the SAME engine `useEnergyMetrics` uses
// (envelope quantities → heat loss → annual demand), so the strip is a
// like-for-like comparison of two deterministic models, never a stored number
// compared against a fresh one.
//
// Pure and React-free on purpose: the panel renders it, the tests drive it.

import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getClimateData } from "@/lib/energy/climate-data";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import type { GeneratedBuildingSeed } from "@/lib/generative/energy/seed-from-design";

/** One design's demand-side numbers, at the granularity the strip shows. */
export interface DesignEnergySummary {
  /** The intensity denominator the engine itself chose (m²). */
  floorAreaSqm: number;
  /** Design heat loss through the envelope (W). */
  heatLossW: number;
  heatingDemandKwh: number;
  coolingDemandKwh: number;
  totalDemandKwh: number;
  /** Energy use intensity, kWh/m²·yr — `demand.demandPerSqm`. */
  euiKwhPerSqm: number;
}

/**
 * Run one seeded design through the energy engine.
 *
 * Returns null when the design has no positive floor area — the same refusal
 * `useEnergyMetrics` makes, because an intensity without a denominator is a
 * fabricated number.
 *
 * @param sigunguCd 시군구 code for regional climate. Omitted ⇒ the engine's own
 *   Seoul default, which the panel discloses.
 */
export function designEnergySummary(
  seed: Pick<GeneratedBuildingSeed, "materials" | "recipe">,
  sigunguCd?: string,
): DesignEnergySummary | null {
  const floorAreaSqm = envelopeQuantities(seed.recipe).intensityFloorAreaSqm;
  if (!(floorAreaSqm > 0)) return null;

  const climate = getClimateData(sigunguCd);
  const heatLoss = calculateHeatLoss(seed.materials, seed.recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, seed.materials, seed.recipe, climate);

  return {
    floorAreaSqm,
    heatLossW: heatLoss.totalHeatLoss,
    heatingDemandKwh: demand.heatingDemand,
    coolingDemandKwh: demand.coolingDemand,
    totalDemandKwh: demand.totalDemand,
    euiKwhPerSqm: demand.demandPerSqm,
  };
}

/** Signed current − previous differences, plus both sides for context. */
export interface DesignEnergyDelta {
  previous: DesignEnergySummary;
  current: DesignEnergySummary;
  /** current − previous. Negative = the successor uses less. */
  totalDemandKwh: number;
  euiKwhPerSqm: number;
  heatingDemandKwh: number;
  coolingDemandKwh: number;
  floorAreaSqm: number;
  /**
   * EUI change as a fraction of the predecessor's EUI. null when the
   * predecessor's EUI is zero — a percentage against nothing is meaningless.
   */
  euiFraction: number | null;
}

/**
 * Compare a successor design against the design it came from.
 *
 * Returns null when either side cannot be modelled: half a comparison is worse
 * than none, because the reader would take the surviving half for a delta.
 */
export function designEnergyDelta(
  previous: Pick<GeneratedBuildingSeed, "materials" | "recipe"> | null,
  current: Pick<GeneratedBuildingSeed, "materials" | "recipe"> | null,
  sigunguCd?: string,
): DesignEnergyDelta | null {
  if (!previous || !current) return null;
  const before = designEnergySummary(previous, sigunguCd);
  const after = designEnergySummary(current, sigunguCd);
  if (!before || !after) return null;

  return {
    previous: before,
    current: after,
    totalDemandKwh: after.totalDemandKwh - before.totalDemandKwh,
    euiKwhPerSqm: after.euiKwhPerSqm - before.euiKwhPerSqm,
    heatingDemandKwh: after.heatingDemandKwh - before.heatingDemandKwh,
    coolingDemandKwh: after.coolingDemandKwh - before.coolingDemandKwh,
    floorAreaSqm: after.floorAreaSqm - before.floorAreaSqm,
    euiFraction:
      before.euiKwhPerSqm > 0
        ? (after.euiKwhPerSqm - before.euiKwhPerSqm) / before.euiKwhPerSqm
        : null,
  };
}

/** `+12.3` / `−4.0` — sign always shown, so a delta never reads as a level. */
export function formatSignedDelta(value: number, decimals = 1): string {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return `±0${decimals > 0 ? `.${"0".repeat(decimals)}` : ""}`;
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toFixed(decimals)}`;
}
