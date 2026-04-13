import { describe, it, expect } from "vitest";
import { getRecipe, applyOverrides } from "../recipe";
import type { BuildingEra } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "../types";

const ALL_ERAS: BuildingEra[] = [
  "pre-1970",
  "1970-1989",
  "1990-1999",
  "2000-2009",
  "2010-2019",
  "2020+",
];

describe("getRecipe", () => {
  it("returns a recipe for each era", () => {
    for (const era of ALL_ERAS) {
      const recipe = getRecipe("11", era, "02000");
      expect(recipe).toBeDefined();
      expect(recipe.facade).toBeDefined();
      expect(recipe.slab).toBeDefined();
      expect(recipe.column).toBeDefined();
      expect(recipe.roof).toBeDefined();
      expect(recipe.materials).toBeDefined();
    }
  });

  it("window dimensions increase with era (older = smaller)", () => {
    const pre1970 = getRecipe("11", "pre-1970", "02000");
    const modern = getRecipe("11", "2020+", "02000");

    expect(modern.facade.windowWidth).toBeGreaterThan(pre1970.facade.windowWidth);
    expect(modern.facade.windowHeight).toBeGreaterThan(pre1970.facade.windowHeight);
  });

  it("mullion depth increases with era (more modern = deeper)", () => {
    const depths = ALL_ERAS.map((era) => getRecipe("11", era, "02000").facade.mullionDepth);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
    }
  });

  it("sill height decreases with era (modern = more glass area)", () => {
    const pre1970 = getRecipe("11", "pre-1970", "02000");
    const modern = getRecipe("11", "2020+", "02000");

    expect(modern.facade.sillHeight).toBeLessThanOrEqual(pre1970.facade.sillHeight);
  });

  it("returns different slab thickness for steel vs masonry", () => {
    const steel = getRecipe("13", "2010-2019", "14000");
    const masonry = getRecipe("22", "2010-2019", "02000");

    expect(steel.slab.thickness).toBe(0.15);
    expect(masonry.slab.thickness).toBe(0.25);
  });

  it("steel structure has wider column spacing", () => {
    const steel = getRecipe("13", "2010-2019", "14000");
    const rc = getRecipe("11", "2010-2019", "02000");

    expect(steel.column.spacing).toBeGreaterThan(rc.column.spacing);
  });

  it("timber structure has tighter column spacing", () => {
    const timber = getRecipe("15", "2010-2019", "02000");
    const rc = getRecipe("11", "2010-2019", "02000");

    expect(timber.column.spacing).toBeLessThan(rc.column.spacing);
  });

  it("window ratio varies by use category", () => {
    const residential = getRecipe("11", "2010-2019", "02000");
    const office = getRecipe("11", "2010-2019", "14000");

    // Offices typically have higher window ratios than residential
    expect(office.facade.windowRatio).toBeGreaterThan(residential.facade.windowRatio);
  });

  it("materials include wall, glass, mullion, slab, column, roof, groundFloor", () => {
    const recipe = getRecipe("11", "2010-2019", "02000");
    expect(recipe.materials.wall).toBeDefined();
    expect(recipe.materials.glass).toBeDefined();
    expect(recipe.materials.mullion).toBeDefined();
    expect(recipe.materials.slab).toBeDefined();
    expect(recipe.materials.column).toBeDefined();
    expect(recipe.materials.roof).toBeDefined();
    expect(recipe.materials.groundFloor).toBeDefined();
  });
});

describe("applyOverrides", () => {
  function makeBaseRecipe(): BuildingRecipe {
    const defaults = getRecipe("11", "2010-2019", "02000");
    const floors: FloorSpec[] = [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 2.9, isGroundFloor: true },
    ];
    return {
      footprintWidth: 10,
      footprintDepth: 8,
      floors,
      totalHeight: 2.9,
      wallThickness: 0.332,
      era: "2010-2019",
      strctCd: "11",
      mainPurpsCd: "02000",
      facade: defaults.facade,
      slab: defaults.slab,
      column: defaults.column,
      roof: defaults.roof,
      materials: defaults.materials,
      siteWidth: 20,
      siteDepth: 15,
      buildingName: "Test",
      address: "Seoul",
    };
  }

  it("overrides footprintWidth", () => {
    const base = makeBaseRecipe();
    const result = applyOverrides(base, { footprintWidth: 15 });
    expect(result.footprintWidth).toBe(15);
    expect(result.footprintDepth).toBe(8); // unchanged
  });

  it("partial facade override merges correctly", () => {
    const base = makeBaseRecipe();
    const result = applyOverrides(base, {
      facade: { windowRatio: 0.5 },
    });
    expect(result.facade.windowRatio).toBe(0.5);
    // Other facade props preserved
    expect(result.facade.mullionDepth).toBe(base.facade.mullionDepth);
    expect(result.facade.windowWidth).toBe(base.facade.windowWidth);
  });

  it("does not mutate the original recipe", () => {
    const base = makeBaseRecipe();
    const originalWidth = base.footprintWidth;
    applyOverrides(base, { footprintWidth: 99 });
    expect(base.footprintWidth).toBe(originalWidth);
  });

  it("overrides slab thickness", () => {
    const base = makeBaseRecipe();
    const result = applyOverrides(base, { slab: { thickness: 0.3 } });
    expect(result.slab.thickness).toBe(0.3);
    expect(result.slab.overhang).toBe(base.slab.overhang);
  });

  it("propagates footprintPolygon override to output recipe", () => {
    const base = makeBaseRecipe();
    const polygon: [number, number][][] = [[[-5, -5], [5, -5], [5, 5], [-5, 5]]];
    const result = applyOverrides(base, { footprintPolygon: polygon });
    expect(result.footprintPolygon).toEqual(polygon);
  });

  it("preserves base footprintPolygon when override omits it", () => {
    const base = makeBaseRecipe();
    // base has no footprintPolygon set — should remain undefined
    const result = applyOverrides(base, { footprintWidth: 12 });
    expect(result.footprintPolygon).toBeUndefined();

    // base with a pre-existing polygon — should be preserved unchanged
    const existingPolygon: [number, number][][] = [[[0, 0], [10, 0], [10, 10], [0, 10]]];
    const baseWithPolygon = { ...base, footprintPolygon: existingPolygon };
    const result2 = applyOverrides(baseWithPolygon, { footprintWidth: 12 });
    expect(result2.footprintPolygon).toEqual(existingPolygon);
  });
});
