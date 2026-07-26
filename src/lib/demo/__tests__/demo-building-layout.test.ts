// src/lib/demo/__tests__/demo-building-layout.test.ts
// Layout recheck for the 데모모드 building: run the demo fixtures through the
// real geometry pipeline and pin the resulting 3D layout — floor stacking,
// heights, ground/basement placement, roof, and era — so fixture edits can
// never silently produce a broken model.

import { describe, it, expect } from "vitest";
import { generateBuildingGeometry, toRecipe } from "@/lib/building-geometry";
import { demoTitle, demoFloors } from "@/lib/demo/demo-building";

const geo = generateBuildingGeometry(demoTitle, demoFloors);

describe("demo building 3D layout", () => {
  it("produces one floor slab per ledger record, sorted bottom-up", () => {
    expect(geo.floors.length).toBe(12);
    expect(geo.floors.map((f) => f.floorNo)).toEqual([
      -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("stacks above-ground floors to exactly the ledger height (41.5 m)", () => {
    expect(geo.totalHeight).toBe(41.5);
    const above = geo.floors.filter((f) => f.type === "above");
    const floorHeight = geo.totalHeight / demoTitle.grndFlrCnt; // 4.15 m
    above.forEach((f) => {
      expect(f.height).toBeCloseTo(floorHeight, 5);
      expect(f.y).toBeCloseTo((f.floorNo - 1) * floorHeight, 5);
    });
    // Top of the highest slab reaches the building height
    const top = above[above.length - 1];
    expect(top.y + top.height).toBeCloseTo(geo.totalHeight, 5);
  });

  it("places basements below grade in a contiguous stack", () => {
    const below = geo.floors.filter((f) => f.type === "below");
    expect(below.map((f) => f.y)).toEqual([-6, -3]); // B2 under B1
    below.forEach((f) => {
      expect(f.y).toBeLessThan(0);
      expect(f.y + f.height).toBeLessThanOrEqual(0);
    });
  });

  it("marks only 1F as the ground floor", () => {
    const grounds = geo.floors.filter((f) => f.isGroundFloor);
    expect(grounds.map((f) => f.floorNo)).toEqual([1]);
  });

  it("keeps a plausible office floor plate (from 건축면적 816 m²)", () => {
    // estimateFootprint(816) → ≈ 35.0 × 23.3 m rectangle fallback; the real
    // L-shape ring (36 × 28 m bbox) replaces this at scene level.
    expect(geo.footprintWidth * geo.footprintDepth).toBeCloseTo(816, -1);
    expect(geo.footprintWidth).toBeGreaterThan(geo.footprintDepth);
  });

  it("is a flat-roof 2000s office in the clean-texture era", () => {
    expect(geo.roofType).toBe("flat");
    expect(geo.era).toBe("2000-2009");
    expect(geo.mainPurpsCd).toBe("14000");
  });

  it("builds a complete procedural recipe (large RC office)", () => {
    const recipe = toRecipe(geo);
    expect(recipe.floors.length).toBe(12);
    expect(recipe.totalHeight).toBe(41.5);
    expect(recipe.column.size).toBe(0.6); // archArea > 500 → large building
    expect(recipe.column.spacing).toBe(6.0); // RC spans
    expect(recipe.slab.thickness).toBe(0.2); // RC slab
  });
});
