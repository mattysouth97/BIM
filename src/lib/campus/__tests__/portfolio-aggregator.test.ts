import { describe, it, expect } from "vitest";
import {
  aggregatePortfolio,
  sortBuildings,
  type BuildingMetrics,
} from "../portfolio-aggregator";

const makeBuilding = (overrides: Partial<BuildingMetrics> & { buildingId: string }): BuildingMetrics => ({
  name: `Building ${overrides.buildingId}`,
  area: 1000,
  energyDemand: 150_000,
  energyPerArea: 150,
  co2Emissions: 30,
  co2PerArea: 0.03,
  energyGrade: "3",
  useType: "Office",
  era: "2000s",
  ...overrides,
});

const BUILDING_A = makeBuilding({
  buildingId: "a",
  name: "Tower A",
  area: 2000,
  energyDemand: 200_000,
  energyPerArea: 100,
  co2Emissions: 40,
  co2PerArea: 0.02,
  energyGrade: "1+",
  useType: "Office",
  era: "2010s",
});

const BUILDING_B = makeBuilding({
  buildingId: "b",
  name: "Block B",
  area: 1000,
  energyDemand: 200_000,
  energyPerArea: 200,
  co2Emissions: 20,
  co2PerArea: 0.02,
  energyGrade: "4",
  useType: "Residential",
  era: "1990s",
});

const BUILDING_C = makeBuilding({
  buildingId: "c",
  name: "Annex C",
  area: 500,
  energyDemand: 175_000,
  energyPerArea: 350,
  co2Emissions: 10,
  co2PerArea: 0.02,
  energyGrade: "7",
  useType: "Warehouse",
  era: "1980s",
});

describe("aggregatePortfolio", () => {
  it("returns zero summary for empty array", () => {
    const result = aggregatePortfolio([]);
    expect(result.totalArea).toBe(0);
    expect(result.totalEnergyDemand).toBe(0);
    expect(result.totalCO2).toBe(0);
    expect(result.avgEnergyPerArea).toBe(0);
    expect(result.avgCO2PerArea).toBe(0);
    expect(result.buildingCount).toBe(0);
    expect(result.worstPerformers).toHaveLength(0);
    expect(result.bestPerformers).toHaveLength(0);
    expect(result.gradeDistribution).toEqual({});
  });

  it("computes correct totals for 3 buildings", () => {
    const result = aggregatePortfolio([BUILDING_A, BUILDING_B, BUILDING_C]);
    expect(result.buildingCount).toBe(3);
    expect(result.totalArea).toBe(3500); // 2000 + 1000 + 500
    expect(result.totalEnergyDemand).toBe(575_000); // 200k + 200k + 175k
    expect(result.totalCO2).toBeCloseTo(70, 5); // 40 + 20 + 10
  });

  it("computes correct area-weighted average energy per area", () => {
    const result = aggregatePortfolio([BUILDING_A, BUILDING_B, BUILDING_C]);
    // avgEnergyPerArea = totalDemand / totalArea = 575000 / 3500
    expect(result.avgEnergyPerArea).toBeCloseTo(575_000 / 3500, 5);
  });

  it("computes correct area-weighted average CO2 per area", () => {
    const result = aggregatePortfolio([BUILDING_A, BUILDING_B, BUILDING_C]);
    // avgCO2PerArea = totalCO2 / totalArea = 70 / 3500
    expect(result.avgCO2PerArea).toBeCloseTo(70 / 3500, 8);
  });

  it("identifies worst performers as buildings with highest energyPerArea", () => {
    const result = aggregatePortfolio([BUILDING_A, BUILDING_B, BUILDING_C]);
    // Worst = highest energyPerArea: C(350) > B(200) > A(100)
    expect(result.worstPerformers[0].buildingId).toBe("c");
    expect(result.worstPerformers[1].buildingId).toBe("b");
    expect(result.worstPerformers[2].buildingId).toBe("a");
  });

  it("identifies best performers as buildings with lowest energyPerArea", () => {
    const result = aggregatePortfolio([BUILDING_A, BUILDING_B, BUILDING_C]);
    // Best = lowest energyPerArea: A(100) < B(200) < C(350)
    expect(result.bestPerformers[0].buildingId).toBe("a");
    expect(result.bestPerformers[1].buildingId).toBe("b");
    expect(result.bestPerformers[2].buildingId).toBe("c");
  });

  it("limits worst and best performers to 3 even with more buildings", () => {
    const buildings = Array.from({ length: 6 }, (_, i) =>
      makeBuilding({ buildingId: `x${i}`, energyPerArea: (i + 1) * 50 })
    );
    const result = aggregatePortfolio(buildings);
    expect(result.worstPerformers).toHaveLength(3);
    expect(result.bestPerformers).toHaveLength(3);
  });

  it("returns at most 3 worst/best when fewer than 3 buildings", () => {
    const result = aggregatePortfolio([BUILDING_A, BUILDING_B]);
    expect(result.worstPerformers.length).toBeLessThanOrEqual(3);
    expect(result.bestPerformers.length).toBeLessThanOrEqual(3);
  });

  it("counts grade distribution correctly", () => {
    const result = aggregatePortfolio([BUILDING_A, BUILDING_B, BUILDING_C]);
    expect(result.gradeDistribution["1+"]).toBe(1);
    expect(result.gradeDistribution["4"]).toBe(1);
    expect(result.gradeDistribution["7"]).toBe(1);
    // No other grades present
    expect(Object.keys(result.gradeDistribution)).toHaveLength(3);
  });

  it("counts multiple buildings with same grade", () => {
    const b1 = makeBuilding({ buildingId: "g1", energyGrade: "3" });
    const b2 = makeBuilding({ buildingId: "g2", energyGrade: "3" });
    const b3 = makeBuilding({ buildingId: "g3", energyGrade: "5" });
    const result = aggregatePortfolio([b1, b2, b3]);
    expect(result.gradeDistribution["3"]).toBe(2);
    expect(result.gradeDistribution["5"]).toBe(1);
  });

  it("single building summary equals the building's own metrics", () => {
    const result = aggregatePortfolio([BUILDING_A]);
    expect(result.buildingCount).toBe(1);
    expect(result.totalArea).toBe(BUILDING_A.area);
    expect(result.totalEnergyDemand).toBe(BUILDING_A.energyDemand);
    expect(result.totalCO2).toBe(BUILDING_A.co2Emissions);
    expect(result.avgEnergyPerArea).toBeCloseTo(BUILDING_A.energyPerArea, 5);
    expect(result.bestPerformers[0].buildingId).toBe("a");
    expect(result.worstPerformers[0].buildingId).toBe("a");
  });
});

describe("sortBuildings", () => {
  const buildings = [BUILDING_A, BUILDING_B, BUILDING_C];

  it("sorts by energyPerArea ascending", () => {
    const result = sortBuildings(buildings, "energyPerArea", "asc");
    expect(result.map((b) => b.buildingId)).toEqual(["a", "b", "c"]);
  });

  it("sorts by energyPerArea descending", () => {
    const result = sortBuildings(buildings, "energyPerArea", "desc");
    expect(result.map((b) => b.buildingId)).toEqual(["c", "b", "a"]);
  });

  it("sorts by co2PerArea ascending", () => {
    // All have same co2PerArea (0.02), so order is stable relative to input
    const b1 = makeBuilding({ buildingId: "1", co2PerArea: 0.01 });
    const b2 = makeBuilding({ buildingId: "2", co2PerArea: 0.05 });
    const b3 = makeBuilding({ buildingId: "3", co2PerArea: 0.03 });
    const result = sortBuildings([b1, b2, b3], "co2PerArea", "asc");
    expect(result[0].buildingId).toBe("1");
    expect(result[2].buildingId).toBe("2");
  });

  it("sorts by area ascending", () => {
    const result = sortBuildings(buildings, "area", "asc");
    // C=500, B=1000, A=2000
    expect(result.map((b) => b.buildingId)).toEqual(["c", "b", "a"]);
  });

  it("sorts by area descending", () => {
    const result = sortBuildings(buildings, "area", "desc");
    expect(result.map((b) => b.buildingId)).toEqual(["a", "b", "c"]);
  });

  it("sorts by grade ascending (best grades first)", () => {
    const result = sortBuildings(buildings, "grade", "asc");
    // A=1+, B=4, C=7
    expect(result.map((b) => b.buildingId)).toEqual(["a", "b", "c"]);
  });

  it("sorts by grade descending (worst grades first)", () => {
    const result = sortBuildings(buildings, "grade", "desc");
    expect(result.map((b) => b.buildingId)).toEqual(["c", "b", "a"]);
  });

  it("defaults to ascending when direction omitted", () => {
    const result = sortBuildings(buildings, "energyPerArea");
    expect(result[0].buildingId).toBe("a");
  });

  it("does not mutate the original array", () => {
    const original = [...buildings];
    sortBuildings(buildings, "area", "desc");
    expect(buildings.map((b) => b.buildingId)).toEqual(
      original.map((b) => b.buildingId)
    );
  });

  it("handles empty array without error", () => {
    expect(sortBuildings([], "energyPerArea")).toEqual([]);
  });

  it("handles unknown grade values without throwing", () => {
    const b = makeBuilding({ buildingId: "x", energyGrade: "unknown" });
    expect(() => sortBuildings([b, BUILDING_A], "grade", "asc")).not.toThrow();
  });
});
