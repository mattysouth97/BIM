/**
 * 별표1 지역별 건축물 부위의 열관류율표 — regulatory U-value ceilings.
 *
 * Source of every number: the official 별표1 attachment of
 * 건축물의 에너지절약설계기준 (국토교통부고시 제2025-738호, 시행 2025-12-31),
 * fetched from law.go.kr. Traceability row STD-SAVING in
 * docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md — do not edit a value
 * here without updating that ledger.
 *
 * The 시도→region allocation in `insulationRegionForSido` is the 별표1
 * footnote structure; the sub-provincial exception lists (강원 영동 6개 시군,
 * 경기 북부 8개 시군 등) are training-knowledge reconstructions of that
 * footnote and are marked as such — a lookup that lands on an exception
 * list reports `regionBasis: "sigungu_exception"` so the UI can show the
 * lower confidence.
 */

export type InsulationRegion = "jungbu1" | "jungbu2" | "nambu" | "jeju";

export const INSULATION_REGION_LABEL_KO: Record<InsulationRegion, string> = {
  jungbu1: "중부1지역",
  jungbu2: "중부2지역",
  nambu: "남부지역",
  jeju: "제주도",
};

/** Envelope element categories of 별표1. */
export type RegulatedElement =
  | "exterior_wall"
  | "roof"
  | "lowest_floor_heated"
  | "lowest_floor_unheated"
  | "interfloor_heated"
  | "window"
  | "door"
  | "apartment_entrance_door";

/** 외기에 직접 면하는 경우 vs 간접 면하는 경우. */
export type ExposureKind = "direct" | "indirect";

type FourRegions = readonly [number, number, number, number]; // 중부1, 중부2, 남부, 제주

const R = (jungbu1: number, jungbu2: number, nambu: number, jeju: number): FourRegions =>
  [jungbu1, jungbu2, nambu, jeju] as const;

/** 별표1 rows, W/m²K. `null` table entries mean the row does not vary by that axis. */
const TABLE: Readonly<
  Record<
    RegulatedElement,
    Readonly<
      Partial<
        Record<
          ExposureKind,
          Readonly<{ residential?: FourRegions; nonResidential?: FourRegions; any?: FourRegions }>
        >
      >
    >
  >
> = {
  exterior_wall: {
    direct: { residential: R(0.15, 0.17, 0.22, 0.29), nonResidential: R(0.17, 0.24, 0.32, 0.41) },
    indirect: { residential: R(0.21, 0.24, 0.31, 0.41), nonResidential: R(0.24, 0.34, 0.45, 0.56) },
  },
  roof: {
    direct: { any: R(0.15, 0.15, 0.18, 0.25) },
    indirect: { any: R(0.21, 0.21, 0.26, 0.35) },
  },
  lowest_floor_heated: {
    direct: { any: R(0.15, 0.17, 0.22, 0.29) },
    indirect: { any: R(0.21, 0.24, 0.31, 0.41) },
  },
  lowest_floor_unheated: {
    direct: { any: R(0.17, 0.2, 0.25, 0.33) },
    indirect: { any: R(0.24, 0.29, 0.35, 0.47) },
  },
  interfloor_heated: {
    // 바닥난방인 층간바닥 — one national value.
    direct: { any: R(0.81, 0.81, 0.81, 0.81) },
    indirect: { any: R(0.81, 0.81, 0.81, 0.81) },
  },
  window: {
    direct: { residential: R(0.9, 1.0, 1.2, 1.6), nonResidential: R(1.3, 1.5, 1.8, 2.2) },
    indirect: { residential: R(1.3, 1.5, 1.7, 2.0), nonResidential: R(1.6, 1.9, 2.2, 2.8) },
  },
  door: {
    // 공동주택 외 문; 공동주택의 문은 창과 같은 값을 적용.
    direct: { residential: R(0.9, 1.0, 1.2, 1.6), nonResidential: R(1.5, 1.5, 1.5, 1.5) },
    indirect: { residential: R(1.3, 1.5, 1.7, 2.0), nonResidential: R(1.9, 1.9, 1.9, 1.9) },
  },
  apartment_entrance_door: {
    direct: { any: R(1.4, 1.4, 1.4, 1.4) },
    indirect: { any: R(1.8, 1.8, 1.8, 1.8) },
  },
};

const REGION_INDEX: Record<InsulationRegion, 0 | 1 | 2 | 3> = {
  jungbu1: 0,
  jungbu2: 1,
  nambu: 2,
  jeju: 3,
};

export type UValueLimitQuery = Readonly<{
  element: RegulatedElement;
  region: InsulationRegion;
  exposure: ExposureKind;
  /** 공동주택 여부 — only walls/windows/doors differ by it. */
  residential: boolean;
}>;

export type UValueLimit = Readonly<{
  limitWPerM2K: number;
  /** Human-readable row identity for the UI / findings. */
  rowKo: string;
  standard: "국토교통부고시 제2025-738호 별표1 (시행 2025-12-31)";
}>;

const ELEMENT_LABEL_KO: Record<RegulatedElement, string> = {
  exterior_wall: "거실의 외벽",
  roof: "최상층 거실의 반자 또는 지붕",
  lowest_floor_heated: "최하층 거실 바닥(바닥난방)",
  lowest_floor_unheated: "최하층 거실 바닥(비난방)",
  interfloor_heated: "바닥난방인 층간바닥",
  window: "창",
  door: "문",
  apartment_entrance_door: "공동주택 세대현관문·방화문",
};

const EXPOSURE_LABEL_KO: Record<ExposureKind, string> = {
  direct: "외기 직접",
  indirect: "외기 간접",
};

/** The regulatory ceiling for one envelope element, or null when 별표1 has no row for it. */
export function uValueLimit(query: UValueLimitQuery): UValueLimit | null {
  const byExposure = TABLE[query.element]?.[query.exposure];
  if (!byExposure) return null;
  const row =
    byExposure.any ?? (query.residential ? byExposure.residential : byExposure.nonResidential);
  if (!row) return null;
  const limit = row[REGION_INDEX[query.region]];
  return {
    limitWPerM2K: limit,
    rowKo: `${ELEMENT_LABEL_KO[query.element]} · ${EXPOSURE_LABEL_KO[query.exposure]} · ${INSULATION_REGION_LABEL_KO[query.region]}`,
    standard: "국토교통부고시 제2025-738호 별표1 (시행 2025-12-31)",
  };
}

export type UValueComplianceCheck = Readonly<{
  compliant: boolean;
  actualWPerM2K: number;
  limit: UValueLimit;
  /** Positive = margin below the ceiling; negative = exceedance. */
  marginWPerM2K: number;
}>;

/** Compare an assembly U-value against its 별표1 ceiling. Lower U is better. */
export function checkUValueCompliance(
  actualWPerM2K: number,
  query: UValueLimitQuery
): UValueComplianceCheck | null {
  const limit = uValueLimit(query);
  if (!limit || !Number.isFinite(actualWPerM2K) || actualWPerM2K <= 0) return null;
  return {
    compliant: actualWPerM2K <= limit.limitWPerM2K,
    actualWPerM2K,
    limit,
    marginWPerM2K: limit.limitWPerM2K - actualWPerM2K,
  };
}

/* ------------------------------------------------------------------ */
/* 시도/시군구 → 지역구분                                              */
/* ------------------------------------------------------------------ */

export type RegionResolution = Readonly<{
  region: InsulationRegion;
  /**
   * "sido" — the whole 시도 falls in one region (verified structure);
   * "sigungu_exception" — decided by a sub-provincial exception list that is
   * a training-knowledge reconstruction of the 별표1 footnote;
   * "address" — parsed from the 시도 name at the start of a road/lot address
   * when no 시군구코드 is available. Both non-"sido" bases surface as lower
   * confidence in the UI.
   */
  regionBasis: "sido" | "sigungu_exception" | "address";
}>;

/** 별표1 footnote: 시도 two-digit prefixes of 시군구코드. */
const SIDO_DEFAULT: Record<string, InsulationRegion> = {
  "11": "jungbu2", // 서울
  "26": "nambu", // 부산
  "27": "nambu", // 대구
  "28": "jungbu2", // 인천
  "29": "nambu", // 광주
  "30": "jungbu2", // 대전
  "31": "nambu", // 울산
  "36": "jungbu2", // 세종
  "41": "jungbu2", // 경기 (북부 일부만 중부1 — exception list)
  "42": "jungbu1", // 강원 (영동 해안만 중부2 — exception list)
  "51": "jungbu1", // 강원 (신코드)
  "43": "jungbu2", // 충북 (제천만 중부1)
  "44": "jungbu2", // 충남
  "45": "jungbu2", // 전북 (구코드)
  "52": "jungbu2", // 전북 (신코드)
  "46": "nambu", // 전남
  "47": "nambu", // 경북 (북부 산간 봉화·청송은 중부1, 일부 내륙은 중부2)
  "48": "nambu", // 경남 (거창·함양은 중부2)
  "50": "jeju", // 제주
};

/**
 * Training-knowledge exception lists (별표1 footnote). Keys are name
 * substrings matched against the 시군구 name because the footnote is written
 * in place names, not codes.
 */
const SIGUNGU_EXCEPTIONS: ReadonlyArray<
  Readonly<{ sidoPrefixes: readonly string[]; nameIncludes: readonly string[]; region: InsulationRegion }>
> = [
  // 강원 영동(해안) → 중부2
  {
    sidoPrefixes: ["42", "51"],
    nameIncludes: ["고성", "속초", "양양", "강릉", "동해", "삼척"],
    region: "jungbu2",
  },
  // 경기 북부 → 중부1
  {
    sidoPrefixes: ["41"],
    nameIncludes: ["연천", "포천", "가평", "남양주", "의정부", "양주", "동두천", "파주"],
    region: "jungbu1",
  },
  // 충북 제천 → 중부1
  { sidoPrefixes: ["43"], nameIncludes: ["제천"], region: "jungbu1" },
  // 경북 봉화·청송 → 중부1
  { sidoPrefixes: ["47"], nameIncludes: ["봉화", "청송"], region: "jungbu1" },
  // 경북 내륙 북부(울진·영덕 제외 지역 일부) → 중부2
  {
    sidoPrefixes: ["47"],
    nameIncludes: ["안동", "영주", "문경", "예천", "의성", "영양", "상주", "구미", "군위", "김천", "칠곡"],
    region: "jungbu2",
  },
  // 경남 거창·함양 → 중부2
  { sidoPrefixes: ["48"], nameIncludes: ["거창", "함양"], region: "jungbu2" },
];

/**
 * Resolve the 별표1 insulation region from a 시군구코드 (5 digits) and,
 * optionally, the 시군구 name (needed only where footnote exceptions exist).
 */
export function resolveInsulationRegion(
  sigunguCode: string,
  sigunguName?: string
): RegionResolution | null {
  const prefix = sigunguCode.slice(0, 2);
  const base = SIDO_DEFAULT[prefix];
  if (!base) return null;
  if (sigunguName) {
    for (const rule of SIGUNGU_EXCEPTIONS) {
      if (
        rule.sidoPrefixes.includes(prefix) &&
        rule.nameIncludes.some((token) => sigunguName.includes(token))
      ) {
        return { region: rule.region, regionBasis: "sigungu_exception" };
      }
    }
  }
  return { region: base, regionBasis: "sido" };
}

/** 시도 name (as it opens a Korean address) → region + code prefixes for the exception pass. */
const SIDO_NAME_RULES: ReadonlyArray<
  Readonly<{ startsWith: string; region: InsulationRegion; prefixes: readonly string[] }>
> = [
  { startsWith: "서울", region: "jungbu2", prefixes: ["11"] },
  { startsWith: "인천", region: "jungbu2", prefixes: ["28"] },
  { startsWith: "대전", region: "jungbu2", prefixes: ["30"] },
  { startsWith: "세종", region: "jungbu2", prefixes: ["36"] },
  { startsWith: "경기", region: "jungbu2", prefixes: ["41"] },
  { startsWith: "충청북", region: "jungbu2", prefixes: ["43"] },
  { startsWith: "충북", region: "jungbu2", prefixes: ["43"] },
  { startsWith: "충청남", region: "jungbu2", prefixes: ["44"] },
  { startsWith: "충남", region: "jungbu2", prefixes: ["44"] },
  { startsWith: "전라북", region: "jungbu2", prefixes: ["45", "52"] },
  { startsWith: "전북", region: "jungbu2", prefixes: ["45", "52"] },
  { startsWith: "강원", region: "jungbu1", prefixes: ["42", "51"] },
  { startsWith: "부산", region: "nambu", prefixes: ["26"] },
  { startsWith: "대구", region: "nambu", prefixes: ["27"] },
  { startsWith: "울산", region: "nambu", prefixes: ["31"] },
  { startsWith: "광주", region: "nambu", prefixes: ["29"] },
  { startsWith: "전라남", region: "nambu", prefixes: ["46"] },
  { startsWith: "전남", region: "nambu", prefixes: ["46"] },
  { startsWith: "경상북", region: "nambu", prefixes: ["47"] },
  { startsWith: "경북", region: "nambu", prefixes: ["47"] },
  { startsWith: "경상남", region: "nambu", prefixes: ["48"] },
  { startsWith: "경남", region: "nambu", prefixes: ["48"] },
  { startsWith: "제주", region: "jeju", prefixes: ["50"] },
];

/**
 * Resolve the region from a road/lot address alone (the 시도 name must open
 * the string, so "경기도 광주시" never collides with 광주광역시). Reported
 * with `regionBasis: "address"` unless a footnote exception matched.
 */
export function resolveInsulationRegionFromAddress(
  address: string
): RegionResolution | null {
  const trimmed = address.trim();
  const rule = SIDO_NAME_RULES.find((candidate) => trimmed.startsWith(candidate.startsWith));
  if (!rule) return null;
  const remainder = trimmed.slice(rule.startsWith.length);
  for (const exception of SIGUNGU_EXCEPTIONS) {
    if (
      exception.sidoPrefixes.some((prefix) => rule.prefixes.includes(prefix)) &&
      exception.nameIncludes.some((token) => remainder.includes(token))
    ) {
      return { region: exception.region, regionBasis: "sigungu_exception" };
    }
  }
  return { region: rule.region, regionBasis: "address" };
}
