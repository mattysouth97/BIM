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
    buildingName: "Test",
    address: "Seoul",
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

/* ------------------------------------------------------------------ */
/* P2-30 — per-storey plates                                            */
/* ------------------------------------------------------------------ */

const BASE: [number, number][] = [
  [-10, -5],
  [10, -5],
  [10, 5],
  [-10, 5],
]; // 20 × 10 = 200 m², perimeter 60
const SMALL: [number, number][] = [
  [-7.746, -3.873],
  [7.746, -3.873],
  [7.746, 3.873],
  [-7.746, 3.873],
]; // ≈ 120 m² (60 % of the base), perimeter ≈ 46.5

function stepped(plates: Array<[number, number][] | undefined>): FloorSpec[] {
  return plates.map((plate, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * 3,
    height: 3,
    isGroundFloor: i === 0,
    ...(plate ? { plate: [plate] } : {}),
  }));
}

describe("envelopeQuantities — per-storey plates (P2-30)", () => {
  it("S1: a prism with every level on the base plate equals the one-ring result", () => {
    const uniform = envelopeQuantities(
      recipe({
        footprintPolygon: [BASE],
        floors: stepped([BASE, BASE, BASE, BASE, BASE]),
        totalHeight: 15,
      }),
    );
    const legacy = envelopeQuantities(
      recipe({ footprintPolygon: [BASE], floors: floors(5), totalHeight: 15 }),
    );
    expect(uniform.grossWallAreaSqm).toBeCloseTo(legacy.grossWallAreaSqm, 6);
    expect(uniform.roofAreaSqm).toBeCloseTo(legacy.roofAreaSqm, 6);
    expect(uniform.volumeM3).toBeCloseTo(legacy.volumeM3, 6);
    expect(uniform.planAreaSqm).toBeCloseTo(legacy.planAreaSqm, 6);
    expect(uniform.derivedFloorAreaSqm).toBeCloseTo(legacy.derivedFloorAreaSqm, 6);
  });

  it("S2: a step is priced — less wall than the base prism, and the terrace is roof", () => {
    const q = envelopeQuantities(
      recipe({
        footprintPolygon: [BASE],
        floors: stepped([BASE, BASE, BASE, SMALL, SMALL]),
        totalHeight: 15,
      }),
    );
    const basePerimeter = 60;
    const smallPerimeter = 4 * 7.746 + 4 * 3.873;
    const baseArea = 200;
    const smallArea = 4 * 7.746 * 3.873;

    expect(q.grossWallAreaSqm).toBeLessThan(basePerimeter * 15);
    expect(q.grossWallAreaSqm).toBeCloseTo(
      basePerimeter * 9 + smallPerimeter * 6,
      3,
    );
    // Roof = top plate + the terrace exposed where level 3 is wider than 4.
    expect(q.roofAreaSqm).toBeCloseTo(smallArea + (baseArea - smallArea), 3);
    expect(q.roofAreaSqm).toBeCloseTo(baseArea, 3);
    // Volume sums each level's own plate.
    expect(q.volumeM3).toBeCloseTo(baseArea * 9 + smallArea * 6, 3);
    // Ground contact is the lowest plate.
    expect(q.planAreaSqm).toBeCloseTo(baseArea, 3);
    // Gross floor area now follows the real stack, not plate × count.
    expect(q.derivedFloorAreaSqm).toBeCloseTo(baseArea * 3 + smallArea * 2, 3);
  });

  it("two consecutive equal plates contribute no phantom terrace", () => {
    const q = envelopeQuantities(
      recipe({
        footprintPolygon: [BASE],
        floors: stepped([BASE, BASE, SMALL, SMALL]),
        totalHeight: 12,
      }),
    );
    const smallArea = 4 * 7.746 * 3.873;
    // One terrace (2→3), not two.
    expect(q.roofAreaSqm).toBeCloseTo(smallArea + (200 - smallArea), 3);
  });

  it("a level wider than the one below adds no negative terrace", () => {
    const q = envelopeQuantities(
      recipe({
        footprintPolygon: [BASE],
        floors: stepped([SMALL, BASE, BASE]),
        totalHeight: 9,
      }),
    );
    // Top plate only; the overhang has no exposed roof from below.
    expect(q.roofAreaSqm).toBeCloseTo(200, 3);
    expect(q.roofAreaSqm).toBeGreaterThanOrEqual(0);
  });

  it("levels without their own plate fall back to the footprint ring", () => {
    const q = envelopeQuantities(
      recipe({
        footprintPolygon: [BASE],
        floors: stepped([undefined, undefined, SMALL]),
        totalHeight: 9,
      }),
    );
    const smallPerimeter = 4 * 7.746 + 4 * 3.873;
    expect(q.grossWallAreaSqm).toBeCloseTo(60 * 6 + smallPerimeter * 3, 3);
    expect(q.source).toBe("polygon");
  });

  it("basements are recorded but not priced as envelope", () => {
    const withBasement = envelopeQuantities(
      recipe({
        footprintPolygon: [BASE],
        floors: [
          {
            floorNo: -1,
            label: "B1F",
            type: "below",
            y: -3,
            height: 3,
            isGroundFloor: false,
            plate: [BASE],
          },
          ...stepped([BASE, BASE]),
        ],
        totalHeight: 6,
      }),
    );
    const noBasement = envelopeQuantities(
      recipe({ footprintPolygon: [BASE], floors: stepped([BASE, BASE]), totalHeight: 6 }),
    );
    expect(withBasement.grossWallAreaSqm).toBeCloseTo(noBasement.grossWallAreaSqm, 6);
    expect(withBasement.roofAreaSqm).toBeCloseTo(noBasement.roofAreaSqm, 6);
    expect(withBasement.volumeM3).toBeCloseTo(noBasement.volumeM3, 6);
  });
});
