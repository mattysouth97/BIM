// src/lib/retrofit/cost-database.ts
// Korean energy price constants, CO2 emission factors, and economic
// assumptions for retrofit calculations.

import type { EconomicAssumptions } from "./economic-model";

/** KICT 2024 unit cost estimates for envelope retrofit measures */
export const RETROFIT_COSTS = {
  windowReplacement: { perM2: 350000, unit: 'KRW/m2', source: 'KICT 2024' },
  wallInsulation: { perM2: 120000, unit: 'KRW/m2', source: 'KICT 2024' },
  roofInsulation: { perM2: 95000, unit: 'KRW/m2', source: 'KICT 2024' },
  floorInsulation: { perM2: 85000, unit: 'KRW/m2', source: 'KICT 2024' },
  airTightness: { perM2: 45000, unit: 'KRW/m2', source: 'KICT 2024' },
} as const;

/**
 * Annual nominal energy-price escalation rates for Korean fuels.
 *
 * Sourced from 2020–2024 actuals:
 *   electricity     — KEPCO commercial tariff CAGR 2020–2024 ≈ 5.4%
 *   gas             — KOGAS commercial tariff CAGR 2020–2024 ≈ 3.0%
 *   district heating — KDHC tariff CAGR 2020–2024 ≈ 3.0%
 *
 * These are HISTORICAL averages, not forecasts. Real future escalation may
 * diverge — sensitivity analysis (±2%) is the recommended way to stress-test
 * conclusions that depend heavily on these numbers.
 */
export const ENERGY_ESCALATION = {
  electricity: 0.05,
  gas: 0.03,
  districtHeating: 0.03,
} as const;

/**
 * Default economic assumptions for Korean GX retrofit analysis.
 *
 *   discountRate          = 5%   — KCEM/MOTIE green-retrofit project hurdle
 *   energyEscalation      — historical (see `ENERGY_ESCALATION`)
 *   analysisHorizonYears  = 20   — Korean energy retrofit norm
 *   subsidyRatio          = none — pure unsubsidised analysis by default
 *
 * Override at the call site for project-specific contexts (e.g. apply
 * 그린리모델링 50% to envelope measure IDs when evaluating eligible buildings).
 */
export const DEFAULT_ECONOMIC_ASSUMPTIONS: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { ...ENERGY_ESCALATION },
  analysisHorizonYears: 20,
};

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
