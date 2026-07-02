import { describe, it, expect } from "vitest";
import { compareBuildings } from "../comparison-engine";
import type { BuildingInput } from "../comparison-engine";

function makeBuilding(overrides: Partial<BuildingInput> & { id: string; name: string }): BuildingInput {
  return {
    energyPerArea: 100,
    co2PerArea: 20,
    wallU: 0.3,
    roofU: 0.2,
    windowU: 1.4,
    airtightness: 3.0,
    ...overrides,
  };
}

describe("compareBuildings", () => {
  describe("2 buildings", () => {
    it("identifies correct best and worst for each metric", () => {
      const buildings: BuildingInput[] = [
        makeBuilding({ id: "a", name: "Building A", energyPerArea: 80, co2PerArea: 15 }),
        makeBuilding({ id: "b", name: "Building B", energyPerArea: 120, co2PerArea: 25 }),
      ];

      const result = compareBuildings(buildings);

      expect(result.buildings).toHaveLength(2);
      expect(result.metrics).toHaveLength(6);

      const energy = result.metrics.find((m) => m.label === "Energy Demand")!;
      // Lower energy = better → A is best
      expect(energy.best).toBe("a");
      expect(energy.worst).toBe("b");

      const co2 = result.metrics.find((m) => m.label === "CO₂ Emissions")!;
      expect(co2.best).toBe("a");
      expect(co2.worst).toBe("b");
    });

    it("best building gets normalized = 1.0, worst gets 0.0", () => {
      const buildings: BuildingInput[] = [
        makeBuilding({ id: "a", name: "A", energyPerArea: 80 }),
        makeBuilding({ id: "b", name: "B", energyPerArea: 160 }),
      ];

      const result = compareBuildings(buildings);
      const energy = result.metrics.find((m) => m.label === "Energy Demand")!;

      const aEntry = energy.values.find((v) => v.buildingId === "a")!;
      const bEntry = energy.values.find((v) => v.buildingId === "b")!;

      expect(aEntry.normalized).toBe(1);
      expect(bEntry.normalized).toBe(0);
    });
  });

  describe("3 buildings", () => {
    it("normalizes all metrics correctly across three buildings", () => {
      const buildings: BuildingInput[] = [
        makeBuilding({ id: "a", name: "A", energyPerArea: 60 }),
        makeBuilding({ id: "b", name: "B", energyPerArea: 100 }),
        makeBuilding({ id: "c", name: "C", energyPerArea: 140 }),
      ];

      const result = compareBuildings(buildings);
      const energy = result.metrics.find((m) => m.label === "Energy Demand")!;

      const aEntry = energy.values.find((v) => v.buildingId === "a")!;
      const bEntry = energy.values.find((v) => v.buildingId === "b")!;
      const cEntry = energy.values.find((v) => v.buildingId === "c")!;

      // A has lowest energy → normalized 1.0 (best)
      expect(aEntry.normalized).toBe(1);
      // C has highest energy → normalized 0.0 (worst)
      expect(cEntry.normalized).toBe(0);
      // B is in the middle: (140-100)/(140-60) = 40/80 = 0.5 from the top → normalized = 0.5
      expect(bEntry.normalized).toBeCloseTo(0.5, 5);
    });

    it("all six metrics are present and have values for all buildings", () => {
      const buildings: BuildingInput[] = [
        makeBuilding({ id: "a", name: "A" }),
        makeBuilding({ id: "b", name: "B", wallU: 0.5, roofU: 0.4, windowU: 2.0 }),
        makeBuilding({ id: "c", name: "C", wallU: 0.2, roofU: 0.15, windowU: 1.0 }),
      ];

      const result = compareBuildings(buildings);
      expect(result.metrics).toHaveLength(6);

      for (const metric of result.metrics) {
        expect(metric.values).toHaveLength(3);
        for (const v of metric.values) {
          expect(v.normalized).toBeGreaterThanOrEqual(0);
          expect(v.normalized).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("single building", () => {
    it("all metrics normalize to 1.0 for a single building", () => {
      const buildings: BuildingInput[] = [
        makeBuilding({ id: "solo", name: "Solo" }),
      ];

      const result = compareBuildings(buildings);

      for (const metric of result.metrics) {
        expect(metric.values).toHaveLength(1);
        expect(metric.values[0].normalized).toBe(1);
        // best and worst both point to the only building
        expect(metric.best).toBe("solo");
        expect(metric.worst).toBe("solo");
      }
    });
  });

  describe("building with all-best values", () => {
    it("scores 1.0 for all metrics when it outperforms all others", () => {
      const buildings: BuildingInput[] = [
        makeBuilding({
          id: "best",
          name: "Best Building",
          energyPerArea: 40,
          co2PerArea: 8,
          wallU: 0.1,
          roofU: 0.08,
          windowU: 0.8,
          airtightness: 0.5,
        }),
        makeBuilding({
          id: "avg",
          name: "Average Building",
          energyPerArea: 100,
          co2PerArea: 20,
          wallU: 0.4,
          roofU: 0.3,
          windowU: 1.8,
          airtightness: 4.0,
        }),
      ];

      const result = compareBuildings(buildings);

      for (const metric of result.metrics) {
        const bestEntry = metric.values.find((v) => v.buildingId === "best")!;
        expect(bestEntry.normalized).toBe(1);
        expect(metric.best).toBe("best");
      }
    });
  });

  describe("edge cases", () => {
    it("returns empty result for zero buildings", () => {
      const result = compareBuildings([]);
      expect(result.buildings).toHaveLength(0);
      expect(result.metrics).toHaveLength(0);
    });

    it("all buildings with identical values all get normalized = 1.0", () => {
      const buildings: BuildingInput[] = [
        makeBuilding({ id: "a", name: "A", energyPerArea: 100 }),
        makeBuilding({ id: "b", name: "B", energyPerArea: 100 }),
      ];

      const result = compareBuildings(buildings);
      const energy = result.metrics.find((m) => m.label === "Energy Demand")!;

      for (const v of energy.values) {
        expect(v.normalized).toBe(1);
      }
    });
  });
});
