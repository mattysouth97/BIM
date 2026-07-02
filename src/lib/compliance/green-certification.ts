// src/lib/compliance/green-certification.ts
// Korean G-SEED (녹색건축물 인증) automated pre-assessment engine.
// Scores only categories assessable from available building data.
// Non-assessable categories (site visits required) are scored 0 with a note.

import type { EnergyGrade } from "@/lib/energy/energy-grade";
import type {
  CertificationVersion,
  CertificationGrade,
  CategoryScore,
  CertificationResult,
} from "./certification-types";
import {
  LEGACY_CATEGORIES,
  LEGACY_GRADE_THRESHOLDS,
} from "./certification-weights-legacy";
import {
  CURRENT_CATEGORIES,
  CURRENT_GRADE_THRESHOLDS,
} from "./certification-weights-2024";

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface BuildingCertificationInput {
  /** Average wall U-value (W/m²·K) */
  wallUValue: number;
  /** Window U-value (W/m²·K) */
  windowUValue: number;
  /** Roof U-value (W/m²·K) */
  roofUValue: number;
  /** Korean energy efficiency grade */
  energyGrade: EnergyGrade;
  /** Primary energy demand kWh/m²·yr (optional — improves accuracy) */
  primaryEnergyDemand?: number;
  /** Installed renewable energy capacity kW (optional) */
  renewableCapacity?: number;
  /** Window-to-wall ratio 0–1 (optional, used for daylighting proxy) */
  windowToWallRatio?: number;
  /** Korean structure type code e.g. "21" = RC, "22" = SRC (optional) */
  structureCode?: string;
}

// ---------------------------------------------------------------------------
// Korean energy standard U-value benchmarks (W/m²·K)
// Source: 건축물 에너지절약 설계기준 별표1 (Central region)
// ---------------------------------------------------------------------------

const U_BENCHMARK = {
  wall: { excellent: 0.17, good: 0.24, baseline: 0.36 },
  window: { excellent: 1.0, good: 1.5, baseline: 2.1 },
  roof: { excellent: 0.12, good: 0.17, baseline: 0.22 },
} as const;

// ---------------------------------------------------------------------------
// Energy grade numeric index (lower = better)
// ---------------------------------------------------------------------------

const GRADE_INDEX: Record<EnergyGrade, number> = {
  "1+++": 0,
  "1++": 1,
  "1+": 2,
  "1": 3,
  "2": 4,
  "3": 5,
  "4": 6,
  "5": 7,
  "6": 8,
  "7": 9,
};

// ---------------------------------------------------------------------------
// Category scorers
// ---------------------------------------------------------------------------

/**
 * Score Energy & Pollution category (assessable ~70%).
 * Points split: energy grade 50%, U-value compliance 30%, renewables 20%.
 */
function scoreEnergyPollution(
  input: BuildingCertificationInput,
  maxPoints: number
): { earned: number; maxEarnable: number; note: string } {
  const gradeIdx = GRADE_INDEX[input.energyGrade];

  // Energy grade sub-score (50% of category)
  // Grades 1+++ to 1+ → full sub-score; degrades linearly through grade 7
  const gradeSubMax = maxPoints * 0.5;
  const gradeScore = Math.max(0, gradeSubMax * (1 - gradeIdx / 9));

  // U-value compliance sub-score (30% of category)
  const uSubMax = maxPoints * 0.3;
  let uScore = 0;
  const wallPass =
    input.wallUValue <= U_BENCHMARK.wall.excellent
      ? 1
      : input.wallUValue <= U_BENCHMARK.wall.good
      ? 0.6
      : input.wallUValue <= U_BENCHMARK.wall.baseline
      ? 0.3
      : 0;
  const windowPass =
    input.windowUValue <= U_BENCHMARK.window.excellent
      ? 1
      : input.windowUValue <= U_BENCHMARK.window.good
      ? 0.6
      : input.windowUValue <= U_BENCHMARK.window.baseline
      ? 0.3
      : 0;
  const roofPass =
    input.roofUValue <= U_BENCHMARK.roof.excellent
      ? 1
      : input.roofUValue <= U_BENCHMARK.roof.good
      ? 0.6
      : input.roofUValue <= U_BENCHMARK.roof.baseline
      ? 0.3
      : 0;
  uScore = uSubMax * ((wallPass + windowPass + roofPass) / 3);

  // Renewable energy sub-score (20% of category)
  const renewSubMax = maxPoints * 0.2;
  const capacityKw = input.renewableCapacity ?? 0;
  // >30 kW = full, >10 kW = half, else proportional up to 10 kW
  const renewScore =
    capacityKw >= 30
      ? renewSubMax
      : capacityKw >= 10
      ? renewSubMax * 0.5
      : renewSubMax * (capacityKw / 30);

  const total = gradeScore + uScore + renewScore;
  // Maximum earnable = all three sub-scores at 100%
  const maxEarnable = gradeSubMax + uSubMax + renewSubMax;
  const note =
    "Scored from energy grade, U-values vs. Korean code benchmarks, and renewable capacity. " +
    "Occupant behavior, MEP systems, and detailed simulation not included (30% unassessed).";

  return { earned: Math.round(total * 10) / 10, maxEarnable, note };
}

/**
 * Score Indoor Environment category (assessable ~30%).
 * Proxy: window-to-wall ratio as daylighting indicator.
 */
function scoreIndoor(
  input: BuildingCertificationInput,
  maxPoints: number
): { earned: number; maxEarnable: number; note: string } {
  const wwr = input.windowToWallRatio ?? 0.3; // assume average if not given

  // Daylighting proxy (30% of category)
  // 0.3–0.5 WWR is optimal for daylighting without overheating
  const daylightSubMax = maxPoints * 0.3;
  const daylightScore =
    wwr >= 0.3 && wwr <= 0.5
      ? daylightSubMax
      : wwr >= 0.2 && wwr < 0.3
      ? daylightSubMax * 0.6
      : wwr > 0.5 && wwr <= 0.6
      ? daylightSubMax * 0.7
      : daylightSubMax * 0.3;

  const note =
    "Scored from window-to-wall ratio as a daylighting proxy only. " +
    "Acoustics, IAQ, thermal comfort, and ventilation require on-site measurement (70% unassessed).";

  return { earned: Math.round(daylightScore * 10) / 10, maxEarnable: daylightSubMax, note };
}

/**
 * Score Materials & Resources category (assessable ~20%).
 * Proxy: structure type code (RC/SRC structures score higher for recyclability data).
 */
function scoreMaterials(
  input: BuildingCertificationInput,
  maxPoints: number
): { earned: number; maxEarnable: number; note: string } {
  const code = input.structureCode ?? "";

  // RC (21) and SRC (22) have documented material specs → partial score
  const materialsSubMax = maxPoints * 0.2;
  const knownStructure = ["21", "22", "23"].includes(code);
  const materialsScore = knownStructure ? materialsSubMax : materialsSubMax * 0.5;

  const note =
    "Scored from structure type code as a materials documentation proxy. " +
    "Recycled content, regional sourcing, and waste management require site data (80% unassessed).";

  return { earned: Math.round(materialsScore * 10) / 10, maxEarnable: materialsSubMax, note };
}

// ---------------------------------------------------------------------------
// Grade determination
// ---------------------------------------------------------------------------

function determineGrade(
  score: number,
  thresholds: typeof LEGACY_GRADE_THRESHOLDS
): CertificationGrade {
  if (score >= thresholds.excellent) return "excellent";
  if (score >= thresholds.best) return "best";
  if (score >= thresholds.good) return "good";
  if (score >= thresholds.general) return "general";
  return "not-assessable";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DISCLAIMER =
  "Automated pre-assessment only. Scores reflect available data (energy grade, " +
  "U-values, window ratio, structure type). Official G-SEED certification requires " +
  "a site visit and authorized assessor. This result is not a substitute for formal certification.";

/**
 * Score a building against Korean G-SEED green certification criteria.
 * Returns a CertificationResult with per-category breakdowns.
 */
export function scoreGreenCertification(
  building: BuildingCertificationInput,
  version: CertificationVersion
): CertificationResult {
  const categories = version === "pre-2024" ? LEGACY_CATEGORIES : CURRENT_CATEGORIES;
  const thresholds =
    version === "pre-2024" ? LEGACY_GRADE_THRESHOLDS : CURRENT_GRADE_THRESHOLDS;

  // Track maxEarnable per category (only filled for assessable categories)
  const maxEarnableMap: Record<string, number> = {};

  const categoryScores: CategoryScore[] = categories.map((cat) => {
    switch (cat.id) {
      case "energy-pollution": {
        const { earned, maxEarnable, note } = scoreEnergyPollution(building, cat.maxPoints);
        maxEarnableMap[cat.id] = maxEarnable;
        return {
          ...cat,
          earnedPoints: earned,
          assessable: true,
          assessmentNote: note,
        };
      }
      case "indoor": {
        const { earned, maxEarnable, note } = scoreIndoor(building, cat.maxPoints);
        maxEarnableMap[cat.id] = maxEarnable;
        return {
          ...cat,
          earnedPoints: earned,
          assessable: true,
          assessmentNote: note,
        };
      }
      case "materials-resources": {
        const { earned, maxEarnable, note } = scoreMaterials(building, cat.maxPoints);
        maxEarnableMap[cat.id] = maxEarnable;
        return {
          ...cat,
          earnedPoints: earned,
          assessable: true,
          assessmentNote: note,
        };
      }
      case "land-transport":
        return {
          ...cat,
          earnedPoints: 0,
          assessable: false,
          assessmentNote:
            "Requires site location analysis: public transit access, pedestrian infrastructure, parking ratios. Not assessable from building data alone.",
        };
      case "water":
        return {
          ...cat,
          earnedPoints: 0,
          assessable: false,
          assessmentNote:
            "Requires plumbing specifications, rainwater harvesting system data, and water fixture efficiency ratings. Not available from envelope data.",
        };
      case "maintenance":
        return {
          ...cat,
          earnedPoints: 0,
          assessable: false,
          assessmentNote:
            "Requires building management system specifications, maintenance manuals, and commissioning records. Not assessable from available data.",
        };
      case "ecology":
        return {
          ...cat,
          earnedPoints: 0,
          assessable: false,
          assessmentNote:
            "Requires site ecology survey, green area ratio, and biotope assessment. Requires on-site visit.",
        };
      case "innovation":
        return {
          ...cat,
          earnedPoints: 0,
          assessable: false,
          assessmentNote:
            "Innovation credits require documentation of novel design strategies not captured in standard building data.",
        };
      default:
        return {
          ...cat,
          earnedPoints: 0,
          assessable: false,
          assessmentNote: "Category not recognized.",
        };
    }
  });

  const totalMaxPoints = categories.reduce((sum, c) => sum + c.maxPoints, 0);
  const assessableMaxPoints = categoryScores
    .filter((c) => c.assessable)
    .reduce((sum, c) => sum + c.maxPoints, 0);
  const earnedPoints = categoryScores.reduce((sum, c) => sum + c.earnedPoints, 0);

  // Sum of points theoretically earnable from our data (sub-portions of each assessable category).
  // A perfect building on all measurable criteria scores totalEarnable.
  const totalEarnable = Object.values(maxEarnableMap).reduce((sum, v) => sum + v, 0);

  // Project earned onto 100-pt scale so grade thresholds remain meaningful.
  // A perfect building on all assessable data → projectedScore = 100.
  const projectedScore =
    totalEarnable > 0
      ? Math.round((earnedPoints / totalEarnable) * 100 * 10) / 10
      : 0;

  // assessablePercentage: what share of the full 100-pt spectrum we can evaluate
  const assessablePercentage =
    totalMaxPoints > 0
      ? Math.round((assessableMaxPoints / totalMaxPoints) * 100 * 10) / 10
      : 0;

  const grade = determineGrade(projectedScore, thresholds);

  return {
    version,
    totalMaxPoints,
    assessableMaxPoints,
    earnedPoints: Math.round(earnedPoints * 10) / 10,
    assessablePercentage,
    grade,
    categories: categoryScores,
    disclaimer: DISCLAIMER,
  };
}
