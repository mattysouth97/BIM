// src/lib/retrofit/__tests__/retrofit-report.test.ts

import { describe, it, expect } from 'vitest';
import { assembleRetrofitReport } from '../retrofit-report';
import type { RetrofitMeasure } from '@/lib/retrofit/retrofit-types';

function makeMeasure(overrides: Partial<RetrofitMeasure> & { id: string }): RetrofitMeasure {
  return {
    name: 'Test measure',
    category: 'envelope',
    description: 'Test measure description',
    estimatedCost: 1_000_000,
    annualEnergySaving: 1000,
    annualCostSaving: 120_000,
    paybackYears: 8.33,
    co2Reduction: 0.459,
    ...overrides,
  };
}

describe('assembleRetrofitReport', () => {
  it('returns empty report with zero summary when given no measures', () => {
    const report = assembleRetrofitReport([]);

    expect(report.measures).toHaveLength(0);
    expect(report.summary.totalInvestment).toBe(0);
    expect(report.summary.totalAnnualSaving).toBe(0);
    expect(report.summary.totalAnnualCostSaving).toBe(0);
    expect(report.summary.totalCO2Reduction).toBe(0);
    expect(report.summary.portfolioPayback).toBe(0);
    expect(report.byCategory.envelope).toHaveLength(0);
    expect(report.byCategory.hvac).toHaveLength(0);
    expect(report.byCategory.lighting).toHaveLength(0);
    expect(report.byCategory.renewable).toHaveLength(0);
    expect(report.cumulativeSavings).toHaveLength(0);
  });

  it('groups 3 measures from different categories correctly', () => {
    const measures: RetrofitMeasure[] = [
      makeMeasure({ id: 'env-1', category: 'envelope', description: 'Window upgrade', paybackYears: 7 }),
      makeMeasure({ id: 'hvac-1', category: 'hvac', description: 'Heat pump', paybackYears: 5 }),
      makeMeasure({ id: 'light-1', category: 'lighting', description: 'LED retrofit', paybackYears: 3 }),
    ];

    const report = assembleRetrofitReport(measures);

    expect(report.byCategory.envelope).toHaveLength(1);
    expect(report.byCategory.envelope[0].id).toBe('env-1');
    expect(report.byCategory.hvac).toHaveLength(1);
    expect(report.byCategory.hvac[0].id).toBe('hvac-1');
    expect(report.byCategory.lighting).toHaveLength(1);
    expect(report.byCategory.lighting[0].id).toBe('light-1');
    expect(report.byCategory.renewable).toHaveLength(0);
  });

  it('sorts measures by payback ascending', () => {
    const measures: RetrofitMeasure[] = [
      makeMeasure({ id: 'slow', paybackYears: 12 }),
      makeMeasure({ id: 'fast', paybackYears: 2 }),
      makeMeasure({ id: 'mid', paybackYears: 6 }),
    ];

    const report = assembleRetrofitReport(measures);

    expect(report.measures[0].id).toBe('fast');
    expect(report.measures[1].id).toBe('mid');
    expect(report.measures[2].id).toBe('slow');
  });

  it('calculates cumulative savings correctly for ordered measures', () => {
    const measures: RetrofitMeasure[] = [
      makeMeasure({
        id: 'm1',
        paybackYears: 2,
        estimatedCost: 500_000,
        annualCostSaving: 250_000,
        annualEnergySaving: 2000,
      }),
      makeMeasure({
        id: 'm2',
        paybackYears: 5,
        estimatedCost: 1_000_000,
        annualCostSaving: 200_000,
        annualEnergySaving: 1500,
      }),
    ];

    const report = assembleRetrofitReport(measures);
    const cum = report.cumulativeSavings;

    expect(cum).toHaveLength(2);

    // After first measure (shortest payback = m1)
    expect(cum[0].measureId).toBe('m1');
    expect(cum[0].cumulativeInvestment).toBe(500_000);
    expect(cum[0].cumulativeAnnualSaving).toBe(250_000);
    expect(cum[0].cumulativePayback).toBeCloseTo(2, 5);

    // After both measures
    expect(cum[1].measureId).toBe('m2');
    expect(cum[1].cumulativeInvestment).toBe(1_500_000);
    expect(cum[1].cumulativeAnnualSaving).toBe(450_000);
    expect(cum[1].cumulativePayback).toBeCloseTo(1_500_000 / 450_000, 5);
  });

  it('calculates portfolio payback as total cost divided by total annual cost saving', () => {
    const measures: RetrofitMeasure[] = [
      makeMeasure({ id: 'a', estimatedCost: 2_000_000, annualCostSaving: 400_000, paybackYears: 5 }),
      makeMeasure({ id: 'b', estimatedCost: 3_000_000, annualCostSaving: 300_000, paybackYears: 10 }),
    ];

    const report = assembleRetrofitReport(measures);

    expect(report.summary.totalInvestment).toBe(5_000_000);
    expect(report.summary.totalAnnualCostSaving).toBe(700_000);
    expect(report.summary.portfolioPayback).toBeCloseTo(5_000_000 / 700_000, 5);
  });

  it('sums totalAnnualSaving and totalCO2Reduction across all measures', () => {
    const measures: RetrofitMeasure[] = [
      makeMeasure({ id: 'x', annualEnergySaving: 1000, co2Reduction: 0.459, paybackYears: 4 }),
      makeMeasure({ id: 'y', annualEnergySaving: 2000, co2Reduction: 0.918, paybackYears: 6 }),
    ];

    const report = assembleRetrofitReport(measures);

    expect(report.summary.totalAnnualSaving).toBe(3000);
    expect(report.summary.totalCO2Reduction).toBeCloseTo(1.377, 5);
  });

  it('does not mutate the input array order', () => {
    const measures: RetrofitMeasure[] = [
      makeMeasure({ id: 'first-in', paybackYears: 10 }),
      makeMeasure({ id: 'second-in', paybackYears: 2 }),
    ];
    const originalFirst = measures[0].id;

    assembleRetrofitReport(measures);

    // Input array unchanged
    expect(measures[0].id).toBe(originalFirst);
  });
});
