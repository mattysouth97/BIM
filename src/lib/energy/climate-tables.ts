// Phase 01: one static climate table, shared by resolver and adapter without an import cycle.
import type { ClimateData } from './climate-data';

export const SEOUL_CLIMATE: ClimateData = {
  hdd: 2700,
  cdd: 220,
  winterDesignTemp: -11.3,
  summerDesignTemp: 33.6,
  indoorTemp: 20,
  indoorCoolTemp: 26,
  coolingSeasonSolar: 350,
};


export const SUMMER_DESIGN_SOURCE = 'https://greentogether.go.kr/ebook/eais_cust_2017/files/basic-html/page170.html';
// Official 2017 guide, p170, cooling DRY-bulb column. These are city values,
// not measured weather and not a claim about the current legal design standard.
// No city-to-province proxy is silently introduced. Seoul's legacy 33.6 remains
// the explicitly named fallback; a resolved Seoul uses the cited 31.2.
const CITY_SUMMER: Readonly<Record<string, number>> = Object.freeze({
  '11': 31.2, '26': 30.7, '27': 33.3, '28': 30.1,
  '29': 31.8, '30': 32.3, '31': 32.2,
});

const BASE_REGIONAL_CLIMATE: Record<string, { hdd: number; cdd: number; winterDesignTemp: number }> = {  "11": { hdd: 2700, cdd: 220, winterDesignTemp: -11.3 }, // Seoul
  "26": { hdd: 1900, cdd: 280, winterDesignTemp: -5.3 },  // Busan
  "27": { hdd: 2200, cdd: 320, winterDesignTemp: -7.6 },  // Daegu
  "28": { hdd: 2750, cdd: 200, winterDesignTemp: -10.4 }, // Incheon
  "29": { hdd: 2150, cdd: 270, winterDesignTemp: -6.6 },  // Gwangju
  "30": { hdd: 2400, cdd: 250, winterDesignTemp: -10.3 }, // Daejeon
  "31": { hdd: 2050, cdd: 260, winterDesignTemp: -7.0 },  // Ulsan
  "36": { hdd: 2450, cdd: 240, winterDesignTemp: -10.3 }, // Sejong
  "41": { hdd: 2750, cdd: 210, winterDesignTemp: -11.3 }, // Gyeonggi
  "43": { hdd: 2800, cdd: 230, winterDesignTemp: -10.9 }, // Chungbuk
  "44": { hdd: 2600, cdd: 240, winterDesignTemp: -9.6 },  // Chungnam
  "45": { hdd: 2350, cdd: 260, winterDesignTemp: -8.7 },  // Jeonbuk (old code)
  "46": { hdd: 2100, cdd: 280, winterDesignTemp: -6.1 },  // Jeonnam
  "47": { hdd: 2500, cdd: 260, winterDesignTemp: -9.0 },  // Gyeongbuk
  "48": { hdd: 2100, cdd: 290, winterDesignTemp: -6.3 },  // Gyeongnam
  "50": { hdd: 1600, cdd: 320, winterDesignTemp: -1.1 },  // Jeju
  "51": { hdd: 3400, cdd: 150, winterDesignTemp: -14.7 }, // Gangwon
  "52": { hdd: 2350, cdd: 260, winterDesignTemp: -8.7 },  // Jeonbuk (new code)
};

export type SummerDesignTempSource = 'regional' | 'national_fallback';
export interface RegionalClimateRow {
  hdd: number; cdd: number; winterDesignTemp: number; summerDesignTemp: number;
  summerDesignTempSource: SummerDesignTempSource;
  summerDesignTempCitation: string | null;
}
// Existing HDD/CDD and winter estimates are retained, not revalidated by the
// new summer-temperature citation. Unlisted provinces and Sejong use fallback.
export const REGIONAL_CLIMATE: Readonly<Record<string, Readonly<RegionalClimateRow>>> = Object.freeze(
  Object.fromEntries(Object.entries(BASE_REGIONAL_CLIMATE).map(([code, row]) => [code, Object.freeze({
    ...row,
    summerDesignTemp: CITY_SUMMER[code] ?? SEOUL_CLIMATE.summerDesignTemp,
    summerDesignTempSource: CITY_SUMMER[code] == null ? 'national_fallback' as const : 'regional' as const,
    summerDesignTempCitation: CITY_SUMMER[code] == null ? null : SUMMER_DESIGN_SOURCE,
  })])),
);
