import { describe, it, expect } from "vitest";
import { envelopeQuantities } from "../envelope-quantities";
import type { BuildingRecipe, FloorSpec, MeasuredEnvelope } from "@/lib/procedural/types";

function floors(n: number): FloorSpec[] {
  return Array.from({ length: n }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above",
    y: i * 3,
    height: 3,
    isGroundFloor: i === 0,
  }));
}

function recipe(partial: Partial<BuildingRecipe> = {}): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 10,
    floors: floors(2),
    totalHeight: 6,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "02000",
    facade: {
      windowWidth: 1.5, windowHeight: 1.5, sillHeight: 0.9, windowSpacing: 3,
      windowRatio: 0.3, mullionDepth: 0.05, mullionWidth: 0.05, glassInset: 0.03,
      solidPanelChance: 0, parapetHeight: 0.9, cornerInset: 0,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.5 },
    roof: { type: "flat", flatThickness: 0.25, gableHeight: 0, hipInset: 0 },
    materials: {
      wall: { color: "#ccc", roughness: 0.8, metalness: 0 },
      glass: { color: "#88b", roughness: 0.1, metalness: 0 },
      mullion: { color: "#666", roughness: 0.4, metalness: 0.5 },
      slab: { color: "#ccc", roughness: 0.8, metalness: 0 },
      column: { color: "#ccc", roughness: 0.8, metalness: 0 },
      roof: { color: "#888", roughness: 0.8, metalness: 0 },
      groundFloor: { color: "#ccc", roughness: 0.8, metalness: 0 },
    },
    siteWidth: 30,
    siteDepth: 20,
    buildingName: "Test",
    address: "Seoul",
    ...partial,
  };
}

const measured: MeasuredEnvelope = {
  planAreaSqm: 2621.08,
  wallLengthM: 217.01,
  grossWallAreaSqm: 2454.52,
  roofAreaSqm: 2669.21,
  volumeM3: 20685.33,
  derivedFloorAreaSqm: 4314.2,
  basis: "test fixture — the Clinic's figures",
};

describe("envelopeQuantities — measured envelope", () => {
  it("returns the measurement verbatim, tagged as such, and never the extrusion", () => {
    const q = envelopeQuantities(recipe({ measuredEnvelope: measured }));
    expect(q.source).toBe("measured");
    expect(q.planAreaSqm).toBe(2621.08);
    expect(q.wallLengthM).toBe(217.01);
    expect(q.grossWallAreaSqm).toBe(2454.52);
    expect(q.roofAreaSqm).toBe(2669.21);
    expect(q.volumeM3).toBe(20685.33);
    expect(q.derivedFloorAreaSqm).toBe(4314.2);
    // The 20 × 10 × 6 box this recipe would otherwise extrude is nowhere in it.
    expect(q.grossWallAreaSqm).not.toBe(2 * (20 + 10) * 6);
  });

  it("the intensity denominator still prefers an official floor area", () => {
    const withOfficial = envelopeQuantities(
      recipe({ measuredEnvelope: measured, officialFloorAreaSqm: 4000 }),
    );
    expect(withOfficial.intensityFloorAreaSqm).toBe(4000);
    const without = envelopeQuantities(recipe({ measuredEnvelope: measured }));
    expect(without.intensityFloorAreaSqm).toBe(4314.2);
    // A documented zero means unavailable, exactly as for a register row.
    const zero = envelopeQuantities(
      recipe({ measuredEnvelope: measured, officialFloorAreaSqm: 0 }),
    );
    expect(zero.intensityFloorAreaSqm).toBe(4314.2);
  });

  it("the same recipe without the measurement extrudes as before", () => {
    const q = envelopeQuantities(recipe());
    expect(q.source).toBe("bbox");
    expect(q.grossWallAreaSqm).toBeCloseTo(2 * (20 + 10) * 6, 6);
  });

  it.each([
    ["planAreaSqm", 0],
    ["grossWallAreaSqm", Number.NaN],
    ["volumeM3", -1],
    ["roofAreaSqm", Number.POSITIVE_INFINITY],
  ] as const)("refuses a broken measurement rather than fill it in: %s = %s", (field, value) => {
    expect(() =>
      envelopeQuantities(recipe({ measuredEnvelope: { ...measured, [field]: value } })),
    ).toThrow(new RegExp(`measuredEnvelope\\.${field}`));
  });
});
