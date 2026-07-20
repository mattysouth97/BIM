// src/lib/retrofit/__tests__/economic-model.test.ts

import { describe, it, expect } from "vitest";
import {
  computeNpv,
  computeIrr,
  computeDiscountedPayback,
  projectCashFlow,
  computeFinancials,
  selectMeasuresForBudget,
  effectiveDiscountRate,
  type EconomicAssumptions,
} from "../economic-model";
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
// D₂: effectiveDiscountRate (WACC) + financingMix
// ──────────────────────────────────────────────────────────────────────────

describe("effectiveDiscountRate", () => {
  it("returns the raw discountRate when no financingMix is set", () => {
    expect(effectiveDiscountRate(ASSUMPTIONS)).toBeCloseTo(0.05, 9);
  });

  it("returns the raw discountRate when debtFraction is 0", () => {
    const a: EconomicAssumptions = {
      ...ASSUMPTIONS,
      financingMix: { debtFraction: 0, loanRatePreSubsidy: 0.055, interestSupportPp: 0.045 },
    };
    expect(effectiveDiscountRate(a)).toBeCloseTo(0.05, 9);
  });

  it("computes WACC correctly for the 그린리모델링 private-base preset", () => {
    // 0.7 × max(0, 0.055 − 0.045) + 0.3 × 0.05 = 0.7 × 0.01 + 0.015 = 0.022
    expect(effectiveDiscountRate(KOREAN_GR_PRIVATE_BASE)).toBeCloseTo(0.022, 6);
  });

  it("floors the loan portion at 0 when interestSupport ≥ loanRate (private high-perf)", () => {
    // 0.7 × max(0, 0.055 − 0.055) + 0.3 × 0.05 = 0 + 0.015 = 0.015
    expect(effectiveDiscountRate(KOREAN_GR_PRIVATE_HIGH_PERF)).toBeCloseTo(0.015, 6);
  });

  it("clamps debtFraction to [0, 1]", () => {
    const over: EconomicAssumptions = {
      ...ASSUMPTIONS,
      financingMix: { debtFraction: 1.5, loanRatePreSubsidy: 0.055, interestSupportPp: 0.045 },
    };
    // Treated as 100% debt: max(0, 0.055 − 0.045) = 0.01
    expect(effectiveDiscountRate(over)).toBeCloseTo(0.01, 6);

    const under: EconomicAssumptions = {
      ...ASSUMPTIONS,
      financingMix: { debtFraction: -0.5, loanRatePreSubsidy: 0.055, interestSupportPp: 0.045 },
    };
    // Treated as 0% debt: pure equity discount
    expect(effectiveDiscountRate(under)).toBeCloseTo(0.05, 6);
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

  it("private-base reduces effective discount rate to 2.2%, no CAPEX subsidy", () => {
    const fin = computeFinancials(ENVELOPE, KOREAN_GR_PRIVATE_BASE);
    expect(fin.effectiveCapex).toBeCloseTo(100_000_000, 0); // no subsidy
    // NPV at 2.2% should be HIGHER than at 5% (the equity-only rate).
    const equityOnly = computeFinancials(ENVELOPE, ASSUMPTIONS);
    expect(fin.npv).toBeGreaterThan(equityOnly.npv);
  });

  it("private-high-perf produces strictly higher NPV than private-base", () => {
    // High-perf zeroes out the financed-portion rate; base leaves a 1% residual.
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
  it("computes WACC of 2.55% (4.0pp support on 70% LTV)", () => {
    // 0.7 × max(0, 0.055 − 0.040) + 0.3 × 0.05 = 0.0105 + 0.015
    expect(effectiveDiscountRate(KOREAN_GR_PRIVATE_TIER2)).toBeCloseTo(0.0255, 6);
  });

  it("sits between base (4.5pp) and high-perf (5.5pp) in effective rate", () => {
    const base = effectiveDiscountRate(KOREAN_GR_PRIVATE_BASE);
    const tier2 = effectiveDiscountRate(KOREAN_GR_PRIVATE_TIER2);
    const high = effectiveDiscountRate(KOREAN_GR_PRIVATE_HIGH_PERF);
    // Higher pp support → lower effective rate; Tier 2 (4.0pp) has the
    // HIGHEST rate of the three per the 2026 program table.
    expect(high).toBeLessThan(base);
    expect(base).toBeLessThan(tier2);
  });
});
