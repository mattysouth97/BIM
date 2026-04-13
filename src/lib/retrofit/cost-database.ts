// src/lib/retrofit/cost-database.ts
// Korean energy price constants and CO2 emission factors for retrofit calculations.

/** KICT 2024 unit cost estimates for envelope retrofit measures */
export const RETROFIT_COSTS = {
  windowReplacement: { perM2: 350000, unit: 'KRW/m2', source: 'KICT 2024' },
  wallInsulation: { perM2: 120000, unit: 'KRW/m2', source: 'KICT 2024' },
  roofInsulation: { perM2: 95000, unit: 'KRW/m2', source: 'KICT 2024' },
  floorInsulation: { perM2: 85000, unit: 'KRW/m2', source: 'KICT 2024' },
  airTightness: { perM2: 45000, unit: 'KRW/m2', source: 'KICT 2024' },
} as const;

/** Electricity price (KRW/kWh) — Korean commercial rate 2024 */
export const ENERGY_PRICES = {
  /** KRW per kWh, electricity (commercial) */
  electricity: 140,
  /** KRW per kWh, district heating */
  districtHeating: 90,
  /** KRW per kWh, natural gas (converted from m³) */
  gas: 75,
} as const;

/** CO2 emission factors (tCO2/MWh) */
export const CO2_FACTORS = {
  /** Korean national grid emission factor 2023 */
  electricity: 0.4594,
  /** Natural gas emission factor */
  gas: 0.2018,
  /** District heating emission factor */
  districtHeating: 0.3200,
} as const;
