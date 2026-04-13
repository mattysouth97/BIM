import { describe, it, expect } from "vitest";
import { calibrateEnergy } from "../calibration";

// Helper: build a predicted input with common defaults
function makePredicted(overrides?: Partial<{ heating: number; cooling: number; lighting: number; dhw: number; total: number }>) {
  return {
    heating: 10_000,
    cooling: 5_000,
    lighting: 3_000,
    dhw: 2_000,
    total: 20_000,
    ...overrides,
  };
}

describe("calibrateEnergy", () => {
  describe("building using MORE energy than predicted", () => {
    it("produces a negative overallDelta when actual > predicted", () => {
      const predicted = makePredicted({ total: 10_000 });
      const actual = { gas_kwh: 8_000, electric_kwh: 8_000, total_kwh: 16_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.overallDelta).toBeLessThan(0);
    });

    it("insight mentions 'more' when actual exceeds predicted", () => {
      const predicted = makePredicted({ total: 10_000 });
      const actual = { gas_kwh: 8_000, electric_kwh: 8_000, total_kwh: 16_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.insight.toLowerCase()).toContain("more");
    });

    it("calibrationRatio > 1 when actual > predicted", () => {
      const predicted = makePredicted({ total: 10_000 });
      const actual = { gas_kwh: 8_000, electric_kwh: 8_000, total_kwh: 16_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.calibrationRatio).toBeGreaterThan(1);
    });
  });

  describe("building using LESS energy than predicted", () => {
    it("produces a positive overallDelta when actual < predicted", () => {
      const predicted = makePredicted({ total: 20_000 });
      const actual = { gas_kwh: 2_000, electric_kwh: 2_000, total_kwh: 10_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.overallDelta).toBeGreaterThan(0);
    });

    it("insight mentions 'less' when actual is below predicted", () => {
      const predicted = makePredicted({ total: 20_000 });
      const actual = { gas_kwh: 2_000, electric_kwh: 2_000, total_kwh: 10_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.insight.toLowerCase()).toContain("less");
    });

    it("calibrationRatio < 1 when actual < predicted", () => {
      const predicted = makePredicted({ total: 20_000 });
      const actual = { gas_kwh: 2_000, electric_kwh: 2_000, total_kwh: 10_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.calibrationRatio).toBeLessThan(1);
    });
  });

  describe("perfect match", () => {
    // Construct actual that maps back to exactly the predicted end-uses
    // heating=10_000 → gas = 10_000/0.8 = 12_500
    // dhw=2_000 → gas contribution = 2_000/0.2 = 10_000 (conflict with heating split)
    // Use total_kwh = predicted.total to get overallDelta ≈ 0
    it("overallDelta is near zero when total_kwh matches predicted.total", () => {
      const predicted = makePredicted({ total: 20_000 });
      const actual = { gas_kwh: 5_000, electric_kwh: 5_000, total_kwh: 20_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.overallDelta).toBeCloseTo(0, 5);
    });

    it("insight mentions 'closely matches' when delta < 5%", () => {
      const predicted = makePredicted({ total: 20_000 });
      const actual = { gas_kwh: 5_000, electric_kwh: 5_000, total_kwh: 20_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.insight.toLowerCase()).toContain("closely matches");
    });

    it("calibrationRatio is 1 when actual.total_kwh equals predicted.total", () => {
      const predicted = makePredicted({ total: 20_000 });
      const actual = { gas_kwh: 5_000, electric_kwh: 5_000, total_kwh: 20_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.calibrationRatio).toBeCloseTo(1, 5);
    });
  });

  describe("largestDiscrepancy", () => {
    it("identifies heating as largest discrepancy when heating delta dominates", () => {
      // Make predicted heating very high but actual gas (→ actual heating) very low
      const predicted = makePredicted({
        heating: 50_000,
        cooling: 1_000,
        lighting: 1_000,
        dhw: 1_000,
        total: 53_000,
      });
      // gas_kwh = 1_000 → actualHeating = 800 — predicted=50_000, huge gap
      // electric_kwh = 2_000 → actualCooling=800, actualLighting=1_200 — small gap vs predicted
      const actual = { gas_kwh: 1_000, electric_kwh: 2_000, total_kwh: 3_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.largestDiscrepancy).toBe("heating");
    });

    it("identifies cooling as largest discrepancy when cooling delta dominates", () => {
      // Predicted cooling very high, but actual electric low
      const predicted = makePredicted({
        heating: 100,
        cooling: 50_000,
        lighting: 100,
        dhw: 100,
        total: 50_300,
      });
      // gas_kwh=500 → actualHeating=400, actualDhw=100 — matches predicted closely
      // electric_kwh=500 → actualCooling=200 — far from predicted 50_000
      const actual = { gas_kwh: 500, electric_kwh: 500, total_kwh: 1_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.largestDiscrepancy).toBe("cooling");
    });

    it("identifies dhw as largest discrepancy when dhw delta dominates", () => {
      // Predicted DHW extremely high, all other end-uses match closely
      const predicted = makePredicted({
        heating: 0,
        cooling: 0,
        lighting: 0,
        dhw: 50_000,
        total: 50_000,
      });
      // gas_kwh=100 → actualDhw = 100*0.2 = 20 — far from 50_000
      // electric_kwh=0
      const actual = { gas_kwh: 100, electric_kwh: 0, total_kwh: 100 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.largestDiscrepancy).toBe("dhw");
    });
  });

  describe("endUseBreakdown", () => {
    it("correctly maps gas to heating (80%) and dhw (20%)", () => {
      const predicted = makePredicted();
      const actual = { gas_kwh: 10_000, electric_kwh: 0, total_kwh: 10_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.endUseBreakdown.heating?.actual).toBeCloseTo(8_000, 5);
      expect(result.endUseBreakdown.dhw?.actual).toBeCloseTo(2_000, 5);
    });

    it("correctly maps electric to cooling (40%) and lighting (60%)", () => {
      const predicted = makePredicted();
      const actual = { gas_kwh: 0, electric_kwh: 10_000, total_kwh: 10_000 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.endUseBreakdown.cooling?.actual).toBeCloseTo(4_000, 5);
      expect(result.endUseBreakdown.lighting?.actual).toBeCloseTo(6_000, 5);
    });

    it("endUseBreakdown delta for heating is (predicted - actual) / actual * 100", () => {
      const predicted = makePredicted({ heating: 10_000 });
      const actual = { gas_kwh: 10_000, electric_kwh: 0, total_kwh: 10_000 };
      // actualHeating = 10_000 * 0.8 = 8_000
      const expectedDelta = ((10_000 - 8_000) / 8_000) * 100; // 25%
      const result = calibrateEnergy(predicted, actual);
      expect(result.endUseBreakdown.heating?.delta).toBeCloseTo(expectedDelta, 5);
    });
  });

  describe("edge cases", () => {
    it("does not produce NaN when actual total_kwh is zero", () => {
      const predicted = makePredicted({ total: 20_000 });
      const actual = { gas_kwh: 0, electric_kwh: 0, total_kwh: 0 };
      const result = calibrateEnergy(predicted, actual);
      expect(isNaN(result.overallDelta)).toBe(false);
      expect(result.overallDelta).toBe(0);
    });

    it("calibrationRatio defaults to 1 when predicted total is zero", () => {
      const predicted = makePredicted({ heating: 0, cooling: 0, lighting: 0, dhw: 0, total: 0 });
      const actual = { gas_kwh: 0, electric_kwh: 0, total_kwh: 0 };
      const result = calibrateEnergy(predicted, actual);
      expect(result.calibrationRatio).toBe(1);
    });
  });
});
