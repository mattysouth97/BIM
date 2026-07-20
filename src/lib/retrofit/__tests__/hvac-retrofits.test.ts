// src/lib/retrofit/__tests__/hvac-retrofits.test.ts
// P1-02 — pins the HVAC savings formulas, trigger boundaries, and lifetimes.
// Expected values are HAND-COMPUTED in comments.

import { describe, it, expect } from "vitest";
import { generateHvacRetrofits } from "../hvac-retrofits";
import { ENERGY_PRICES, MEASURE_LIFETIMES } from "../cost-database";

const AREA = 1000;
const D = 100_000; // annual heating demand kWh
const COOL = 30_000;

function generate(heatingEfficiency: number, age?: number) {
  return generateHvacRetrofits(
    { heatingType: "central", heatingEfficiency, age },
    AREA,
    D,
    COOL
  );
}

describe("generateHvacRetrofits (P1-02)", () => {
  it("pins the boiler-upgrade formula (η=0.7)", () => {
    const boiler = generate(0.7).find((m) => m.id === "hvac-boiler-upgrade")!;
    // saving = D × (1 − η/0.95) = 100,000 × (1 − 0.7/0.95) = 26,315.789...
    expect(boiler.annualEnergySaving).toBeCloseTo(100_000 * (1 - 0.7 / 0.95), 3);
    expect(boiler.annualCostSaving).toBeCloseTo(boiler.annualEnergySaving * ENERGY_PRICES.gas, 3);
  });

  it("pins the heat-pump formula (η=0.6 triggers)", () => {
    const hp = generate(0.6).find((m) => m.id === "hvac-heat-pump")!;
    // saving = D/η − D/COP = 100,000/0.6 − 100,000/3.5 = 166,666.67 − 28,571.43
    expect(hp.annualEnergySaving).toBeCloseTo(100_000 / 0.6 - 100_000 / 3.5, 2);
  });

  it("pins the HRV formula (always emitted): 15% of heating demand", () => {
    const hrv = generate(0.9).find((m) => m.id === "hvac-hrv")!;
    expect(hrv.annualEnergySaving).toBeCloseTo(0.15 * D, 6);
  });

  it("asserts current trigger boundaries (no redesign)", () => {
    // η = 0.85: no boiler measure (strict <)
    expect(generate(0.85).find((m) => m.id === "hvac-boiler-upgrade")).toBeUndefined();
    // η = 0.7 exactly: no heat pump (strict <) unless age > 15
    expect(generate(0.7).find((m) => m.id === "hvac-heat-pump")).toBeUndefined();
    // age = 15 exactly: no heat pump (strict >)
    expect(generate(0.8, 15).find((m) => m.id === "hvac-heat-pump")).toBeUndefined();
    // age = 16: heat pump triggers regardless of η
    expect(generate(0.8, 16).find((m) => m.id === "hvac-heat-pump")).toBeDefined();
  });

  it("every emitted measure carries its MEASURE_LIFETIMES entry (P1-02)", () => {
    const measures = generate(0.6, 20);
    expect(measures.length).toBe(3);
    for (const m of measures) {
      expect(m.lifetimeYears).toBe(MEASURE_LIFETIMES[m.id]);
    }
  });
});
