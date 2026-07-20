// src/lib/retrofit/__tests__/envelope-retrofits.test.ts
// P1-02 — pins the envelope savings formula and lifetime annotations.
// Expected values are HAND-COMPUTED in comments, not copied from output.

import { describe, it, expect } from "vitest";
import { generateEnvelopeRetrofits, KOREAN_2020_TARGET_U_VALUES } from "../envelope-retrofits";
import { ENERGY_PRICES, MEASURE_LIFETIMES } from "../cost-database";

const AREAS = { wall: 300, roof: 200, window: 100, floor: 200 };
const HDD = 2400;
const ETA = 0.87;

function generate(u: { wall: number; roof: number; window: number; floor?: number }) {
  return generateEnvelopeRetrofits(u, KOREAN_2020_TARGET_U_VALUES, AREAS, HDD, ETA);
}

describe("generateEnvelopeRetrofits (P1-02)", () => {
  it("pins the wall-insulation saving formula and cost", () => {
    const measures = generate({ wall: 0.26, roof: 0.1, window: 0.5, floor: 0.1 });
    expect(measures).toHaveLength(1);
    const wall = measures[0];
    expect(wall.id).toBe("envelope-wall-insulation");

    // saving = (0.26 − 0.15) × 300 × 2400 × 24 / 1000 / 0.87
    //        = 0.11 × 300 × 2400 × 24 / 1000 / 0.87 = 2184.827586... kWh/yr
    expect(wall.annualEnergySaving).toBeCloseTo((0.11 * 300 * 2400 * 24) / 1000 / 0.87, 6);
    // cost = 300 m² × 120,000 KRW (KICT 2024)
    expect(wall.estimatedCost).toBe(36_000_000);
    // cost saving priced at gas
    expect(wall.annualCostSaving).toBeCloseTo(wall.annualEnergySaving * ENERGY_PRICES.gas, 6);
  });

  it("pins roof and floor variants", () => {
    const measures = generate({ wall: 0.1, roof: 0.35, window: 0.5, floor: 0.4 });
    const roof = measures.find((m) => m.id === "envelope-roof-insulation")!;
    const floor = measures.find((m) => m.id === "envelope-floor-insulation")!;

    // roof: (0.35 − 0.15) × 200 × 2400 × 24 / 1000 / 0.87 = 2648.28 kWh
    expect(roof.annualEnergySaving).toBeCloseTo((0.2 * 200 * 2400 * 24) / 1000 / 0.87, 6);
    // floor: (0.40 − 0.18) × 200 × 2400 × 24 / 1000 / 0.87
    expect(floor.annualEnergySaving).toBeCloseTo((0.22 * 200 * 2400 * 24) / 1000 / 0.87, 6);
  });

  it("emits no measure when a U-value already meets the target", () => {
    const measures = generate({ wall: 0.15, roof: 0.15, window: 0.9, floor: 0.18 });
    expect(measures).toHaveLength(0);
  });

  it("sorts by payback ascending", () => {
    const measures = generate({ wall: 0.6, roof: 0.35, window: 2.4, floor: 0.4 });
    for (let i = 1; i < measures.length; i++) {
      expect(measures[i].paybackYears).toBeGreaterThanOrEqual(measures[i - 1].paybackYears);
    }
  });

  it("every emitted measure carries its MEASURE_LIFETIMES entry (P1-02)", () => {
    const measures = generate({ wall: 0.6, roof: 0.35, window: 2.4, floor: 0.4 });
    expect(measures.length).toBeGreaterThan(0);
    for (const m of measures) {
      expect(m.lifetimeYears).toBe(MEASURE_LIFETIMES[m.id]);
      expect(m.lifetimeYears).toBeGreaterThan(0);
    }
  });
});
