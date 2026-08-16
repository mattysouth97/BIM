// src/lib/report/__tests__/scenario-summary.test.ts
// Union: local twin-knapsack → audit takeaway + P0-02 portfolio / fidelity.

import { describe, expect, it } from "vitest";
import type { BudgetSelection } from "@/lib/retrofit/economic-model";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import {
  scenarioToAuditSummary,
  buildScenarioPortfolioSummary,
  deriveFidelityLevel,
} from "../scenario-summary";
import { buildEnergyAuditSections } from "../templates/energy-audit";
import type { EnergyAuditInput } from "../templates/energy-audit";

function measure(partial: Partial<RetrofitMeasure> & Pick<RetrofitMeasure, "id" | "name">): RetrofitMeasure {
  return {
    category: "hvac",
    estimatedCost: 80_000_000,
    annualEnergySaving: 100_000,
    annualCostSaving: 20_000_000,
    co2Reduction: 10,
    paybackYears: 6,
    description: partial.name,
    financials: {
      npv: 170_000_000,
      irr: 0.21,
      discountedPayback: 5.7,
      cashFlow: [],
      effectiveCapex: 80_000_000,
      subsidyValue: 0,
      resolvedFuel: "electricity",
    },
    ...partial,
  };
}

const selection: BudgetSelection = {
  selected: [
    measure({ id: "hrv", name: "열회수환기장치(HRV) 설치" }),
    measure({
      id: "pv",
      name: "Solar PV",
      financials: {
        npv: 140_000_000,
        irr: 0.12,
        discountedPayback: 10.9,
        cashFlow: [],
        effectiveCapex: 170_000_000,
        subsidyValue: 0,
        resolvedFuel: "electricity",
      },
    }),
  ],
  npv: 310_000_000,
  effectiveCapex: 250_000_000,
  aggregateCashFlow: [],
  discountedPayback: 8.5,
};

describe("scenarioToAuditSummary", () => {
  it("maps the twin knapsack so the report can take the same answer away", () => {
    const summary = scenarioToAuditSummary(selection);
    expect(summary).toBeDefined();
    expect(summary?.npv).toBe(310_000_000);
    expect(summary?.totalInvestment).toBe(250_000_000);
    expect(summary?.topMeasures.map((m) => m.description)).toEqual([
      "열회수환기장치(HRV) 설치",
      "Solar PV",
    ]);
  });

  it("returns undefined when nothing is selected", () => {
    expect(scenarioToAuditSummary(null)).toBeUndefined();
    expect(
      scenarioToAuditSummary({
        selected: [],
        npv: 0,
        effectiveCapex: 0,
        aggregateCashFlow: [],
        discountedPayback: Infinity,
      }),
    ).toBeUndefined();
  });
});

const baseInput: EnergyAuditInput = {
  building: {
    name: "데모 오피스 타워",
    address: "서울",
    useType: "업무시설",
    era: "2008",
    area: 8000,
    floors: 12,
  },
  fidelityLevel: 1,
  dataSources: ["대장"],
  envelope: { wallU: 0.6, roofU: 0.3, windowU: 2.1, airtightness: 3.5 },
  energy: {
    heatingDemand: 68,
    coolingDemand: 8,
    totalDemand: 76,
    energyGrade: "1",
    demandPerArea: 76,
  },
  co2: { total: 170, perArea: 17.4 },
  heatLossBreakdown: {
    walls: 1,
    roof: 1,
    windows: 1,
    floor: 1,
    ventilation: 1,
  },
};

describe("buildEnergyAuditSections retrofit takeaway", () => {
  it("prints the twin scenario, not a fidelity-gate lie", () => {
    const sections = buildEnergyAuditSections({
      ...baseInput,
      retrofitSummary: scenarioToAuditSummary(selection),
    });
    const retrofit = sections.find((s) => s.titleKo === "개보수 권장 사항");
    expect(retrofit?.content.type).toBe("table");
    const blob = JSON.stringify(retrofit);
    expect(blob).toContain("열회수환기장치(HRV) 설치");
    expect(blob).toContain("포트폴리오 NPV");
    expect(blob).not.toMatch(/Fidelity Level 2/);
  });

  it("empty copy points back to the twin, not a missing engine", () => {
    const sections = buildEnergyAuditSections(baseInput);
    const retrofit = sections.find((s) => s.titleKo === "개보수 권장 사항");
    expect(retrofit?.content.type).toBe("text");
    if (retrofit?.content.type === "text") {
      expect(retrofit.content.text).toMatch(/No retrofit analysis|트윈/);
    }
  });
});

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
    const dead = makeSelection({
      selected: [
        makeMeasure({ id: "dead", annualCostSaving: 0, annualEnergySaving: 0 }),
      ],
      aggregateCashFlow: new Array(10).fill(0),
      discountedPayback: Infinity,
    });
    const summary = buildScenarioPortfolioSummary(dead)!;

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
