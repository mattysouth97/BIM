"use client";

// src/hooks/use-energy-metrics.ts
// Reactive energy metrics computation from material-store and recipe-store.
// IMPORTANT: Avoids getEffectiveRecipe in Zustand selector to prevent infinite loops.
// Instead subscribes to baseRecipes[pk] and overrides[pk] separately, derives effective recipe via useMemo.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { mergeRecipeOverrides } from "@/lib/procedural/recipe";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getGradeColor } from "@/lib/energy/energy-grade";
import { calculateCO2 } from "@/lib/energy/co2-emissions";
import { calculateSystemBreakdown } from "@/lib/energy/system-breakdown";
import type { SystemBreakdown } from "@/lib/energy/system-breakdown";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import type { HeatLossResult } from "@/lib/energy/heat-loss";
import type { AnnualDemand } from "@/lib/energy/annual-demand";
import type { EnergyGrade } from "@/lib/energy/energy-grade";
import type { CO2Result } from "@/lib/energy/co2-emissions";
import type { AnnualConsumption } from "@/lib/energy/consumption-normalizer";

export interface EnergyMetrics {
  heatLoss: HeatLossResult;
  demand: AnnualDemand;
  /** Official-style grade on PRIMARY energy with the correct threshold table */
  grade: EnergyGrade;
  gradeColor: string;
  co2: CO2Result;
  /** Whole-building primary energy intensity (kWh/m²·yr) the grade is based on */
  primaryPerSqm: number;
  /** Whole-building site energy incl. lighting/DHW/plug (kWh/yr) */
  siteTotal: number;
  /** End-use split behind siteTotal (hvac/lighting/dhw/plugLoads) */
  breakdown: SystemBreakdown;
  /**
   * Percentage difference between predicted annual demand and most recent actual consumption.
   * Positive = predicted exceeds actual; negative = actual exceeds predicted.
   * null when no actual consumption data is available.
   */
  predictedVsActualDelta: number | null;
}

/**
 * Reactively compute energy metrics for a building.
 * Subscribes to material and recipe stores; recalculates on any slider/config change.
 * Returns null if materials or recipe data is not yet available.
 *
 * @param buildingPk - Building primary key for store lookups
 * @param sigunguCd - Optional 법정동 code (e.g. "5110000000") — used to look up regional HDD/CDD
 * @param actualConsumption - Optional actual annual consumption from useActualEnergy hook
 */
export function useEnergyMetrics(
  buildingPk: string,
  sigunguCd?: string,
  actualConsumption?: AnnualConsumption[]
): EnergyMetrics | null {
  // Subscribe to individual store slices to avoid infinite loop from getEffectiveRecipe
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

  const effectiveRecipe = useMemo(() => {
    if (!baseRecipe) return undefined;
    if (!overrides) return baseRecipe;
    return mergeRecipeOverrides(baseRecipe, overrides);
  }, [baseRecipe, overrides]);

  // Compute all energy metrics
  const metrics = useMemo<EnergyMetrics | null>(() => {
    if (!materials || !effectiveRecipe) return null;

    const climate = getClimateData(sigunguCd);
    const heatLoss = calculateHeatLoss(materials, effectiveRecipe, climate);
    const demand = calculateAnnualDemand(
      heatLoss,
      materials,
      effectiveRecipe,
      climate
    );
    const totalFloorArea =
      effectiveRecipe.footprintWidth *
      effectiveRecipe.footprintDepth *
      effectiveRecipe.floors.length;

    // Whole-building site energy: HVAC (degree-day engine) + lighting/DHW/
    // plug via use-type ratios. Needed for grading and calibration — the
    // HVAC-only number systematically under-represents the building.
    const breakdown = calculateSystemBreakdown(materials, effectiveRecipe, climate);

    // Grade on PRIMARY energy against the correct table (official method).
    // Fuel split: heating + DHW ride the heating fuel; cooling, lighting and
    // plug loads are electric.
    const heatingFuel = materials.hvac.heating.fuelType;
    const fuelLeg = demand.heatingDemand + breakdown.dhw;
    const electricLeg =
      demand.coolingDemand + breakdown.lighting + breakdown.plugLoads;
    const delivered = {
      electric:
        heatingFuel === "electric" || heatingFuel === "heat-pump"
          ? electricLeg + fuelLeg
          : electricLeg,
      gas: heatingFuel === "gas" || heatingFuel === "oil" ? fuelLeg : 0,
      districtHeating: heatingFuel === "district-heat" ? fuelLeg : 0,
    };
    const isResidential =
      effectiveRecipe.mainPurpsCd?.startsWith("01") ||
      effectiveRecipe.mainPurpsCd?.startsWith("02");
    const rating = calculateEfficiencyRating(
      delivered,
      totalFloorArea,
      isResidential ? "residential" : "non-residential"
    );
    const grade = rating.grade as EnergyGrade;
    const gradeColor = getGradeColor(grade);
    const co2 = calculateCO2(demand, totalFloorArea, heatingFuel);

    // Predicted vs actual: compare whole-building prediction against the
    // whole-building meter total (HVAC-only vs meter is apples-to-oranges).
    let predictedVsActualDelta: number | null = null;
    if (actualConsumption && actualConsumption.length > 0) {
      const mostRecent = actualConsumption.reduce((a, b) =>
        b.year > a.year ? b : a
      );
      if (mostRecent.total_kwh > 0) {
        predictedVsActualDelta =
          ((breakdown.total - mostRecent.total_kwh) / mostRecent.total_kwh) * 100;
      }
    }

    return {
      heatLoss,
      demand,
      grade,
      gradeColor,
      co2,
      primaryPerSqm: rating.primaryEnergyPerArea,
      siteTotal: breakdown.total,
      breakdown,
      predictedVsActualDelta,
    };
  }, [materials, effectiveRecipe, sigunguCd, actualConsumption]);

  return metrics;
}
