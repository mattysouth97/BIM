import { describe, expect, it } from "vitest";

import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import { sliceRecipeToFloors } from "../session/recipe-view";
import type { BuildingRecipe, BuildingSection } from "@/lib/procedural/types";

const provider = new HeuristicReasoningProvider();

/**
 * A real compiled recipe, not a hand-written fixture: the slice has to survive
 * whatever the compiler actually emits (basements at negative y, a stacked
 * above-grade run), and a fixture would quietly stop resembling that.
 */
async function recipeFor(prompt: string): Promise<BuildingRecipe> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return compileSpecToRecipe(data).recipe;
}

const STACK_PROMPT = "A 6 storey office building with two levels of basement parking.";

const floorNos = (recipe: BuildingRecipe) => recipe.floors.map((f) => f.floorNo);
const topOf = (recipe: BuildingRecipe, nos: number[]) =>
  recipe.floors
    .filter((f) => nos.includes(f.floorNo))
    .reduce((max, f) => Math.max(max, f.y + f.height), 0);

describe("sliceRecipeToFloors — identity cases", () => {
  // The identity return is load-bearing for React memoisation: a fresh object
  // for a no-op selection would remount the whole 3D scene on every render.
  it("returns the very same object for a null selection", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    expect(sliceRecipeToFloors(recipe, null)).toBe(recipe);
  });

  it("returns the very same object for an empty selection", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    expect(sliceRecipeToFloors(recipe, [])).toBe(recipe);
  });

  it("returns the very same object when every floor is selected", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    expect(sliceRecipeToFloors(recipe, floorNos(recipe))).toBe(recipe);
  });

  it("returns the very same object when unknown floorNos pad a full selection", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    // Selection state can outlive the design it was made against; extra numbers
    // must not be read as "a subset was requested".
    const padded = [...floorNos(recipe), 99, -99, 0, Number.NaN];
    expect(sliceRecipeToFloors(recipe, padded)).toBe(recipe);
  });

  it("returns the whole building when nothing matches rather than an empty model", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    // An empty viewport reads as a crash, so a stale selection degrades to the
    // full building instead of to nothing.
    expect(sliceRecipeToFloors(recipe, [42, 43])).toBe(recipe);
    expect(sliceRecipeToFloors(recipe, [Number.NaN])).toBe(recipe);
  });
});

describe("sliceRecipeToFloors — genuine subsets", () => {
  it("keeps exactly the requested storeys and drops the rest", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    const wanted = [2, 3];
    const sliced = sliceRecipeToFloors(recipe, wanted);

    expect(sliced).not.toBe(recipe);
    expect(floorNos(sliced)).toEqual(wanted);
  });

  it("ignores floorNos that do not exist while still slicing the ones that do", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    const sliced = sliceRecipeToFloors(recipe, [3, 777]);
    expect(floorNos(sliced)).toEqual([3]);
  });

  it("treats a repeated floorNo as a single storey", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    // The selection is a set of levels, not a multiset; duplicates from a
    // sloppy caller must not duplicate geometry.
    const sliced = sliceRecipeToFloors(recipe, [3, 3, 3]);
    expect(floorNos(sliced)).toEqual([3]);
  });

  it("preserves everything about the recipe that is not level-scoped", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    const sliced = sliceRecipeToFloors(recipe, [1, 2]);

    // Isolation is a view, not an edit: the design must survive it untouched.
    expect(sliced.footprintPolygon).toBe(recipe.footprintPolygon);
    expect(sliced.facade).toBe(recipe.facade);
    expect(sliced.column).toBe(recipe.column);
    expect(sliced.materials).toBe(recipe.materials);
    expect(sliced.buildingName).toBe(recipe.buildingName);
    expect(sliced.strctCd).toBe(recipe.strctCd);
  });
});

describe("sliceRecipeToFloors — totalHeight", () => {
  it("caps the slice at the top of its highest storey", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    const wanted = [1, 2, 3];
    const sliced = sliceRecipeToFloors(recipe, wanted);

    // The roof/parapet is drawn at totalHeight, so it has to follow the cut
    // rather than hover at the height of the storeys that were removed.
    expect(sliced.totalHeight).toBeCloseTo(topOf(recipe, wanted), 6);
    expect(sliced.totalHeight).toBeLessThan(recipe.totalHeight);
  });

  it("caps a mid-band slice above its own floors, not at grade", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    const wanted = [4, 5];
    const sliced = sliceRecipeToFloors(recipe, wanted);

    const band = sliced.floors;
    expect(sliced.totalHeight).toBeCloseTo(topOf(recipe, wanted), 6);
    // Every retained storey sits under the cap, including the lowest one whose
    // y is well above zero.
    for (const floor of band) {
      expect(floor.y + floor.height).toBeLessThanOrEqual(sliced.totalHeight + 1e-9);
    }
    expect(band[0].y).toBeGreaterThan(0);
  });

  it("caps a basement-only slice at its own top rather than the building height", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    const basements = floorNos(recipe).filter((no) => no < 0);
    expect(basements.length).toBeGreaterThan(0);

    const sliced = sliceRecipeToFloors(recipe, basements);
    expect(sliced.floors.every((f) => f.y < 0)).toBe(true);

    // B1's slab top is exactly grade, so the computed cap is 0 — which is the
    // correct cap for this slice, not a degenerate value needing a fallback.
    // Guarding on `> 0` used to reject it and put the roof ~24 m above a
    // two-storey basement: precisely the floating cap the recompute exists to
    // prevent.
    expect(sliced.totalHeight).toBeCloseTo(topOf(recipe, basements), 6);
    expect(sliced.totalHeight).toBeLessThan(recipe.totalHeight);
    for (const floor of sliced.floors) {
      expect(floor.y + floor.height).toBeLessThanOrEqual(sliced.totalHeight + 1e-9);
    }
  });
});

describe("sliceRecipeToFloors — sections and immutability", () => {
  it("drops vertical sections, whose ranges index absolute floorNos", async () => {
    const base = await recipeFor(STACK_PROMPT);
    const section: BuildingSection = {
      startFloor: 1,
      endFloor: 2,
      mainPurpsCd: "07000",
      facade: base.facade,
    };
    const mixedUse: BuildingRecipe = {
      ...base,
      sections: [section, { ...section, startFloor: 3, endFloor: 6 }],
    };

    const sliced = sliceRecipeToFloors(mixedUse, [4, 5]);
    // Keeping the ranges would point the per-section facade at storeys that are
    // no longer in the model; the single-facade path is the safe fallback.
    expect(sliced.sections).toBeUndefined();
  });

  it("leaves the source recipe untouched", async () => {
    const base = await recipeFor(STACK_PROMPT);
    const mixedUse: BuildingRecipe = {
      ...base,
      sections: [
        { startFloor: 1, endFloor: 6, mainPurpsCd: "14000", facade: base.facade },
      ],
    };
    const before = {
      floors: mixedUse.floors,
      floorCount: mixedUse.floors.length,
      totalHeight: mixedUse.totalHeight,
      sectionCount: mixedUse.sections?.length,
    };

    const sliced = sliceRecipeToFloors(mixedUse, [2]);

    expect(mixedUse.floors).toBe(before.floors);
    expect(mixedUse.floors).toHaveLength(before.floorCount);
    expect(mixedUse.totalHeight).toBe(before.totalHeight);
    expect(mixedUse.sections).toHaveLength(before.sectionCount!);
    // The slice owns its own array so a later render cannot write through it.
    expect(sliced.floors).not.toBe(mixedUse.floors);
  });

  it("is stable under repeated slicing of the same selection", async () => {
    const recipe = await recipeFor(STACK_PROMPT);
    const once = sliceRecipeToFloors(recipe, [2, 3]);
    const twice = sliceRecipeToFloors(once, [2, 3]);
    // The second call sees a recipe whose every floor matches, so it must
    // short-circuit to the identity instead of re-deriving a narrower height.
    expect(twice).toBe(once);
    expect(twice.totalHeight).toBe(once.totalHeight);
  });
});
