// src/lib/energy/co2-emissions.ts
// CO2 emission calculation. P2-02: per-fuel factors (gas heating no longer
// charged at the grid-electricity factor).

import type { AnnualDemand } from "./annual-demand";
import { CO2_FACTORS } from "./co2-factors";

/**
 * Korean grid emission factor (tCO2/MWh, 2023 national average).
 * Kept as an alias of the canonical factor — no duplicate literal (P2-02).
 */
export const KOREAN_GRID_EMISSION_FACTOR = CO2_FACTORS.electricity;

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
 * Calculate annual CO2 emissions from energy demand.
 * With a per-fuel split (`demand.fuelDemand`), each fuel is charged its own
 * factor. Without it, falls back to the all-electric grid factor and flags
 * the assumption.
 */
export function calculateCO2(
  annualDemand: AnnualDemand,
  totalFloorArea: number
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
  } else {
    // Fallback: no fuel split provided — charge the whole total at grid rate.
    electricCO2 = (annualDemand.totalDemand / 1000) * CO2_FACTORS.electricity;
    fossilCO2 = 0;
    assumption = "all-electric (no fuel split provided)";
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
