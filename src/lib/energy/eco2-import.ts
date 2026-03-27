// src/lib/energy/eco2-import.ts
// Parse ECO2 result files and extract energy grade/demand/CO2.

import type { EnergyGrade } from "./energy-grade";

const VALID_GRADES: Set<string> = new Set([
  "1+++", "1++", "1+", "1", "2", "3", "4", "5", "6", "7",
]);

export interface ECO2ImportResult {
  grade: EnergyGrade;
  demand: number;
  co2: number;
}

/**
 * Parse an ECO2 result JSON file and extract key metrics.
 * Supports both our own export format and a generic ECO2 result format.
 * Returns null if the file cannot be parsed.
 */
export function parseECO2Result(content: string): ECO2ImportResult | null {
  try {
    const data = JSON.parse(content);

    // Try our own export format first
    if (data?.calculated) {
      const calc = data.calculated;
      const grade = String(calc.energyGrade ?? "");
      const demand = Number(calc.demandPerSqm_kWh);
      const co2 = Number(calc.co2PerSqm_kgCO2);

      if (VALID_GRADES.has(grade) && isFinite(demand) && isFinite(co2)) {
        return { grade: grade as EnergyGrade, demand, co2 };
      }
    }

    // Try generic ECO2 result format
    // Common fields: energyGrade, energyDemand, co2Emissions
    const grade =
      String(data?.energyGrade ?? data?.grade ?? data?.result?.grade ?? "");
    const demand = Number(
      data?.energyDemand ??
        data?.demand ??
        data?.result?.demand ??
        data?.demandPerSqm ??
        0
    );
    const co2 = Number(
      data?.co2Emissions ??
        data?.co2 ??
        data?.result?.co2 ??
        data?.co2PerSqm ??
        0
    );

    if (VALID_GRADES.has(grade) && isFinite(demand) && isFinite(co2)) {
      return { grade: grade as EnergyGrade, demand, co2 };
    }

    return null;
  } catch {
    return null;
  }
}
