// src/lib/retrofit/__tests__/measure-interactions.test.ts
// P1-01 — conflict-group metadata + pairwise portfolio damping fallback.

import { describe, it, expect } from "vitest";
import { generateHvacRetrofits } from "../hvac-retrofits";
import {
  dampPortfolioSavings,
  INTERACTION_COEFFICIENTS,
} from "../measure-interactions";
import type { RetrofitMeasure } from "../retrofit-types";

function makeMeasure(overrides: Partial<RetrofitMeasure> & { id: string }): RetrofitMeasure {
  return {
    name: "Test measure",
    category: "envelope",
    description: "Test",
    estimatedCost: 10_000_000,
    annualEnergySaving: 10_000,
    annualCostSaving: 1_000_000,
    paybackYears: 10,
    co2Reduction: 2,
    ...overrides,
  };
}

describe("conflict-group metadata (P1-01)", () => {
  it("boiler upgrade and heat pump both carry the heating-plant conflict group", () => {
    const measures = generateHvacRetrofits(
      { heatingType: "central", heatingEfficiency: 0.6, age: 20 },
      1000,
      100_000,
      30_000
    );
    const boiler = measures.find((m) => m.id === "hvac-boiler-upgrade");
    const heatPump = measures.find((m) => m.id === "hvac-heat-pump");
    expect(boiler).toBeDefined();
    expect(heatPump).toBeDefined();
    expect(boiler!.conflictGroup).toBe("heating-plant");
    expect(heatPump!.conflictGroup).toBe("heating-plant");
    // HRV is independent — no conflict group.
    expect(measures.find((m) => m.id === "hvac-hrv")!.conflictGroup).toBeUndefined();
  });
});

describe("dampPortfolioSavings (P1-01)", () => {
  it("damps envelope + HRV overlap by the documented coefficient", () => {
    const envelope = makeMeasure({
      id: "envelope-wall-insulation",
      annualEnergySaving: 30_000,
      annualCostSaving: 3_000_000,
      co2Reduction: 6,
    });
    const hrv = makeMeasure({
      id: "hvac-hrv",
      category: "hvac",
      annualEnergySaving: 15_000,
      annualCostSaving: 1_500_000,
      co2Reduction: 3,
    });

    const damped = dampPortfolioSavings([envelope, hrv]);

    // overlap = 0.15 × min(30,000, 15,000) = 2,250 kWh
    const expectedEnergy = 45_000 - INTERACTION_COEFFICIENTS["envelope|hvac-hrv"] * 15_000;
    expect(damped.totalAnnualSaving).toBeCloseTo(expectedEnergy, 6);
    // Cost/CO2 scale with the same fraction on the damped (later) measure.
    expect(damped.totalAnnualCostSaving).toBeLessThan(4_500_000);
    expect(damped.totalCO2Reduction).toBeLessThan(9);
  });

  it("damps envelope + boiler-upgrade overlap", () => {
    const envelope = makeMeasure({ id: "envelope-roof-insulation", annualEnergySaving: 30_000 });
    const boiler = makeMeasure({
      id: "hvac-boiler-upgrade",
      category: "hvac",
      annualEnergySaving: 20_000,
    });

    const damped = dampPortfolioSavings([envelope, boiler]);
    const expected = 50_000 - INTERACTION_COEFFICIENTS["envelope|hvac-boiler-upgrade"] * 20_000;
    expect(damped.totalAnnualSaving).toBeCloseTo(expected, 6);
  });

  it("is the identity for non-interacting portfolios (honesty: no silent change)", () => {
    const lighting = makeMeasure({ id: "lighting-led", category: "lighting", annualEnergySaving: 8_000 });
    const solar = makeMeasure({ id: "solar-pv", category: "renewable", annualEnergySaving: 12_000 });
    const single = makeMeasure({ id: "envelope-wall-insulation", annualEnergySaving: 30_000 });

    expect(dampPortfolioSavings([lighting, solar]).totalAnnualSaving).toBe(20_000);
    expect(dampPortfolioSavings([single]).totalAnnualSaving).toBe(30_000);
    expect(dampPortfolioSavings([]).totalAnnualSaving).toBe(0);
  });

  it("is monotone: damped total ≤ naive sum for randomized heating-side sets", () => {
    // Deterministic pseudo-random walk (no Math.random — reproducible).
    let seed = 42;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let trial = 0; trial < 20; trial++) {
      const measures: RetrofitMeasure[] = [
        makeMeasure({ id: "envelope-wall-insulation", annualEnergySaving: next() * 50_000 }),
        makeMeasure({ id: "envelope-window-replacement", annualEnergySaving: next() * 40_000 }),
        makeMeasure({ id: "hvac-hrv", category: "hvac", annualEnergySaving: next() * 20_000 }),
        makeMeasure({ id: "hvac-boiler-upgrade", category: "hvac", annualEnergySaving: next() * 30_000 }),
        makeMeasure({ id: "lighting-led", category: "lighting", annualEnergySaving: next() * 10_000 }),
      ];
      const naive = measures.reduce((s, m) => s + m.annualEnergySaving, 0);
      const damped = dampPortfolioSavings(measures);
      expect(damped.totalAnnualSaving).toBeLessThanOrEqual(naive + 1e-9);
      expect(damped.totalAnnualSaving).toBeGreaterThanOrEqual(0);
    }
  });

  it("every coefficient key matches a real measure-id pair pattern and is documented in (0,1]", () => {
    for (const [key, coeff] of Object.entries(INTERACTION_COEFFICIENTS)) {
      expect(key).toMatch(/^envelope\|hvac-(hrv|boiler-upgrade)$/);
      expect(coeff).toBeGreaterThan(0);
      expect(coeff).toBeLessThanOrEqual(1);
    }
  });
});
