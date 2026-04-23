// src/lib/portfolio/feature-extractor.ts
// Pure extractFeatures function — Phase 35 Task 3.
//
// PARITY NOTE: scripts/extract-features.mjs contains a parallel plain-JS
// implementation that MUST produce identical output for all inputs.
// Behavioural parity is enforced by the smoke test in
// src/lib/portfolio/__tests__/extract-features-cli.test.ts (Task 3) and
// by a CI guard in scripts/ci-check-plan.mjs (Task 11).
//
// This function NEVER calls any API. The caller pre-fetches both the
// BuildingRecord (from 건축물대장) and the FootprintGeometry (from VWorld).

import type { BuildingRecord } from "../types";
import type { FootprintGeometry } from "./types";
import type { PortfolioFeatureVector } from "./features";
import {
  WALL_U_VALUES,
  WINDOW_U_VALUES,
  WINDOW_SHGC,
} from "../korean-building-codes";
import { classifyEra } from "../material-types";
import type { BuildingEra } from "../material-types";

// ─── Structure-type encoding ─────────────────────────────────────────────────
// Source: STRUCTURE_TO_WALL_KEY in korean-building-codes.ts + 건축물대장 strctCd
// 0 = masonry/mixed-masonry  (strctCd "22","23","24","25" — 조적식구조 variants)
// 1 = reinforced concrete    (strctCd "11","12","14","21","42" — RC, SRC, precast)
// 2 = steel                  (strctCd "13" — 철골구조)
// 3 = wood                   (strctCd "15" — 목구조)
// 4 = other / unknown
function encodeStructureType(strctCd: string): number {
  switch (strctCd) {
    case "22": case "23": case "24": case "25":
      return 0; // masonry / 조적식구조
    case "11": case "12": case "14": case "21": case "42":
      return 1; // reinforced concrete / RC / SRC / precast
    case "13":
      return 2; // steel / 철골구조
    case "15":
      return 3; // wood / 목구조
    default:
      return 4; // other / unknown
  }
}

// ─── Use-type encoding ───────────────────────────────────────────────────────
// Driven by mainPurpsCd (useCode in BuildingRecord) major category prefix.
// Korean building use categories (국토교통부 건축물용도):
//   "01" = 단독주택           → 0 residential
//   "02" = 공동주택           → 0 residential
//   "03" = 제1종근린생활시설  → 2 mixed (first-category neighbourhood commercial)
//   "04" = 제1종근린생활시설  → 2 mixed (alternative code)
//   "05" = 제2종근린생활시설  → 2 mixed
//   "06" = 문화·집회시설      → 4 other
//   "07" = 판매시설            → 3 retail
//   "08" = 운수시설            → 4 other
//   "09" = 의료시설            → 4 other
//   "10" = 교육연구시설        → 4 other
//   "11" = 노유자시설          → 4 other
//   "12" = 수련시설            → 4 other
//   "13" = 운동시설            → 4 other
//   "14" = 업무시설            → 1 office
//   "15" = 숙박시설            → 4 other
//   "16" = 위락시설            → 3 retail (entertainment → retail-adjacent)
//   "17" = 공장                → 4 other
//   "18" = 창고시설            → 4 other
//   "19" = 위험물저장처리시설  → 4 other
//   "20" = 자동차관련시설      → 4 other
//   other                      → 4 other
function encodeUseType(useCode: string): number {
  const prefix = useCode.slice(0, 2);
  switch (prefix) {
    case "01": case "02":
      return 0; // residential
    case "14":
      return 1; // office
    case "03": case "04": case "05":
      return 2; // mixed / 근린생활시설
    case "07": case "16":
      return 3; // retail
    default:
      return 4; // other
  }
}

// ─── Climate-zone encoding ───────────────────────────────────────────────────
// Derived from the 2-digit sido prefix embedded in the pk (mgmBldrgstPk).
// mgmBldrgstPk format: "<5-digit sigunguCd>-…"  where first 2 digits = sido code.
// 0 = central (default — Seoul, Incheon, Gyeonggi, Daejeon, Sejong, Chungnam,
//              Chungbuk, Jeonbuk, Gyeongbuk, Gangwon, Daegu, Ulsan, Gyeongnam)
// 1 = southern (부산 26, 광주 29, 전남 46, 경남 48, 울산 31)
//              Note: Ulsan is latitude ~35.5°N — classified southern here.
// 2 = jeju    (제주 50)
//
// Source: GROUND_TEMPERATURES in korean-building-codes.ts for sido prefix map.
function encodeClimateZone(pk: string): number {
  const sidoPrefix = pk.slice(0, 2);
  switch (sidoPrefix) {
    case "50":
      return 2; // Jeju
    case "26": // Busan
    case "29": // Gwangju
    case "31": // Ulsan
    case "46": // Jeonnam
    case "48": // Gyeongnam
      return 1; // southern
    default:
      return 0; // central
  }
}

// ─── Era-prior lookup ────────────────────────────────────────────────────────
// classifyEra() from material-types.ts accepts a date string (YYYYMMDD).
// BuildingRecord.approvalDate (사용승인일) is the most reliable date field;
// fall back to permitDate (허가일) if approvalDate is empty/missing.
//
// WALL U-value: residential vs non-residential split.
// WINDOW U-value, SHGC: era-only (no use-type split).
// LIGHTING LPD prior: no era table exists in korean-building-codes.ts, so we
// use a small inline table derived from the Korean energy code timeline:
//   pre-1990 era   → 12 W/m² (fluorescent T12, no controls)
//   2000s era      → 8  W/m²  (T5/compact fluorescent, manual)
//   2010s+ era     → 6  W/m²  (LED, semi-controlled)
// These match the LIGHTING_DEFAULTS["default"].lpd order-of-magnitude and are
// annotated for Task 11 CI review.
const LIGHTING_LPD_BY_ERA: Record<BuildingEra, number> = {
  "pre-1970":  12,
  "1970-1989": 12,
  "1990-1999": 10,
  "2000-2009": 8,
  "2010-2019": 6,
  "2020+":     6,
};

function isResidential(useCode: string): boolean {
  const prefix = useCode.slice(0, 2);
  return prefix === "01" || prefix === "02";
}

// ─── Main extractor ──────────────────────────────────────────────────────────

/**
 * Derives a {@link PortfolioFeatureVector} purely from public-data inputs.
 * No API calls. No mutations. No throws — sentinel 0 passes through.
 *
 * @param building - Parsed 건축물대장 record from {@link BuildingRecord}
 * @param geometry - Pre-fetched footprint geometry from VWorld pipeline
 */
export function extractFeatures(
  building: BuildingRecord,
  geometry: FootprintGeometry,
): PortfolioFeatureVector {
  // ── construction year ──────────────────────────────────────────────────────
  // Parse year from approvalDate (사용승인일, YYYYMMDD). Fall back to permitDate.
  const dateStr = (building.approvalDate && building.approvalDate.length >= 4)
    ? building.approvalDate
    : building.permitDate;
  const constructionYear = (dateStr && dateStr.length >= 4)
    ? parseInt(dateStr.slice(0, 4), 10) || 0
    : 0;

  // ── era classification ─────────────────────────────────────────────────────
  // classifyEra expects a raw pmsDay-style string (first 4 chars = year).
  const era = classifyEra(dateStr);

  // ── building height ────────────────────────────────────────────────────────
  // Zero value in height means data unavailable (CLAUDE.md sentinel rule).
  // Infer from floor count at 3 m/storey when height is 0.
  const buildingHeightM = (building.height !== 0)
    ? building.height
    : building.floorsAbove * 3; // estimated; 3m/storey default

  // ── mainPurpsCode ──────────────────────────────────────────────────────────
  // Parse "02000" → 2000, "14000" → 14000. Empty/unparseable → 0.
  const mainPurpsCode = (building.useCode && building.useCode.trim() !== "")
    ? (parseInt(building.useCode, 10) || 0)
    : 0;

  // ── geometry fields ────────────────────────────────────────────────────────
  const { areaSqm, perimeterM, aspectRatio } = geometry;
  // Compactness: 4π·A / P². Clamp to [0, 1].
  const rawCompactness = (perimeterM > 0)
    ? (4 * Math.PI * areaSqm) / (perimeterM * perimeterM)
    : 0;
  const compactness = Math.min(1, Math.max(0, rawCompactness));

  // ── era-prior lookups ──────────────────────────────────────────────────────
  const residential = isResidential(building.useCode ?? "");
  const wallUValuePrior = residential
    ? WALL_U_VALUES[era].residential
    : WALL_U_VALUES[era].nonResidential;
  const windowUValuePrior = WINDOW_U_VALUES[era];
  const windowShgcPrior = WINDOW_SHGC[era];
  const lightingPowerDensityPrior = LIGHTING_LPD_BY_ERA[era];

  // ── climate zone ───────────────────────────────────────────────────────────
  const climateZoneCode = encodeClimateZone(building.pk ?? "");

  return {
    // bldrgst
    gfaSqm:            building.totalArea,
    floorCountAbove:   building.floorsAbove,
    floorCountBelow:   building.floorsBelow,
    buildingHeightM,
    constructionYear,
    structureTypeCode: encodeStructureType(building.structureCode ?? ""),
    useTypeCode:       encodeUseType(building.useCode ?? ""),
    mainPurpsCode,
    bcRat:             building.coverageRatio,     // 0 sentinel passes through
    vlRat:             building.floorAreaRatio,    // 0 sentinel passes through
    platAreaSqm:       building.siteArea,          // 0 sentinel passes through

    // geometry
    footprintAreaSqm: areaSqm,
    aspectRatio,
    perimeterM,
    compactness,

    // era_prior
    wallUValuePrior,
    windowUValuePrior,
    windowShgcPrior,
    lightingPowerDensityPrior,

    // location
    climateZoneCode,
  };
}
