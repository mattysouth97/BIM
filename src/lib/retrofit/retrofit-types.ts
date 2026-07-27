// src/lib/retrofit/retrofit-types.ts
// Shared types for building retrofit recommendations.

import type { MeasureFinancials, Fuel } from "./economic-model";

export type RetrofitCategory = "hvac" | "lighting" | "envelope" | "renewable";

export interface RetrofitMeasure {
  /** Unique identifier for the measure */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category of retrofit */
  category: RetrofitCategory;
  /** Total installed cost (KRW) — pre-subsidy */
  estimatedCost: number;
  /** Annual energy savings (kWh/yr) */
  annualEnergySaving: number;
  /** Annual cost savings (KRW/yr) — pre-escalation, year-1 prices */
  annualCostSaving: number;
  /** Annual CO2 reduction (tCO2/yr) */
  co2Reduction: number;
  /** Simple payback period (years). Kept as a quick reference; financials.discountedPayback is the audit-grade number. */
  paybackYears: number;
  /** Short description of the recommendation */
  description: string;
  /**
   * Primary fuel whose price escalation drives this measure's saving stream.
   * Optional — if absent, `economic-model.resolveFuel()` infers from id/category.
   */
  fuel?: Fuel;
  /**
   * Mutual-exclusion group. Measures sharing the same group key are
   * alternatives (e.g. boiler upgrade vs heat-pump conversion both replace
   * the heating plant) — the budget knapsack selects AT MOST ONE per group.
   * Absent = independently selectable.
   */
  exclusiveGroup?: string;
  /**
   * Discounted-cash-flow enrichment. Populated by `assembleRetrofitReport`
   * when called with `EconomicAssumptions`. Absent on raw measures emitted
   * by the per-category generators.
   */
  financials?: MeasureFinancials;
}
