// src/lib/retrofit/__tests__/hvac-retrofits.test.ts
// Pins the audited fuel-side math for HVAC retrofit measures.

import { describe, it, expect } from "vitest";
import { generateHvacRetrofits } from "../hvac-retrofits";

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
    expect(hrv.exclusiveGroup).toBeUndefined();
  });
});
