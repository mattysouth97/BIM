// Drawing-origin fixture — a blank 1-floor host for the CAD door.
// Not the demo office tower. No network, no API key, no VWorld.

import { DRAWING_BUILDING_PK, DRAWING_BUILDING_PARAMS } from "@/lib/constants";
import type { ApiListResponse } from "@/lib/api-client";
import type {
  BrFloorInfo,
  BrRecapTitleInfo,
  BrTitleInfo,
  BrAreaInfo,
} from "@/lib/types";

const ARCH_AREA = 100;
const PLAT_AREA = 200;
const FLOOR_HEIGHT = 3.5;

export const DRAWING_ADDRESS = "도면에서 시작";

const common = {
  mgmBldrgstPk: DRAWING_BUILDING_PK,
  sigunguCd: DRAWING_BUILDING_PARAMS.sigunguCd,
  bjdongCd: DRAWING_BUILDING_PARAMS.bjdongCd,
  platGbCd: DRAWING_BUILDING_PARAMS.platGbCd,
  bun: DRAWING_BUILDING_PARAMS.bun,
  ji: DRAWING_BUILDING_PARAMS.ji,
};

export const drawingTitle: BrTitleInfo = {
  ...common,
  bldNm: "도면에서 시작",
  platPlcNm: DRAWING_ADDRESS,
  newPlatPlc: "",
  mainPurpsCd: "14000",
  mainPurpsCdNm: "업무시설",
  etcPurps: "도면에서 작성",
  strctCd: "11",
  strctCdNm: "철근콘크리트구조",
  etcStrct: "",
  grndFlrCnt: 1,
  ugrndFlrCnt: 0,
  totArea: ARCH_AREA,
  archArea: ARCH_AREA,
  platArea: PLAT_AREA,
  bcRat: 50,
  vlRat: 50,
  useAprDay: "",
  pmsDay: "",
  stcnsDay: "",
  roofCd: "1",
  roofCdNm: "평지붕",
  heit: FLOOR_HEIGHT,
  regstrGbCd: "2",
  regstrGbCdNm: "일반",
  regstrKindCd: "2",
  regstrKindCdNm: "일반건축물",
};

export const drawingRecap: BrRecapTitleInfo = {
  mgmBldrgstPk: DRAWING_BUILDING_PK,
  bldNm: drawingTitle.bldNm,
  platPlcNm: DRAWING_ADDRESS,
  sigunguCd: common.sigunguCd,
  bjdongCd: common.bjdongCd,
  platGbCd: common.platGbCd,
  bun: common.bun,
  ji: common.ji,
  mainPurpsCdNm: drawingTitle.mainPurpsCdNm,
  etcPurps: drawingTitle.etcPurps,
  hhldCnt: 0,
  fmlyCnt: 0,
  totArea: ARCH_AREA,
  archArea: ARCH_AREA,
  platArea: PLAT_AREA,
  bcRat: 50,
  vlRat: 50,
  grndFlrCnt: 1,
  ugrndFlrCnt: 0,
  useAprDay: "",
  pmsDay: "",
  stcnsDay: "",
  dongCnt: 1,
};

export const drawingFloors: BrFloorInfo[] = [
  {
    mgmBldrgstPk: DRAWING_BUILDING_PK,
    flrNo: 1,
    flrNoNm: "1층",
    flrGbCd: "20",
    flrGbCdNm: "지상",
    mainAtchGbCd: "0",
    mainAtchGbCdNm: "주건축물",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "업무시설",
    etcPurps: "도면에서 작성",
    area: ARCH_AREA,
    strctCd: "11",
    strctCdNm: "철근콘크리트구조",
  },
];

export const drawingAreas: BrAreaInfo[] = [
  {
    mgmBldrgstPk: DRAWING_BUILDING_PK,
    exposPubuseGbCd: "1",
    exposPubuseGbCdNm: "전유",
    flrNo: 1,
    flrNoNm: "1층",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "업무시설",
    area: ARCH_AREA,
  },
];

function wrap<T>(items: T[]): ApiListResponse<T> {
  return { items, totalCount: items.length, pageNo: 1, numOfRows: items.length };
}

const DRAWING_RESPONSES: Record<string, ApiListResponse<unknown>> = {
  "/api/bldrgst/title": wrap([drawingTitle]),
  "/api/bldrgst/recap": wrap([drawingRecap]),
  "/api/bldrgst/floors": wrap(drawingFloors),
  "/api/bldrgst/areas": wrap(drawingAreas),
  "/api/bldrgst/basis": wrap([]),
  "/api/bldrgst/jijugu": wrap([]),
};

export function getDrawingResponse(path: string): ApiListResponse<unknown> | null {
  return DRAWING_RESPONSES[path] ?? null;
}

/** Skip VWorld — a drawing-origin twin has no cadastral parcel yet. */
export function getDrawingFootprintResult(
  address: string | undefined,
): { polygon: null; error: null } | null {
  if (address !== DRAWING_ADDRESS) return null;
  return { polygon: null, error: null };
}
