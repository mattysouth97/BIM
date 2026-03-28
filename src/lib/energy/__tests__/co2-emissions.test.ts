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

    const result = calculateCO2(demand, totalFloorArea);

    // CO2 = 8400 kWh / 1000 * 0.4594 = 3.859 tCO2/yr
    expect(result.totalCO2).toBeCloseTo(3.859, 2);

    // CO2/m2 = 3.859 tCO2 * 1000 / 84 = 45.94 kgCO2/m2/yr
    expect(result.co2PerSqm).toBeCloseTo(45.94, 1);
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
});
