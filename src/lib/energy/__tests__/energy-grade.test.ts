import { describe, it, expect } from "vitest";
import { getEnergyGrade, getGradeColor, GRADE_THRESHOLDS } from "../energy-grade";
import type { EnergyGrade } from "../energy-grade";

describe("getEnergyGrade", () => {
  it("returns 1+++ for demand below 60", () => {
    expect(getEnergyGrade(0)).toBe("1+++");
    expect(getEnergyGrade(30)).toBe("1+++");
    expect(getEnergyGrade(59)).toBe("1+++");
    expect(getEnergyGrade(59.99)).toBe("1+++");
  });

  it("returns 1++ for demand 60-89", () => {
    expect(getEnergyGrade(60)).toBe("1++");
    expect(getEnergyGrade(75)).toBe("1++");
    expect(getEnergyGrade(89.99)).toBe("1++");
  });

  it("returns 1+ for demand 90-119", () => {
    expect(getEnergyGrade(90)).toBe("1+");
    expect(getEnergyGrade(100)).toBe("1+");
    expect(getEnergyGrade(119.99)).toBe("1+");
  });

  it("returns 1 for demand 120-149 (Korean Grade 1 < 150 benchmark)", () => {
    expect(getEnergyGrade(120)).toBe("1");
    expect(getEnergyGrade(140)).toBe("1");
    expect(getEnergyGrade(149.99)).toBe("1");
  });

  it("returns 2 for demand 150-189", () => {
    expect(getEnergyGrade(150)).toBe("2");
    expect(getEnergyGrade(170)).toBe("2");
    expect(getEnergyGrade(189.99)).toBe("2");
  });

  it("returns 3 for demand 190-229", () => {
    expect(getEnergyGrade(190)).toBe("3");
    expect(getEnergyGrade(229.99)).toBe("3");
  });

  it("returns 4 for demand 230-269", () => {
    expect(getEnergyGrade(230)).toBe("4");
    expect(getEnergyGrade(269.99)).toBe("4");
  });

  it("returns 5 for demand 270-319", () => {
    expect(getEnergyGrade(270)).toBe("5");
    expect(getEnergyGrade(319.99)).toBe("5");
  });

  it("returns 6 for demand 320-369", () => {
    expect(getEnergyGrade(320)).toBe("6");
    expect(getEnergyGrade(369.99)).toBe("6");
  });

  it("returns 7 for demand >= 370", () => {
    expect(getEnergyGrade(370)).toBe("7");
    expect(getEnergyGrade(500)).toBe("7");
    expect(getEnergyGrade(1000)).toBe("7");
  });

  it("handles exact boundary values", () => {
    // Each threshold is the upper bound (exclusive) for the grade
    expect(getEnergyGrade(60)).toBe("1++"); // exactly at 1+++ threshold
    expect(getEnergyGrade(90)).toBe("1+");
    expect(getEnergyGrade(120)).toBe("1");
    expect(getEnergyGrade(150)).toBe("2");
    expect(getEnergyGrade(190)).toBe("3");
    expect(getEnergyGrade(230)).toBe("4");
    expect(getEnergyGrade(270)).toBe("5");
    expect(getEnergyGrade(320)).toBe("6");
    expect(getEnergyGrade(370)).toBe("7");
  });
});

describe("getGradeColor", () => {
  const ALL_GRADES: EnergyGrade[] = [
    "1+++", "1++", "1+", "1", "2", "3", "4", "5", "6", "7",
  ];

  it("returns valid hex color for each grade", () => {
    for (const grade of ALL_GRADES) {
      const color = getGradeColor(grade);
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("efficient grades are green-ish, inefficient are red-ish", () => {
    // 1+++ should be dark green
    expect(getGradeColor("1+++")).toBe("#006400");
    // 7 should be crimson
    expect(getGradeColor("7")).toBe("#DC143C");
  });
});

describe("GRADE_THRESHOLDS", () => {
  it("has 9 thresholds (1+++ through 6, no threshold for 7)", () => {
    expect(Object.keys(GRADE_THRESHOLDS)).toHaveLength(9);
  });

  it("thresholds are in ascending order", () => {
    const gradeOrder = ["1+++", "1++", "1+", "1", "2", "3", "4", "5", "6"] as const;
    for (let i = 1; i < gradeOrder.length; i++) {
      expect(GRADE_THRESHOLDS[gradeOrder[i]]).toBeGreaterThan(
        GRADE_THRESHOLDS[gradeOrder[i - 1]]
      );
    }
  });
});
