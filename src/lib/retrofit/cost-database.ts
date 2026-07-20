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
 * P1-02 — useful equipment life per measure id (years). Cash flow truncates
 * at `min(lifetimeYears, analysisHorizonYears)`. Values are engineering
 * estimates anchored to the ASHRAE Equipment Life Expectancy table (ASHRAE
 * Handbook — HVAC Applications, Ch. 37 "Owning and Operating Costs") and
 * common manufacturer-rated lives; none is an official Korean standard —
 * labeled honestly per entry.
 */
export const MEASURE_LIFETIMES: Record<string, number> = {
  "lighting-led": 15, // LED fixture rated life ~50k h ÷ 2,500-4,000 h/yr — engineering estimate
  "lighting-led-smart": 15, // controls ≤ fixtures; governed by fixture life — engineering estimate
  "hvac-boiler-upgrade": 15, // ASHRAE: steel water-tube boilers ~24 yr, packaged commercial ~15 yr — conservative
  "hvac-heat-pump": 20, // ASHRAE: air-to-air heat pumps ~15 yr; modern VRF-class units ~20 — engineering estimate
  "hvac-hrv": 15, // ASHRAE: heat-recovery ventilators/air-side economizers ~15 yr
  "envelope-wall-insulation": 30, // insulation outlives the 20-yr horizon ⇒ intentionally no truncation
  "envelope-roof-insulation": 30, // same — no truncation at 20 yr
  "envelope-floor-insulation": 30, // same — no truncation at 20 yr
  "envelope-window-replacement": 25, // IGU service life 20-30 yr — engineering estimate; ≥ horizon ⇒ no truncation
  "solar-pv": 25, // panel performance warranty norm (80% @ 25 yr); applies to all solar-pv-<roof> ids
};

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
 *   subsidy               = none — pure unsubsidised analysis by default
 *
 * Use `KOREAN_GR_*` presets below to apply 그린리모델링 program parameters.
 */
export const DEFAULT_ECONOMIC_ASSUMPTIONS: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { ...ENERGY_ESCALATION },
  analysisHorizonYears: 20,
};

// ───────────────────────────────────────────────────────────────────────────
// 그린리모델링 사업 (Green Remodeling Support Project) presets
//
// Sourced from the D₁ research dossier at
// docs/superpowers/research/2026-04-30-green-remodeling.md. The program is
// TWO tracks with different economic effects:
//
//   공공건축물 (public): direct CAPEX subsidy — 50% (Seoul + central govt)
//                         or 70% (other local govt). Applied per-category
//                         to envelope/HVAC/lighting; renewable (solar PV)
//                         is routed through the SEPARATE 신재생에너지 보급
//                         사업 program and NOT subsidized here by default.
//
//   민간건축물 (private): interest-rate buy-down on the retrofit loan, NOT
//                         a CAPEX grant. Drops the effective discount rate
//                         on the financed portion via WACC. Default
//                         debtFraction = 0.7 (typical Korean retrofit LTV).
//                         Tier 1 base = 4.5pp; Tier 3 high-perf = 5.5pp.
//
// 2026 program parameters (program restarted in March 2026 after 2024 hiatus).
// ───────────────────────────────────────────────────────────────────────────

/**
 * 공공건축물 그린리모델링 — 서울특별시 + 중앙·공공 (50% direct subsidy).
 * Applied to envelope/HVAC/lighting. Renewable not auto-subsidized.
 */
export const KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { ...ENERGY_ESCALATION },
  analysisHorizonYears: 20,
  subsidyByCategory: {
    envelope: 0.5,
    hvac: 0.5,
    lighting: 0.5,
    // renewable intentionally absent — separate program (신재생에너지 보급)
  },
};

/**
 * 공공건축물 그린리모델링 — 그 외 지방자치단체 (70% direct subsidy).
 */
export const KOREAN_GR_PUBLIC_LOCAL: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { ...ENERGY_ESCALATION },
  analysisHorizonYears: 20,
  subsidyByCategory: {
    envelope: 0.7,
    hvac: 0.7,
    lighting: 0.7,
  },
};

/**
 * 민간건축물 그린리모델링 — Tier 1 base interest support (4.5pp on 70% LTV).
 *
 * Effective WACC ≈ 0.7 × max(0, 0.055 − 0.045) + 0.3 × 0.05
 *                ≈ 0.007 + 0.015 = 2.2%.
 *
 * Korean commercial retrofit loans run ~5.5% in 2025–2026; 4.5pp support
 * brings the financed-portion rate to ~1%. Equity portion still uses 5%.
 */
export const KOREAN_GR_PRIVATE_BASE: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { ...ENERGY_ESCALATION },
  analysisHorizonYears: 20,
  financingMix: {
    debtFraction: 0.7,
    loanRatePreSubsidy: 0.055,
    interestSupportPp: 0.045,
  },
};

/**
 * 민간건축물 그린리모델링 — Tier 2 interest support (4.0pp on 70% LTV).
 * Triggered by ≥20% energy performance improvement OR window energy
 * grade ≥3 (residential). Note the 2026 program table: Tier 2's rate
 * (4.0pp) is LOWER than the base tier (4.5pp) — the base tier exists to
 * encourage entry-level retrofits below the 20% threshold.
 */
export const KOREAN_GR_PRIVATE_TIER2: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { ...ENERGY_ESCALATION },
  analysisHorizonYears: 20,
  financingMix: {
    debtFraction: 0.7,
    loanRatePreSubsidy: 0.055,
    interestSupportPp: 0.04,
  },
};

/**
 * 민간건축물 그린리모델링 — Tier 3 high-performance interest support
 * (5.5pp on 70% LTV). Triggered by ≥30% energy improvement OR vulnerable
 * household status (low-income / multi-child / elderly / newlywed).
 *
 * Effective WACC ≈ 0.7 × 0 + 0.3 × 0.05 = 1.5% — the financed portion
 * effectively becomes interest-free.
 */
export const KOREAN_GR_PRIVATE_HIGH_PERF: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { ...ENERGY_ESCALATION },
  analysisHorizonYears: 20,
  financingMix: {
    debtFraction: 0.7,
    loanRatePreSubsidy: 0.055,
    interestSupportPp: 0.055,
  },
};

/** Map preset names to assumptions for the UI track selector. */
export const KOREAN_GR_PRESETS = {
  none: DEFAULT_ECONOMIC_ASSUMPTIONS,
  "public-seoul-or-central": KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL,
  "public-local": KOREAN_GR_PUBLIC_LOCAL,
  "private-base": KOREAN_GR_PRIVATE_BASE,
  "private-tier2": KOREAN_GR_PRIVATE_TIER2,
  "private-high-perf": KOREAN_GR_PRIVATE_HIGH_PERF,
} as const;

export type ProgramTrack = keyof typeof KOREAN_GR_PRESETS;

/**
 * D₂.5 — suggest the private-track tier from the scenario's energy
 * performance improvement vs baseline (dossier §6):
 *
 *   ≥30% → Tier 3 (5.5pp), ≥20% → Tier 2 (4.0pp), else base (4.5pp).
 *
 * This is a SUGGESTION for the UI, never an auto-switch: track choice
 * stays with the user (public vs private depends on ownership we don't
 * have in the building record, and tier eligibility has non-energy
 * criteria — window grade, household status — we can't see).
 */
export function suggestPrivateTrack(improvementFraction: number): ProgramTrack {
  if (!Number.isFinite(improvementFraction) || improvementFraction < 0) {
    return "private-base";
  }
  if (improvementFraction >= 0.3) return "private-high-perf";
  if (improvementFraction >= 0.2) return "private-tier2";
  return "private-base";
}

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
