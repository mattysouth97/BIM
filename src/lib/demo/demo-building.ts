// src/lib/demo/demo-building.ts
// Demo mode (데모모드) fixtures — a complete default building served without
// an API key or network access. The building is a 2008-approved RC office
// tower (업무시설, 10F/B2) with an L-shaped footprint, chosen so the
// procedural curtain-wall facade, clean-texture era (2000+), and the GX
// retrofit features all have realistic data to work with.
//
// Values are derived from a handful of base dimensions below so floor sums,
// counts, and 건폐율/용적률 stay internally consistent by construction —
// guarded by src/lib/demo/__tests__/demo-building.test.ts.

import { DEMO_BUILDING_PK, DEMO_BUILDING_PARAMS } from "@/lib/constants";
import type { ApiListResponse } from "@/lib/api-client";
import type {
  BrTitleInfo,
  BrRecapTitleInfo,
  BrFloorInfo,
  BrAreaInfo,
  BrBasisInfo,
  BrJijiguInfo,
} from "@/lib/types";

// ─────────────────────────────────────────────
// Base dimensions
// ─────────────────────────────────────────────

const GROUND_FLOORS = 10;
const BASEMENT_FLOORS = 2;

// Conventional rectangular parcel — the ordinary case for a mid-rise office
// on a city block. Plan dimensions drive 건축면적 so the model and the ledger
// can never disagree.
const FOOTPRINT_WIDTH_M = 34; // east–west
const FOOTPRINT_DEPTH_M = 24; // north–south

const PLAT_AREA = 1650; // 대지면적 (m²)
const ARCH_AREA = FOOTPRINT_WIDTH_M * FOOTPRINT_DEPTH_M; // 건축면적 = 816 m²
const FIRST_FLOOR_AREA = 780; // 1층 로비/근생 (코어 제외 축소)
const UPPER_FLOOR_AREA = 816; // 2~10층 기준층
const BASEMENT_AREA = 1150; // 지하 주차장/기계실 (footprint보다 넓게 굴착)

const ABOVE_GFA =
  FIRST_FLOOR_AREA + UPPER_FLOOR_AREA * (GROUND_FLOORS - 1); // 지상 연면적
const TOT_AREA = ABOVE_GFA + BASEMENT_AREA * BASEMENT_FLOORS; // 연면적

const round2 = (n: number) => Math.round(n * 100) / 100;

export const DEMO_ADDRESS = "서울특별시 강남구 역삼동 000-0 (데모)";

const common = {
  mgmBldrgstPk: DEMO_BUILDING_PK,
  sigunguCd: DEMO_BUILDING_PARAMS.sigunguCd,
  bjdongCd: DEMO_BUILDING_PARAMS.bjdongCd,
  platGbCd: DEMO_BUILDING_PARAMS.platGbCd,
  bun: DEMO_BUILDING_PARAMS.bun,
  ji: DEMO_BUILDING_PARAMS.ji,
};

// ─────────────────────────────────────────────
// 표제부 (title)
// ─────────────────────────────────────────────

export const demoTitle: BrTitleInfo = {
  ...common,
  bldNm: "데모 오피스 타워",
  platPlcNm: DEMO_ADDRESS,
  newPlatPlc: "서울특별시 강남구 테헤란로 000 (데모)",
  mainPurpsCd: "14000",
  mainPurpsCdNm: "업무시설",
  etcPurps: "사무소",
  strctCd: "11",
  strctCdNm: "철근콘크리트구조",
  etcStrct: "",
  grndFlrCnt: GROUND_FLOORS,
  ugrndFlrCnt: BASEMENT_FLOORS,
  totArea: TOT_AREA,
  archArea: ARCH_AREA,
  platArea: PLAT_AREA,
  bcRat: round2((ARCH_AREA / PLAT_AREA) * 100),
  vlRat: round2((ABOVE_GFA / PLAT_AREA) * 100),
  useAprDay: "20081124",
  pmsDay: "20060315",
  stcnsDay: "20060810",
  roofCd: "1",
  roofCdNm: "평지붕",
  heit: 41.5,
  regstrGbCd: "2",
  regstrGbCdNm: "일반",
  regstrKindCd: "2",
  regstrKindCdNm: "일반건축물",
};

// ─────────────────────────────────────────────
// 총괄표제부 (recap)
// ─────────────────────────────────────────────

export const demoRecap: BrRecapTitleInfo = {
  mgmBldrgstPk: DEMO_BUILDING_PK,
  bldNm: demoTitle.bldNm,
  platPlcNm: DEMO_ADDRESS,
  sigunguCd: common.sigunguCd,
  bjdongCd: common.bjdongCd,
  platGbCd: common.platGbCd,
  bun: common.bun,
  ji: common.ji,
  mainPurpsCdNm: demoTitle.mainPurpsCdNm,
  etcPurps: demoTitle.etcPurps,
  hhldCnt: 0,
  fmlyCnt: 0,
  totArea: TOT_AREA,
  archArea: ARCH_AREA,
  platArea: PLAT_AREA,
  bcRat: demoTitle.bcRat,
  vlRat: demoTitle.vlRat,
  grndFlrCnt: GROUND_FLOORS,
  ugrndFlrCnt: BASEMENT_FLOORS,
  useAprDay: demoTitle.useAprDay,
  pmsDay: demoTitle.pmsDay,
  stcnsDay: demoTitle.stcnsDay,
  dongCnt: 1,
};

// ─────────────────────────────────────────────
// 층별개요 (floors) — generated so counts/sums always match the title
// ─────────────────────────────────────────────

function makeFloor(
  flrNo: number,
  area: number,
  use: { cd: string; nm: string; etc: string },
): BrFloorInfo {
  const below = flrNo < 0;
  return {
    mgmBldrgstPk: DEMO_BUILDING_PK,
    flrNo,
    flrNoNm: below ? `지하${Math.abs(flrNo)}층` : `${flrNo}층`,
    flrGbCd: below ? "10" : "20",
    flrGbCdNm: below ? "지하" : "지상",
    mainAtchGbCd: "0",
    mainAtchGbCdNm: "주건축물",
    mainPurpsCd: use.cd,
    mainPurpsCdNm: use.nm,
    etcPurps: use.etc,
    area,
    strctCd: "11",
    strctCdNm: "철근콘크리트구조",
  };
}

const PARKING = { cd: "20000", nm: "자동차관련시설", etc: "주차장·기계실" };
const LOBBY = { cd: "04000", nm: "제2종근린생활시설", etc: "로비·휴게음식점" };
const OFFICE = { cd: "14000", nm: "업무시설", etc: "사무소" };

export const demoFloors: BrFloorInfo[] = [
  // 지하 (deepest first, the ledger's usual ordering)
  ...Array.from({ length: BASEMENT_FLOORS }, (_, i) =>
    makeFloor(-(BASEMENT_FLOORS - i), BASEMENT_AREA, PARKING),
  ),
  // 지상
  makeFloor(1, FIRST_FLOOR_AREA, LOBBY),
  ...Array.from({ length: GROUND_FLOORS - 1 }, (_, i) =>
    makeFloor(i + 2, UPPER_FLOOR_AREA, OFFICE),
  ),
];

// ─────────────────────────────────────────────
// 전유공용면적 (areas) — 전유 + 공용 per 지상층, 공용 for 지하
// ─────────────────────────────────────────────

function makeArea(
  flrNo: number,
  exclusive: boolean,
  area: number,
  use: { cd: string; nm: string },
): BrAreaInfo {
  const below = flrNo < 0;
  return {
    mgmBldrgstPk: DEMO_BUILDING_PK,
    exposPubuseGbCd: exclusive ? "1" : "2",
    exposPubuseGbCdNm: exclusive ? "전유" : "공용",
    flrNo,
    flrNoNm: below ? `지하${Math.abs(flrNo)}층` : `${flrNo}층`,
    mainPurpsCd: use.cd,
    mainPurpsCdNm: use.nm,
    area,
  };
}

export const demoAreas: BrAreaInfo[] = demoFloors.flatMap((f) => {
  if (f.flrNo < 0) {
    return [makeArea(f.flrNo, false, f.area, { cd: "20000", nm: "자동차관련시설" })];
  }
  const use = { cd: f.mainPurpsCd, nm: f.mainPurpsCdNm };
  const exclusive = round2(f.area * 0.74); // 전용률 약 74%
  return [
    makeArea(f.flrNo, true, exclusive, use),
    makeArea(f.flrNo, false, round2(f.area - exclusive), {
      cd: f.mainPurpsCd,
      nm: "계단실·복도·화장실",
    }),
  ];
});

// ─────────────────────────────────────────────
// 기본개요 (basis) + 지역지구 (jijigu)
// ─────────────────────────────────────────────

export const demoBasis: BrBasisInfo = {
  mgmBldrgstPk: DEMO_BUILDING_PK,
  bldNm: demoTitle.bldNm,
  platPlcNm: DEMO_ADDRESS,
  sigunguCd: common.sigunguCd,
  bjdongCd: common.bjdongCd,
  mainPurpsCdNm: demoTitle.mainPurpsCdNm,
  strctCdNm: demoTitle.strctCdNm,
  grndFlrCnt: GROUND_FLOORS,
  ugrndFlrCnt: BASEMENT_FLOORS,
  totArea: TOT_AREA,
  archArea: ARCH_AREA,
  platArea: PLAT_AREA,
  useAprDay: demoTitle.useAprDay,
};

export const demoJijigu: BrJijiguInfo[] = [
  {
    mgmBldrgstPk: DEMO_BUILDING_PK,
    jijiguCd: "UQA100",
    jijiguCdNm: "일반상업지역",
    etcJijigu: "",
    jijiguGbCd: "1",
    jijiguGbCdNm: "용도지역",
  },
  {
    mgmBldrgstPk: DEMO_BUILDING_PK,
    jijiguCd: "UQQ300",
    jijiguCdNm: "지구단위계획구역",
    etcJijigu: "",
    jijiguGbCd: "3",
    jijiguGbCdNm: "구역",
  },
];

// ─────────────────────────────────────────────
// Footprint — closed WGS84 ring of [lng, lat] for a plain rectangular parcel
// (FOOTPRINT_WIDTH_M × FOOTPRINT_DEPTH_M) in 역삼동, a conventional Gangnam
// office block. Generated from the metre dimensions so the drawn outline and
// 건축면적 stay in lockstep; BuildingScene projects it to local metres.
// ─────────────────────────────────────────────

/** Parcel south-west corner (WGS84). */
const SITE_ORIGIN_LNG = 127.0355;
const SITE_ORIGIN_LAT = 37.501;

// Metres per degree at the site latitude (WGS84 ellipsoid, φ ≈ 37.5°).
const M_PER_DEG_LAT = 110_987;
const M_PER_DEG_LNG = 88_425;

const LNG_SPAN = FOOTPRINT_WIDTH_M / M_PER_DEG_LNG;
const LAT_SPAN = FOOTPRINT_DEPTH_M / M_PER_DEG_LAT;

const EAST = SITE_ORIGIN_LNG + LNG_SPAN;
const NORTH = SITE_ORIGIN_LAT + LAT_SPAN;

export const DEMO_FOOTPRINT: number[][][] = [
  [
    [SITE_ORIGIN_LNG, SITE_ORIGIN_LAT],
    [EAST, SITE_ORIGIN_LAT],
    [EAST, NORTH],
    [SITE_ORIGIN_LNG, NORTH],
    [SITE_ORIGIN_LNG, SITE_ORIGIN_LAT],
  ],
];

/**
 * Bundled footprint for the demo building. Returns null for any other
 * address so real lookups keep flowing to the VWorld proxy.
 */
export function getDemoFootprintResult(
  address: string | undefined,
): { polygon: number[][][]; error: null } | null {
  if (address !== DEMO_ADDRESS) return null;
  return { polygon: DEMO_FOOTPRINT, error: null };
}

// ─────────────────────────────────────────────
// Endpoint path → fixture response
// ─────────────────────────────────────────────

function wrap<T>(items: T[]): ApiListResponse<T> {
  return { items, totalCount: items.length, pageNo: 1, numOfRows: items.length };
}

const DEMO_RESPONSES: Record<string, ApiListResponse<unknown>> = {
  "/api/bldrgst/title": wrap([demoTitle]),
  "/api/bldrgst/recap": wrap([demoRecap]),
  "/api/bldrgst/floors": wrap(demoFloors),
  "/api/bldrgst/areas": wrap(demoAreas),
  "/api/bldrgst/basis": wrap([demoBasis]),
  "/api/bldrgst/jijugu": wrap(demoJijigu),
};

/** Fixture response for a bldrgst endpoint path, or null when not covered. */
export function getDemoResponse(path: string): ApiListResponse<unknown> | null {
  return DEMO_RESPONSES[path] ?? null;
}
