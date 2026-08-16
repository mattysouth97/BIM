import { describe, it, expect, beforeEach } from "vitest";
import { useRecipeStore } from "../recipe-store";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

function makeRecipe(overrides?: Partial<BuildingRecipe>): BuildingRecipe {
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
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.35, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.582 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    },
    siteWidth: 20,
    siteDepth: 15,
    buildingName: "Test",
    address: "Seoul",
    ...overrides,
  };
}

describe("useRecipeStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });

  it("setBaseRecipe stores recipe by PK", () => {
    const recipe = makeRecipe();
    useRecipeStore.getState().setBaseRecipe("pk-001", recipe);

    expect(useRecipeStore.getState().baseRecipes["pk-001"]).toBeDefined();
    expect(useRecipeStore.getState().baseRecipes["pk-001"].footprintWidth).toBe(10);
  });

  it("getEffectiveRecipe returns base when no overrides", () => {
    const recipe = makeRecipe();
    useRecipeStore.getState().setBaseRecipe("pk-001", recipe);

    const effective = useRecipeStore.getState().getEffectiveRecipe("pk-001");
    expect(effective).toEqual(recipe);
  });

  it("getEffectiveRecipe returns undefined for unknown PK", () => {
    const effective = useRecipeStore.getState().getEffectiveRecipe("unknown");
    expect(effective).toBeUndefined();
  });

  it("setOverride with dot-path sets nested value", () => {
    const recipe = makeRecipe();
    useRecipeStore.getState().setBaseRecipe("pk-001", recipe);
    useRecipeStore.getState().setOverride("pk-001", "facade.windowRatio", 0.5);

    const effective = useRecipeStore.getState().getEffectiveRecipe("pk-001");
    expect(effective?.facade.windowRatio).toBe(0.5);
    // Other facade props preserved
    expect(effective?.facade.mullionDepth).toBe(0.08);
  });

  it("setOverride with top-level path sets scalar", () => {
    const recipe = makeRecipe();
    useRecipeStore.getState().setBaseRecipe("pk-001", recipe);
    useRecipeStore.getState().setOverride("pk-001", "footprintWidth", 20);

    const effective = useRecipeStore.getState().getEffectiveRecipe("pk-001");
    expect(effective?.footprintWidth).toBe(20);
  });

  it("resetOverrides clears all overrides for a PK", () => {
    const recipe = makeRecipe();
    useRecipeStore.getState().setBaseRecipe("pk-001", recipe);
    useRecipeStore.getState().setOverride("pk-001", "facade.windowRatio", 0.5);
    useRecipeStore.getState().setOverride("pk-001", "footprintWidth", 20);

    useRecipeStore.getState().resetOverrides("pk-001");

    const effective = useRecipeStore.getState().getEffectiveRecipe("pk-001");
    expect(effective?.footprintWidth).toBe(10); // back to base
    expect(effective?.facade.windowRatio).toBe(0.35); // back to base
  });

  it("getEffectiveRecipe applies floorCount through mergeRecipeOverrides", () => {
    const recipe = makeRecipe();
    useRecipeStore.getState().setBaseRecipe("pk-001", recipe);
    useRecipeStore.getState().setOverride("pk-001", "floorCount", 5);
    useRecipeStore.getState().setOverride("pk-001", "floorHeight", 3.2);
    const effective = useRecipeStore.getState().getEffectiveRecipe("pk-001");
    expect(effective?.floors.filter((f) => f.type !== "below")).toHaveLength(5);
    expect(effective?.totalHeight).toBeCloseTo(16, 5);
  });

  it("resetSection clears only the specified section", () => {
    const recipe = makeRecipe();
    useRecipeStore.getState().setBaseRecipe("pk-001", recipe);
    useRecipeStore.getState().setOverride("pk-001", "facade.windowRatio", 0.5);
    useRecipeStore.getState().setOverride("pk-001", "slab.thickness", 0.3);

    useRecipeStore.getState().resetSection("pk-001", "facade");

    const effective = useRecipeStore.getState().getEffectiveRecipe("pk-001");
    expect(effective?.facade.windowRatio).toBe(0.35); // reset to base
    expect(effective?.slab.thickness).toBe(0.3); // slab override preserved
  });
});
