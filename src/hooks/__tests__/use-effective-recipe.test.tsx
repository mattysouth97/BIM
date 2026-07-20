// src/hooks/__tests__/use-effective-recipe.test.tsx
// P1-08 (a) — THE single reactive effective-recipe hook. Replaces five
// hand-copied merge blocks that silently dropped footprintPolygon overrides
// (uploaded CAD footprints never reached energy/report/export consumers).

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEffectiveRecipe } from "../use-effective-recipe";
import { useRecipeStore } from "@/store/recipe-store";
import { makeRecipe, TRIANGLE_RINGS } from "./test-fixtures";

const PK = "TEST-PK-EFFECTIVE";

describe("useEffectiveRecipe", () => {
  beforeEach(() => {
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });

  it("returns undefined when no base recipe exists", () => {
    const { result } = renderHook(() => useEffectiveRecipe(PK));
    expect(result.current).toBeUndefined();
  });

  it("returns the base recipe (same reference) when no overrides exist", () => {
    const base = makeRecipe();
    useRecipeStore.setState({ baseRecipes: { [PK]: base } });

    const { result } = renderHook(() => useEffectiveRecipe(PK));
    expect(result.current).toBe(base);
  });

  it("merges footprintPolygon overrides — the CAD-upload regression (P1-08 a)", () => {
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });
    // Exactly what upload-stage.tsx does on commit:
    useRecipeStore.getState().setOverride(PK, "footprintPolygon", TRIANGLE_RINGS);

    const { result } = renderHook(() => useEffectiveRecipe(PK));
    expect(result.current?.footprintPolygon).toEqual(TRIANGLE_RINGS);
  });

  it("merges scalar and section overrides via the canonical mergeRecipeOverrides", () => {
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });
    useRecipeStore.getState().setOverride(PK, "footprintWidth", 25);
    useRecipeStore.getState().setOverride(PK, "facade.windowRatio", 0.6);

    const { result } = renderHook(() => useEffectiveRecipe(PK));
    expect(result.current?.footprintWidth).toBe(25);
    expect(result.current?.facade.windowRatio).toBe(0.6);
    // Untouched base fields survive
    expect(result.current?.footprintDepth).toBe(7.5);
  });

  it("is referentially stable across re-renders with unchanged inputs", () => {
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });
    useRecipeStore.getState().setOverride(PK, "footprintWidth", 25);

    const { result, rerender } = renderHook(() => useEffectiveRecipe(PK));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
