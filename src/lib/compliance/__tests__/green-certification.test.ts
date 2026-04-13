// src/lib/compliance/__tests__/green-certification.test.ts
import { describe, it, expect } from "vitest";
import { scoreGreenCertification } from "../green-certification";
import type { BuildingCertificationInput } from "../green-certification";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const goodOffice2020: BuildingCertificationInput = {
  wallUValue: 0.15,    // below excellent benchmark 0.17
  windowUValue: 0.9,   // below excellent benchmark 1.0
  roofUValue: 0.11,    // below excellent benchmark 0.12
  energyGrade: "1+",
  primaryEnergyDemand: 110,
  renewableCapacity: 35,
  windowToWallRatio: 0.4,
  structureCode: "21", // RC
};

const oldBuilding1960: BuildingCertificationInput = {
  wallUValue: 1.2,     // well above baseline 0.36
  windowUValue: 4.5,   // well above baseline 2.1
  roofUValue: 0.9,     // well above baseline 0.22
  energyGrade: "7",
  renewableCapacity: 0,
  windowToWallRatio: 0.15,
  structureCode: "11", // unknown/masonry
};

// ---------------------------------------------------------------------------
// Energy & Pollution scoring
// ---------------------------------------------------------------------------

describe("scoreGreenCertification — energy & pollution category", () => {
  it("2020+ office with good envelope scores high energy points", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    const energy = result.categories.find((c) => c.id === "energy-pollution")!;
    expect(energy.assessable).toBe(true);
    // Should score well above 50% of max (24 pts legacy)
    expect(energy.earnedPoints).toBeGreaterThan(12);
  });

  it("pre-1970 building scores low energy points", () => {
    const result = scoreGreenCertification(oldBuilding1960, "pre-2024");
    const energy = result.categories.find((c) => c.id === "energy-pollution")!;
    expect(energy.assessable).toBe(true);
    expect(energy.earnedPoints).toBeLessThan(6);
  });

  it("2024 version has higher energy max points (26 vs 24)", () => {
    const legacy = scoreGreenCertification(goodOffice2020, "pre-2024");
    const current = scoreGreenCertification(goodOffice2020, "2024");
    const legacyEnergy = legacy.categories.find((c) => c.id === "energy-pollution")!;
    const currentEnergy = current.categories.find((c) => c.id === "energy-pollution")!;
    expect(legacyEnergy.maxPoints).toBe(24);
    expect(currentEnergy.maxPoints).toBe(26);
    // Higher max → higher earned for same building
    expect(currentEnergy.earnedPoints).toBeGreaterThan(legacyEnergy.earnedPoints);
  });
});

// ---------------------------------------------------------------------------
// Version differences
// ---------------------------------------------------------------------------

describe("scoreGreenCertification — version differences", () => {
  it("pre-2024 total max points is 100", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    expect(result.totalMaxPoints).toBe(100);
    expect(result.version).toBe("pre-2024");
  });

  it("2024 total max points is 100", () => {
    const result = scoreGreenCertification(goodOffice2020, "2024");
    expect(result.totalMaxPoints).toBe(100);
    expect(result.version).toBe("2024");
  });

  it("pre-2024 land-transport max is 12, 2024 is 10", () => {
    const legacy = scoreGreenCertification(goodOffice2020, "pre-2024");
    const current = scoreGreenCertification(goodOffice2020, "2024");
    const legacyLand = legacy.categories.find((c) => c.id === "land-transport")!;
    const currentLand = current.categories.find((c) => c.id === "land-transport")!;
    expect(legacyLand.maxPoints).toBe(12);
    expect(currentLand.maxPoints).toBe(10);
  });

  it("same building produces different assessableMaxPoints across versions", () => {
    const legacy = scoreGreenCertification(goodOffice2020, "pre-2024");
    const current = scoreGreenCertification(goodOffice2020, "2024");
    // Assessable categories: energy-pollution + indoor + materials-resources
    // pre-2024: 24 + 14 + 14 = 52
    // 2024:     26 + 14 + 14 = 54
    expect(legacy.assessableMaxPoints).toBe(52);
    expect(current.assessableMaxPoints).toBe(54);
  });
});

// ---------------------------------------------------------------------------
// Grade thresholds
// ---------------------------------------------------------------------------

describe("scoreGreenCertification — grade thresholds", () => {
  it("high-performance building achieves best or excellent grade", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    expect(["excellent", "best"]).toContain(result.grade);
  });

  it("old building scores not-assessable or general grade", () => {
    const result = scoreGreenCertification(oldBuilding1960, "pre-2024");
    expect(["not-assessable", "general"]).toContain(result.grade);
  });

  it("earnedPoints reflects only assessable category scores", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    const sumAssessable = result.categories.reduce(
      (sum, c) => sum + c.earnedPoints,
      0
    );
    // All non-assessable categories earn 0, so total equals sum of all
    expect(result.earnedPoints).toBeCloseTo(sumAssessable, 1);
  });

  it("assessablePercentage is between 0 and 100", () => {
    const r1 = scoreGreenCertification(goodOffice2020, "2024");
    const r2 = scoreGreenCertification(oldBuilding1960, "2024");
    expect(r1.assessablePercentage).toBeGreaterThanOrEqual(0);
    expect(r1.assessablePercentage).toBeLessThanOrEqual(100);
    expect(r2.assessablePercentage).toBeGreaterThanOrEqual(0);
    expect(r2.assessablePercentage).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Non-assessable categories
// ---------------------------------------------------------------------------

describe("scoreGreenCertification — non-assessable categories", () => {
  const nonAssessableIds = [
    "land-transport",
    "water",
    "maintenance",
    "ecology",
    "innovation",
  ];

  it("non-assessable categories have earnedPoints = 0", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    for (const id of nonAssessableIds) {
      const cat = result.categories.find((c) => c.id === id)!;
      expect(cat.earnedPoints).toBe(0);
    }
  });

  it("non-assessable categories have assessable = false", () => {
    const result = scoreGreenCertification(goodOffice2020, "2024");
    for (const id of nonAssessableIds) {
      const cat = result.categories.find((c) => c.id === id)!;
      expect(cat.assessable).toBe(false);
    }
  });

  it("assessable categories have assessable = true", () => {
    const result = scoreGreenCertification(goodOffice2020, "2024");
    for (const id of ["energy-pollution", "indoor", "materials-resources"]) {
      const cat = result.categories.find((c) => c.id === id)!;
      expect(cat.assessable).toBe(true);
    }
  });

  it("all categories have non-empty assessmentNote", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    for (const cat of result.categories) {
      expect(cat.assessmentNote.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------

describe("scoreGreenCertification — disclaimer", () => {
  it("result includes a disclaimer string", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    expect(typeof result.disclaimer).toBe("string");
    expect(result.disclaimer.length).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe("scoreGreenCertification — result shape", () => {
  it("returns 8 categories", () => {
    const result = scoreGreenCertification(goodOffice2020, "pre-2024");
    expect(result.categories).toHaveLength(8);
  });

  it("each category has required fields", () => {
    const result = scoreGreenCertification(goodOffice2020, "2024");
    for (const cat of result.categories) {
      expect(typeof cat.id).toBe("string");
      expect(typeof cat.nameKo).toBe("string");
      expect(typeof cat.nameEn).toBe("string");
      expect(typeof cat.maxPoints).toBe("number");
      expect(typeof cat.earnedPoints).toBe("number");
      expect(typeof cat.assessable).toBe("boolean");
      expect(typeof cat.assessmentNote).toBe("string");
      // earnedPoints must not exceed maxPoints
      expect(cat.earnedPoints).toBeLessThanOrEqual(cat.maxPoints);
      expect(cat.earnedPoints).toBeGreaterThanOrEqual(0);
    }
  });
});
