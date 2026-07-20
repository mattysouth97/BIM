"use client";

// src/hooks/use-energy-metrics.ts
// Reactive energy metrics computation from material-store and recipe-store.
// IMPORTANT: Avoids getEffectiveRecipe in Zustand selector to prevent infinite loops.
// Instead subscribes to baseRecipes[pk] and overrides[pk] separately, derives effective recipe via useMemo.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getGradeColor } from "@/lib/energy/energy-grade";
import { calculateCO2 } from "@/lib/energy/co2-emissions";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import {
  deliveredFromDemand,
  buildingTypeFromMaterials,
} from "@/lib/energy/delivered-from-demand";
import type { HeatLossResult } from "@/lib/energy/heat-loss";
import type { AnnualDemand } from "@/lib/energy/annual-demand";
import type { EfficiencyGrade } from "@/lib/compliance/efficiency-rating";
import type { CO2Result } from "@/lib/energy/co2-emissions";
import type { AnnualConsumption } from "@/lib/energy/consumption-normalizer";

export interface EnergyMetrics {
  heatLoss: HeatLossResult;
  demand: AnnualDemand;
  /**
   * P1-05: the OFFICIAL MOTIE/KEMCO primary-energy grade
   * (calculateEfficiencyRating), residential/non-residential aware. The
   * legacy delivered-energy scale is no longer user-facing.
   */
  grade: EfficiencyGrade;
  gradeColor: string;
  /** Primary energy intensity backing the grade + benchmark. kWh/m²·yr. */
  primaryEnergyPerArea: number;
  co2: CO2Result;
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
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  // P1-08 (a): single canonical merge — carries footprintPolygon overrides.
  const effectiveRecipe = useEffectiveRecipe(buildingPk);

  // Compute all energy metrics
  const metrics = useMemo<EnergyMetrics | null>(() => {
    if (!materials || !effectiveRecipe) return null;

    const totalFloorArea =
      effectiveRecipe.footprintWidth *
      effectiveRecipe.footprintDepth *
      effectiveRecipe.floors.length;
    // P1-05 honesty: without a positive floor area no per-area intensity or
    // grade can exist — return null rather than fabricate a "1+++" rating.
    if (totalFloorArea <= 0) return null;

    const climate = getClimateData(sigunguCd);
    const heatLoss = calculateHeatLoss(materials, effectiveRecipe, climate);
    const demand = calculateAnnualDemand(
      heatLoss,
      materials,
      effectiveRecipe,
      climate
    );
    // P1-05: official primary-energy rating — one computation path shared
    // with the compliance report.
    const rating = calculateEfficiencyRating(
      deliveredFromDemand(demand),
      totalFloorArea,
      buildingTypeFromMaterials(materials)
    );
    const grade = rating.grade;
    const gradeColor = getGradeColor(grade);
    const co2 = calculateCO2(demand, totalFloorArea);

    // Compute predicted vs actual delta using most recent actual year
    let predictedVsActualDelta: number | null = null;
    if (actualConsumption && actualConsumption.length > 0) {
      const mostRecent = actualConsumption.reduce((a, b) =>
        b.year > a.year ? b : a
      );
      if (mostRecent.total_kwh > 0) {
        predictedVsActualDelta =
          ((demand.totalDemand - mostRecent.total_kwh) / mostRecent.total_kwh) * 100;
      }
    }

    return {
      heatLoss,
      demand,
      grade,
      gradeColor,
      primaryEnergyPerArea: rating.primaryEnergyPerArea,
      co2,
      predictedVsActualDelta,
    };
  }, [materials, effectiveRecipe, sigunguCd, actualConsumption]);

  return metrics;
}
