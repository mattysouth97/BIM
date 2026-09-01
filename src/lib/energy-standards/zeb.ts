/**
 * 제로에너지건축물(ZEB) 인증 등급 — 국토교통부고시 제2024-893호 (시행 2025-01-01).
 *
 * Verified against zeb.energy.or.kr (fetched 2026-08-31); traceability rows
 * STD-ZEB-RULE / STD-ZEB-GRADES in
 * docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md. The 2025 scheme absorbed
 * the former 건축물 에너지효율등급 인증 and added the ZEB플러스 tier.
 *
 * A grade is earned by the BETTER of two criteria:
 *   1. 에너지자립률 = 1차에너지생산량 / 1차에너지소요량 × 100 (%)
 *   2. 1차에너지소요량 잔여치 = 소요량 − 신재생 상쇄 (kWh/m²·yr),
 *      with separate 주거/비주거 thresholds.
 *
 * This module classifies a computed result against the published table. It
 * never claims certification — the app's screening numbers are not ECO2
 * outputs, and the UI must present the grade as 참고 등급 (design-stage
 * reference), which is the caller's responsibility.
 */

export type ZebGrade = "ZEB_PLUS" | "ZEB_1" | "ZEB_2" | "ZEB_3" | "ZEB_4" | "ZEB_5" | "NONE";

export const ZEB_GRADE_LABEL_KO: Record<ZebGrade, string> = {
  ZEB_PLUS: "ZEB 플러스",
  ZEB_1: "ZEB 1등급",
  ZEB_2: "ZEB 2등급",
  ZEB_3: "ZEB 3등급",
  ZEB_4: "ZEB 4등급",
  ZEB_5: "ZEB 5등급",
  NONE: "등급 외",
};

type GradeRow = Readonly<{
  grade: Exclude<ZebGrade, "NONE">;
  /** Minimum 에너지자립률 (%) — criterion 1. */
  minSelfSufficiencyPct: number;
  /** Exclusive upper bound on residual primary energy, 주거 (kWh/m²·yr) — criterion 2. */
  maxResidualResidential: number;
  /** Exclusive upper bound on residual primary energy, 비주거 (kWh/m²·yr) — criterion 2. */
  maxResidualNonResidential: number;
}>;

/** The published table, best grade first. Values verified 2026-08-31. */
export const ZEB_GRADE_TABLE: readonly GradeRow[] = Object.freeze([
  { grade: "ZEB_PLUS", minSelfSufficiencyPct: 120, maxResidualResidential: -10, maxResidualNonResidential: -70 },
  { grade: "ZEB_1", minSelfSufficiencyPct: 100, maxResidualResidential: 10, maxResidualNonResidential: -30 },
  { grade: "ZEB_2", minSelfSufficiencyPct: 80, maxResidualResidential: 30, maxResidualNonResidential: 10 },
  { grade: "ZEB_3", minSelfSufficiencyPct: 60, maxResidualResidential: 50, maxResidualNonResidential: 50 },
  { grade: "ZEB_4", minSelfSufficiencyPct: 40, maxResidualResidential: 70, maxResidualNonResidential: 90 },
  { grade: "ZEB_5", minSelfSufficiencyPct: 20, maxResidualResidential: 90, maxResidualNonResidential: 130 },
]);

export type ZebInput = Readonly<{
  /** 1차에너지소요량 (kWh/m²·yr), before renewable offset. Must be ≥ 0. */
  primaryEnergyDemandKwhPerM2: number;
  /** 1차에너지생산량 (kWh/m²·yr) from on-site renewables. ≥ 0. */
  primaryEnergyProductionKwhPerM2: number;
  residential: boolean;
}>;

export type ZebResult = Readonly<{
  grade: ZebGrade;
  /** 에너지자립률 (%). Null when demand is zero (undefined ratio). */
  selfSufficiencyPct: number | null;
  /** 소요량 − 생산량 (kWh/m²·yr); negative = net producer. */
  residualPrimaryKwhPerM2: number;
  /** Which criterion earned the grade — for the WHY explanation. */
  earnedBy: "self_sufficiency" | "residual_primary" | "both" | null;
  standard: "국토교통부고시 제2024-893호 (시행 2025-01-01)";
}>;

/** Classify a screening result against the ZEB grade table. */
export function zebGradeOf(input: ZebInput): ZebResult {
  const demand = input.primaryEnergyDemandKwhPerM2;
  const production = input.primaryEnergyProductionKwhPerM2;
  const residual = demand - production;
  const selfSufficiencyPct = demand > 0 ? (production / demand) * 100 : null;

  for (const row of ZEB_GRADE_TABLE) {
    const bySelf = selfSufficiencyPct !== null && selfSufficiencyPct >= row.minSelfSufficiencyPct;
    const cap = input.residential ? row.maxResidualResidential : row.maxResidualNonResidential;
    const byResidual = residual < cap;
    if (bySelf || byResidual) {
      return {
        grade: row.grade,
        selfSufficiencyPct,
        residualPrimaryKwhPerM2: residual,
        earnedBy: bySelf && byResidual ? "both" : bySelf ? "self_sufficiency" : "residual_primary",
        standard: "국토교통부고시 제2024-893호 (시행 2025-01-01)",
      };
    }
  }
  return {
    grade: "NONE",
    selfSufficiencyPct,
    residualPrimaryKwhPerM2: residual,
    earnedBy: null,
    standard: "국토교통부고시 제2024-893호 (시행 2025-01-01)",
  };
}
