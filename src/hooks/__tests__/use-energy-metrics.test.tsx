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
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import {
  deliveredFromDemand,
  buildingTypeForGrade,
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
      { year: 2025, electric_kwh: 0, gas_kwh: 0, district_kwh: 0, total_kwh: base!.demand.totalDemand / 2 },
    ];
    const withActual = renderHook(() => useEnergyMetrics(PK, undefined, actual)).result
      .current;
    expect(withActual!.predictedVsActualDelta).not.toBeNull();
    expect(withActual!.predictedVsActualDelta!).toBeGreaterThan(0);

    // Actual at double the predicted ⇒ negative delta.
    const actualHigh = [
      { year: 2025, electric_kwh: 0, gas_kwh: 0, district_kwh: 0, total_kwh: base!.demand.totalDemand * 2 },
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
    const totalArea = envelopeQuantities(recipe).intensityFloorAreaSqm;
    const expected = calculateEfficiencyRating(
      deliveredFromDemand(metrics!.demand),
      totalArea,
      // The recipe's 주용도코드 reaches the table choice, exactly as
      // `useEnergyMetrics` passes it — this fixture is 02000, a dwelling.
      buildingTypeForGrade(makeMaterials(), recipe.mainPurpsCd)
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

  it("the threshold table follows the USE CODE, not the occupancy density (P1-05)", () => {
    // This test asserted the opposite until 2026-09-06: that flipping the
    // density flipped the table. It did, and that was the defect — a dwelling
    // is the least densely occupied building there is, so density read three
    // of the four reference buildings onto the 비주거용 table and graded them
    // a band better than their use earns.
    const dense = makeMaterials();
    dense.occupancy.occupancyDensity = 0.2;

    // `makeRecipe()` is mainPurpsCd 02000 — 공동주택.
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });
    const sparse = renderHook(() => useEnergyMetrics(PK)).result.current;

    useMaterialStore.setState({ properties: { [PK]: dense } });
    const crowded = renderHook(() => useEnergyMetrics(PK)).result.current;

    // Same building, same demand, and now the SAME grade: the register says
    // it is housing either way, so the density no longer gets a vote.
    expect(crowded!.demand.totalDemand).toBeCloseTo(sparse!.demand.totalDemand, 6);
    expect(crowded!.grade).toBe(sparse!.grade);
  });

  it("the split still follows density where the recipe states no usable use code (P1-05)", () => {
    // The fallback the fix cannot reach, and the one the pages disclose.
    const noUseCode = { ...makeRecipe(), mainPurpsCd: "09000" };
    const dense = makeMaterials();
    dense.occupancy.occupancyDensity = 0.2;

    useRecipeStore.setState({ baseRecipes: { [PK]: noUseCode } });
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    const sparse = renderHook(() => useEnergyMetrics(PK)).result.current;

    useMaterialStore.setState({ properties: { [PK]: dense } });
    const crowded = renderHook(() => useEnergyMetrics(PK)).result.current;

    expect(crowded!.demand.totalDemand).toBeCloseTo(sparse!.demand.totalDemand, 6);
    expect(crowded!.grade).not.toBe(sparse!.grade);
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
