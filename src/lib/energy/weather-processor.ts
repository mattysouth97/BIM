// src/lib/energy/weather-processor.ts
// Pure functions for computing HDD/CDD from raw KMA ASOS daily weather data.
// Base temperatures follow Korean standard: heating 18.3°C, cooling 24°C.

/** A single day of KMA ASOS daily weather data. */
export interface DailyWeather {
  date: string;
  avgTemp: number;
  maxTemp: number;
  minTemp: number;
}

/**
 * Computed annual weather summary derived from observed daily data.
 * dataCompleteness < 0.9 indicates unreliable data (< 329 days observed).
 */
export interface WeatherSummary {
  year: number;
  /** Heating Degree Days — base 18.3°C (Korean standard) */
  hdd: number;
  /** Cooling Degree Days — base 24°C (Korean standard) */
  cdd: number;
  /** Mean average temperature across all valid days (°C) */
  avgTemp: number;
  /** Fraction of valid days out of 365. Values < 0.9 are considered unreliable. */
  dataCompleteness: number;
}

const HEATING_BASE = 18.3;
const COOLING_BASE = 24.0;

/**
 * Compute HDD, CDD, avgTemp, and dataCompleteness from raw daily weather records.
 *
 * @param days - Array of daily observations. May be empty or partial-year.
 * @param year - The calendar year these observations belong to (used in output).
 */
export function processWeatherData(days: DailyWeather[], year: number): WeatherSummary {
  if (days.length === 0) {
    return { year, hdd: 0, cdd: 0, avgTemp: 0, dataCompleteness: 0 };
  }

  let hdd = 0;
  let cdd = 0;
  let tempSum = 0;

  for (const day of days) {
    const t = day.avgTemp;
    if (t < HEATING_BASE) {
      hdd += HEATING_BASE - t;
    }
    if (t > COOLING_BASE) {
      cdd += t - COOLING_BASE;
    }
    tempSum += t;
  }

  const avgTemp = tempSum / days.length;
  const dataCompleteness = days.length / 365;

  return {
    year,
    hdd: Math.round(hdd * 10) / 10,
    cdd: Math.round(cdd * 10) / 10,
    avgTemp: Math.round(avgTemp * 10) / 10,
    dataCompleteness: Math.round(dataCompleteness * 1000) / 1000,
  };
}
