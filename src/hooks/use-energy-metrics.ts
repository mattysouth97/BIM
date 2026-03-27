"use client";

// src/hooks/use-energy-metrics.ts
// Reactive energy metrics computation from material-store and recipe-store.
// IMPORTANT: Avoids getEffectiveRecipe in Zustand selector to prevent infinite loops.
// Instead subscribes to baseRecipes[pk] and overrides[pk] separately, derives effective recipe via useMemo.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getEnergyGrade, getGradeColor } from "@/lib/energy/energy-grade";
import { calculateCO2 } from "@/lib/energy/co2-emissions";
import type { HeatLossResult } from "@/lib/energy/heat-loss";
import type { AnnualDemand } from "@/lib/energy/annual-demand";
import type { EnergyGrade } from "@/lib/energy/energy-grade";
import type { CO2Result } from "@/lib/energy/co2-emissions";

export interface EnergyMetrics {
  heatLoss: HeatLossResult;
  demand: AnnualDemand;
  grade: EnergyGrade;
  gradeColor: string;
  co2: CO2Result;
}

/**
 * Reactively compute energy metrics for a building.
 * Subscribes to material and recipe stores; recalculates on any slider/config change.
 * Returns null if materials or recipe data is not yet available.
 */
export function useEnergyMetrics(buildingPk: string): EnergyMetrics | null {
  // Subscribe to individual store slices to avoid infinite loop from getEffectiveRecipe
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

  // Derive effective recipe in useMemo (same logic as store's getEffectiveRecipe)
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

  // Compute all energy metrics
  const metrics = useMemo<EnergyMetrics | null>(() => {
    if (!materials || !effectiveRecipe) return null;

    const climate = getClimateData();
    const heatLoss = calculateHeatLoss(materials, effectiveRecipe, climate);
    const demand = calculateAnnualDemand(
      heatLoss,
      materials,
      effectiveRecipe,
      climate
    );
    const grade = getEnergyGrade(demand.demandPerSqm);
    const gradeColor = getGradeColor(grade);
    const totalFloorArea =
      effectiveRecipe.footprintWidth *
      effectiveRecipe.footprintDepth *
      effectiveRecipe.floors.length;
    const co2 = calculateCO2(demand, totalFloorArea);

    return { heatLoss, demand, grade, gradeColor, co2 };
  }, [materials, effectiveRecipe]);

  return metrics;
}
