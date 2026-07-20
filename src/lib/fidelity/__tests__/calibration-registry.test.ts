// src/lib/fidelity/__tests__/calibration-registry.test.ts
// TDD tests for P2-12: calibration registry schema validation + floor-height override.

import { describe, it, expect } from "vitest";
import {
  loadCalibration,
  validateCalibrationEntry,
  applyCalibrationFloorHeights,
} from "../building-calibration-loader";
import type { BuildingCalibration } from "../fidelity-types";
import type { FloorSpec } from "@/lib/procedural/types";

describe("validateCalibrationEntry", () => {
  it("accepts a valid calibration entry", () => {
    const valid: BuildingCalibration = {
      buildingId: "1111010100100010000",
      pnu: "1111010100100010000",
      geometricLOD: "L3",
      overrides: [
        {
          field: "walls.uValue",
          inferredValue: 0.47,
          overrideValue: 0.28,
          source: "permit-drawing-A3 sheet 4",
          hypothesisForInference: "if OCR could read insulation thickness",
        },
      ],
    };
    expect(() => validateCalibrationEntry(valid)).not.toThrow();
  });

  it("rejects entry with missing buildingId", () => {
    const invalid = {
      pnu: "1111010100100010000",
      geometricLOD: "L3",
      overrides: [],
    } as unknown as BuildingCalibration;
    expect(() => validateCalibrationEntry(invalid)).toThrow(/buildingId/);
  });

  it("rejects entry with invalid geometricLOD", () => {
    const invalid: BuildingCalibration = {
      buildingId: "1111010100100010000",
      geometricLOD: "L99" as never,
      overrides: [],
    };
    expect(() => validateCalibrationEntry(invalid)).toThrow(/geometricLOD/);
  });

  it("rejects override with empty source (no 'backfit'/'tuned' vague sources)", () => {
    const invalid: BuildingCalibration = {
      buildingId: "1111010100100010000",
      geometricLOD: "L2",
      overrides: [
        {
          field: "floorHeights.3",
          inferredValue: 2.9,
          overrideValue: 3.15,
          source: "", // empty source is invalid
          hypothesisForInference: "some hypothesis",
        },
      ],
    };
    expect(() => validateCalibrationEntry(invalid)).toThrow(/source/);
  });

  it("rejects override with vague source 'backfit'", () => {
    const invalid: BuildingCalibration = {
      buildingId: "1111010100100010000",
      geometricLOD: "L2",
      overrides: [
        {
          field: "floorHeights.3",
          inferredValue: 2.9,
          overrideValue: 3.15,
          source: "backfit",
          hypothesisForInference: "some hypothesis",
        },
      ],
    };
    expect(() => validateCalibrationEntry(invalid)).toThrow(/source/);
  });
});

describe("loadCalibration with seed entries", () => {
  it("returns null for an unknown buildingId (never an error)", () => {
    expect(loadCalibration("completely-unknown-pk-9999999")).toBeNull();
  });

  it("loads seed entry for GN district apartment (11110-series)", () => {
    const cal = loadCalibration("seed-apt-gangnam-2003");
    expect(cal).not.toBeNull();
    expect(cal?.buildingId).toBe("seed-apt-gangnam-2003");
    expect(cal?.geometricLOD).toMatch(/^L[123]$/);
  });

  it("loads seed entry for office building", () => {
    const cal = loadCalibration("seed-office-mapo-2012");
    expect(cal).not.toBeNull();
    expect(cal?.geometricLOD).toBe("L2");
  });

  it("loads all 5 seed entries without throwing", () => {
    const seedIds = [
      "seed-apt-gangnam-2003",
      "seed-office-mapo-2012",
      "seed-factory-guro-1988",
      "seed-retail-jongno-1995",
      "seed-apt-nowon-1979",
    ];
    for (const id of seedIds) {
      expect(() => loadCalibration(id)).not.toThrow();
      expect(loadCalibration(id)).not.toBeNull();
    }
  });
});

describe("applyCalibrationFloorHeights", () => {
  const baseFloors: FloorSpec[] = [
    { floorNo: 1, label: "1F", type: "above", y: 0, height: 2.9, isGroundFloor: true },
    { floorNo: 2, label: "2F", type: "above", y: 2.9, height: 2.9, isGroundFloor: false },
    { floorNo: 3, label: "3F", type: "above", y: 5.8, height: 2.9, isGroundFloor: false },
  ];

  it("returns floors unchanged when calibration is null", () => {
    const result = applyCalibrationFloorHeights(baseFloors, null);
    expect(result.floors).toEqual(baseFloors);
    expect(result.estimatedFlags).toEqual([false, false, false]);
  });

  it("overrides floor heights from calibration and recalculates y positions", () => {
    const calibration: BuildingCalibration = {
      buildingId: "test-bldg",
      geometricLOD: "L3",
      overrides: [
        {
          field: "floorHeights.1",
          inferredValue: 2.9,
          overrideValue: 4.2,
          source: "건축물대장:heit confirmed via on-site survey 2025",
          hypothesisForInference: "era default 2.9m inferred from 2000-2009 residential",
        },
        {
          field: "floorHeights.2",
          inferredValue: 2.9,
          overrideValue: 3.1,
          source: "building permit drawing sheet A2",
          hypothesisForInference: "era default underestimates commercial ground-floor lobbies",
        },
      ],
    };

    const result = applyCalibrationFloorHeights(baseFloors, calibration);

    // Floor 1 overridden to 4.2
    expect(result.floors[0].height).toBeCloseTo(4.2, 3);
    expect(result.estimatedFlags[0]).toBe(false); // calibrated = measured

    // Floor 2 overridden to 3.1
    expect(result.floors[1].height).toBeCloseTo(3.1, 3);
    expect(result.estimatedFlags[1]).toBe(false);

    // Floor 3 not in calibration — falls back to recipe default
    expect(result.floors[2].height).toBeCloseTo(2.9, 3);
    expect(result.estimatedFlags[2]).toBe(true); // estimated (not calibrated)
  });

  it("zero recipe heights fall back and are flagged estimated", () => {
    const floorsWithZero: FloorSpec[] = [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 0, height: 0, isGroundFloor: false },
    ];
    const result = applyCalibrationFloorHeights(floorsWithZero, null);
    expect(result.estimatedFlags[0]).toBe(true);
    expect(result.estimatedFlags[1]).toBe(true);
  });

  it("y positions are recalculated after height overrides", () => {
    const calibration: BuildingCalibration = {
      buildingId: "test-bldg",
      geometricLOD: "L3",
      overrides: [
        {
          field: "floorHeights.1",
          inferredValue: 2.9,
          overrideValue: 4.5,
          source: "on-site measurement 2025-03",
          hypothesisForInference: "era default 2.9m",
        },
      ],
    };

    const result = applyCalibrationFloorHeights(baseFloors, calibration);

    // Floor 1: y=0 (unchanged, it's the first floor)
    expect(result.floors[0].y).toBeCloseTo(0, 3);
    // Floor 2: y = floor1.height (overridden to 4.5)
    expect(result.floors[1].y).toBeCloseTo(4.5, 3);
    // Floor 3: y = floor1.height + floor2.height = 4.5 + 2.9
    expect(result.floors[2].y).toBeCloseTo(4.5 + 2.9, 3);
  });
});
