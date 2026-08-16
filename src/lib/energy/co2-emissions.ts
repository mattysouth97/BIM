// src/lib/energy/co2-emissions.ts
// CO2 emissions with PER-FUEL factors (P2-02): heating rides its actual fuel
// (gas/oil/district heat/electricity), cooling is always electric.
// Prefer `demand.fuelDemand` when present; otherwise split heating vs cooling
// via the optional heatingFuel argument (defaults to gas so two-argument
// callers no longer misprice gas at the grid factor).

import type { AnnualDemand } from "./annual-demand";
import { CO2_FACTORS } from "./co2-factors";

/**
 * Korean grid emission factor (tCO2/MWh, 2023 national average).
 * Alias of the canonical factor — no duplicate literal (P2-02).
 */
export const KOREAN_GRID_EMISSION_FACTOR = CO2_FACTORS.electricity;

/**
 * Emission factors by delivered-energy carrier (tCO2/MWh).
 * Carrier keys match `materials.hvac.heating.fuelType`.
 */
export const FUEL_EMISSION_FACTORS: Record<string, number> = {
  electric: KOREAN_GRID_EMISSION_FACTOR,
  "heat-pump": KOREAN_GRID_EMISSION_FACTOR, // electricity-driven
  gas: 0.202,             // city gas ≈ 56.1 tCO2/TJ
  oil: 0.279,             // kerosene/light oil
  "district-heat": 0.13,  // 한국지역난방공사 average
};

export interface CO2Result {
  /** Total annual CO2 emissions (tCO2/yr) */
  totalCO2: number;
  /** CO2 emissions per floor area (kgCO2/m²·yr) */
  co2PerSqm: number;
  /** P2-02 — CO2 from the electric portion (tCO2/yr). */
  electricCO2: number;
  /** P2-02 — CO2 from the fossil/district portion (tCO2/yr). */
  fossilCO2: number;
  /**
   * P2-02 — set only when the per-fuel split was unavailable and the result
   * fell back to the all-electric assumption. Never silently applied.
   */
  assumption?: string;
}

/**
 * Calculate annual CO2 emissions from site energy by fuel.
 *
 * Priority:
 *  1. `demand.fuelDemand` (P2-02) — each fuel at its CO2_FACTORS rate.
 *  2. Heating/cooling split via explicit `heatingFuel` (accuracy wave).
 *  3. Two-argument call with no fuelDemand: all-electric grid fallback,
 *     flagged on `assumption` (P2-02 s4).
 */
export function calculateCO2(
  annualDemand: AnnualDemand,
  totalFloorArea: number,
  heatingFuel?: string
): CO2Result {
  const fuel = annualDemand.fuelDemand;

  let electricCO2: number;
  let fossilCO2: number;
  let assumption: string | undefined;

  if (fuel) {
    electricCO2 = (fuel.electricKwh / 1000) * CO2_FACTORS.electricity;
    fossilCO2 = fuel.fossilFuel
      ? (fuel.fossilKwh / 1000) * CO2_FACTORS[fuel.fossilFuel]
      : 0;
  } else if (heatingFuel !== undefined) {
    // Accuracy-wave path: explicit heating fuel, cooling always electric.
    const heatingFactor =
      FUEL_EMISSION_FACTORS[heatingFuel] ?? KOREAN_GRID_EMISSION_FACTOR;
    const heatingIsElectric =
      heatingFuel === "electric" || heatingFuel === "heat-pump";
    const heatingCO2 = (annualDemand.heatingDemand / 1000) * heatingFactor;
    const coolingCO2 =
      (annualDemand.coolingDemand / 1000) * KOREAN_GRID_EMISSION_FACTOR;
    electricCO2 = coolingCO2 + (heatingIsElectric ? heatingCO2 : 0);
    fossilCO2 = heatingIsElectric ? 0 : heatingCO2;
  } else {
    // P2-02 fallback: no fuelDemand and no heatingFuel — flag the assumption.
    electricCO2 = (annualDemand.totalDemand / 1000) * CO2_FACTORS.electricity;
    fossilCO2 = 0;
    if (annualDemand.totalDemand > 0) {
      assumption = "all-electric (no fuel split provided)";
    }
  }

  const totalCO2 = electricCO2 + fossilCO2;

  return {
    totalCO2,
    co2PerSqm: totalFloorArea > 0 ? (totalCO2 * 1000) / totalFloorArea : 0, // tCO2 → kgCO2
    electricCO2,
    fossilCO2,
    ...(assumption ? { assumption } : {}),
  };
}
