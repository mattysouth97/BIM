// src/lib/energy/climate-data.ts
// Climate data for Korean cities — used in heat loss and energy demand calculations.

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
 * Get climate data for a Korean city.
 * Currently returns Seoul defaults; expandable to other cities later.
 */
export function getClimateData(_city?: string): ClimateData {
  // Future: look up city-specific data from a table
  return SEOUL_CLIMATE;
}
