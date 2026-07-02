// src/lib/energy/climate-data.ts
// Climate data for Korean cities — used in heat loss and energy demand calculations.

import type { WeatherSummary } from "./weather-processor";

export interface ClimateData {
  /** Heating Degree Days (base 18°C) */
  hdd: number;
  /** Cooling Degree Days (base 24°C) */
  cdd: number;
  /** Winter design temperature (°C) */
  winterDesignTemp: number;
  /** Summer design temperature (°C) */
  summerDesignTemp: number;
  /** Indoor heating setpoint (°C) */
  indoorTemp: number;
  /** Indoor cooling setpoint (°C) */
  indoorCoolTemp: number;
}

export const SEOUL_CLIMATE: ClimateData = {
  hdd: 2700,
  cdd: 600,
  winterDesignTemp: -11.3,
  summerDesignTemp: 33.6,
  indoorTemp: 20,
  indoorCoolTemp: 26,
};

/**
 * Regional HDD/CDD lookup keyed by 2-digit sido code prefix.
 * Source: KMA (Korea Meteorological Administration) approximate values.
 * Design temps and indoor setpoints vary less regionally — use Seoul values as defaults.
 */
export const REGIONAL_CLIMATE: Record<string, { hdd: number; cdd: number }> = {
  "11": { hdd: 2700, cdd: 600 },  // Seoul
  "26": { hdd: 1900, cdd: 750 },  // Busan
  "27": { hdd: 2200, cdd: 800 },  // Daegu
  "28": { hdd: 2750, cdd: 550 },  // Incheon
  "29": { hdd: 2150, cdd: 700 },  // Gwangju
  "30": { hdd: 2400, cdd: 650 },  // Daejeon
  "31": { hdd: 2050, cdd: 700 },  // Ulsan
  "36": { hdd: 2450, cdd: 650 },  // Sejong
  "41": { hdd: 2750, cdd: 580 },  // Gyeonggi
  "43": { hdd: 2800, cdd: 620 },  // Chungbuk
  "44": { hdd: 2600, cdd: 630 },  // Chungnam
  "45": { hdd: 2350, cdd: 680 },  // Jeonbuk (old code)
  "46": { hdd: 2100, cdd: 720 },  // Jeonnam
  "47": { hdd: 2500, cdd: 680 },  // Gyeongbuk
  "48": { hdd: 2100, cdd: 720 },  // Gyeongnam
  "50": { hdd: 1600, cdd: 800 },  // Jeju
  "51": { hdd: 3400, cdd: 450 },  // Gangwon
  "52": { hdd: 2350, cdd: 680 },  // Jeonbuk (new code)
};

/**
 * Get climate data for a Korean region.
 * Accepts an optional sigunguCd (법정동 code) to look up regional HDD/CDD.
 * Extracts the 2-digit sido prefix and returns regional data if found,
 * falling back to Seoul defaults for unknown regions.
 *
 * When dynamicWeather is provided and its dataCompleteness is >= 0.9,
 * the observed HDD/CDD values replace the static table values.
 * This allows callers to transparently use live data when available.
 */
export function getClimateData(
  sigunguCd?: string,
  dynamicWeather?: WeatherSummary,
): ClimateData {
  // Resolve base static values for the region
  let hdd: number;
  let cdd: number;

  if (sigunguCd) {
    const prefix = sigunguCd.slice(0, 2);
    const regional = REGIONAL_CLIMATE[prefix];
    if (regional) {
      hdd = regional.hdd;
      cdd = regional.cdd;
    } else {
      hdd = SEOUL_CLIMATE.hdd;
      cdd = SEOUL_CLIMATE.cdd;
    }
  } else {
    hdd = SEOUL_CLIMATE.hdd;
    cdd = SEOUL_CLIMATE.cdd;
  }

  // Override with dynamic observed data when completeness is sufficient
  if (dynamicWeather && dynamicWeather.dataCompleteness >= 0.9) {
    hdd = dynamicWeather.hdd;
    cdd = dynamicWeather.cdd;
  }

  return {
    hdd,
    cdd,
    winterDesignTemp: SEOUL_CLIMATE.winterDesignTemp,
    summerDesignTemp: SEOUL_CLIMATE.summerDesignTemp,
    indoorTemp: SEOUL_CLIMATE.indoorTemp,
    indoorCoolTemp: SEOUL_CLIMATE.indoorCoolTemp,
  };
}
