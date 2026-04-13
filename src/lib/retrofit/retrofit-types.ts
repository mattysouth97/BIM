// src/lib/retrofit/retrofit-types.ts
// Shared types for building retrofit recommendations.

export type RetrofitCategory = "hvac" | "lighting" | "envelope" | "renewable";

export interface RetrofitMeasure {
  /** Unique identifier for the measure */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category of retrofit */
  category: RetrofitCategory;
  /** Total installed cost (KRW) */
  estimatedCost: number;
  /** Annual energy savings (kWh/yr) */
  annualEnergySaving: number;
  /** Annual cost savings (KRW/yr) */
  annualCostSaving: number;
  /** Annual CO2 reduction (tCO2/yr) */
  co2Reduction: number;
  /** Simple payback period (years) */
  paybackYears: number;
  /** Short description of the recommendation */
  description: string;
}
