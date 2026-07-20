// src/hooks/__tests__/use-energy-metrics.test.tsx
// P1-08 (a, d) — useEnergyMetrics: effective-recipe consolidation carries
// footprintPolygon (via useEffectiveRecipe), regional sigunguCd changes the
// climate result, and actualConsumption produces predictedVsActualDelta.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEnergyMetrics } from "../use-energy-metrics";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { makeMaterials, makeRecipe } from "./test-fixtures";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import {
  deliveredFromDemand,
  buildingTypeFromMaterials,
} from "@/lib/energy/delivered-from-demand";
import { getEnergyGrade } from "@/lib/energy/energy-grade";

const PK = "TEST-PK-METRICS";

describe("useEnergyMetrics", () => {
  beforeEach(() => {
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });

  it("returns null when materials or recipe are missing", () => {
    const { result } = renderHook(() => useEnergyMetrics(PK));
    expect(result.current).toBeNull();

    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });
    const { result: r2 } = renderHook(() => useEnergyMetrics(PK));
    expect(r2.current).toBeNull();
  });

  it("regional sigunguCd changes the computed demand vs the Seoul default (P1-08 d)", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });

    const seoul = renderHook(() => useEnergyMetrics(PK)).result.current;
    // Busan prefix "26": HDD 1900 vs Seoul 2700 — heating demand must drop.
    const busan = renderHook(() => useEnergyMetrics(PK, "2611000000")).result.current;

    expect(seoul).not.toBeNull();
    expect(busan).not.toBeNull();
    expect(busan!.demand.heatingDemand).toBeLessThan(seoul!.demand.heatingDemand);
  });

  it("actualConsumption produces a non-null predictedVsActualDelta with correct sign (P1-08 d)", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });

    const base = renderHook(() => useEnergyMetrics(PK)).result.current;
    expect(base).not.toBeNull();

    // Actual consumption at half the predicted demand ⇒ positive delta
    // (predicted exceeds actual).
    const actual = [
      { year: 2025, electric_kwh: 0, gas_kwh: 0, total_kwh: base!.demand.totalDemand / 2 },
    ];
    const withActual = renderHook(() => useEnergyMetrics(PK, undefined, actual)).result
      .current;
    expect(withActual!.predictedVsActualDelta).not.toBeNull();
    expect(withActual!.predictedVsActualDelta!).toBeGreaterThan(0);

    // Actual at double the predicted ⇒ negative delta.
    const actualHigh = [
      { year: 2025, electric_kwh: 0, gas_kwh: 0, total_kwh: base!.demand.totalDemand * 2 },
    ];
    const withHigh = renderHook(() => useEnergyMetrics(PK, undefined, actualHigh)).result
      .current;
    expect(withHigh!.predictedVsActualDelta!).toBeLessThan(0);
  });

  it("grade is the official primary-energy rating, one computation path (P1-05)", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });

    const metrics = renderHook(() => useEnergyMetrics(PK)).result.current;
    expect(metrics).not.toBeNull();

    // Recompute through the official path with identical inputs — the hook's
    // grade must equal calculateEfficiencyRating's, not the legacy
    // delivered-energy scale.
    const recipe = makeRecipe();
    const totalArea =
      recipe.footprintWidth * recipe.footprintDepth * recipe.floors.length;
    const expected = calculateEfficiencyRating(
      deliveredFromDemand(metrics!.demand),
      totalArea,
      buildingTypeFromMaterials(makeMaterials())
    );
    expect(metrics!.grade).toBe(expected.grade);
    expect(metrics!.primaryEnergyPerArea).toBeCloseTo(
      expected.primaryEnergyPerArea,
      6
    );
    // And it must NOT be the legacy delivered-energy grade whenever the two
    // scales disagree for this fixture (primary ≈ 2.3× delivered).
    const legacy = getEnergyGrade(metrics!.demand.demandPerSqm);
    if (legacy !== expected.grade) {
      expect(metrics!.grade).not.toBe(legacy);
    }
  });

  it("the residential/non-residential split changes the grade for identical demand (P1-05)", () => {
    const residentialMaterials = makeMaterials();
    residentialMaterials.occupancy.occupancyDensity = 0.2; // residential

    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });
    const nonRes = renderHook(() => useEnergyMetrics(PK)).result.current;

    useMaterialStore.setState({ properties: { [PK]: residentialMaterials } });
    const res = renderHook(() => useEnergyMetrics(PK)).result.current;

    // Same demand, different threshold table ⇒ different grade (residential
    // thresholds are stricter at every band in this fixture's primary range).
    expect(res!.demand.totalDemand).toBeCloseTo(nonRes!.demand.totalDemand, 6);
    expect(res!.grade).not.toBe(nonRes!.grade);
  });

  it("returns null (no fabricated grade) when total floor area is not positive (P1-05)", () => {
    const recipe = makeRecipe();
    recipe.footprintWidth = 0;
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: recipe } });

    const { result } = renderHook(() => useEnergyMetrics(PK));
    expect(result.current).toBeNull();
  });

  it("stays null-honest: empty actualConsumption keeps predictedVsActualDelta null", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });

    const { result } = renderHook(() => useEnergyMetrics(PK, undefined, []));
    expect(result.current!.predictedVsActualDelta).toBeNull();
  });
});
