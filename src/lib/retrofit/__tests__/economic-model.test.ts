// src/lib/retrofit/__tests__/economic-model.test.ts

import { describe, it, expect } from "vitest";
import {
  computeNpv,
  computeIrr,
  computeDiscountedPayback,
  computeInterestSavedSchedule,
  projectCashFlow,
  computeFinancials,
  selectMeasuresForBudget,
  effectiveDiscountRate,
  type EconomicAssumptions,
} from "../economic-model";
import { generateHvacRetrofits } from "../hvac-retrofits";
import {
  KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL,
  KOREAN_GR_PUBLIC_LOCAL,
  KOREAN_GR_PRIVATE_BASE,
  KOREAN_GR_PRIVATE_HIGH_PERF,
  KOREAN_GR_PRIVATE_TIER2,
  suggestPrivateTrack,
} from "../cost-database";
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

  it("returns the clamped sentinel 5.0 when the IRR exceeds the bracket ceiling (audit finding #11)", () => {
    // Outflow 1, single inflow 1000 → true IRR = 999 (99,900%), far beyond
    // the widened bracket ceiling of 5.0. The old code returned null (looked
    // like "no IRR"); the fix returns the 5.0 sentinel.
    expect(computeIrr(1, [1000])).toBe(5.0);
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

  it("maps window replacement to GAS escalation (audit finding #3)", () => {
    // Window savings are HDD-derived heating (gas). The old resolveFuel
    // special-cased the window measure to electricity (5% escalation);
    // corrected to gas (3%).
    const m = makeMeasure({ id: "envelope-window-replacement", annualCostSaving: 1_000_000 });
    const { cashFlow, resolvedFuel } = projectCashFlow(m, ASSUMPTIONS);
    expect(resolvedFuel).toBe("gas");
    expect(cashFlow[1]).toBeCloseTo(1_030_000, 0); // 3%/yr, not 5%/yr
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

describe("projectCashFlow lifetime truncation (P1-02)", () => {
  it("zero-pads years beyond lifetimeYears, keeping vector length = horizon", () => {
    const m = makeMeasure({ id: "lighting-led", lifetimeYears: 15, annualCostSaving: 1_000_000 });
    const { cashFlow } = projectCashFlow(m, flatAssumptions(0.05, 20));

    expect(cashFlow).toHaveLength(20);
    for (let t = 0; t < 15; t++) expect(cashFlow[t]).toBe(1_000_000);
    for (let t = 15; t < 20; t++) expect(cashFlow[t]).toBe(0);
  });

  it("NPV is strictly lower and discounted payback ≥ for the shorter lifetime", () => {
    const short = makeMeasure({ id: "short", lifetimeYears: 15 });
    const long = makeMeasure({ id: "long" }); // absent ⇒ full horizon
    const a = flatAssumptions(0.05, 20);

    const finShort = computeFinancials(short, a);
    const finLong = computeFinancials(long, a);
    expect(finShort.npv).toBeLessThan(finLong.npv);
    expect(finShort.discountedPayback).toBeGreaterThanOrEqual(finLong.discountedPayback);
  });

  it("lifetime longer than the horizon behaves exactly like absent", () => {
    const over = makeMeasure({ id: "envelope-wall-insulation", lifetimeYears: 30 });
    const absent = makeMeasure({ id: "no-lifetime" });
    const a = flatAssumptions(0.05, 20);

    expect(projectCashFlow(over, a).cashFlow).toEqual(projectCashFlow(absent, a).cashFlow);
  });

  it("knapsack still aggregates truncated measures with full-length cash flows", () => {
    const m1 = makeMeasure({ id: "m1", lifetimeYears: 10, estimatedCost: 3_000_000, annualCostSaving: 600_000 });
    const m2 = makeMeasure({ id: "m2", estimatedCost: 4_000_000, annualCostSaving: 700_000 });
    const result = selectMeasuresForBudget([m1, m2], 10_000_000, ASSUMPTIONS);

    expect(result.aggregateCashFlow).toHaveLength(20);
    // Beyond m1's 10-yr life only m2's stream remains (escalated).
    expect(result.aggregateCashFlow[15]).toBeGreaterThan(0);
  });
});

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
    expect(result.selected[0].financials?.npv).toBeGreaterThan(0);
  });

  it("packs multiple measures when budget is large enough", () => {
    const m1 = makeMeasure({ id: "m1", estimatedCost: 3_000_000, annualCostSaving: 500_000 });
    const m2 = makeMeasure({ id: "m2", estimatedCost: 4_000_000, annualCostSaving: 700_000 });
    const m3 = makeMeasure({ id: "m3", estimatedCost: 2_000_000, annualCostSaving: 400_000 });
    const result = selectMeasuresForBudget([m1, m2, m3], 10_000_000, ASSUMPTIONS);
    expect(result.selected.length).toBeGreaterThanOrEqual(2);
    expect(result.effectiveCapex).toBeLessThanOrEqual(10_000_000);
  });

  // ── P1-01: conflict groups (mutually exclusive measures) ──────────────────

  it("never selects two measures sharing a conflictGroup, keeping the higher-NPV one", () => {
    const boiler = makeMeasure({
      id: "hvac-boiler-upgrade",
      category: "hvac",
      conflictGroup: "heating-plant",
      estimatedCost: 10_000_000,
      annualCostSaving: 2_000_000,
    });
    const heatPump = makeMeasure({
      id: "hvac-heat-pump",
      category: "hvac",
      conflictGroup: "heating-plant",
      estimatedCost: 40_000_000,
      annualCostSaving: 10_000_000,
    });
    // Budget fits BOTH — the conflict, not the budget, must exclude one.
    const result = selectMeasuresForBudget([boiler, heatPump], 100_000_000, ASSUMPTIONS);

    const heatingPlant = result.selected.filter((m) => m.conflictGroup === "heating-plant");
    expect(heatingPlant).toHaveLength(1);
    expect(heatingPlant[0].id).toBe("hvac-heat-pump"); // higher NPV wins
  });

  it("conflict branching picks the cheaper measure when the better one is infeasible", () => {
    const boiler = makeMeasure({
      id: "hvac-boiler-upgrade",
      category: "hvac",
      conflictGroup: "heating-plant",
      estimatedCost: 10_000_000,
      annualCostSaving: 2_000_000,
    });
    const heatPump = makeMeasure({
      id: "hvac-heat-pump",
      category: "hvac",
      conflictGroup: "heating-plant",
      estimatedCost: 40_000_000,
      annualCostSaving: 10_000_000,
    });
    // 15M budget: heat-pump branch is infeasible; boiler branch must win.
    const result = selectMeasuresForBudget([boiler, heatPump], 15_000_000, ASSUMPTIONS);
    expect(result.selected.map((m) => m.id)).toEqual(["hvac-boiler-upgrade"]);
  });

  it("non-conflicting measures still combine with the chosen group representative", () => {
    const boiler = makeMeasure({
      id: "hvac-boiler-upgrade",
      category: "hvac",
      conflictGroup: "heating-plant",
      estimatedCost: 10_000_000,
      annualCostSaving: 2_000_000,
    });
    const heatPump = makeMeasure({
      id: "hvac-heat-pump",
      category: "hvac",
      conflictGroup: "heating-plant",
      estimatedCost: 40_000_000,
      annualCostSaving: 10_000_000,
    });
    const led = makeMeasure({
      id: "lighting-led",
      category: "lighting",
      estimatedCost: 5_000_000,
      annualCostSaving: 1_200_000,
    });
    const result = selectMeasuresForBudget([boiler, heatPump, led], 100_000_000, ASSUMPTIONS);

    expect(result.selected.map((m) => m.id).sort()).toEqual(["hvac-heat-pump", "lighting-led"]);
    // Property: no two selected share a group — ever.
    const groups = result.selected.map((m) => m.conflictGroup).filter(Boolean);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it("is deterministic for identical inputs (fixed branch order + tie-breaks)", () => {
    const measures = [
      makeMeasure({ id: "hvac-boiler-upgrade", conflictGroup: "heating-plant", estimatedCost: 10_000_000, annualCostSaving: 2_000_000 }),
      makeMeasure({ id: "hvac-heat-pump", conflictGroup: "heating-plant", estimatedCost: 12_000_000, annualCostSaving: 2_000_000 }),
      makeMeasure({ id: "lighting-led", estimatedCost: 5_000_000, annualCostSaving: 1_000_000 }),
    ];
    const a = selectMeasuresForBudget(measures, 50_000_000, ASSUMPTIONS);
    const b = selectMeasuresForBudget(measures, 50_000_000, ASSUMPTIONS);
    expect(a.selected.map((m) => m.id)).toEqual(b.selected.map((m) => m.id));
    expect(a.npv).toBe(b.npv);
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

// ──────────────────────────────────────────────────────────────────────────
// Audit finding #7: interest subsidy is an additive PV term, NOT a blended
// WACC. All cash flows discount at the BASE rate; the 이자지원 buy-down is
// the present value of interest saved on a 5-year equal-principal loan.
// ──────────────────────────────────────────────────────────────────────────

describe("effectiveDiscountRate", () => {
  it("returns the raw discountRate when no financingMix is set", () => {
    expect(effectiveDiscountRate(ASSUMPTIONS)).toBeCloseTo(0.05, 9);
  });

  it("returns the BASE discountRate even with a financingMix (audit finding #7)", () => {
    // Corrected: the old model returned a blended WACC (2.2% for private-base,
    // 1.5% for high-perf), permanently lowering the discount rate over all 20
    // years. Interest support only lasts the loan term — it is now modeled as
    // an additive subsidyValue PV, so the discount rate stays at 5%.
    expect(effectiveDiscountRate(KOREAN_GR_PRIVATE_BASE)).toBeCloseTo(0.05, 9);
    expect(effectiveDiscountRate(KOREAN_GR_PRIVATE_HIGH_PERF)).toBeCloseTo(0.05, 9);
  });
});

describe("computeInterestSavedSchedule (audit finding #7)", () => {
  // Loan principal = 0.7 × 100,000,000 = 70,000,000; equal-principal over
  // 5 years → outstanding balances at the start of years 1..5:
  //   70M, 56M, 42M, 28M, 14M
  // Interest saved at 4.5pp: 3.15M, 2.52M, 1.89M, 1.26M, 0.63M, then 0.
  it("computes the equal-principal amortization interest-saved schedule", () => {
    const schedule = computeInterestSavedSchedule(
      100_000_000,
      { debtFraction: 0.7, loanRatePreSubsidy: 0.055, interestSupportPp: 0.045 },
      20,
    );
    expect(schedule).toHaveLength(20);
    expect(schedule[0]).toBeCloseTo(3_150_000, 0);
    expect(schedule[1]).toBeCloseTo(2_520_000, 0);
    expect(schedule[2]).toBeCloseTo(1_890_000, 0);
    expect(schedule[3]).toBeCloseTo(1_260_000, 0);
    expect(schedule[4]).toBeCloseTo(630_000, 0);
    expect(schedule[5]).toBe(0);
    expect(schedule[19]).toBe(0);
  });

  it("respects the loanCapKrw program cap", () => {
    // Cap 50M < 0.7 × 100M = 70M → principal 50M → year-1 saved 2.25M.
    const schedule = computeInterestSavedSchedule(
      100_000_000,
      {
        debtFraction: 0.7,
        loanRatePreSubsidy: 0.055,
        interestSupportPp: 0.045,
        loanCapKrw: 50_000_000,
      },
      20,
    );
    expect(schedule[0]).toBeCloseTo(2_250_000, 0);
  });

  it("caps the buy-down at the loan rate (cannot save more interest than paid)", () => {
    // 6.5pp support on a 5.5% loan saves at most 5.5pp.
    const schedule = computeInterestSavedSchedule(
      100_000_000,
      { debtFraction: 1, loanRatePreSubsidy: 0.055, interestSupportPp: 0.065 },
      20,
    );
    expect(schedule[0]).toBeCloseTo(100_000_000 * 0.055, 0);
  });
});

describe("computeFinancials — subsidyValue (audit finding #7)", () => {
  const ENVELOPE_100M = makeMeasure({
    id: "envelope-wall-insulation",
    category: "envelope",
    estimatedCost: 100_000_000,
    annualCostSaving: 5_000_000,
  });

  it("subsidyValue is 0 without a financingMix", () => {
    const fin = computeFinancials(ENVELOPE_100M, ASSUMPTIONS);
    expect(fin.subsidyValue).toBe(0);
  });

  it("private-base subsidyValue = PV of interest saved ≈ ₩14,353,070", () => {
    // P2-32: this was ₩8,448,594, computed over a 5-year schedule, because
    // computeInterestSavedSchedule ignored the preset's declared term. The
    // preset declares GR_PRIVATE_LOAN_TERM_YEARS = 10, so the buy-down is now
    // valued over ten years. Hand calc, principal 70M at 4.5pp, 5% base rate:
    //   3,150,000/1.05    = 3,000,000.00
    //   2,835,000/1.05^2  = 2,571,428.57
    //   2,520,000/1.05^3  = 2,176,870.75
    //   2,205,000/1.05^4  = 1,814,058.96
    //   1,890,000/1.05^5  = 1,480,864.45
    //   1,575,000/1.05^6  = 1,175,289.25
    //   1,260,000/1.05^7  =   895,458.48
    //     945,000/1.05^8  =   639,613.20
    //     630,000/1.05^9  =   406,103.62
    //     315,000/1.05^10 =   193,382.67
    //   Σ = 14,353,069.95
    const fin = computeFinancials(ENVELOPE_100M, KOREAN_GR_PRIVATE_BASE);
    expect(fin.subsidyValue).toBeCloseTo(14_353_069.95, 0);
  });

  it("npv = base-rate NPV + subsidyValue", () => {
    const withFin = computeFinancials(ENVELOPE_100M, KOREAN_GR_PRIVATE_BASE);
    const equityOnly = computeFinancials(ENVELOPE_100M, ASSUMPTIONS);
    expect(withFin.npv).toBeCloseTo(equityOnly.npv + withFin.subsidyValue, 0);
  });

  it("tier subsidyValues scale with the support pp (4.0 < 4.5 < 5.5)", () => {
    // Linear in pp, so the tiers stay in the same ratio to base after P2-32
    // widened the term to ten years: base × 8/9 = 12,758,284.40;
    // base × 11/9 = 17,542,641.05. (Were 7,509,861.29 and 10,326,059.27 on
    // the 5-year schedule.)
    const base = computeFinancials(ENVELOPE_100M, KOREAN_GR_PRIVATE_BASE);
    const tier2 = computeFinancials(ENVELOPE_100M, KOREAN_GR_PRIVATE_TIER2);
    const high = computeFinancials(ENVELOPE_100M, KOREAN_GR_PRIVATE_HIGH_PERF);
    expect(tier2.subsidyValue).toBeCloseTo(12_758_284.40, 0);
    expect(high.subsidyValue).toBeCloseTo(17_542_641.05, 0);
    expect(tier2.subsidyValue).toBeLessThan(base.subsidyValue);
    expect(base.subsidyValue).toBeLessThan(high.subsidyValue);
  });

  it("IRR and discounted payback include the yearly interest-saved amounts", () => {
    // A measure that pays back at the base rate: 100M capex, 8M/yr gas-side
    // saving. Adding interest-saved inflows in years 1–5 must raise IRR and
    // shorten the discounted payback.
    const payer = makeMeasure({
      id: "envelope-wall-insulation",
      category: "envelope",
      estimatedCost: 100_000_000,
      annualCostSaving: 8_000_000,
    });
    const noFin = computeFinancials(payer, ASSUMPTIONS);
    const withFin = computeFinancials(payer, KOREAN_GR_PRIVATE_BASE);
    expect(noFin.irr).not.toBeNull();
    expect(withFin.irr).not.toBeNull();
    expect(withFin.irr!).toBeGreaterThan(noFin.irr!);
    expect(withFin.discountedPayback).toBeLessThan(noFin.discountedPayback);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// D₂: subsidyByCategory (per-category default with per-id override)
// ──────────────────────────────────────────────────────────────────────────

describe("subsidyByCategory", () => {
  it("applies the category default when no per-id override exists", () => {
    const m = makeMeasure({ id: "envelope-wall-insulation", category: "envelope" });
    const a: EconomicAssumptions = {
      ...ASSUMPTIONS,
      subsidyByCategory: { envelope: 0.5 },
    };
    const fin = computeFinancials(m, a);
    expect(fin.effectiveCapex).toBeCloseTo(5_000_000, 0); // 50% of 10M
  });

  it("per-id subsidyRatio overrides category default", () => {
    const m = makeMeasure({ id: "envelope-wall-insulation", category: "envelope" });
    const a: EconomicAssumptions = {
      ...ASSUMPTIONS,
      subsidyByCategory: { envelope: 0.5 },
      subsidyRatio: { "envelope-wall-insulation": 0.8 },
    };
    const fin = computeFinancials(m, a);
    expect(fin.effectiveCapex).toBeCloseTo(2_000_000, 0); // 80% subsidy via id wins
  });

  it("category not in map → no subsidy on that measure", () => {
    const solar = makeMeasure({ id: "solar-pv-flat", category: "renewable" });
    const a: EconomicAssumptions = {
      ...ASSUMPTIONS,
      subsidyByCategory: { envelope: 0.5, hvac: 0.5 }, // no renewable
    };
    const fin = computeFinancials(solar, a);
    expect(fin.effectiveCapex).toBeCloseTo(10_000_000, 0); // unsubsidized
  });
});

// ──────────────────────────────────────────────────────────────────────────
// D₂: 그린리모델링 named presets behave as the dossier specifies
// ──────────────────────────────────────────────────────────────────────────

describe("그린리모델링 presets (KOREAN_GR_*)", () => {
  const ENVELOPE = makeMeasure({
    id: "envelope-wall-insulation",
    category: "envelope",
    estimatedCost: 100_000_000,
    annualCostSaving: 5_000_000,
  });
  const SOLAR = makeMeasure({
    id: "solar-pv-flat",
    category: "renewable",
    estimatedCost: 50_000_000,
    annualCostSaving: 6_000_000,
  });

  it("public-Seoul applies 50% CAPEX subsidy to envelope", () => {
    const fin = computeFinancials(ENVELOPE, KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL);
    expect(fin.effectiveCapex).toBeCloseTo(50_000_000, 0);
  });

  it("public-local applies 70% CAPEX subsidy to envelope", () => {
    const fin = computeFinancials(ENVELOPE, KOREAN_GR_PUBLIC_LOCAL);
    expect(fin.effectiveCapex).toBeCloseTo(30_000_000, 0);
  });

  it("public-Seoul does NOT subsidize solar (renewable not in map)", () => {
    // The dossier finding: solar PV routes through 신재생에너지 보급사업,
    // not 그린리모델링. The preset must leave solar at full CAPEX.
    const fin = computeFinancials(SOLAR, KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL);
    expect(fin.effectiveCapex).toBeCloseTo(50_000_000, 0); // unchanged
  });

  it("private-base adds an interest-subsidy PV, no CAPEX subsidy", () => {
    // Audit finding #7: interest support no longer lowers the discount rate;
    // it adds a positive subsidyValue on top of the base-rate NPV.
    const fin = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_BASE);
    expect(fin.effectiveCapex).toBeCloseTo(100_000_000, 0); // no subsidy
    expect(fin.subsidyValue).toBeGreaterThan(0);
    const equityOnly = computeFinancials(ENVELOPE, ASSUMPTIONS);
    expect(fin.npv).toBeGreaterThan(equityOnly.npv);
  });

  it("private-high-perf produces strictly higher NPV than private-base", () => {
    // 5.5pp support saves more interest each year than 4.5pp.
    const base = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_BASE);
    const high = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_HIGH_PERF);
    expect(high.npv).toBeGreaterThan(base.npv);
  });

  it("public-Seoul beats private-base for high-CAPEX measures", () => {
    // 50% direct CAPEX grant is generally more valuable than a 4.5pp interest
    // buy-down on a 70% LTV. Confirms the dossier's intuition that the right
    // track depends on building ownership.
    const publicSeoul = computeFinancials(ENVELOPE, KOREAN_GR_PUBLIC_SEOUL_OR_CENTRAL);
    const privateBase = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_BASE);
    expect(publicSeoul.npv).toBeGreaterThan(privateBase.npv);
  });
});

// ---------------------------------------------------------------------------
// D₂.5: private-tier suggestion + Tier 2 preset
// ---------------------------------------------------------------------------

describe("suggestPrivateTrack (D₂.5)", () => {
  it("suggests base tier below 20% improvement", () => {
    expect(suggestPrivateTrack(0)).toBe("private-base");
    expect(suggestPrivateTrack(0.19)).toBe("private-base");
  });

  it("suggests tier 2 for 20–30% improvement", () => {
    expect(suggestPrivateTrack(0.2)).toBe("private-tier2");
    expect(suggestPrivateTrack(0.299)).toBe("private-tier2");
  });

  it("suggests high-perf tier at ≥30% improvement", () => {
    expect(suggestPrivateTrack(0.3)).toBe("private-high-perf");
    expect(suggestPrivateTrack(0.85)).toBe("private-high-perf");
  });

  it("degrades to base tier on any non-finite or negative input", () => {
    expect(suggestPrivateTrack(Number.NaN)).toBe("private-base");
    expect(suggestPrivateTrack(-1)).toBe("private-base");
    expect(suggestPrivateTrack(Number.POSITIVE_INFINITY)).toBe("private-base");
  });
});

describe("KOREAN_GR_PRIVATE_TIER2 preset", () => {
  // Audit finding #7: tiers are now compared via subsidyValue (PV of interest
  // saved), not via a blended discount rate — the old test pinned WACC 2.55%.
  const ENVELOPE = makeMeasure({
    id: "envelope-wall-insulation",
    category: "envelope",
    estimatedCost: 100_000_000,
    annualCostSaving: 5_000_000,
  });

  it("discounts at the base rate like every other preset", () => {
    expect(effectiveDiscountRate(KOREAN_GR_PRIVATE_TIER2)).toBeCloseTo(0.05, 9);
  });

  it("has the SMALLEST subsidyValue of the three private tiers (4.0pp)", () => {
    const base = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_BASE);
    const tier2 = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_TIER2);
    const high = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_HIGH_PERF);
    // Per the 2026 program table Tier 2 (4.0pp) is below the base tier (4.5pp).
    expect(tier2.subsidyValue).toBeLessThan(base.subsidyValue);
    expect(base.subsidyValue).toBeLessThan(high.subsidyValue);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Audit finding #8: exclusiveGroup — grouped knapsack
// ──────────────────────────────────────────────────────────────────────────

describe("selectMeasuresForBudget — exclusiveGroup (audit finding #8)", () => {
  it("selects at most one measure per group even when the budget allows both", () => {
    // Both fit within 100M; heat pump has the higher NPV
    // (saving 7.54M/yr vs 2.11M/yr at similar CAPEX) and must win.
    const boiler = makeMeasure({
      id: "hvac-boiler-upgrade",
      category: "hvac",
      exclusiveGroup: "heating-plant",
      estimatedCost: 2_500_000,
      annualCostSaving: 2_105_263,
    });
    const hp = makeMeasure({
      id: "hvac-heat-pump",
      category: "hvac",
      exclusiveGroup: "heating-plant",
      estimatedCost: 4_000_000,
      annualCostSaving: 7_538_462,
    });
    const result = selectMeasuresForBudget([boiler, hp], 100_000_000, ASSUMPTIONS);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].id).toBe("hvac-heat-pump");
  });

  it("generated boiler + heat-pump are mutually exclusive; HRV still packs", () => {
    // η = 0.65 generates boiler, heat pump AND HRV. With a budget covering
    // everything, exactly one heating-plant measure may be selected.
    const measures = generateHvacRetrofits(
      { heatingType: "boiler", heatingEfficiency: 0.65 },
      100,
      100_000,
      0,
    );
    const result = selectMeasuresForBudget(measures, 100_000_000, ASSUMPTIONS);
    const ids = result.selected.map((m) => m.id);
    const heatingPlant = ids.filter(
      (id) => id === "hvac-boiler-upgrade" || id === "hvac-heat-pump",
    );
    expect(heatingPlant).toEqual(["hvac-heat-pump"]); // higher-NPV alternative
    expect(ids).toContain("hvac-hrv"); // independent measure still selected
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Audit finding #9: baseline savings cap
// ──────────────────────────────────────────────────────────────────────────

describe("selectMeasuresForBudget — baseline savings cap (audit finding #9)", () => {
  const gas = makeMeasure({
    id: "envelope-wall-insulation",
    category: "envelope",
    fuel: "gas",
    estimatedCost: 3_000_000,
    annualCostSaving: 1_000_000,
  });
  const elec = makeMeasure({
    id: "lighting-led",
    category: "lighting",
    fuel: "electricity",
    estimatedCost: 2_000_000,
    annualCostSaving: 500_000,
  });

  it("scales heating-side savings proportionally so total ≤ baseline", () => {
    // Selected total = 1.5M > baseline 1.2M → excess 0.3M is borne by the
    // heating (gas) side: factor = (1.0M − 0.3M) / 1.0M = 0.7.
    // Gas measure → 700,000; electric untouched → total = 1,200,000.
    const result = selectMeasuresForBudget(
      [gas, elec],
      10_000_000,
      ASSUMPTIONS,
      1_000_000,
      1_200_000,
    );
    const total = result.selected.reduce((s, m) => s + m.annualCostSaving, 0);
    expect(total).toBeCloseTo(1_200_000, 0);
    const gasSel = result.selected.find((m) => m.id === "envelope-wall-insulation")!;
    const elecSel = result.selected.find((m) => m.id === "lighting-led")!;
    expect(gasSel.annualCostSaving).toBeCloseTo(700_000, 0);
    expect(elecSel.annualCostSaving).toBeCloseTo(500_000, 0);
    // Year-1 aggregate cash flow reflects the capped savings.
    expect(result.aggregateCashFlow[0]).toBeCloseTo(1_200_000, 0);
  });

  it("is backward compatible: no cap when the baseline param is absent", () => {
    const result = selectMeasuresForBudget([gas, elec], 10_000_000, ASSUMPTIONS);
    const total = result.selected.reduce((s, m) => s + m.annualCostSaving, 0);
    expect(total).toBeCloseTo(1_500_000, 0);
  });

  it("does not scale when total savings are within the baseline", () => {
    const result = selectMeasuresForBudget(
      [gas, elec],
      10_000_000,
      ASSUMPTIONS,
      1_000_000,
      2_000_000,
    );
    const total = result.selected.reduce((s, m) => s + m.annualCostSaving, 0);
    expect(total).toBeCloseTo(1_500_000, 0);
  });
});
