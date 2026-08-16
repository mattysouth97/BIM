// ─────────────────────────────────────────────
// API Configuration
// ─────────────────────────────────────────────
export const DATA_GO_KR_BASE_URL =
  "https://apis.data.go.kr/1613000/BldRgstHubService";

export const API_ENDPOINTS = {
  title: "/getBrTitleInfo",
  recap: "/getBrRecapTitleInfo",
  floors: "/getBrFlrOulnInfo",
  areas: "/getBrExposPubuseAreaInfo",
  basis: "/getBrBasisOulnInfo",
  jijugu: "/getBrJijiguInfo",
} as const;

export type EndpointKey = keyof typeof API_ENDPOINTS;

// ─────────────────────────────────────────────
// Building Use Codes (주용도코드)
// ─────────────────────────────────────────────
export const USE_CODES: Record<string, { ko: string; en: string }> = {
  "01000": { ko: "단독주택", en: "Single House" },
  "02000": { ko: "공동주택", en: "Apartment" },
  "03000": { ko: "제1종 근린생활시설", en: "Neighborhood Facility I" },
  "04000": { ko: "제2종 근린생활시설", en: "Neighborhood Facility II" },
  "05000": { ko: "문화및집회시설", en: "Assembly" },
  "06000": { ko: "종교시설", en: "Religious" },
  "07000": { ko: "판매시설", en: "Retail" },
  "08000": { ko: "운수시설", en: "Transport" },
  "09000": { ko: "의료시설", en: "Medical" },
  "10000": { ko: "교육연구시설", en: "Education" },
  "11000": { ko: "노유자시설", en: "Elderly/Child Care" },
  "12000": { ko: "수련시설", en: "Training" },
  "13000": { ko: "운동시설", en: "Sports" },
  "14000": { ko: "업무시설", en: "Office" },
  "15000": { ko: "숙박시설", en: "Lodging" },
  "16000": { ko: "위락시설", en: "Entertainment" },
  "17000": { ko: "공장", en: "Factory" },
  "18000": { ko: "창고시설", en: "Warehouse" },
  "19000": { ko: "위험물저장및처리시설", en: "Hazardous Storage" },
  "20000": { ko: "자동차관련시설", en: "Automotive" },
  "21000": { ko: "동물및식물관련시설", en: "Animal/Plant" },
  "22000": { ko: "자원순환관련시설", en: "Recycling" },
  "23000": { ko: "교정및군사시설", en: "Correctional/Military" },
  "24000": { ko: "방송통신시설", en: "Broadcasting" },
  "25000": { ko: "발전시설", en: "Power Generation" },
  "26000": { ko: "묘지관련시설", en: "Cemetery" },
  "27000": { ko: "관광휴게시설", en: "Tourism/Rest" },
  "28000": { ko: "장례시설", en: "Funeral" },
  "29000": { ko: "야영장시설", en: "Camping" },
};

/** Ledger noun for a 주용도코드. Never return the raw code when a name exists. */
export function formatUseTypeLabel(
  code: string | undefined,
  lang: "ko" | "en" = "ko",
): string {
  if (!code) return lang === "ko" ? "미상" : "Unknown";
  const entry = USE_CODES[code];
  if (entry) return lang === "ko" ? entry.ko : entry.en;
  return code;
}

// Common filter options for search
export const SEARCH_USE_FILTERS = [
  { code: "17000", ko: "공장", en: "Factory" },
  { code: "18000", ko: "창고시설", en: "Warehouse" },
  { code: "14000", ko: "업무시설", en: "Office" },
  { code: "02000", ko: "공동주택", en: "Apartment" },
  { code: "01000", ko: "단독주택", en: "Single House" },
  { code: "07000", ko: "판매시설", en: "Retail" },
  { code: "10000", ko: "교육연구시설", en: "Education" },
  { code: "09000", ko: "의료시설", en: "Medical" },
];

// ─────────────────────────────────────────────
// Structure Codes (구조코드)
// ─────────────────────────────────────────────
export const STRUCTURE_CODES: Record<string, { ko: string; en: string }> = {
  "11": { ko: "철근콘크리트구조", en: "Reinforced Concrete (RC)" },
  "12": { ko: "철골철근콘크리트구조", en: "Steel RC (SRC)" },
  "13": { ko: "철골구조", en: "Steel Frame" },
  "14": { ko: "프리캐스트콘크리트구조", en: "Precast Concrete" },
  "15": { ko: "목구조", en: "Timber" },
  "21": { ko: "벽돌구조", en: "Brick" },
  "22": { ko: "블록구조", en: "Block" },
  "23": { ko: "석구조", en: "Stone" },
  "24": { ko: "조적구조", en: "Masonry" },
  "25": { ko: "기타조적", en: "Other Masonry" },
};

// ─────────────────────────────────────────────
// Roof Codes (지붕코드)
// ─────────────────────────────────────────────
export const ROOF_CODES: Record<string, { ko: string; en: string }> = {
  "1": { ko: "평지붕", en: "Flat Roof" },
  "2": { ko: "박공지붕", en: "Gable Roof" },
  "3": { ko: "기타지붕", en: "Other Roof" },
};

// ─────────────────────────────────────────────
// Demo mode (데모모드)
// ─────────────────────────────────────────────

/** Reserved URL slug for the bundled demo building: /building/demo */
export const DEMO_BUILDING_ID = "demo";

/** mgmBldrgstPk carried by every demo fixture row — lets the UI label sample data */
export const DEMO_BUILDING_PK = "DEMO-00000-00000";

/**
 * Sentinel ledger params for the demo building. No real 시군구/법정동 uses
 * code 00000, so the sentinel can never collide with a live record.
 * api-client short-circuits requests carrying both sentinel codes to the
 * bundled fixtures in src/lib/demo/demo-building.ts — no network, no key.
 */
export const DEMO_BUILDING_PARAMS = {
  sigunguCd: "00000",
  bjdongCd: "00000",
  platGbCd: "0",
  bun: "0000",
  ji: "0000",
};

export function isDemoParams(params: {
  sigunguCd?: string;
  bjdongCd?: string;
}): boolean {
  return (
    params.sigunguCd === DEMO_BUILDING_PARAMS.sigunguCd &&
    params.bjdongCd === DEMO_BUILDING_PARAMS.bjdongCd
  );
}

/** Reserved URL slug for a drawing-origin twin: /building/drawing */
export const DRAWING_BUILDING_ID = "drawing";

/** mgmBldrgstPk for the blank drawing-origin fixture — never the demo tower. */
export const DRAWING_BUILDING_PK = "DRAW-00000-00000";

/**
 * Sentinel params for a CAD/drawing start. Shares the unused 00000 시군구
 * but a different 법정동 so it cannot collide with the demo office fixture.
 */
export const DRAWING_BUILDING_PARAMS = {
  sigunguCd: "00000",
  bjdongCd: "00001",
  platGbCd: "0",
  bun: "0000",
  ji: "0000",
};

export function isDrawingParams(params: {
  sigunguCd?: string;
  bjdongCd?: string;
}): boolean {
  return (
    params.sigunguCd === DRAWING_BUILDING_PARAMS.sigunguCd &&
    params.bjdongCd === DRAWING_BUILDING_PARAMS.bjdongCd
  );
}

// ─────────────────────────────────────────────
// Building ID encoding
// ─────────────────────────────────────────────
export function encodeBuildingId(
  sigunguCd: string,
  bjdongCd: string,
  platGbCd: string,
  bun: string,
  ji: string
): string {
  return `${sigunguCd}-${bjdongCd}-${platGbCd}-${bun}-${ji}`;
}

export function decodeBuildingId(id: string) {
  if (id === DEMO_BUILDING_ID) return { ...DEMO_BUILDING_PARAMS };
  if (id === DRAWING_BUILDING_ID) return { ...DRAWING_BUILDING_PARAMS };
  const [sigunguCd, bjdongCd, platGbCd, bun, ji] = id.split("-");
  return { sigunguCd, bjdongCd, platGbCd, bun, ji };
}

// ─────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────
export function formatArea(area: number | string | undefined): string {
  if (area === undefined || area === null || area === "-") return "-";
  const num = typeof area === "string" ? parseFloat(area) : area;
  if (isNaN(num) || num === 0) return "-";
  return num.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + " m²";
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr || dateStr === "-" || dateStr.trim() === "" || dateStr.length < 8) return "-";
  // API returns YYYYMMDD format
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

export function formatPercent(value: number | string | undefined): string {
  if (value === undefined || value === null || value === "-") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return "-";
  return num.toFixed(2) + "%";
}
