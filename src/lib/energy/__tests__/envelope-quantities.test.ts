import { describe, it, expect } from "vitest";
import { envelopeQuantities } from "../envelope-quantities";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

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
      windowWidth: 1.5,
      windowHeight: 1.5,
      sillHeight: 0.9,
      windowSpacing: 3,
      windowRatio: 0.3,
      mullionDepth: 0.05,
      mullionWidth: 0.05,
      glassInset: 0.03,
      solidPanelChance: 0,
      parapetHeight: 0.9,
      cornerInset: 0,
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
    ...partial,
  };
}

describe("envelopeQuantities", () => {
  it("uses bbox when no polygon is present", () => {
    const q = envelopeQuantities(recipe());
    expect(q.source).toBe("bbox");
    expect(q.planAreaSqm).toBe(200);
    expect(q.wallLengthM).toBe(60);
    expect(q.grossWallAreaSqm).toBe(360);
    expect(q.derivedFloorAreaSqm).toBe(400);
    expect(q.intensityFloorAreaSqm).toBe(400);
  });

  it("follows a triangular CAD ring instead of the bounding box", () => {
    const q = envelopeQuantities(
      recipe({
        footprintWidth: 20,
        footprintDepth: 10,
        footprintPolygon: [
          [
            [0, 0],
            [20, 0],
            [0, 10],
          ],
        ],
      })
    );
    expect(q.source).toBe("polygon");
    expect(q.planAreaSqm).toBeCloseTo(100, 5);
    expect(q.planAreaSqm).toBeLessThan(200);
    expect(q.wallLengthM).toBeCloseTo(20 + 10 + Math.hypot(20, 10), 5);
    expect(q.derivedFloorAreaSqm).toBeCloseTo(200, 5);
  });

  it("treats courtyard holes as extra envelope", () => {
    const outer: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const hole: [number, number][] = [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
    ];
    const q = envelopeQuantities(
      recipe({
        footprintWidth: 20,
        footprintDepth: 20,
        footprintPolygon: [outer, hole],
      })
    );
    expect(q.planAreaSqm).toBeCloseTo(300, 5);
    expect(q.wallLengthM).toBeCloseTo(80 + 40, 5);
  });

  it("uses official totArea for intensity when > 0", () => {
    const q = envelopeQuantities(recipe({ officialFloorAreaSqm: 350 }));
    expect(q.derivedFloorAreaSqm).toBe(400);
    expect(q.intensityFloorAreaSqm).toBe(350);
  });

  it("treats totArea 0 as unavailable (AFF-6)", () => {
    const q = envelopeQuantities(recipe({ officialFloorAreaSqm: 0 }));
    expect(q.intensityFloorAreaSqm).toBe(400);
  });
});
