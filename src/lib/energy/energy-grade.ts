// src/lib/energy/energy-grade.ts
// ⚠️ INTERNAL COLOR SCALE — NOT the official rating (P1-05).
//
// `getEnergyGrade` buckets DELIVERED kWh/m²·yr on a legacy scale and exists
// only as a continuous color ramp for the 3D heatmap
// (src/lib/layers/energy-heatmap-builder.ts). The user-facing grade is the
// official MOTIE/KEMCO PRIMARY-energy rating from
// src/lib/compliance/efficiency-rating.ts (calculateEfficiencyRating),
// surfaced via useEnergyMetrics().grade. Do NOT render getEnergyGrade output
// in any UI component, report, or export.

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

/** Korean label (e.g. "1등급") → EnergyGrade bucket. Mirrors GRADE_LABELS in compliance/efficiency-rating.ts. */
const KOREAN_LABEL_TO_GRADE: Record<string, EnergyGrade> = {
  "1+++등급": "1+++",
  "1++등급": "1++",
  "1+등급": "1+",
  "1등급": "1",
  "2등급": "2",
  "3등급": "3",
  "4등급": "4",
  "5등급": "5",
  "6등급": "6",
  "7등급": "7",
};

/**
 * Normalize either an EnergyGrade enum value or its original Korean label
 * (e.g. "1등급", or the fuller "1+++등급 (제로에너지수준)" form used in
 * compliance/efficiency-rating.ts GRADE_LABELS) to the same EnergyGrade
 * bucket. Returns null when the input matches neither form — callers should
 * treat that as a data-quality gap, not silently default a grade.
 */
export function normalizeEnergyGrade(input: string): EnergyGrade | null {
  const trimmed = input.trim();
  if ((GRADE_ORDER as string[]).includes(trimmed)) {
    return trimmed as EnergyGrade;
  }
  if (trimmed in KOREAN_LABEL_TO_GRADE) {
    return KOREAN_LABEL_TO_GRADE[trimmed];
  }
  // Fall back to matching the leading "N등급" token, tolerating trailing
  // annotations like " (제로에너지수준)" seen in GRADE_LABELS.
  const match = trimmed.match(/^(1\+\+\+|1\+\+|1\+|[1-7])등급/);
  if (match) {
    return KOREAN_LABEL_TO_GRADE[`${match[1]}등급`] ?? null;
  }
  return null;
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
