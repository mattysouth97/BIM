// Phase 01 (D-17/D-18): resolve climate and solar together at the payload boundary.
// Pure functions — no React, no stores.
import { REGIONAL_CLIMATE, SEOUL_CLIMATE, type SummerDesignTempSource } from './climate-tables';
import { REGIONAL_IRRADIANCE } from '@/lib/retrofit/solar-potential';

export const SIDO_TOKENS: Readonly<Record<string, Readonly<{ token: string; ko: string }>>> =
  Object.freeze({
    "11": { token: "Seoul", ko: "서울특별시" },
    "26": { token: "Busan", ko: "부산광역시" },
    "27": { token: "Daegu", ko: "대구광역시" },
    "28": { token: "Incheon", ko: "인천광역시" },
    "29": { token: "Gwangju", ko: "광주광역시" },
    "30": { token: "Daejeon", ko: "대전광역시" },
    "31": { token: "Ulsan", ko: "울산광역시" },
    "36": { token: "Sejong", ko: "세종특별자치시" },
    "41": { token: "Gyeonggi", ko: "경기도" },
    "43": { token: "Chungbuk", ko: "충청북도" },
    "44": { token: "Chungnam", ko: "충청남도" },
    "45": { token: "Jeonbuk", ko: "전라북도" },
    "52": { token: "Jeonbuk", ko: "전라북도" },
    "46": { token: "Jeonnam", ko: "전라남도" },
    "47": { token: "Gyeongbuk", ko: "경상북도" },
    "48": { token: "Gyeongnam", ko: "경상남도" },
    "50": { token: "Jeju", ko: "제주특별자치도" },
    "51": { token: "Gangwon", ko: "강원특별자치도" },
  });

/** Address fallback, in the same order the adapter itself scans. */
export const ADDRESS_TOKENS: readonly (readonly [string, string])[] = Object.freeze([
  ["서울", "11"], ["부산", "26"], ["대구", "27"], ["인천", "28"],
  ["광주", "29"], ["대전", "30"], ["울산", "31"], ["세종", "36"],
  ["경기", "41"], ["충북", "43"], ["충청북", "43"], ["충남", "44"],
  ["충청남", "44"], ["전북", "52"], ["전라북", "52"], ["전남", "46"],
  ["전라남", "46"], ["경북", "47"], ["경상북", "47"], ["경남", "48"],
  ["경상남", "48"], ["제주", "50"], ["강원", "51"],
]);


export interface ClimateRegionInput { sigunguCd?: string; platPlcNm?: string; newPlatPlc?: string }
export type ClimateRegion = Readonly<{
  sidoCode: string; token: string; ko: string; via: 'sigunguCd' | 'address';
  hdd: number; cdd: number; winterDesignTemp: number; summerDesignTemp: number;
  summerDesignTempSource: SummerDesignTempSource; summerDesignTempCitation: string | null;
  coolingSeasonSolar: number; coolingSeasonSolarBasis: 'derived_from_regional_psh';
  peakSunHours: number;
}>;

export function resolveClimateRegion(input: Readonly<ClimateRegionInput>): ClimateRegion | null {
  const prefix = String(input.sigunguCd ?? '').trim().slice(0, 2);
  const address = `${input.platPlcNm ?? ''} ${input.newPlatPlc ?? ''}`;
  const code = SIDO_TOKENS[prefix] ? prefix : ADDRESS_TOKENS.find(([token]) => address.includes(token))?.[1];
  if (!code) return null;
  const label = SIDO_TOKENS[code];
  const row = REGIONAL_CLIMATE[code];
  const peakSunHours = REGIONAL_IRRADIANCE[label.token.toLowerCase()];
  const seoulHours = REGIONAL_IRRADIANCE.seoul;
  if (!row || !Number.isFinite(peakSunHours) || peakSunHours <= 0 || !Number.isFinite(seoulHours) || seoulHours <= 0) return null;
  const coolingSeasonSolar = SEOUL_CLIMATE.coolingSeasonSolar * peakSunHours / seoulHours;
  if (![row.hdd, row.cdd, row.winterDesignTemp, row.summerDesignTemp, coolingSeasonSolar].every(Number.isFinite)) return null;
  return Object.freeze({
    sidoCode: code, ...label, via: code === prefix ? 'sigunguCd' : 'address',
    ...row, peakSunHours, coolingSeasonSolar, coolingSeasonSolarBasis: 'derived_from_regional_psh',
  });
}
