// src/lib/retrofit/retrofit-report.ts
// Assembles individual retrofit measures into a prioritized, cumulative report.

import type { RetrofitMeasure } from '@/lib/retrofit/retrofit-types';

export interface CumulativeSaving {
  measureId: string;
  description: string;
  cumulativeInvestment: number;
  cumulativeAnnualSaving: number;
  cumulativePayback: number;
}

export interface RetrofitReport {
  measures: RetrofitMeasure[];
  summary: {
    totalInvestment: number;        // KRW
    totalAnnualSaving: number;      // kWh/year
    totalAnnualCostSaving: number;  // KRW/year
    totalCO2Reduction: number;      // tCO2/year
    portfolioPayback: number;       // years (total cost / total annual cost saving)
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
 */
export function assembleRetrofitReport(measures: RetrofitMeasure[]): RetrofitReport {
  // Sort by payback, shortest first
  const sorted = [...measures].sort((a, b) => a.paybackYears - b.paybackYears);

  // Group by category
  const byCategory: RetrofitReport['byCategory'] = {
    envelope: sorted.filter((m) => m.category === 'envelope'),
    hvac: sorted.filter((m) => m.category === 'hvac'),
    lighting: sorted.filter((m) => m.category === 'lighting'),
    renewable: sorted.filter((m) => m.category === 'renewable'),
  };

  // Portfolio summary
  const totalInvestment = sorted.reduce((sum, m) => sum + m.estimatedCost, 0);
  const totalAnnualSaving = sorted.reduce((sum, m) => sum + m.annualEnergySaving, 0);
  const totalAnnualCostSaving = sorted.reduce((sum, m) => sum + m.annualCostSaving, 0);
  const totalCO2Reduction = sorted.reduce((sum, m) => sum + m.co2Reduction, 0);
  const portfolioPayback =
    totalAnnualCostSaving > 0 ? totalInvestment / totalAnnualCostSaving : 0;

  // Cumulative savings: running totals ordered by payback
  let runCost = 0;
  let runSaving = 0;
  const cumulativeSavings: CumulativeSaving[] = sorted.map((m) => {
    runCost += m.estimatedCost;
    runSaving += m.annualCostSaving;
    const cumulativePayback = runSaving > 0 ? runCost / runSaving : 0;
    return {
      measureId: m.id,
      description: m.description,
      cumulativeInvestment: runCost,
      cumulativeAnnualSaving: runSaving,
      cumulativePayback,
    };
  });

  return {
    measures: sorted,
    summary: {
      totalInvestment,
      totalAnnualSaving,
      totalAnnualCostSaving,
      totalCO2Reduction,
      portfolioPayback,
    },
    byCategory,
    cumulativeSavings,
  };
}
