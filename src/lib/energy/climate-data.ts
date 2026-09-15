// Shared climate assembly; region resolution refuses unknown places.
// Legacy getClimateData keeps a named Seoul fallback for its existing consumers.
import type { WeatherSummary } from './weather-processor';
import { resolveClimateRegion, type ClimateRegion } from './climate-region';
import { SEOUL_CLIMATE } from './climate-tables';
export { SEOUL_CLIMATE, REGIONAL_CLIMATE } from './climate-tables';

export interface ClimateData {
  /** Heating Degree Days (base 18°C, K·day) */
  hdd: number;
  /** Explicit source description; absent only on legacy caller-authored fixtures. */
  assumptions?: readonly string[];
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


export function climateFromRegion(region: ClimateRegion, dynamicWeather?: WeatherSummary): ClimateData {
  if (![region.hdd, region.cdd, region.winterDesignTemp, region.summerDesignTemp, region.coolingSeasonSolar, region.peakSunHours].every(Number.isFinite) || region.peakSunHours <= 0) {
    throw new RangeError('ClimateRegion contains invalid climate or irradiance values');
  }
  const observed = dynamicWeather && dynamicWeather.dataCompleteness >= 0.9 &&
    Number.isFinite(dynamicWeather.hdd) && Number.isFinite(dynamicWeather.cdd);
  return {
    hdd: observed ? dynamicWeather.hdd : region.hdd,
    cdd: observed ? dynamicWeather.cdd : region.cdd,
    winterDesignTemp: region.winterDesignTemp,
    summerDesignTemp: region.summerDesignTemp,
    // National occupancy setpoint assumptions, not local weather observations.
    indoorTemp: SEOUL_CLIMATE.indoorTemp,
    indoorCoolTemp: SEOUL_CLIMATE.indoorCoolTemp,
    coolingSeasonSolar: region.coolingSeasonSolar,
    assumptions: [
      region.summerDesignTempSource === 'regional'
        ? `Summer design temperature ${region.summerDesignTemp} °C: ${region.token}, official 2017 guide p170; design input, not measured weather.`
        : `Summer design temperature ${region.summerDesignTemp} °C: named legacy Seoul fallback for ${region.token}; regional design value unavailable.`,
      `Cooling-season solar ${region.coolingSeasonSolar} kWh/m²: derived assumption, 350 × regional peak-sun-hours / Seoul peak-sun-hours; not measured glazing irradiation.`,
      'Indoor setpoints 20 °C heating / 26 °C cooling are national occupancy assumptions.',
    ],
  };
}

export function getClimateData(sigunguCd?: string, dynamicWeather?: WeatherSummary): ClimateData {
  const region = resolveClimateRegion({ sigunguCd });
  if (region) return climateFromRegion(region, dynamicWeather);
  const observed = dynamicWeather && dynamicWeather.dataCompleteness >= 0.9 &&
    Number.isFinite(dynamicWeather.hdd) && Number.isFinite(dynamicWeather.cdd);
  return { ...SEOUL_CLIMATE,
    hdd: observed ? dynamicWeather.hdd : SEOUL_CLIMATE.hdd,
    cdd: observed ? dynamicWeather.cdd : SEOUL_CLIMATE.cdd,
    assumptions: ['Region unresolved: legacy Seoul climate fallback; this does not resolve a region for PV.', 'Indoor setpoints 20 °C heating / 26 °C cooling are national occupancy assumptions.'],
  };
}
