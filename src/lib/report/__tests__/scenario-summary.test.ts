// src/lib/report/__tests__/scenario-summary.test.ts
// P0-02 — pure derivations shared by all report/export surfaces:
// buildScenarioPortfolioSummary (BudgetSelection → portfolio financials) and
// deriveFidelityLevel (honest 1/2/3 mapping from data availability).

import { describe, it, expect } from "vitest";
import {
  buildScenarioPortfolioSummary,
  deriveFidelityLevel,
} from "../scenario-summary";
import type { BudgetSelection } from "@/lib/retrofit/economic-model";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

function makeMeasure(overrides: Partial<RetrofitMeasure> & { id: string }): RetrofitMeasure {
  return {
    name: "Test measure",
    category: "envelope",
    description: "Test measure description",
    estimatedCost: 5_000_000,
    annualEnergySaving: 10_000,
    annualCostSaving: 1_200_000,
    paybackYears: 4.2,
    co2Reduction: 4.5,
    ...overrides,
  };
}

function makeSelection(overrides: Partial<BudgetSelection> = {}): BudgetSelection {
  return {
    selected: [
      makeMeasure({ id: "m-slow", paybackYears: 9.0, description: "Wall insulation" }),
      makeMeasure({ id: "m-fast", paybackYears: 2.5, description: "LED retrofit" }),
      makeMeasure({ id: "m-mid", paybackYears: 5.0, description: "Heat pump" }),
      makeMeasure({ id: "m-slowest", paybackYears: 12.0, description: "Window replacement" }),
    ],
    npv: 6_500_000,
    effectiveCapex: 8_000_000,
    aggregateCashFlow: new Array(10).fill(1_500_000),
    discountedPayback: 6.8,
    ...overrides,
  };
}

describe("buildScenarioPortfolioSummary", () => {
  it("returns null for a null selection or an empty selected set", () => {
    expect(buildScenarioPortfolioSummary(null)).toBeNull();
    expect(buildScenarioPortfolioSummary(makeSelection({ selected: [] }))).toBeNull();
  });

  it("aggregates investment, savings, NPV, and effective CAPEX from the selection", () => {
    const summary = buildScenarioPortfolioSummary(makeSelection())!;

    expect(summary.totalInvestment).toBe(20_000_000);
    expect(summary.totalAnnualSavingKwh).toBe(40_000);
    expect(summary.totalAnnualCostSavingKrw).toBe(4_800_000);
    expect(summary.npv).toBe(6_500_000);
    expect(summary.effectiveCapex).toBe(8_000_000);
    // Simple payback = 20M / 4.8M/yr
    expect(summary.payback).toBeCloseTo(20_000_000 / 4_800_000, 5);
    expect(summary.discountedPayback).toBe(6.8);
  });

  it("computes a portfolio IRR from the aggregate cash flow when savings cover capex", () => {
    const summary = buildScenarioPortfolioSummary(makeSelection())!;
    // 10 × 1.5M = 15M inflow vs 8M effective capex ⇒ positive IRR exists.
    expect(summary.irr).not.toBeNull();
    expect(summary.irr!).toBeGreaterThan(0);
  });

  it("returns null payback and null IRR when annual cost savings are zero", () => {
    const selection = makeSelection({
      selected: [
        makeMeasure({ id: "dead", annualCostSaving: 0, annualEnergySaving: 0 }),
      ],
      aggregateCashFlow: new Array(10).fill(0),
      discountedPayback: Infinity,
    });
    const summary = buildScenarioPortfolioSummary(selection)!;

    expect(summary.payback).toBeNull();
    expect(summary.irr).toBeNull();
    // Infinity from the engine is converted to null at this boundary.
    expect(summary.discountedPayback).toBeNull();
    expect(JSON.stringify(summary)).not.toContain("Infinity");
    expect(JSON.stringify(summary)).not.toContain("NaN");
  });

  it("lists at most 3 top measures ordered by shortest payback", () => {
    const summary = buildScenarioPortfolioSummary(makeSelection())!;

    expect(summary.topMeasures).toHaveLength(3);
    expect(summary.topMeasures[0].description).toBe("LED retrofit");
    expect(summary.topMeasures[1].description).toBe("Heat pump");
    expect(summary.topMeasures[2].description).toBe("Wall insulation");
  });

  it("serializes without Infinity/NaN for the happy path too", () => {
    const raw = JSON.stringify(buildScenarioPortfolioSummary(makeSelection()));
    expect(raw).not.toContain("Infinity");
    expect(raw).not.toContain("NaN");
  });
});

describe("deriveFidelityLevel", () => {
  it("maps data availability to fidelity honestly", () => {
    expect(deriveFidelityLevel(false, false)).toBe(1); // public data only
    expect(deriveFidelityLevel(false, true)).toBe(2); // actual energy rows present
    expect(deriveFidelityLevel(true, true)).toBe(3); // calibration result exists
    expect(deriveFidelityLevel(true, false)).toBe(3); // calibration implies highest tier
  });
});
