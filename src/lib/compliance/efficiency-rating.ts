// src/lib/compliance/efficiency-rating.ts
// Korean Building Energy Efficiency Rating (건축물 에너지효율등급)
// Standard: 건축물 에너지효율등급 인증 및 제로에너지건축물 인증 기준 (MOTIE/KEMCO)

import {
  calculatePrimaryEnergy,
  type PrimaryEnergyResult,
} from "@/lib/energy/primary-energy";

export type EfficiencyGrade =
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

export interface EfficiencyRatingResult {
  primaryEnergyPerArea: number; // kWh/m²·year
  grade: EfficiencyGrade;
  gradeLabel: string; // Korean label
  breakdown: PrimaryEnergyResult;
}

/**
 * Upper-bound thresholds (kWh/m²·year primary energy).
 * Grade is assigned when primaryEnergyPerArea < threshold.
 * Grade 7 has no upper bound.
 */
const RESIDENTIAL_THRESHOLDS: Record<Exclude<EfficiencyGrade, "7">, number> = {
  "1+++": 60,
  "1++": 90,
  "1+": 120,
  "1": 150,
  // 주거용 1차에너지 기준: grades 2–6 corrected to the official
  // 190/230/270/320/370 bands (previous values were non-residential bands).
  "2": 190,
  "3": 230,
  "4": 270,
  "5": 320,
  "6": 370,
};

const NON_RESIDENTIAL_THRESHOLDS: Record<
  Exclude<EfficiencyGrade, "7">,
  number
> = {
  "1+++": 80,
  "1++": 140,
  "1+": 200,
  "1": 260,
  "2": 320,
  "3": 380,
  "4": 450, // official band 380–450 (was 440)
  "5": 520,
  "6": 610,
};

const GRADE_ORDER: EfficiencyGrade[] = [
  "1+++",
  "1++",
  "1+",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
];

const GRADE_LABELS: Record<EfficiencyGrade, string> = {
  "1+++": "1+++등급 (제로에너지수준)",
  "1++": "1++등급",
  "1+": "1+등급",
  "1": "1등급",
  "2": "2등급",
  "3": "3등급",
  "4": "4등급",
  "5": "5등급",
  "6": "6등급",
  "7": "7등급",
};

function resolveGrade(
  primaryEnergyPerArea: number,
  thresholds: Record<Exclude<EfficiencyGrade, "7">, number>
): EfficiencyGrade {
  for (const grade of GRADE_ORDER) {
    if (grade === "7") return "7";
    const threshold = thresholds[grade as Exclude<EfficiencyGrade, "7">];
    if (primaryEnergyPerArea < threshold) return grade;
  }
  return "7";
}

/**
 * Calculate the official Korean energy efficiency rating using primary energy.
 *
 * @param delivered   Annual delivered energy by fuel type (kWh/year)
 * @param totalArea   Gross conditioned floor area (m²)
 * @param buildingType  'residential' or 'non-residential' — determines threshold table
 */
export function calculateEfficiencyRating(
  delivered: {
    electric: number;
    gas: number;
    districtHeating?: number;
    districtCooling?: number;
    renewable?: number;
  },
  totalArea: number,
  buildingType: "residential" | "non-residential"
): EfficiencyRatingResult {
  const breakdown = calculatePrimaryEnergy(delivered, totalArea);
  const { primaryEnergyPerArea } = breakdown;

  const thresholds =
    buildingType === "residential"
      ? RESIDENTIAL_THRESHOLDS
      : NON_RESIDENTIAL_THRESHOLDS;

  const grade = resolveGrade(primaryEnergyPerArea, thresholds);

  return {
    primaryEnergyPerArea,
    grade,
    gradeLabel: GRADE_LABELS[grade],
    breakdown,
  };
}

export {
  RESIDENTIAL_THRESHOLDS,
  NON_RESIDENTIAL_THRESHOLDS,
  GRADE_LABELS,
};
