"use client";

// src/hooks/use-effective-recipe.ts
// P1-08 (a) — THE single reactive effective-recipe hook.
//
// Subscribes to baseRecipes[pk] and overrides[pk] as separate slices and
// merges in useMemo via the canonical mergeRecipeOverrides. NEVER call
// getEffectiveRecipe() inside a Zustand selector — its getter returns a new
// object per call and causes an infinite re-render loop (Phase 23 Pitfall 1).
//
// This hook replaced five hand-copied merge blocks that silently dropped
// footprintPolygon overrides (uploaded CAD footprints never reached the
// energy, report, or export consumers). Do not re-inline the merge.

import { useMemo } from "react";
import { useRecipeStore } from "@/store/recipe-store";
import { mergeRecipeOverrides } from "@/lib/procedural/recipe";
import type { BuildingRecipe } from "@/lib/procedural/types";

/**
 * Reactive base+overrides merge for a building. Returns undefined when no
 * base recipe exists; the base object itself (same reference) when there are
 * no overrides; referentially stable while inputs are unchanged.
 */
export function useEffectiveRecipe(buildingPk: string): BuildingRecipe | undefined {
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

  return useMemo(() => {
    if (!baseRecipe) return undefined;
    if (!overrides) return baseRecipe;
    return mergeRecipeOverrides(baseRecipe, overrides);
  }, [baseRecipe, overrides]);
}
