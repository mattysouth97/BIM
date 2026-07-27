// src/lib/energy/co2-emissions.ts
// CO2 emissions with PER-FUEL factors: heating rides its actual fuel
// (gas/oil/district heat/electricity), cooling is always electric.
// Applying the grid factor to gas overstates gas CO2 by ~2.3×.

import type { AnnualDemand } from "./annual-demand";

/** Korean grid emission factor (tCO2/MWh, 2021–2023 공표 national average) */
export const KOREAN_GRID_EMISSION_FACTOR = 0.4594;

/** Emission factors by delivered-energy carrier (tCO2/MWh). */
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
}

/**
 * Calculate annual CO2 emissions from site energy by fuel.
 * heatingFuel defaults to gas (the dominant Korean heating fuel) so legacy
 * two-argument call sites remain valid but no longer misprice gas heat.
 */
export function calculateCO2(
  annualDemand: AnnualDemand,
  totalFloorArea: number,
  heatingFuel: string = "gas"
): CO2Result {
  const heatingFactor =
    FUEL_EMISSION_FACTORS[heatingFuel] ?? KOREAN_GRID_EMISSION_FACTOR;
  const totalCO2 =
    (annualDemand.heatingDemand / 1000) * heatingFactor +
    (annualDemand.coolingDemand / 1000) * KOREAN_GRID_EMISSION_FACTOR;

  return {
    totalCO2,
    co2PerSqm:
      totalFloorArea > 0 ? (totalCO2 * 1000) / totalFloorArea : 0, // tCO2 → kgCO2
  };
}
