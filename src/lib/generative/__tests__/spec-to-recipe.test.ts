import { describe, expect, it } from "vitest";

import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { generateMassing, polygonArea } from "../generate/massing";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

describe("massing", () => {
  it("produces a closed rectangular footprint of the requested size", async () => {
    const spec = await specFor("Create a five-story office building.");
    const massing = generateMassing(spec);
    expect(massing.primary[0]).toHaveLength(4);
    expect(massing.widthM).toBeCloseTo(spec.massing.widthMm.value / 1000, 5);
    expect(massing.depthM).toBeCloseTo(spec.massing.depthMm.value / 1000, 5);
  });

  it("subtracts a courtyard void from the plate area", async () => {
    const spec = await specFor(
      "A five story office building arranged around a central courtyard.",
    );
    expect(spec.massing.strategy.value).toBe("courtyard");
    const massing = generateMassing(spec);
    expect(massing.primary).toHaveLength(2); // outer + hole

    const solid = massing.widthM * massing.depthM;
    expect(polygonArea(massing.primary)).toBeLessThan(solid);
    expect(polygonArea(massing.primary)).toBeGreaterThan(0);
  });

  it("never lets the void consume the whole plate", async () => {
    const spec = await specFor("A courtyard building.");
    // Force an absurd void and confirm a habitable ring survives.
    const abusive: BuildingSpec = {
      ...spec,
      massing: {
        ...spec.massing,
        parameters: { voidWidthMm: 9_000_000, voidDepthMm: 9_000_000 },
      },
    };
    const massing = generateMassing(abusive);
    expect(polygonArea(massing.primary)).toBeGreaterThan(0);
  });

  it("varies plates by level for a stepped massing", async () => {
    const spec = await specFor("A ten storey stepped office building.");
    expect(spec.massing.strategy.value).toBe("stepped");
    const massing = generateMassing(spec);
    expect(massing.variesByLevel).toBe(true);

    const ground = massing.plates.find((p) => p.floorNo === 1);
    const top = massing.plates.reduce((a, b) => (b.floorNo > a.floorNo ? b : a));
    expect(top.areaSqm).toBeLessThan(ground!.areaSqm);
  });

  it("keeps every L/U/cross/twin-bar outline a simple non-empty ring", async () => {
    for (const prompt of [
      "An L-shaped five storey office building.",
      "A U-shaped five storey office building.",
      "A cross-shaped five storey office building.",
      "A twin-bar five storey office building.",
    ]) {
      const spec = await specFor(prompt);
      const massing = generateMassing(spec);
      expect(massing.primary[0].length).toBeGreaterThanOrEqual(4);
      expect(polygonArea(massing.primary)).toBeGreaterThan(0);
    }
  });
});

describe("compileSpecToRecipe", () => {
  it("compiles a bare prompt into a recipe the geometry engine can consume", async () => {
    const spec = await specFor("Create an office building.");
    const { recipe } = compileSpecToRecipe(spec);

    // Shape required by BuildingRecipe / ProceduralBuilding.
    expect(recipe.floors.length).toBeGreaterThan(0);
    expect(recipe.footprintWidth).toBeGreaterThan(0);
    expect(recipe.footprintDepth).toBeGreaterThan(0);
    expect(recipe.footprintPolygon?.[0].length).toBeGreaterThanOrEqual(4);
    expect(recipe.materials.wall).toBeTruthy();
    expect(recipe.materials.glass).toBeTruthy();
    expect(recipe.roof.type).toBeTruthy();
    expect(recipe.column.spacing).toBeGreaterThan(0);
  });

  it("converts millimetres to metres exactly once", async () => {
    const spec = await specFor(
      "Generate a 7-story office building with an 8.4 m structural grid.",
    );
    const { recipe } = compileSpecToRecipe(spec);

    expect(recipe.column.spacing).toBeCloseTo(8.4, 6);
    expect(recipe.wallThickness).toBeCloseTo(
      spec.dimensions.exteriorWallMm.value / 1000,
      6,
    );
    expect(recipe.slab.thickness).toBeCloseTo(
      spec.structure.slabThicknessMm.value / 1000,
      6,
    );
  });

  it("stacks levels into a continuous floor list with derived height", async () => {
    const spec = await specFor("A 5 storey office with two levels of basement parking.");
    const { recipe, totalHeightM } = compileSpecToRecipe(spec);

    expect(recipe.floors.filter((f) => f.type === "below")).toHaveLength(2);
    expect(recipe.floors.filter((f) => f.type === "above")).toHaveLength(5);

    // Above-grade floors must stack without gaps or overlaps.
    const above = recipe.floors
      .filter((f) => f.type === "above")
      .sort((a, b) => a.floorNo - b.floorNo);
    expect(above[0].y).toBeCloseTo(0, 6);
    for (let i = 1; i < above.length; i += 1) {
      expect(above[i].y).toBeCloseTo(above[i - 1].y + above[i - 1].height, 6);
    }

    // Basements descend below grade.
    const below = recipe.floors.filter((f) => f.type === "below");
    for (const floor of below) expect(floor.y).toBeLessThan(0);

    // Height is derived from the stack, never asserted independently.
    const expected = above.reduce((sum, f) => sum + f.height, 0);
    expect(totalHeightM).toBeCloseTo(expected, 6);
    expect(recipe.totalHeight).toBeCloseTo(expected, 6);
  });

  it("marks exactly one ground floor", async () => {
    const spec = await specFor("A 5 storey office with one basement.");
    const { recipe } = compileSpecToRecipe(spec);
    expect(recipe.floors.filter((f) => f.isGroundFloor)).toHaveLength(1);
    expect(recipe.floors.find((f) => f.isGroundFloor)?.floorNo).toBe(1);
  });

  it("carries the requested facade through to the rendered shell", async () => {
    const spec = await specFor(
      "Five story office with curtain wall on the south elevation.",
    );
    const { recipe, approximations } = compileSpecToRecipe(spec);

    expect(recipe.facade.windowRatio).toBeGreaterThan(0);
    // Mixed per-elevation systems are declared, not silently flattened.
    expect(approximations.some((a) => /facade system/i.test(a))).toBe(true);
  });

  it("reports different geometry for different building types", async () => {
    const office = compileSpecToRecipe(await specFor("A 5 storey office building."));
    const factory = compileSpecToRecipe(
      await specFor("A 5 storey warehouse industrial building."),
    );

    expect(office.recipe.strctCd).not.toBe(factory.recipe.strctCd);
    expect(office.recipe.column.spacing).not.toBeCloseTo(
      factory.recipe.column.spacing,
      3,
    );
    expect(office.recipe.mainPurpsCd).not.toBe(factory.recipe.mainPurpsCd);
  });

  it("is deterministic for a fixed seed", async () => {
    const a = compileSpecToRecipe(await specFor("Create a five-story office building."));
    const b = compileSpecToRecipe(await specFor("Create a five-story office building."));
    expect(JSON.stringify(a.recipe)).toEqual(JSON.stringify(b.recipe));
  });

  it("never emits an invented address for a generated building", async () => {
    const spec = await specFor("Create an office building.");
    const { recipe } = compileSpecToRecipe(spec);
    expect(recipe.address).toBe("");
  });
});
