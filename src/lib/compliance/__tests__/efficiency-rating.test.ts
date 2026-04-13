import { describe, it, expect } from "vitest";
import {
  calculateEfficiencyRating,
  RESIDENTIAL_THRESHOLDS,
  NON_RESIDENTIAL_THRESHOLDS,
} from "../efficiency-rating";
import { PRIMARY_ENERGY_FACTORS } from "@/lib/energy/primary-energy";

// Helpers to produce a delivered input that lands at a known primary kWh/m²·yr.
// All electricity, area = 1 m² → primaryEnergyPerArea = electric * 2.75
function electricDeliveredForPrimary(primaryPerSqm: number): number {
  return primaryPerSqm / PRIMARY_ENERGY_FACTORS.electricity;
}

describe("calculateEfficiencyRating — residential", () => {
  it("returns 1+++ for primary energy below 60 kWh/m²·yr", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(30), gas: 0 },
      1,
      "residential"
    );
    expect(result.grade).toBe("1+++");
    expect(result.primaryEnergyPerArea).toBeCloseTo(30, 4);
  });

  it("returns 7 for very high primary energy (> 450 kWh/m²·yr)", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(500), gas: 0 },
      1,
      "residential"
    );
    expect(result.grade).toBe("7");
  });

  it("boundary: exactly at 1+++ threshold (60) is still 1+++", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(60), gas: 0 },
      1,
      "residential"
    );
    expect(result.grade).toBe("1+++");
  });

  it("boundary: just below 1+++ threshold (59.99…) stays in 1+++", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(59.999), gas: 0 },
      1,
      "residential"
    );
    expect(result.grade).toBe("1+++");
  });

  it("returns correct grade for grade 2 range (200 > x ≥ 150)", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(175), gas: 0 },
      1,
      "residential"
    );
    expect(result.grade).toBe("2");
  });

  it("includes breakdown with primaryEnergyPerArea", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(100), gas: 0 },
      1,
      "residential"
    );
    expect(result.breakdown.primaryEnergyPerArea).toBeCloseTo(100, 4);
    expect(result.gradeLabel).toContain("1+");
  });
});

describe("calculateEfficiencyRating — non-residential", () => {
  it("uses higher thresholds than residential (same primary → better grade)", () => {
    // 70 kWh/m²·yr → residential: 1++ (≥60), non-residential: 1+++ (<80)
    const primary = 70;
    const residential = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(primary), gas: 0 },
      1,
      "residential"
    );
    const nonResidential = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(primary), gas: 0 },
      1,
      "non-residential"
    );
    expect(residential.grade).toBe("1++");
    expect(nonResidential.grade).toBe("1+++");
  });

  it("returns appropriate grade for moderate demand", () => {
    // 300 kWh/m²·yr non-residential → 2 (threshold: 260–320)
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(300), gas: 0 },
      1,
      "non-residential"
    );
    expect(result.grade).toBe("2");
  });

  it("boundary: exactly at non-residential 1+++ threshold (80) falls into 1++", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(80), gas: 0 },
      1,
      "non-residential"
    );
    expect(result.grade).toBe("1++");
  });

  it("returns 7 above top threshold (> 610 kWh/m²·yr)", () => {
    const result = calculateEfficiencyRating(
      { electric: electricDeliveredForPrimary(700), gas: 0 },
      1,
      "non-residential"
    );
    expect(result.grade).toBe("7");
  });
});

describe("RESIDENTIAL_THRESHOLDS", () => {
  it("has 9 entries (grades 1+++ through 6)", () => {
    expect(Object.keys(RESIDENTIAL_THRESHOLDS)).toHaveLength(9);
  });

  it("thresholds are in ascending order", () => {
    const grades = ["1+++", "1++", "1+", "1", "2", "3", "4", "5", "6"] as const;
    for (let i = 1; i < grades.length; i++) {
      expect(RESIDENTIAL_THRESHOLDS[grades[i]]).toBeGreaterThan(
        RESIDENTIAL_THRESHOLDS[grades[i - 1]]
      );
    }
  });
});

describe("NON_RESIDENTIAL_THRESHOLDS", () => {
  it("all thresholds are higher than residential equivalents", () => {
    const grades = ["1+++", "1++", "1+", "1", "2", "3", "4", "5", "6"] as const;
    for (const grade of grades) {
      expect(NON_RESIDENTIAL_THRESHOLDS[grade]).toBeGreaterThanOrEqual(
        RESIDENTIAL_THRESHOLDS[grade]
      );
    }
  });
});
