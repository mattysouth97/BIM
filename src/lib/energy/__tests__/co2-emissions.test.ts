import { describe, it, expect } from "vitest";
import { calculateCO2, KOREAN_GRID_EMISSION_FACTOR } from "../co2-emissions";
import type { AnnualDemand } from "../annual-demand";

describe("calculateCO2", () => {
  it("uses Korean grid emission factor of 0.4594 tCO2/MWh", () => {
    expect(KOREAN_GRID_EMISSION_FACTOR).toBe(0.4594);
  });

  it("calculates CO2 for 100 kWh/m2/yr on 84m2", () => {
    const totalFloorArea = 84;
    const demand: AnnualDemand = {
      heatingDemand: 6000,
      coolingDemand: 2400,
      totalDemand: 8400, // 100 kWh/m2 * 84 m2
      demandPerSqm: 100,
    };

    const result = calculateCO2(demand, totalFloorArea, "gas");

    // Per-fuel factors: heating rides gas (0.202 t/MWh), cooling the grid
    // (0.4594): 6.0 MWh × 0.202 + 2.4 MWh × 0.4594 = 1.212 + 1.10256 = 2.3146 t
    expect(result.totalCO2).toBeCloseTo(2.3146, 3);

    // CO2/m2 = 2314.6 kg / 84 m² = 27.55 kgCO2/m²·yr
    expect(result.co2PerSqm).toBeCloseTo(27.55, 1);
  });

  it("electric heating uses the grid factor for both legs", () => {
    const demand: AnnualDemand = {
      heatingDemand: 6000,
      coolingDemand: 2400,
      totalDemand: 8400,
      demandPerSqm: 100,
    };
    const result = calculateCO2(demand, 84, "electric");
    // 8.4 MWh × 0.4594 = 3.859 t — the old single-factor value, now only
    // correct for all-electric buildings.
    expect(result.totalCO2).toBeCloseTo(3.859, 2);
  });

  it("returns zero for zero demand", () => {
    const demand: AnnualDemand = {
      heatingDemand: 0,
      coolingDemand: 0,
      totalDemand: 0,
      demandPerSqm: 0,
    };

    const result = calculateCO2(demand, 100);
    expect(result.totalCO2).toBe(0);
    expect(result.co2PerSqm).toBe(0);
  });

  it("handles zero floor area", () => {
    const demand: AnnualDemand = {
      heatingDemand: 1000,
      coolingDemand: 500,
      totalDemand: 1500,
      demandPerSqm: 0,
    };

    const result = calculateCO2(demand, 0);
    expect(result.totalCO2).toBeGreaterThan(0);
    expect(result.co2PerSqm).toBe(0);
  });

  it("CO2 scales linearly with demand", () => {
    const demand1: AnnualDemand = {
      heatingDemand: 5000,
      coolingDemand: 0,
      totalDemand: 5000,
      demandPerSqm: 50,
    };
    const demand2: AnnualDemand = {
      heatingDemand: 10000,
      coolingDemand: 0,
      totalDemand: 10000,
      demandPerSqm: 100,
    };

    const result1 = calculateCO2(demand1, 100);
    const result2 = calculateCO2(demand2, 100);

    expect(result2.totalCO2).toBeCloseTo(result1.totalCO2 * 2, 5);
  });

  // ── P2-02: per-fuel CO2 ────────────────────────────────────────────────────

  it("computes CO2 per fuel and is lower than the single-factor result for gas heating (s1)", () => {
    const demand: AnnualDemand = {
      heatingDemand: 6000, coolingDemand: 2400, totalDemand: 8400, demandPerSqm: 100,
      fuelDemand: { electricKwh: 2400, fossilKwh: 6000, fossilFuel: "gas" },
    };
    const result = calculateCO2(demand, 84);

    // electric 2400/1000×0.4594 + gas 6000/1000×0.2018
    const expected = (2400 / 1000) * 0.4594 + (6000 / 1000) * 0.2018;
    expect(result.totalCO2).toBeCloseTo(expected, 5);
    expect(result.electricCO2).toBeCloseTo((2400 / 1000) * 0.4594, 5);
    expect(result.fossilCO2).toBeCloseTo((6000 / 1000) * 0.2018, 5);
    // Strictly lower than the old all-electric-on-total result.
    expect(result.totalCO2).toBeLessThan((8400 / 1000) * 0.4594);
    expect(result.assumption).toBeUndefined();
  });

  it("all-electric fuel split equals the legacy factor path (s2)", () => {
    const demand: AnnualDemand = {
      heatingDemand: 3000, coolingDemand: 3000, totalDemand: 6000, demandPerSqm: 60,
      fuelDemand: { electricKwh: 6000, fossilKwh: 0, fossilFuel: null },
    };
    const result = calculateCO2(demand, 100);
    expect(result.totalCO2).toBeCloseTo((6000 / 1000) * 0.4594, 5);
    expect(result.fossilCO2).toBe(0);
  });

  it("falls back to all-electric with an explicit flag when no fuel split is provided (s4)", () => {
    const demand: AnnualDemand = {
      heatingDemand: 6000, coolingDemand: 2400, totalDemand: 8400, demandPerSqm: 100,
    };
    const result = calculateCO2(demand, 84);
    expect(result.totalCO2).toBeCloseTo((8400 / 1000) * 0.4594, 5);
    expect(result.assumption).toBeTruthy();
  });
});
