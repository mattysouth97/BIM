// src/lib/energy/energy-grade.ts
// Korean building energy efficiency rating (건축물 에너지효율등급).
// Scale: 1+++ (best) to 7 (worst), based on kWh/m²·yr.
//
// Two grading modes:
//   - Delivered energy grade (getEnergyGrade): legacy, uses delivered kWh/m²·yr
//   - Primary energy grade (primaryEnergyGrade in EnergyGradeResult): uses
//     official primary energy per 건축물 에너지효율등급 인증 기준 (MOTIE/KEMCO)

import type { EfficiencyGrade } from "@/lib/compliance/efficiency-rating";

export type EnergyGrade =
  | "1+++"
  | "1++"
  | "1+"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7";

/**
 * Combined grading result carrying both the legacy delivered-energy grade and,
 * when primary energy data is available, the official primary-energy grade.
 */
export interface EnergyGradeResult {
  /** Grade based on delivered energy (kWh/m²·yr) — legacy calculation. */
  deliveredEnergyGrade: EnergyGrade;
  /**
   * Official primary-energy grade per MOTIE/KEMCO standard.
   * Undefined when primary energy has not been calculated yet.
   */
  primaryEnergyGrade?: EfficiencyGrade;
}

/** Maximum kWh/m²·yr for each grade (upper bound, exclusive) */
export const GRADE_THRESHOLDS: Record<Exclude<EnergyGrade, "7">, number> = {
  "1+++": 60,
  "1++": 90,
  "1+": 120,
  "1": 150,
  "2": 190,
  "3": 230,
  "4": 270,
  "5": 320,
  "6": 370,
};

const GRADE_ORDER: EnergyGrade[] = [
  "1+++", "1++", "1+", "1", "2", "3", "4", "5", "6", "7",
];

/**
 * Determine Korean energy efficiency grade from annual energy demand.
 */
export function getEnergyGrade(demandPerSqm: number): EnergyGrade {
  for (const grade of GRADE_ORDER) {
    if (grade === "7") return "7";
    const threshold = GRADE_THRESHOLDS[grade as Exclude<EnergyGrade, "7">];
    if (demandPerSqm < threshold) return grade;
  }
  return "7";
}

/** Grade label colors — green (efficient) to red (inefficient) */
const GRADE_COLORS: Record<EnergyGrade, string> = {
  "1+++": "#006400", // dark green
  "1++": "#228B22",  // forest green
  "1+": "#32CD32",   // lime green
  "1": "#7CFC00",    // lawn green
  "2": "#ADFF2F",    // green yellow
  "3": "#FFD700",    // gold
  "4": "#FFA500",    // orange
  "5": "#FF6347",    // tomato
  "6": "#FF4500",    // orange red
  "7": "#DC143C",    // crimson
};

/**
 * Get a display color for a given energy grade.
 */
export function getGradeColor(grade: EnergyGrade): string {
  return GRADE_COLORS[grade] ?? "#999999";
}

/**
 * Return a combined grading result with delivered-energy grade and, optionally,
 * the official primary-energy grade when primary energy data is provided.
 *
 * @param demandPerSqm      Delivered energy intensity (kWh/m²·yr)
 * @param primaryEnergyGrade  Pre-computed primary-energy grade from
 *                            calculateEfficiencyRating(), if available
 */
export function getEnergyGradeResult(
  demandPerSqm: number,
  primaryEnergyGrade?: EfficiencyGrade
): EnergyGradeResult {
  return {
    deliveredEnergyGrade: getEnergyGrade(demandPerSqm),
    primaryEnergyGrade,
  };
}
