"use client";

// src/hooks/use-energy-breakdown.ts
// Reactive per-system energy breakdown (HVAC / lighting / DHW / plug) from material-store
// and recipe-store. P1-08 (a): the effective recipe comes from the single
// useEffectiveRecipe hook — DO NOT subscribe to getEffectiveRecipe() in a
// selector (its getter returns a new object per call; Phase 23 Pitfall 1).

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
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
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  // P1-08 (a): single canonical merge — referentially stable while inputs
  // are unchanged, which preserves this hook's stability guarantee.
  const effectiveRecipe = useEffectiveRecipe(buildingPk);

  // Run pure calculation with stable deps
  return useMemo<SystemBreakdown | null>(() => {
    if (!materials || !effectiveRecipe) return null;
    const climate = getClimateData(sigunguCd);
    return calculateSystemBreakdown(materials, effectiveRecipe, climate);
  }, [materials, effectiveRecipe, sigunguCd]);
}
