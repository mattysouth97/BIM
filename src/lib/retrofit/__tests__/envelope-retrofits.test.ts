// src/lib/retrofit/__tests__/envelope-retrofits.test.ts
// Pins the audited fuel/CO2/ground-loss math for envelope retrofit measures.

import { describe, it, expect } from "vitest";
import { generateEnvelopeRetrofits } from "../envelope-retrofits";

const TARGETS = { wall: 0.15, roof: 0.15, window: 0.9, floor: 0.18 };

function findMeasure(measures: { id: string }[], id: string) {
  const m = measures.find((x) => x.id === id);
  if (!m) throw new Error(`measure ${id} not found`);
  return m as import("../retrofit-types").RetrofitMeasure;
}

// Shared scenario: HDD = 2,500 °C·day, heating efficiency 0.8.
// Only the element under test exceeds its target U-value in each case.

describe("generateEnvelopeRetrofits — window replacement (audit findings #3, #4)", () => {
  // Window ΔU = 2.8 − 0.9 = 1.9 W/m²K, area 100 m²:
  //   energySaving = 1.9 × 100 × 2500 × 24 / 1000 / 0.8 = 14,250 kWh/yr
  const measures = generateEnvelopeRetrofits(
    { wall: 0.15, roof: 0.15, window: 2.8, floor: 0.18 },
    TARGETS,
    { wall: 300, roof: 200, window: 100, floor: 200 },
    2_500,
    0.8,
  );
  const win = findMeasure(measures, "envelope-window-replacement");

  it("saves 14,250 kWh of heating fuel", () => {
    expect(win.annualEnergySaving).toBeCloseTo(14_250, 4);
  });

  it("prices the HDD-derived heating saving at GAS (75 KRW/kWh), not electricity", () => {
    // Audit finding #3: windows' HDD-based saving is heating (gas).
    // Correct: 14,250 × 75 = 1,068,750 KRW (old code used 140 → 1,995,000).
    expect(win.annualCostSaving).toBeCloseTo(1_068_750, 0);
  });

  it("uses the gas CO2 factor (0.2018 tCO2/MWh), not the grid factor", () => {
    // Audit finding #4: 14,250 kWh × 0.0002018 t/kWh = 2.87565 tCO2
    // (old code used the electric grid factor 0.0004594 → 6.54645).
    expect(win.co2Reduction).toBeCloseTo(2.87565, 4);
  });

  it("payback reflects gas-priced savings", () => {
    // 100 m² × 350,000 KRW/m² = 35,000,000; 35,000,000 / 1,068,750 = 32.75 yr
    expect(win.estimatedCost).toBeCloseTo(35_000_000, 0);
    expect(win.paybackYears).toBeCloseTo(35_000_000 / 1_068_750, 4);
  });
});

describe("generateEnvelopeRetrofits — ground floor insulation (audit finding #5)", () => {
  // Floor ΔU = 0.58 − 0.18 = 0.4 W/m²K, area 200 m²:
  //   raw outdoor-HDD saving = 0.4 × 200 × 2500 × 24 / 1000 / 0.8 = 6,000 kWh
  // Ground-contact losses are driven by ground temperature, not outdoor air
  // (ISO 13370) → apply 0.5 reduction factor: 3,000 kWh/yr.
  const measures = generateEnvelopeRetrofits(
    { wall: 0.15, roof: 0.15, window: 0.9, floor: 0.58 },
    TARGETS,
    { wall: 300, roof: 200, window: 100, floor: 200 },
    2_500,
    0.8,
  );
  const floor = findMeasure(measures, "envelope-floor-insulation");

  it("applies the 0.5 ground reduction factor → 3,000 kWh/yr", () => {
    expect(floor.annualEnergySaving).toBeCloseTo(3_000, 4);
  });

  it("cost saving and CO2 follow the reduced saving", () => {
    // 3,000 × 75 = 225,000 KRW; 3 MWh × 0.2018 = 0.6054 tCO2
    expect(floor.annualCostSaving).toBeCloseTo(225_000, 0);
    expect(floor.co2Reduction).toBeCloseTo(0.6054, 4);
  });
});

describe("generateEnvelopeRetrofits — wall insulation (regression, unchanged math)", () => {
  it("wall ΔU=0.5 over 300 m² at HDD 2500, η 0.8 saves 11,250 kWh", () => {
    // 0.5 × 300 × 2500 × 24 / 1000 / 0.8 = 11,250 kWh; × 75 = 843,750 KRW
    const measures = generateEnvelopeRetrofits(
      { wall: 0.65, roof: 0.15, window: 0.9, floor: 0.18 },
      TARGETS,
      { wall: 300, roof: 200, window: 100, floor: 200 },
      2_500,
      0.8,
    );
    const wall = findMeasure(measures, "envelope-wall-insulation");
    expect(wall.annualEnergySaving).toBeCloseTo(11_250, 4);
    expect(wall.annualCostSaving).toBeCloseTo(843_750, 0);
  });
});
