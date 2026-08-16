// src/lib/retrofit/__tests__/hvac-retrofits.test.ts
// Union: audited fuel-side math + P1-02 lifetimes / trigger boundaries.

import { describe, it, expect } from "vitest";
import { generateHvacRetrofits } from "../hvac-retrofits";
import { ENERGY_PRICES, MEASURE_LIFETIMES } from "../cost-database";

function findMeasure(measures: { id: string }[], id: string) {
  const m = measures.find((x) => x.id === id);
  if (!m) throw new Error(`measure ${id} not found`);
  return m as import("../retrofit-types").RetrofitMeasure;
}

describe("generateHvacRetrofits — boiler upgrade fuel savings (audit finding #1)", () => {
  // Input demand is USEFUL heat. Fuel saving = D × (1/ηold − 1/ηnew),
  // NOT D × (1 − ηold/ηnew) which under-counts because it compares
  // efficiencies on the demand side.
  //
  // Hand calc: D = 100,000 kWh, η 0.75 → 0.95:
  //   100,000 × (1/0.75 − 1/0.95) = 100,000 × (1.3333333 − 1.0526316)
  //                               = 28,070.18 kWh (NOT 21,052.63)
  it("D=100,000, η 0.75→0.95 saves 28,070 kWh of fuel", () => {
    const measures = generateHvacRetrofits(
      { heatingType: "boiler", heatingEfficiency: 0.75 },
      100,
      100_000,
      0,
    );
    const boiler = findMeasure(measures, "hvac-boiler-upgrade");
    expect(boiler.annualEnergySaving).toBeCloseTo(28_070.18, 1);
    // Cost saving priced at gas: 28,070.18 × 75 = 2,105,263 KRW
    expect(boiler.annualCostSaving).toBeCloseTo(2_105_263.16, 0);
    // CO2: 28.07018 MWh × 0.2018 tCO2/MWh = 5.6646 tCO2
    expect(boiler.co2Reduction).toBeCloseTo(5.6646, 3);
  });
});

describe("generateHvacRetrofits — HRV saving is demand-side (audit finding #2)", () => {
  // HRV recovers ventilation heat LOSS (demand side). Fuel saved must be
  // grossed up by the boiler efficiency:
  //   fuel saving = D × 0.15 / η = 100,000 × 0.15 / 0.75 = 20,000 kWh
  // (old code left it at 15,000 kWh demand-side).
  it("D=100,000, η=0.75 saves 20,000 kWh of fuel", () => {
    const measures = generateHvacRetrofits(
      { heatingType: "boiler", heatingEfficiency: 0.75 },
      100,
      100_000,
      0,
    );
    const hrv = findMeasure(measures, "hvac-hrv");
    expect(hrv.annualEnergySaving).toBeCloseTo(20_000, 6);
    // 20,000 × 75 KRW/kWh = 1,500,000 KRW
    expect(hrv.annualCostSaving).toBeCloseTo(1_500_000, 0);
    // 20 MWh × 0.2018 = 4.036 tCO2
    expect(hrv.co2Reduction).toBeCloseTo(4.036, 4);
  });

  it("normalizes percent-style efficiency (75 ≡ 0.75)", () => {
    const asFraction = generateHvacRetrofits(
      { heatingType: "boiler", heatingEfficiency: 0.75 },
      100,
      100_000,
      0,
    );
    const asPercent = generateHvacRetrofits(
      { heatingType: "boiler", heatingEfficiency: 75 },
      100,
      100_000,
      0,
    );
    const hrvFraction = findMeasure(asFraction, "hvac-hrv");
    const hrvPercent = findMeasure(asPercent, "hvac-hrv");
    expect(hrvPercent.annualEnergySaving).toBeCloseTo(
      hrvFraction.annualEnergySaving,
      6,
    );
  });
});

describe("generateHvacRetrofits — mutual exclusion tagging (audit finding #8)", () => {
  it("tags boiler upgrade and heat pump with exclusiveGroup 'heating-plant'", () => {
    // η = 0.65 triggers BOTH boiler (< 0.85) and heat pump (< 0.70)
    const measures = generateHvacRetrofits(
      { heatingType: "boiler", heatingEfficiency: 0.65 },
      100,
      100_000,
      0,
    );
    const boiler = findMeasure(measures, "hvac-boiler-upgrade");
    const hp = findMeasure(measures, "hvac-heat-pump");
    const hrv = findMeasure(measures, "hvac-hrv");
    expect(boiler.exclusiveGroup).toBe("heating-plant");
    expect(hp.exclusiveGroup).toBe("heating-plant");
    expect(boiler.conflictGroup).toBe("heating-plant");
    expect(hp.conflictGroup).toBe("heating-plant");
    expect(hrv.exclusiveGroup).toBeUndefined();
    expect(hrv.conflictGroup).toBeUndefined();
  });
});

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
    // Fuel-side form (audit #1): D × (1/η − 1/0.95)
    expect(boiler.annualEnergySaving).toBeCloseTo(100_000 * (1 / 0.7 - 1 / 0.95), 3);
    expect(boiler.annualCostSaving).toBeCloseTo(boiler.annualEnergySaving * ENERGY_PRICES.gas, 3);
  });

  it("pins the heat-pump formula (η=0.6 triggers)", () => {
    const hp = generate(0.6).find((m) => m.id === "hvac-heat-pump")!;
    // saving = D/η − D/COP = 100,000/0.6 − 100,000/3.5 = 166,666.67 − 28,571.43
    expect(hp.annualEnergySaving).toBeCloseTo(100_000 / 0.6 - 100_000 / 3.5, 2);
  });

  it("pins the HRV formula (always emitted): 15% of heating demand", () => {
    const hrv = generate(0.9).find((m) => m.id === "hvac-hrv")!;
    // Fuel-side form (audit #2): demand-side 15% grossed up by η.
    expect(hrv.annualEnergySaving).toBeCloseTo((0.15 * D) / 0.9, 6);
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
