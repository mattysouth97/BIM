"use client";

// src/hooks/use-energy-breakdown.ts
// Reactive per-system energy breakdown (HVAC / lighting / DHW / plug) from material-store
// and recipe-store. Mirrors use-energy-metrics.ts — same two-useMemo pattern to avoid
// infinite loops (Phase 23 Pitfall 1). DO NOT subscribe to getEffectiveRecipe() — its
// getter returns a new object per call.
//
// SYNC NOTE: The override-merge block in the first useMemo (lines below) is kept
// byte-for-byte identical to use-energy-metrics.ts lines 56–83. If that file changes
// its merge logic, update this file in the same commit.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { getClimateData } from "@/lib/energy/climate-data";
import {
  calculateSystemBreakdown,
  type SystemBreakdown,
} from "@/lib/energy/system-breakdown";

export type { SystemBreakdown };

/**
 * Reactively compute the per-system energy breakdown for a building.
 * Returns null if materials or recipe data is not yet in its store.
 *
 * Stability guarantee: when materials, baseRecipe, overrides, and sigunguCd are all
 * referentially unchanged, this hook returns the SAME SystemBreakdown object reference
 * across re-renders. This is critical for Phase 25's heatmap useEffect — otherwise the
 * floor-plane geometry would rebuild on every camera frame.
 *
 * @param buildingPk - Building primary key for store lookups
 * @param sigunguCd  - Optional 법정동 code for HDD/CDD climate lookup
 */
export function useEnergyBreakdown(
  buildingPk: string,
  sigunguCd?: string
): SystemBreakdown | null {
  // Subscribe to INDIVIDUAL slices to avoid getEffectiveRecipe infinite loop
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

  // First useMemo: derive effective recipe from [baseRecipe, overrides] — identical
  // override-merge logic as use-energy-metrics.ts lines 56–83. Keep this block in sync.
  const effectiveRecipe = useMemo(() => {
    if (!baseRecipe) return undefined;
    if (!overrides) return baseRecipe;
    return {
      ...baseRecipe,
      ...(overrides.footprintWidth !== undefined
        ? { footprintWidth: overrides.footprintWidth }
        : {}),
      ...(overrides.footprintDepth !== undefined
        ? { footprintDepth: overrides.footprintDepth }
        : {}),
      ...(overrides.wallThickness !== undefined
        ? { wallThickness: overrides.wallThickness }
        : {}),
      ...(overrides.facade
        ? { facade: { ...baseRecipe.facade, ...overrides.facade } }
        : {}),
      ...(overrides.slab
        ? { slab: { ...baseRecipe.slab, ...overrides.slab } }
        : {}),
      ...(overrides.column
        ? { column: { ...baseRecipe.column, ...overrides.column } }
        : {}),
      ...(overrides.roof
        ? { roof: { ...baseRecipe.roof, ...overrides.roof } }
        : {}),
    };
  }, [baseRecipe, overrides]);

  // Second useMemo: run pure calculation with stable deps
  return useMemo<SystemBreakdown | null>(() => {
    if (!materials || !effectiveRecipe) return null;
    const climate = getClimateData(sigunguCd);
    return calculateSystemBreakdown(materials, effectiveRecipe, climate);
  }, [materials, effectiveRecipe, sigunguCd]);
}
