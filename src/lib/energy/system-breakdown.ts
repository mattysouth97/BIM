// src/lib/energy/system-breakdown.ts
// Per-system energy attribution and per-floor kWh/m² distribution.
// Extends calculateAnnualDemand() without modifying it — all existing callers untouched.

import { calculateAnnualDemand } from "./annual-demand";
import { calculateHeatLoss } from "./heat-loss";
import { envelopeQuantities } from "./envelope-quantities";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { ClimateData } from "./climate-data";

// ── EnergyDataSource discriminated union (CONTEXT.md D4) ────────────────────
//
// Single source of truth — re-export from here everywhere else.
// "modeled" variant from RESEARCH.md is SUPERSEDED — do not use.
//
export type EnergyDataSource =
  | "actual"              // measured from data.go.kr API (future Phase 26 use)
  | "estimated-ratio"     // derived by applying an ASHRAE/KEMCO ratio to a modeled total
  | "estimated-inferred"; // inferred from building metadata (Phase 26 equipment panel use)

// ── SYSTEM_RATIOS table (CONTEXT.md D6, D7) ─────────────────────────────────
//
// Keys are 2-character prefixes of mainPurpsCd (e.g. "02" matches "02000", "02001", …).
// Each row sums to 1.0.
//
// Source: ASHRAE 90.1 Table G3.1 default ratios, cross-referenced against KEMCO 2024 data.
// NOTE: RESEARCH.md listed office as 40/35/7/18 — those values are SUPERSEDED.
//       CONTEXT.md D6 specifies 55/25/10/10 for Korean office buildings.
//
// P1-04: keys re-bound to the REAL MOLIT 건축물대장 주용도코드 table
// (건축법 시행령 별표1). The ratio VALUES are unchanged (CONTEXT.md D6/D7);
// only the code↔use binding was wrong. Former keys "11" (노유자시설) and
// "13" (운동시설) were removed deliberately: no researched profile exists for
// them, so falling back to DEFAULT_RATIOS is honest — a wrong specific
// binding is not. Exported so the use-code consistency test can iterate it.
export const SYSTEM_RATIOS: Record<
  string,
  { hvac: number; lighting: number; dhw: number; plug: number }
> = {
  // Keys follow the standard 건축물대장 주용도코드 used across this repo
  // (korean-building-codes.ts / MOLIT 건축법 시행령 별표1):
  // 01000 단독, 02000 공동주택, 07000 판매시설, 14000 업무시설.
  // (Earlier revision was mis-keyed 02→office, 13→retail.)
  "01": { hvac: 0.50, lighting: 0.07, dhw: 0.25, plug: 0.18 }, // 단독주택 single-family residential (MOLIT 01)
  "02": { hvac: 0.50, lighting: 0.07, dhw: 0.25, plug: 0.18 }, // 공동주택 multi-family residential (MOLIT 02)
  "07": { hvac: 0.45, lighting: 0.40, dhw: 0.03, plug: 0.12 }, // 판매시설 retail (MOLIT 07)
  "14": { hvac: 0.55, lighting: 0.25, dhw: 0.10, plug: 0.10 }, // 업무시설 office (MOLIT 14)
};

// Default ratios for all other building types (mixed-use average).
// 0.42 + 0.28 + 0.12 + 0.18 = 1.00
const DEFAULT_RATIOS = { hvac: 0.42, lighting: 0.28, dhw: 0.12, plug: 0.18 };

// ── Ratio provenance ────────────────────────────────────────────────────────
//
// `SYSTEM_RATIOS[prefix] ?? DEFAULT_RATIOS` was correct arithmetic and a silent
// claim. The table holds four researched profiles (01/02/07/14); every other
// 주용도코드 — 교육연구시설, 의료시설, 숙박시설, 문화시설 and the rest — took the
// mixed-use average with nothing anywhere recording that a default had been
// applied. On one 법정동 that is about a fifth of the buildings, each reported
// as though its use type had been accounted for.
//
// This repository's governing rule is that what the register states and what we
// assumed must never read alike, so the fallback has to say so. A discriminated
// union is what makes that non-optional: there is no shape here that carries
// generic ratios without also carrying the assumption naming them, so a reader
// cannot mistake one for a sourced profile.
//
// What this deliberately does NOT do is invent ratios for the missing codes.
// Extending the table needs real MOLIT figures; a plausible-looking row with a
// citation attached would be worse than the silence it replaced.
export type SystemRatioProvenance =
  | { source: "use_code"; useCodePrefix: string }
  | { source: "generic_default"; useCodePrefix: string; assumption: string };

function resolveSystemRatios(mainPurpsCd: string): {
  ratios: { hvac: number; lighting: number; dhw: number; plug: number };
  provenance: SystemRatioProvenance;
} {
  const useCodePrefix = (mainPurpsCd ?? "").slice(0, 2);
  const matched = SYSTEM_RATIOS[useCodePrefix];
  if (matched) {
    return { ratios: matched, provenance: { source: "use_code", useCodePrefix } };
  }

  // Built from DEFAULT_RATIOS rather than typed out, so the sentence cannot
  // drift away from the numbers it is describing.
  const shares = `냉난방 ${Math.round(DEFAULT_RATIOS.hvac * 100)} / 조명 ${Math.round(
    DEFAULT_RATIOS.lighting * 100,
  )} / 급탕 ${Math.round(DEFAULT_RATIOS.dhw * 100)} / 기타 ${Math.round(
    DEFAULT_RATIOS.plug * 100,
  )}%`;
  // An absent code and an unlisted code are different failures, and saying
  // 주용도코드 "" would imply a code that was never supplied.
  const assumption = useCodePrefix
    ? `주용도코드 "${useCodePrefix}"에 대한 용도별 에너지 비율 자료가 없어 일반 평균값(${shares})을 적용했습니다. 실측값이 아닌 가정입니다.`
    : `주용도코드가 없어 일반 평균값(${shares})을 적용했습니다. 실측값이 아닌 가정입니다.`;

  return {
    ratios: DEFAULT_RATIOS,
    provenance: { source: "generic_default", useCodePrefix, assumption },
  };
}

// ── SystemBreakdown interface ────────────────────────────────────────────────

export interface SystemBreakdown {
  /**
   * Where the four system ratios came from: a researched 주용도코드 profile, or
   * the generic average with the assumption named. Never absent, so a caller
   * cannot render a breakdown without being able to say which it is.
   */
  ratioProvenance: SystemRatioProvenance;
  /** kWh/yr — HVAC (heating + cooling), anchored to calculateAnnualDemand().totalDemand (D2) */
  hvac: number;
  /** kWh/yr — lighting, derived by ASHRAE ratio from HVAC-anchored total */
  lighting: number;
  /** kWh/yr — domestic hot water, derived by ASHRAE ratio */
  dhw: number;
  /** kWh/yr — plug loads / equipment, derived by ASHRAE ratio */
  plugLoads: number;
  /** kWh/yr — sum of all four systems (hvac + lighting + dhw + plugLoads) */
  total: number;
  /**
   * kWh/m² per above-grade floor (uniform distribution across floors).
   * Array index matches recipe.floors.filter(f => f.type === "above") order.
   * Phase 25 heatmap uses the same filter and same array index convention.
   */
  perFloor: number[];
  /** Source provenance for hvac value */
  hvacDataSource: EnergyDataSource;
  /** Source provenance for lighting value */
  lightingDataSource: EnergyDataSource;
  /** Source provenance for dhw value */
  dhwDataSource: EnergyDataSource;
  /** Source provenance for plug loads value */
  plugLoadsDataSource: EnergyDataSource;
}

// ── calculateSystemBreakdown ─────────────────────────────────────────────────

/**
 * Extend the annual HVAC demand with per-system attribution and per-floor distribution.
 *
 * Architecture:
 * - Calls calculateHeatLoss() and calculateAnnualDemand() internally — callers do NOT
 *   need to pre-compute HeatLossResult or AnnualDemand.
 * - HVAC is anchored to the degree-day engine output (not back-calculated from ratio).
 * - Other systems are scaled so total = hvac / hvac_ratio (D2 contract).
 * - perFloor distributes the total uniformly across above-grade floors only (D3 contract).
 * - All DataSource fields are "estimated-ratio" — Phase 26 introduces "actual" for sub-metered data.
 *
 * @param materials  - Building material and HVAC properties
 * @param recipe     - Procedural building recipe (floors, footprint, mainPurpsCd)
 * @param climate    - Climate data (HDD/CDD, design temperatures)
 */
export function calculateSystemBreakdown(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): SystemBreakdown {
  // Step 1: Run the existing degree-day engine (unchanged).
  const heatLoss = calculateHeatLoss(materials, recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, materials, recipe, climate);

  // Step 2: Look up ASHRAE ratios by 2-char mainPurpsCd prefix (D7).
  const { ratios, provenance } = resolveSystemRatios(recipe.mainPurpsCd);

  // Step 3: HVAC anchor + scale other systems so total = hvac / hvac_ratio (D2).
  // Guard against degenerate hvac_ratio = 0 (would produce Infinity).
  const hvac = demand.totalDemand;
  const totalFromHvac = ratios.hvac > 0 ? hvac / ratios.hvac : 0;

  const lighting = totalFromHvac * ratios.lighting;
  const dhw = totalFromHvac * ratios.dhw;
  const plugLoads = totalFromHvac * ratios.plug;
  const total = hvac + lighting + dhw + plugLoads;

  // Step 4: Per-floor distribution across above-grade floors only (D3).
  // Array index matches Phase 25 heatmap convention — DO NOT include below-grade floors.
  const aboveFloors = recipe.floors.filter((f: FloorSpec) => f.type === "above");
  const floorArea = envelopeQuantities(recipe).planAreaSqm;
  const perFloorIntensity =
    aboveFloors.length > 0 && floorArea > 0
      ? total / (aboveFloors.length * floorArea) // uniform kWh/m² distribution
      : 0;
  const perFloor = aboveFloors.map(() => perFloorIntensity);

  return {
    hvac,
    lighting,
    dhw,
    plugLoads,
    total,
    perFloor,
    // All "estimated-ratio": Phase 26 will introduce "actual" when sub-metered data is wired.
    ratioProvenance: provenance,
    hvacDataSource: "estimated-ratio",
    lightingDataSource: "estimated-ratio",
    dhwDataSource: "estimated-ratio",
    plugLoadsDataSource: "estimated-ratio",
  };
}
