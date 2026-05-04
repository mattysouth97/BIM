// src/lib/retrofit/__tests__/economic-model.test.ts

import { describe, it, expect } from "vitest";
import {
  computeNpv,
  computeIrr,
  computeDiscountedPayback,
  projectCashFlow,
  computeFinancials,
  selectMeasuresForBudget,
  type EconomicAssumptions,
} from "../economic-model";
import type { RetrofitMeasure } from "../retrofit-types";

const ASSUMPTIONS: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { electricity: 0.05, gas: 0.03, districtHeating: 0.03 },
  analysisHorizonYears: 20,
};

function flatAssumptions(rate: number, horizon: number): EconomicAssumptions {
  return {
    discountRate: rate,
    energyEscalation: { electricity: 0, gas: 0, districtHeating: 0 },
    analysisHorizonYears: horizon,
  };
}

function makeMeasure(overrides: Partial<RetrofitMeasure>): RetrofitMeasure {
  return {
    id: "test-measure",
    name: "Test",
    category: "envelope",
    estimatedCost: 10_000_000,
    annualEnergySaving: 5_000,
    annualCostSaving: 1_000_000,
    co2Reduction: 1.0,
    paybackYears: 10,
    description: "Test measure",
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// computeNpv
// ──────────────────────────────────────────────────────────────────────────

describe("computeNpv", () => {
  it("returns -outflow when cash flow is empty", () => {
    expect(computeNpv(100, [], 0.05)).toBeCloseTo(-100, 6);
  });

  it("equals undiscounted sum minus outflow when discount rate is 0", () => {
    expect(computeNpv(100, [50, 50, 50], 0)).toBeCloseTo(50, 6);
  });

  it("matches the known closed-form annuity at 5% over 20 years", () => {
    // PV of ₩1 annuity for 20 years at 5% = (1 - 1.05^-20) / 0.05 = 12.46221...
    const cashFlow = new Array(20).fill(1);
    const pv = computeNpv(0, cashFlow, 0.05);
    expect(pv).toBeCloseTo(12.46221, 4);
  });

  it("is negative when discounted savings can't cover outflow", () => {
    expect(computeNpv(1000, [10, 10, 10], 0.05)).toBeLessThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// computeIrr
// ──────────────────────────────────────────────────────────────────────────

describe("computeIrr", () => {
  it("returns null when total savings can't cover outflow", () => {
    expect(computeIrr(1000, [10, 10, 10])).toBeNull();
  });

  it("returns null for zero/negative outflow (degenerate)", () => {
    expect(computeIrr(0, [100, 100])).toBeNull();
    expect(computeIrr(-50, [100, 100])).toBeNull();
  });

  it("converges on a known monotonic case", () => {
    // ₩1000 outflow, ₩200/yr for 10 years → IRR ≈ 15.10%
    const cashFlow = new Array(10).fill(200);
    const irr = computeIrr(1000, cashFlow);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.151, 2);
  });

  it("makes NPV ≈ 0 at the IRR rate (relative to outflow)", () => {
    const outflow = 5_000_000;
    const cashFlow = new Array(15).fill(700_000);
    const irr = computeIrr(outflow, cashFlow);
    expect(irr).not.toBeNull();
    const npvAtIrr = computeNpv(outflow, cashFlow, irr!);
    // Bisection converges to ~1e-6 in rate space; the resulting NPV gap
    // scales with outflow × horizon. Assert relative tolerance instead of
    // an absolute KRW bound.
    expect(Math.abs(npvAtIrr) / outflow).toBeLessThan(1e-4);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// computeDiscountedPayback
// ──────────────────────────────────────────────────────────────────────────

describe("computeDiscountedPayback", () => {
  it("returns 0 when outflow is 0", () => {
    expect(computeDiscountedPayback(0, [100], 0.05)).toBe(0);
  });

  it("returns Infinity when savings never recover outflow", () => {
    expect(computeDiscountedPayback(1_000_000, [10, 10, 10], 0.05)).toBe(Infinity);
  });

  it("equals the integer year when discounted savings exactly equal outflow at year boundary", () => {
    // Outflow = 100; discount 0%; flow [50, 50] → cumulative 50 (yr1), 100 (yr2)
    expect(computeDiscountedPayback(100, [50, 50], 0)).toBeCloseTo(2, 6);
  });

  it("interpolates within a year when discounted savings cross outflow mid-year", () => {
    // Outflow = 75, discount 0%, flow [50, 50] → covered at year 1 + 25/50 = 1.5
    expect(computeDiscountedPayback(75, [50, 50], 0)).toBeCloseTo(1.5, 6);
  });

  it("is longer than simple payback when discount rate > 0", () => {
    const outflow = 1000;
    const cashFlow = new Array(20).fill(200);
    const simple = outflow / 200; // 5 years undiscounted
    const discounted = computeDiscountedPayback(outflow, cashFlow, 0.10);
    expect(discounted).toBeGreaterThan(simple);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// projectCashFlow — escalation
// ──────────────────────────────────────────────────────────────────────────

describe("projectCashFlow", () => {
  it("year 1 value equals annualCostSaving (no escalation in year 1)", () => {
    const m = makeMeasure({ id: "envelope-wall-insulation", annualCostSaving: 1_000_000 });
    const { cashFlow, resolvedFuel } = projectCashFlow(m, ASSUMPTIONS);
    expect(resolvedFuel).toBe("gas");
    expect(cashFlow[0]).toBeCloseTo(1_000_000, 0);
  });

  it("escalates year-by-year by the resolved fuel rate", () => {
    const m = makeMeasure({ id: "lighting-led", annualCostSaving: 1_000_000 });
    const { cashFlow, resolvedFuel } = projectCashFlow(m, ASSUMPTIONS);
    expect(resolvedFuel).toBe("electricity");
    // Year 1: 1.00, year 2: 1.05, year 3: 1.05^2, ..., year 20: 1.05^19
    expect(cashFlow[0]).toBeCloseTo(1_000_000, 0);
    expect(cashFlow[1]).toBeCloseTo(1_050_000, 0);
    expect(cashFlow[19]).toBeCloseTo(1_000_000 * Math.pow(1.05, 19), 0);
  });

  it("respects an explicit `fuel` override on the measure", () => {
    const m = makeMeasure({ id: "anything", fuel: "districtHeating", annualCostSaving: 1_000_000 });
    const { resolvedFuel } = projectCashFlow(m, ASSUMPTIONS);
    expect(resolvedFuel).toBe("districtHeating");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// computeFinancials integration
// ──────────────────────────────────────────────────────────────────────────

describe("computeFinancials", () => {
  it("produces a coherent financials block for a typical measure", () => {
    const m = makeMeasure({
      id: "envelope-wall-insulation",
      estimatedCost: 10_000_000,
      annualCostSaving: 1_500_000,
    });
    const fin = computeFinancials(m, ASSUMPTIONS);
    expect(fin.cashFlow).toHaveLength(20);
    expect(fin.effectiveCapex).toBe(10_000_000); // no subsidy
    expect(fin.npv).toBeGreaterThan(0);
    expect(fin.irr).not.toBeNull();
    expect(fin.discountedPayback).toBeGreaterThan(0);
    expect(fin.discountedPayback).toBeLessThan(20);
    expect(fin.resolvedFuel).toBe("gas");
  });

  it("applies subsidyRatio to effectiveCapex", () => {
    const m = makeMeasure({ id: "envelope-wall-insulation", estimatedCost: 10_000_000 });
    const subsidised = computeFinancials(m, {
      ...ASSUMPTIONS,
      subsidyRatio: { "envelope-wall-insulation": 0.5 },
    });
    expect(subsidised.effectiveCapex).toBeCloseTo(5_000_000, 0);
    expect(subsidised.npv).toBeGreaterThan(computeFinancials(m, ASSUMPTIONS).npv);
  });

  it("returns null IRR for a money-losing measure", () => {
    const m = makeMeasure({ estimatedCost: 100_000_000, annualCostSaving: 100_000 });
    const fin = computeFinancials(m, flatAssumptions(0.05, 20));
    expect(fin.irr).toBeNull();
    expect(fin.discountedPayback).toBe(Infinity);
    expect(fin.npv).toBeLessThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// selectMeasuresForBudget — knapsack
// ──────────────────────────────────────────────────────────────────────────

describe("selectMeasuresForBudget", () => {
  it("returns empty selection for zero budget", () => {
    const result = selectMeasuresForBudget(
      [makeMeasure({ id: "m1" })],
      0,
      ASSUMPTIONS,
    );
    expect(result.selected).toEqual([]);
    expect(result.npv).toBe(0);
  });

  it("excludes negative-NPV measures even when they fit the budget", () => {
    const bad = makeMeasure({ id: "bad", estimatedCost: 100_000_000, annualCostSaving: 10_000 });
    const result = selectMeasuresForBudget(
      [bad],
      200_000_000,
      flatAssumptions(0.05, 20),
    );
    expect(result.selected).toEqual([]);
  });

  it("picks the higher-NPV measure when only one fits", () => {
    const cheap = makeMeasure({
      id: "cheap",
      estimatedCost: 5_000_000,
      annualCostSaving: 800_000,
    });
    const expensive = makeMeasure({
      id: "expensive",
      estimatedCost: 8_000_000,
      annualCostSaving: 1_500_000,
    });
    // Budget only fits one of them.
    const result = selectMeasuresForBudget([cheap, expensive], 8_500_000, ASSUMPTIONS);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].id).toBe("expensive"); // higher NPV
  });

  it("packs multiple measures when budget is large enough", () => {
    const m1 = makeMeasure({ id: "m1", estimatedCost: 3_000_000, annualCostSaving: 500_000 });
    const m2 = makeMeasure({ id: "m2", estimatedCost: 4_000_000, annualCostSaving: 700_000 });
    const m3 = makeMeasure({ id: "m3", estimatedCost: 2_000_000, annualCostSaving: 400_000 });
    const result = selectMeasuresForBudget([m1, m2, m3], 10_000_000, ASSUMPTIONS);
    expect(result.selected.length).toBeGreaterThanOrEqual(2);
    expect(result.effectiveCapex).toBeLessThanOrEqual(10_000_000);
  });

  it("aggregates cash flow across selected measures", () => {
    const m1 = makeMeasure({
      id: "m1",
      fuel: "electricity",
      estimatedCost: 3_000_000,
      annualCostSaving: 500_000,
    });
    const m2 = makeMeasure({
      id: "m2",
      fuel: "electricity",
      estimatedCost: 4_000_000,
      annualCostSaving: 700_000,
    });
    const result = selectMeasuresForBudget([m1, m2], 10_000_000, ASSUMPTIONS);
    expect(result.aggregateCashFlow).toHaveLength(20);
    // Year 1 = sum of year-1 savings of selected measures (no escalation yet)
    const expectedYear1 = result.selected.reduce((s, m) => s + m.annualCostSaving, 0);
    expect(result.aggregateCashFlow[0]).toBeCloseTo(expectedYear1, 0);
  });
});
