// src/lib/retrofit/__tests__/lighting-retrofits.test.ts
// P1-02 — pins the lighting savings formula, branch boundaries, lifetimes.

import { describe, it, expect } from "vitest";
import { generateLightingRetrofits } from "../lighting-retrofits";
import { MEASURE_LIFETIMES } from "../cost-database";

describe("generateLightingRetrofits (P1-02)", () => {
  it("pins the LED+smart formula for LPD 20 → 6", () => {
    const measures = generateLightingRetrofits(20, 1000, 2500);
    expect(measures).toHaveLength(1);
    const m = measures[0];
    expect(m.id).toBe("lighting-led-smart");
    // saving = (20 − 6) × 1000 × 2500 / 1000 = 35,000 kWh/yr
    expect(m.annualEnergySaving).toBe(35_000);
    // cost = (45,000 + 25,000) × 1000
    expect(m.estimatedCost).toBe(70_000_000);
  });

  it("LPD 15 falls into the LED-only branch (boundary is strict >15)", () => {
    const measures = generateLightingRetrofits(15, 1000, 2500);
    expect(measures).toHaveLength(1);
    expect(measures[0].id).toBe("lighting-led");
    // saving = (15 − 8) × 1000 × 2500 / 1000 = 17,500 kWh
    expect(measures[0].annualEnergySaving).toBe(17_500);
  });

  it("LPD 10 and below emit no measure (boundary is strict >10)", () => {
    expect(generateLightingRetrofits(10, 1000, 2500)).toHaveLength(0);
    expect(generateLightingRetrofits(9.9, 1000, 2500)).toHaveLength(0);
  });

  it("every emitted measure carries its MEASURE_LIFETIMES entry (P1-02)", () => {
    for (const lpd of [20, 12]) {
      for (const m of generateLightingRetrofits(lpd, 1000, 2500)) {
        expect(m.lifetimeYears).toBe(MEASURE_LIFETIMES[m.id]);
      }
    }
  });
});
