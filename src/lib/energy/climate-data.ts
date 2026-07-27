// src/lib/energy/climate-data.ts
// Climate data for Korean cities — used in heat loss and energy demand calculations.
// HDD base 18°C, CDD base 24°C — BOTH bases must match weather-processor.ts,
// which computes the dynamic replacements from KMA observations.

import type { WeatherSummary } from "./weather-processor";

export interface ClimateData {
  /** Heating Degree Days (base 18°C, K·day) */
  hdd: number;
  /** Cooling Degree Days (base 24°C, K·day) */
  cdd: number;
  /** Winter design temperature (°C) */
  winterDesignTemp: number;
  /** Summer design temperature (°C) */
  summerDesignTemp: number;
  /** Indoor heating setpoint (°C) */
  indoorTemp: number;
  /** Indoor cooling setpoint (°C) */
  indoorCoolTemp: number;
  /** Cooling-season solar irradiation on vertical glazing, orientation-averaged (kWh/m²·season) */
  coolingSeasonSolar: number;
}

export const SEOUL_CLIMATE: ClimateData = {
  hdd: 2700,
  cdd: 220,
  winterDesignTemp: -11.3,
  summerDesignTemp: 33.6,
  indoorTemp: 20,
  indoorCoolTemp: 26,
  coolingSeasonSolar: 350,
};

/**
 * Regional HDD/CDD and winter design temperature keyed by 2-digit sido prefix.
 * HDD base 18°C (KMA normals). CDD base 24°C — note these are much smaller
 * than the base-18 cooling values often quoted; they MUST stay consistent
 * with weather-processor.ts which computes observed CDD at base 24.
 * Design temps: 난방 설계 외기온도 (approximate KS values per region).
 */
export const REGIONAL_CLIMATE: Record<
  string,
  { hdd: number; cdd: number; winterDesignTemp: number }
> = {
  "11": { hdd: 2700, cdd: 220, winterDesignTemp: -11.3 }, // Seoul
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

/**
 * Get climate data for a Korean region.
 * Accepts an optional sigunguCd (법정동 code) to look up regional HDD/CDD and
 * winter design temperature. Falls back to Seoul for unknown regions.
 *
 * When dynamicWeather has dataCompleteness >= 0.9, observed HDD/CDD replace
 * the static table values (same degree-day bases on both sides).
 */
export function getClimateData(
  sigunguCd?: string,
  dynamicWeather?: WeatherSummary,
): ClimateData {
  let hdd = SEOUL_CLIMATE.hdd;
  let cdd = SEOUL_CLIMATE.cdd;
  let winterDesignTemp = SEOUL_CLIMATE.winterDesignTemp;

  if (sigunguCd) {
    const regional = REGIONAL_CLIMATE[sigunguCd.slice(0, 2)];
    if (regional) {
      hdd = regional.hdd;
      cdd = regional.cdd;
      winterDesignTemp = regional.winterDesignTemp;
    }
  }

  // Override with dynamic observed data when completeness is sufficient
  if (dynamicWeather && dynamicWeather.dataCompleteness >= 0.9) {
    hdd = dynamicWeather.hdd;
    cdd = dynamicWeather.cdd;
  }

  return {
    hdd,
    cdd,
    winterDesignTemp,
    summerDesignTemp: SEOUL_CLIMATE.summerDesignTemp,
    indoorTemp: SEOUL_CLIMATE.indoorTemp,
    indoorCoolTemp: SEOUL_CLIMATE.indoorCoolTemp,
    coolingSeasonSolar: SEOUL_CLIMATE.coolingSeasonSolar,
  };
}
