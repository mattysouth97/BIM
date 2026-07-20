// src/lib/ifc/__tests__/ifc-geometry-extractor.test.ts
// P2-11 — First unit tests for the IFC geometry extractor.
// Focus: BASESLAB must NOT be counted as roof area.

import { describe, it, expect } from "vitest";
import { extractGeometry } from "../ifc-geometry-extractor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(overrides: Record<string, unknown>) {
  return { area: 100, level: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// BASESLAB classification
// ---------------------------------------------------------------------------

describe("extractGeometry — BASESLAB slab classification", () => {
  it("BASESLAB is counted as floor area (level 0), NOT roof area", () => {
    const result = extractGeometry({
      elements: [
        makeElement({
          ifcType: "IFCSLAB",
          PredefinedType: "BASESLAB",
          area: 200,
          level: 0,
        }),
      ],
    });
    expect(result.roofArea).toBe(0);
    expect(result.floorAreas).toHaveLength(1);
    expect(result.floorAreas[0].area).toBe(200);
    expect(result.floorAreas[0].level).toBe(0);
  });

  it("BASESLAB with lowercase predefinedType key is still floor area", () => {
    const result = extractGeometry({
      elements: [
        makeElement({
          ifcType: "IFCSLAB",
          predefinedType: "BASESLAB",
          area: 150,
          level: 0,
        }),
      ],
    });
    expect(result.roofArea).toBe(0);
    expect(result.floorAreas[0].area).toBe(150);
  });

  it("ROOF predefined type on IFCSLAB is counted as roof area", () => {
    const result = extractGeometry({
      elements: [
        makeElement({
          ifcType: "IFCSLAB",
          PredefinedType: "ROOF",
          area: 120,
        }),
      ],
    });
    expect(result.roofArea).toBe(120);
    expect(result.floorAreas).toHaveLength(0);
  });

  it("IFCROOF element is counted as roof area", () => {
    const result = extractGeometry({
      elements: [
        makeElement({
          ifcType: "IFCROOF",
          area: 90,
        }),
      ],
    });
    expect(result.roofArea).toBe(90);
    expect(result.floorAreas).toHaveLength(0);
  });

  it("model with both BASESLAB and ROOF slab yields correct split", () => {
    const result = extractGeometry({
      elements: [
        makeElement({
          ifcType: "IFCSLAB",
          PredefinedType: "BASESLAB",
          area: 200,
          level: 0,
        }),
        makeElement({
          ifcType: "IFCSLAB",
          PredefinedType: "ROOF",
          area: 180,
          level: 5,
        }),
      ],
    });
    expect(result.roofArea).toBe(180);
    expect(result.floorAreas).toHaveLength(1);
    expect(result.floorAreas[0].area).toBe(200);
  });

  it("IFCSLAB with FLOOR predefined type is counted as floor area", () => {
    const result = extractGeometry({
      elements: [
        makeElement({
          ifcType: "IFCSLAB",
          PredefinedType: "FLOOR",
          area: 80,
          level: 1,
        }),
      ],
    });
    expect(result.roofArea).toBe(0);
    expect(result.floorAreas[0].area).toBe(80);
  });
});
