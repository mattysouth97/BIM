// src/lib/energy/co2-emissions.ts
// CO2 emission calculation using Korean national grid emission factor.

import type { AnnualDemand } from "./annual-demand";

/** Korean grid emission factor (tCO2/MWh, 2023 national average) */
export const KOREAN_GRID_EMISSION_FACTOR = 0.4594;

export interface CO2Result {
  /** Total annual CO2 emissions (tCO2/yr) */
  totalCO2: number;
  /** CO2 emissions per floor area (kgCO2/m²·yr) */
  co2PerSqm: number;
}

/**
 * Calculate annual CO2 emissions from energy demand.
 * CO2 = totalDemand(kWh) × emissionFactor(tCO2/MWh) / 1000 (kWh→MWh)
 */
export function calculateCO2(
  annualDemand: AnnualDemand,
  totalFloorArea: number
): CO2Result {
  // Convert kWh to MWh, multiply by emission factor
  const totalCO2 =
    (annualDemand.totalDemand / 1000) * KOREAN_GRID_EMISSION_FACTOR;

  return {
    totalCO2,
    co2PerSqm:
      totalFloorArea > 0 ? (totalCO2 * 1000) / totalFloorArea : 0, // tCO2 → kgCO2
  };
}
