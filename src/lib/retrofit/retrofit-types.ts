// src/lib/retrofit/retrofit-types.ts
// Shared types for building retrofit recommendations.

import type { MeasureFinancials, Fuel, EscalationComponent } from "./economic-model";

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
   * P1-01 — alias of exclusiveGroup used by pivot-side tests and generators.
   * `selectMeasuresForBudget` treats `conflictGroup ?? exclusiveGroup`.
   */
  conflictGroup?: string;
  /**
   * P1-02 — useful equipment life in years; cash flow truncates at
   * `min(lifetimeYears, analysisHorizonYears)`. Absent ⇒ full horizon
   * (legacy behavior for external/custom measures).
   */
  lifetimeYears?: number;
  /**
   * P2-10 (c)/(e) — per-fuel saving breakdown for measures whose cash flow
   * blends streams that escalate differently (heat-pump gas-saved vs
   * electricity-spent; solar self-consumption vs fixed feed-in tariff, with
   * panel degradation). When present, `projectCashFlow` escalates each
   * component independently and ignores the single-fuel path for this measure.
   * The scalar `annualCostSaving` remains the year-1 sum for display/knapsack.
   */
  escalationComponents?: EscalationComponent[];
  /**
   * Discounted-cash-flow enrichment. Populated by `assembleRetrofitReport`
   * when called with `EconomicAssumptions`. Absent on raw measures emitted
   * by the per-category generators.
   */
  financials?: MeasureFinancials;
}
