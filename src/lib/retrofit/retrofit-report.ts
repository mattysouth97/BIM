// src/lib/retrofit/retrofit-report.ts
// Assembles individual retrofit measures into a prioritized, cumulative report.

import type { RetrofitMeasure } from '@/lib/retrofit/retrofit-types';
import type { EconomicAssumptions } from '@/lib/retrofit/economic-model';
import { computeFinancials } from '@/lib/retrofit/economic-model';
import { dampPortfolioSavings } from '@/lib/retrofit/measure-interactions';

export interface CumulativeSaving {
  measureId: string;
  description: string;
  cumulativeInvestment: number;
  cumulativeAnnualSaving: number;
  /** Years; `null` when cumulative annual cost saving is 0 (no payback claim). */
  cumulativePayback: number | null;
}

export interface RetrofitReport {
  measures: RetrofitMeasure[];
  summary: {
    totalInvestment: number;        // KRW
    totalAnnualSaving: number;      // kWh/year
    totalAnnualCostSaving: number;  // KRW/year
    totalCO2Reduction: number;      // tCO2/year
    /**
     * Years (total cost / total annual cost saving). `null` when total annual
     * cost saving ≤ 0 — never a fabricated 0 ("instant payback") and never
     * Infinity (not JSON-serializable).
     */
    portfolioPayback: number | null;
    /**
     * Sum of per-measure NPV when the report was assembled with
     * EconomicAssumptions. Absent for legacy callers.
     */
    portfolioNpv?: number;
    /** Sum of effective CAPEX (post-subsidy) when assumptions are provided. */
    portfolioEffectiveCapex?: number;
  };
  byCategory: {
    envelope: RetrofitMeasure[];
    hvac: RetrofitMeasure[];
    lighting: RetrofitMeasure[];
    renewable: RetrofitMeasure[];
  };
  cumulativeSavings: CumulativeSaving[]; // ordered by payback (shortest first)
}

/**
 * Assembles all retrofit measures into a prioritized report.
 * Measures are sorted by payback period (shortest first).
 * Cumulative savings show the progressive effect of adopting measures in order.
 *
 * When `assumptions` is provided, each measure is enriched with NPV/IRR/
 * cash-flow via `computeFinancials`, and the summary gains `portfolioNpv` +
 * `portfolioEffectiveCapex`. When omitted, the report falls back to the
 * pre-existing simple-payback view (no NPV, no escalation, no subsidy).
 */
export function assembleRetrofitReport(
  measures: RetrofitMeasure[],
  assumptions?: EconomicAssumptions,
): RetrofitReport {
  // Enrich with financials when assumptions are provided.
  const enriched: RetrofitMeasure[] = assumptions
    ? measures.map((m) => ({ ...m, financials: computeFinancials(m, assumptions) }))
    : measures;

  measures = enriched;
  // Sort by payback, shortest first
  const sorted = [...measures].sort((a, b) => a.paybackYears - b.paybackYears);

  // Group by category
  const byCategory: RetrofitReport['byCategory'] = {
    envelope: sorted.filter((m) => m.category === 'envelope'),
    hvac: sorted.filter((m) => m.category === 'hvac'),
    lighting: sorted.filter((m) => m.category === 'lighting'),
    renewable: sorted.filter((m) => m.category === 'renewable'),
  };

  // Portfolio summary — P1-01: totals are DAMPED for overlapping
  // heating-demand measures (envelope ↔ HRV/boiler). Per-measure fields keep
  // their generated semantics; only these aggregates are damped.
  const damped = dampPortfolioSavings(sorted);
  const totalInvestment = sorted.reduce((sum, m) => sum + m.estimatedCost, 0);
  const totalAnnualSaving = damped.totalAnnualSaving;
  const totalAnnualCostSaving = damped.totalAnnualCostSaving;
  const totalCO2Reduction = damped.totalCO2Reduction;
  const portfolioPayback =
    totalAnnualCostSaving > 0 ? totalInvestment / totalAnnualCostSaving : null;

  // Cumulative savings: running totals ordered by payback (display order),
  // using the per-measure DAMPED values (damping attributed in physical
  // order envelope → hvac by the helper, independent of display order).
  let runCost = 0;
  let runSaving = 0;
  const cumulativeSavings: CumulativeSaving[] = sorted.map((m) => {
    const dampedEntry = damped.dampedByMeasureId.get(m.id);
    runCost += m.estimatedCost;
    runSaving += dampedEntry?.cost ?? m.annualCostSaving;
    const cumulativePayback = runSaving > 0 ? runCost / runSaving : null;
    return {
      measureId: m.id,
      description: m.description,
      cumulativeInvestment: runCost,
      cumulativeAnnualSaving: runSaving,
      cumulativePayback,
    };
  });

  // Optional NPV / effective-capex aggregation when financials are present.
  let portfolioNpv: number | undefined;
  let portfolioEffectiveCapex: number | undefined;
  if (sorted.length > 0 && sorted[0].financials) {
    portfolioNpv = 0;
    portfolioEffectiveCapex = 0;
    for (const m of sorted) {
      if (!m.financials) continue;
      portfolioNpv += m.financials.npv;
      portfolioEffectiveCapex += m.financials.effectiveCapex;
    }
  }

  return {
    measures: sorted,
    summary: {
      totalInvestment,
      totalAnnualSaving,
      totalAnnualCostSaving,
      totalCO2Reduction,
      portfolioPayback,
      ...(portfolioNpv !== undefined ? { portfolioNpv } : {}),
      ...(portfolioEffectiveCapex !== undefined ? { portfolioEffectiveCapex } : {}),
    },
    byCategory,
    cumulativeSavings,
  };
}
