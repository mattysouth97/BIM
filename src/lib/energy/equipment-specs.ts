// src/lib/energy/equipment-specs.ts
// Equipment-level efficiency grades and inference from BuildingRecipe.
//
// IMPORTANT: This module is SEPARATE from energy-grade.ts.
// - energy-grade.ts: Building certification (EnergyGrade = "1+++" | ... | "7", kWh/m²·yr)
// - equipment-specs.ts: Equipment efficiency (EquipmentEfficiencyGrade = 1|2|3|4|5, KS B 6364 / KSC IEC 62301)
//
// Per D-04: DO NOT import from energy-grade.ts. The two grade scales must not be conflated.

import type { BuildingEra } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * KS B 6364 (HVAC) / KSC IEC 62301 (electrical) equipment efficiency grade.
 * Scale: 1 (best, 우수) to 5 (worst, 불량).
 * SEPARATE from building-level EnergyGrade ("1+++" to "7") — do NOT import EnergyGrade here.
 */
export type EquipmentEfficiencyGrade = 1 | 2 | 3 | 4 | 5;

/** Provenance discriminant — every EquipmentSpec field must have a data source */
export type EquipmentDataSource = "estimated-from-era" | "estimated-from-recipe";

/** Korean standard reference for the grade */
export type EquipmentStandardRef = "KS B 6364" | "KSC IEC 62301";

/**
 * Inferred specification record for a single MEP equipment item.
 * All fields carry provenance via dataSource.
 * Plain JSON-serialisable — no THREE.js, no React refs.
 */
export interface EquipmentSpec {
  /** Korean equipment category label (e.g. "냉방기") */
  categoryKo: string;
  /** English category label (e.g. "Cooling Plant") */
  categoryEn: string;
  /** Capacity with unit, e.g. "12 kW" or "500 W/fixture" */
  capacity: string;
  /** Approximate install year from ERA_INSTALL_YEAR era midpoint */
  installYear: number;
  /** Estimated annual electricity consumption in kWh */
  annualKwh: number;
  /** Equipment-level efficiency grade (1~5 scale) */
  efficiencyGrade: EquipmentEfficiencyGrade;
  /** Korean grade label, e.g. "1등급 (우수)" */
  efficiencyGradeLabel: string;
  /** Hex color for the grade badge */
  gradeColor: string;
  /** Provenance of grade and installYear */
  dataSource: EquipmentDataSource;
  /** Korean standard reference */
  standardRef: EquipmentStandardRef;
}

// ---------------------------------------------------------------------------
// Era → install year midpoint table
// ---------------------------------------------------------------------------

export const ERA_INSTALL_YEAR: Record<BuildingEra, number> = {
  "pre-1970":  1965,
  "1970-1989": 1979,
  "1990-1999": 1994,
  "2000-2009": 2004,
  "2010-2019": 2014,
  "2020+":     2022,
};

// ---------------------------------------------------------------------------
// Era → efficiency grade tables
// ---------------------------------------------------------------------------

/** KS B 6364 HVAC equipment grades inferred from era (1=best, 5=worst) */
export const HVAC_ERA_GRADE: Record<BuildingEra, EquipmentEfficiencyGrade> = {
  "pre-1970":  5,
  "1970-1989": 5,
  "1990-1999": 4,
  "2000-2009": 3,
  "2010-2019": 2,
  "2020+":     1,
};

/** KSC IEC 62301 electrical appliance grades inferred from era (1=best, 5=worst) */
export const ELECTRICAL_ERA_GRADE: Record<BuildingEra, EquipmentEfficiencyGrade> = {
  "pre-1970":  5,
  "1970-1989": 5,
  "1990-1999": 4,
  "2000-2009": 3,
  "2010-2019": 2,
  "2020+":     1,
};

// ---------------------------------------------------------------------------
// Grade display tables
// ---------------------------------------------------------------------------

export const EQUIPMENT_GRADE_LABELS: Record<EquipmentEfficiencyGrade, string> = {
  1: "1등급 (우수)",
  2: "2등급 (양호)",
  3: "3등급 (보통)",
  4: "4등급 (미흡)",
  5: "5등급 (불량)",
};

export const EQUIPMENT_GRADE_COLORS: Record<EquipmentEfficiencyGrade, string> = {
  1: "#16a34a",  // green (best)
  2: "#84cc16",  // lime
  3: "#facc15",  // yellow
  4: "#f97316",  // orange
  5: "#dc2626",  // red (worst)
};

// ---------------------------------------------------------------------------
// Use-code → operating hours (ASHRAE 90.1 defaults)
// ---------------------------------------------------------------------------

/**
 * Annual operating hours by Korean use code (주용도코드).
 * P1-04: office hours moved from the mislabeled "12000" (수련시설 per MOLIT)
 * to "14000" (업무시설). 12xxx buildings now fall back to the 2500 h default —
 * correct-by-ignorance rather than mislabeled. Exported for the use-code
 * consistency test.
 */
export const USE_CODE_OPERATING_HOURS: Record<string, number> = {
  "01000": 2920,  // 단독주택 (residential)
  "02000": 2920,  // 공동주택 (multi-family residential)
  "03000": 3000,  // 제1종 근린생활시설
  "04000": 3000,  // 제2종 근린생활시설
  "05000": 2000,  // 문화및집회시설
  "07000": 4000,  // 판매시설 (retail)
  "09000": 3500,  // 의료시설 (medical)
  "10000": 2500,  // 교육연구시설 (education)
  "14000": 4380,  // 업무시설 (office, 8760/2) — MOLIT 14
};

function getOperatingHours(mainPurpsCd: string): number {
  return USE_CODE_OPERATING_HOURS[mainPurpsCd] ?? 2500;
}

// ---------------------------------------------------------------------------
// Internal helper — build a complete EquipmentSpec
// ---------------------------------------------------------------------------

function buildSpec(params: {
  categoryKo: string;
  categoryEn: string;
  capacity: string;
  installYear: number;
  annualKwh: number;
  grade: EquipmentEfficiencyGrade;
  dataSource: EquipmentDataSource;
  standardRef: EquipmentStandardRef;
}): EquipmentSpec {
  return {
    categoryKo:          params.categoryKo,
    categoryEn:          params.categoryEn,
    capacity:            params.capacity,
    installYear:         params.installYear,
    annualKwh:           params.annualKwh,
    efficiencyGrade:     params.grade,
    efficiencyGradeLabel: EQUIPMENT_GRADE_LABELS[params.grade],
    gradeColor:          EQUIPMENT_GRADE_COLORS[params.grade],
    dataSource:          params.dataSource,
    standardRef:         params.standardRef,
  };
}

// ---------------------------------------------------------------------------
// inferEquipmentSpecs — pure, synchronous
// ---------------------------------------------------------------------------

/**
 * Infer equipment specifications from MEP mesh userData and BuildingRecipe.
 *
 * Pure synchronous function — no React, no THREE.js, no store reads, no async.
 * All inputs are plain values available at click time.
 *
 * Per D-04: this function must NEVER call getEnergyGrade() or reference EnergyGrade.
 * Per D-03: installYear derives from ERA_INSTALL_YEAR[recipe.era] only.
 *
 * @param userData  Partial userData from the hit mesh (type, floorNo)
 * @param recipe    Current building recipe
 * @returns         Fully-populated EquipmentSpec
 */
export function inferEquipmentSpecs(
  userData: { type?: string; floorNo?: number | null },
  recipe: BuildingRecipe
): EquipmentSpec {
  const type = userData.type ?? "unknown";
  const era = recipe.era;
  const installYear = ERA_INSTALL_YEAR[era];
  const floorArea = Math.max(recipe.footprintWidth * recipe.footprintDepth, 1);
  const floorCount = Math.max(recipe.floors.length, 1);
  const opHours = getOperatingHours(recipe.mainPurpsCd);

  // Dispatch on the prefix before the first "-"
  const prefix = type.split("-")[0];

  switch (prefix) {
    // -----------------------------------------------------------------------
    // HVAC — cooling-*
    // -----------------------------------------------------------------------
    case "cooling": {
      const grade = HVAC_ERA_GRADE[era];
      // HVAC cooling: ~0.05 kW/m² installed capacity, COP degrades with era
      const copByGrade: Record<EquipmentEfficiencyGrade, number> = {
        1: 5.5, 2: 4.5, 3: 3.5, 4: 2.5, 5: 1.8,
      };
      const cop = copByGrade[grade];
      const coolingLoad = floorArea * floorCount * 0.05; // kW
      const annualKwh = Math.round((coolingLoad * opHours * 0.4) / cop); // 40% part-load
      const capacityKw = Math.round(coolingLoad * 10) / 10;

      return buildSpec({
        categoryKo:  "냉방기",
        categoryEn:  "Cooling System",
        capacity:    `${capacityKw} kW`,
        installYear,
        annualKwh:   Math.max(annualKwh, 1),
        grade,
        dataSource:  "estimated-from-era",
        standardRef: "KS B 6364",
      });
    }

    // -----------------------------------------------------------------------
    // HVAC — heating-*
    // -----------------------------------------------------------------------
    case "heating": {
      const grade = HVAC_ERA_GRADE[era];
      // Heating efficiency: COP/efficiency ratio
      const effByGrade: Record<EquipmentEfficiencyGrade, number> = {
        1: 0.95, 2: 0.88, 3: 0.80, 4: 0.72, 5: 0.60,
      };
      const eff = effByGrade[grade];
      const heatingLoad = floorArea * floorCount * 0.06; // kW (slightly higher than cooling)
      const annualKwh = Math.round((heatingLoad * opHours * 0.45) / eff);
      const capacityKw = Math.round(heatingLoad * 10) / 10;

      return buildSpec({
        categoryKo:  "난방기",
        categoryEn:  "Heating System",
        capacity:    `${capacityKw} kW`,
        installYear,
        annualKwh:   Math.max(annualKwh, 1),
        grade,
        dataSource:  "estimated-from-era",
        standardRef: "KS B 6364",
      });
    }

    // -----------------------------------------------------------------------
    // HVAC — vent-*
    // -----------------------------------------------------------------------
    case "vent": {
      const grade = HVAC_ERA_GRADE[era];
      // SFP (specific fan power) W/(m³/h): lower grade = higher SFP
      const sfpByGrade: Record<EquipmentEfficiencyGrade, number> = {
        1: 0.3, 2: 0.5, 3: 0.8, 4: 1.2, 5: 1.8,
      };
      const sfp = sfpByGrade[grade];
      const airflowM3h = floorArea * floorCount * 3; // 3 ACH default
      const fanKw = (sfp * airflowM3h) / 1000;
      const annualKwh = Math.round(fanKw * opHours);

      return buildSpec({
        categoryKo:  "환기장치",
        categoryEn:  "Ventilation Unit",
        capacity:    `${Math.round(airflowM3h)} m³/h`,
        installYear,
        annualKwh:   Math.max(annualKwh, 1),
        grade,
        dataSource:  "estimated-from-era",
        standardRef: "KS B 6364",
      });
    }

    // -----------------------------------------------------------------------
    // Lighting — lighting-*
    // -----------------------------------------------------------------------
    case "lighting": {
      const grade = ELECTRICAL_ERA_GRADE[era];
      // Lighting power density W/m² by era/grade
      const lpdByGrade: Record<EquipmentEfficiencyGrade, number> = {
        1: 8,   // LED, 2020+
        2: 10,  // LED/T5, 2010-2019
        3: 14,  // T8 fluorescent, 2000-2009
        4: 18,  // fluorescent, 1990-1999
        5: 24,  // incandescent/old fluorescent, pre-1990
      };
      const lpd = lpdByGrade[grade];
      const totalLightingKw = (floorArea * floorCount * lpd) / 1000;
      const annualKwh = Math.round(totalLightingKw * opHours);
      const capacityW = Math.round(lpd * floorArea);

      return buildSpec({
        categoryKo:  "조명기기",
        categoryEn:  "Lighting Fixture",
        capacity:    `${capacityW} W`,
        installYear,
        annualKwh:   Math.max(annualKwh, 1),
        grade,
        dataSource:  "estimated-from-era",
        standardRef: "KSC IEC 62301",
      });
    }

    // -----------------------------------------------------------------------
    // DHW — dhw-*
    // -----------------------------------------------------------------------
    case "dhw": {
      const grade = HVAC_ERA_GRADE[era];
      // DHW: approx 5 kWh/m²·yr baseline × floor area, adjusted by use type
      const dhwFactor = recipe.mainPurpsCd.startsWith("01") || recipe.mainPurpsCd.startsWith("02")
        ? 8   // residential: higher DHW demand
        : 5;  // commercial
      const annualKwh = Math.round(floorArea * floorCount * dhwFactor);
      const storageL = Math.round(floorArea * 0.5); // L storage volume estimate

      return buildSpec({
        categoryKo:  "급탕기",
        categoryEn:  "Domestic Hot Water System",
        capacity:    `${storageL} L`,
        installYear,
        annualKwh:   Math.max(annualKwh, 1),
        grade,
        dataSource:  "estimated-from-era",
        standardRef: "KS B 6364",
      });
    }

    // -----------------------------------------------------------------------
    // Electrical — shell-*
    // -----------------------------------------------------------------------
    case "shell": {
      const grade = ELECTRICAL_ERA_GRADE[era];
      // Electrical distribution / panel load: residual plug load
      const plugLoadWm2ByGrade: Record<EquipmentEfficiencyGrade, number> = {
        1: 5, 2: 8, 3: 12, 4: 16, 5: 20,
      };
      const plugLoad = plugLoadWm2ByGrade[grade];
      const totalKw = (floorArea * floorCount * plugLoad) / 1000;
      const annualKwh = Math.round(totalKw * opHours);

      return buildSpec({
        categoryKo:  "전기배전반",
        categoryEn:  "Electrical Distribution Panel",
        capacity:    `${Math.round(totalKw)} kW`,
        installYear,
        annualKwh:   Math.max(annualKwh, 1),
        grade,
        dataSource:  "estimated-from-era",
        standardRef: "KSC IEC 62301",
      });
    }

    // -----------------------------------------------------------------------
    // Electrical — microgrid-*
    // -----------------------------------------------------------------------
    case "microgrid": {
      // PV/BESS microgrid — always grade 1 (renewable)
      const pvCapacityKwp = Math.round(floorArea * 0.1 * 10) / 10; // 10% of footprint as PV
      const annualKwh = Math.round(pvCapacityKwp * 1100); // ~1100 kWh/kWp/yr in Korea

      return buildSpec({
        categoryKo:  "마이크로그리드",
        categoryEn:  "Microgrid (PV/BESS)",
        capacity:    `${pvCapacityKwp} kWp`,
        installYear,
        annualKwh:   Math.max(annualKwh, 1),
        grade:       1,  // renewable — always best grade
        dataSource:  "estimated-from-recipe",
        standardRef: "KSC IEC 62301",
      });
    }

    // -----------------------------------------------------------------------
    // Unknown / fallback
    // -----------------------------------------------------------------------
    default: {
      return buildSpec({
        categoryKo:  "기타",
        categoryEn:  "Other Equipment",
        capacity:    "—",
        installYear,
        annualKwh:   Math.round(floorArea * floorCount * 3),
        grade:       3,  // neutral default
        dataSource:  "estimated-from-recipe",
        standardRef: "KSC IEC 62301",
      });
    }
  }
}
