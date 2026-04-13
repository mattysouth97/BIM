// ─────────────────────────────────────────────
// data.go.kr BldRgstService_v2 API Types
// ─────────────────────────────────────────────

/** Common API response wrapper from data.go.kr */
export interface DataGoKrResponse<T> {
  response: {
    header: {
      resultCode: string;
      resultMsg: string;
    };
    body: {
      items: {
        item: T | T[];
      };
      numOfRows: number;
      pageNo: number;
      totalCount: number;
    };
  };
}

/** getBrTitleInfo — 표제부 (Main title / building overview) */
export interface BrTitleInfo {
  mgmBldrgstPk: string;       // 관리건축물대장PK
  bldNm: string;               // 건물명
  platPlcNm: string;           // 대지위치명 (address)
  newPlatPlc: string;          // 새주소 (new road-name address)
  sigunguCd: string;           // 시군구코드
  bjdongCd: string;            // 법정동코드
  platGbCd: string;            // 대지구분코드 (0=land, 1=mountain)
  bun: string;                 // 번
  ji: string;                  // 지
  mainPurpsCd: string;         // 주용도코드
  mainPurpsCdNm: string;       // 주용도코드명
  etcPurps: string;            // 기타용도
  strctCd: string;             // 구조코드
  strctCdNm: string;           // 구조코드명
  etcStrct: string;            // 기타구조
  grndFlrCnt: number;          // 지상층수
  ugrndFlrCnt: number;         // 지하층수
  totArea: number;             // 연면적 (m²)
  archArea: number;            // 건축면적 (m²)
  platArea: number;            // 대지면적 (m²)
  bcRat: number;               // 건폐율 (%)
  vlRat: number;               // 용적률 (%)
  useAprDay: string;           // 사용승인일
  pmsDay: string;              // 허가일
  stcnsDay: string;            // 착공일
  roofCd: string;              // 지붕코드
  roofCdNm: string;            // 지붕코드명
  heit: number;                // 높이 (m)
  regstrGbCd: string;          // 대장구분코드
  regstrGbCdNm: string;        // 대장구분코드명
  regstrKindCd: string;        // 대장종류코드
  regstrKindCdNm: string;      // 대장종류코드명
}

/** getBrRecapTitleInfo — 총괄표제부 (Recap/summary title) */
export interface BrRecapTitleInfo {
  mgmBldrgstPk: string;
  bldNm: string;
  platPlcNm: string;
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: string;
  bun: string;
  ji: string;
  mainPurpsCdNm: string;
  etcPurps: string;
  hhldCnt: number;             // 세대수
  fmlyCnt: number;             // 가구수
  totArea: number;
  archArea: number;
  platArea: number;
  bcRat: number;
  vlRat: number;
  grndFlrCnt: number;
  ugrndFlrCnt: number;
  useAprDay: string;
  pmsDay: string;
  stcnsDay: string;
  dongCnt: number;             // 동수
}

/** getBrFlrOulnInfo — 층별개요 (Floor outline) */
export interface BrFloorInfo {
  mgmBldrgstPk: string;
  flrNo: number;               // 층번호
  flrNoNm: string;             // 층번호명
  flrGbCd: string;             // 층구분코드
  flrGbCdNm: string;           // 층구분코드명 (지상/지하)
  mainAtchGbCd: string;        // 주부속구분코드
  mainAtchGbCdNm: string;      // 주부속구분코드명
  mainPurpsCd: string;         // 주용도코드
  mainPurpsCdNm: string;       // 주용도코드명
  etcPurps: string;            // 기타용도
  area: number;                // 면적 (m²)
  strctCd: string;             // 구조코드
  strctCdNm: string;           // 구조코드명
}

/** getBrExposPubuseAreaInfo — 전유공용면적 (Exclusive/common area) */
export interface BrAreaInfo {
  mgmBldrgstPk: string;
  exposPubuseGbCd: string;     // 전유공용구분코드
  exposPubuseGbCdNm: string;   // 전유공용구분코드명
  flrNo: number;
  flrNoNm: string;
  mainPurpsCd: string;
  mainPurpsCdNm: string;
  area: number;
}

/** getBrBasisOulnInfo — 기본개요 (Basic outline) */
export interface BrBasisInfo {
  mgmBldrgstPk: string;
  bldNm: string;
  platPlcNm: string;
  sigunguCd: string;
  bjdongCd: string;
  mainPurpsCdNm: string;
  strctCdNm: string;
  grndFlrCnt: number;
  ugrndFlrCnt: number;
  totArea: number;
  archArea: number;
  platArea: number;
  useAprDay: string;
}

/** getBrJijiguInfo — 지역지구구역 (Zone info) */
export interface BrJijiguInfo {
  mgmBldrgstPk: string;
  jijiguCd: string;            // 지역지구코드
  jijiguCdNm: string;          // 지역지구코드명
  etcJijigu: string;           // 기타지역지구
  jijiguGbCd: string;          // 지역지구구분코드
  jijiguGbCdNm: string;        // 지역지구구분코드명
}

// ─────────────────────────────────────────────
// Application-level types
// ─────────────────────────────────────────────

/** Parsed building record for display */
export interface BuildingRecord {
  pk: string;
  name: string;
  address: string;
  useCode: string;
  useName: string;
  structureCode: string;
  structureName: string;
  floorsAbove: number;
  floorsBelow: number;
  totalArea: number;
  buildingArea: number;
  siteArea: number;
  coverageRatio: number;
  floorAreaRatio: number;
  approvalDate: string;
  permitDate: string;
  constructionDate: string;
  roofType: string;
  height: number;
}

/** Floor record for display */
export interface FloorRecord {
  floorNo: number;
  floorName: string;
  floorType: string;
  use: string;
  area: number;
  structure: string;
}

/** Search params for region-based search */
export interface RegionSearchParams {
  sigunguCd: string;
  bjdongCd?: string;
  mainPurpsCd?: string;
  numOfRows?: number;
  pageNo?: number;
}

/** Search params for address-based search */
export interface AddressSearchParams {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd?: string;
  bun?: string;
  ji?: string;
  numOfRows?: number;
  pageNo?: number;
}

/** Composite building ID encoded in URL */
export interface BuildingId {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: string;
  bun: string;
  ji: string;
}

/** Region hierarchy for cascading selects */
export interface Region {
  code: string;
  name: string;
}

export interface RegionHierarchy {
  sido: Region[];
  sigungu: Record<string, Region[]>;   // keyed by sido code
  dong: Record<string, Region[]>;      // keyed by sigungu code
}
