// src/lib/retrofit/measure-interactions.ts
// P1-01 — portfolio-level interaction damping for measures that act on the
// same heating demand. Pure functions, no React.
//
// Two damping paths exist:
//   1. The hook (use-retrofit-scenario.ts) dampens at GENERATION time by
//      passing the post-envelope residual heating demand to the HVAC
//      generator — that path is exact.
//   2. This module is the documented PAIRWISE FALLBACK for measures assembled
//      outside the hook (assembleRetrofitReport callers, tests): for each
//      unordered pair (i, j) that both act on heating demand, subtract
//      INTERACTION_COEFFICIENTS[pairKey] × min(s_i, s_j) from the LATER
//      measure in physical order (envelope → hvac).
//
// IMPORTANT: per-measure fields keep their generated semantics ("saving of
// this measure applied to the demand it was generated against"); only the
// PORTFOLIO aggregates returned here are damped. Never present these totals
// as per-measure savings.

import type { RetrofitMeasure } from "./retrofit-types";

/** Which heating-demand class a measure belongs to for pairwise damping. */
function heatingClass(m: RetrofitMeasure): "envelope" | "hvac-hrv" | "hvac-boiler-upgrade" | null {
  if (m.id.startsWith("envelope-")) return "envelope";
  if (m.id === "hvac-hrv") return "hvac-hrv";
  if (m.id === "hvac-boiler-upgrade") return "hvac-boiler-upgrade";
  return null;
}

/**
 * Pairwise overlap coefficients, keyed "envelope|<hvac-id>", applied to
 * min(s_envelope, s_hvac). Derivations from the sequential-demand model
 * (HVAC saving recomputed against post-envelope residual demand):
 *
 * - envelope|hvac-hrv = 0.15 — HRV saves hrvSavingRate (0.15,
 *   hvac-retrofits.ts) of heating demand, so removing S_env of demand
 *   removes 0.15 × S_env of HRV saving. Using min() caps the deduction at
 *   the smaller saving (conservative when S_env > S_hrv).
 *
 * - envelope|hvac-boiler-upgrade = 0.2 — boiler saving fraction of demand is
 *   f = 1 − η/0.95; for the representative pre-retrofit efficiency η = 0.76
 *   (midpoint of the 0.6–0.85 trigger band), f = 0.2. The hook path uses the
 *   exact per-building value; this constant is the documented fallback.
 */
export const INTERACTION_COEFFICIENTS: Record<string, number> = {
  "envelope|hvac-hrv": 0.15,
  "envelope|hvac-boiler-upgrade": 0.2,
};

export interface DampedPortfolioTotals {
  /** kWh/yr — damped portfolio energy saving (≤ naive sum, always). */
  totalAnnualSaving: number;
  /** KRW/yr — damped portfolio cost saving. */
  totalAnnualCostSaving: number;
  /** tCO2/yr — damped portfolio CO2 reduction. */
  totalCO2Reduction: number;
  /**
   * Per-measure damped values (energy/cost/co2), keyed by measure id.
   * Deductions are attributed to the LATER measure in physical order
   * (envelope → hvac); envelope measures are never damped here.
   */
  dampedByMeasureId: Map<string, { energy: number; cost: number; co2: number }>;
}

/**
 * Damp portfolio savings for overlapping heating-demand measures.
 * Identity (naive sums) when no interacting pair exists.
 */
export function dampPortfolioSavings(measures: RetrofitMeasure[]): DampedPortfolioTotals {
  const dampedByMeasureId = new Map<string, { energy: number; cost: number; co2: number }>();
  for (const m of measures) {
    dampedByMeasureId.set(m.id, {
      energy: m.annualEnergySaving,
      cost: m.annualCostSaving,
      co2: m.co2Reduction,
    });
  }

  const envelopeMeasures = measures.filter((m) => heatingClass(m) === "envelope");
  const hvacHeating = measures.filter((m) => {
    const c = heatingClass(m);
    return c === "hvac-hrv" || c === "hvac-boiler-upgrade";
  });

  // Attribute each pair's deduction to the HVAC (physically later) measure.
  for (const hvac of hvacHeating) {
    const coeff = INTERACTION_COEFFICIENTS[`envelope|${hvac.id}`];
    if (coeff === undefined) continue;
    let deduction = 0;
    for (const env of envelopeMeasures) {
      deduction += coeff * Math.min(env.annualEnergySaving, hvac.annualEnergySaving);
    }
    const entry = dampedByMeasureId.get(hvac.id)!;
    const dampedEnergy = Math.max(0, entry.energy - deduction);
    // Cost/CO2 scale with the same fraction — the overlap is heating energy
    // priced/emitting identically to the measure's own saving stream.
    const ratio = entry.energy > 0 ? dampedEnergy / entry.energy : 0;
    dampedByMeasureId.set(hvac.id, {
      energy: dampedEnergy,
      cost: entry.cost * ratio,
      co2: entry.co2 * ratio,
    });
  }

  let totalAnnualSaving = 0;
  let totalAnnualCostSaving = 0;
  let totalCO2Reduction = 0;
  for (const entry of dampedByMeasureId.values()) {
    totalAnnualSaving += entry.energy;
    totalAnnualCostSaving += entry.cost;
    totalCO2Reduction += entry.co2;
  }

  return { totalAnnualSaving, totalAnnualCostSaving, totalCO2Reduction, dampedByMeasureId };
}
