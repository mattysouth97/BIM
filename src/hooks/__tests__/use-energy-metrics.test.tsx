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

  it("stays null-honest: empty actualConsumption keeps predictedVsActualDelta null", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() } });

    const { result } = renderHook(() => useEnergyMetrics(PK, undefined, []));
    expect(result.current!.predictedVsActualDelta).toBeNull();
  });
});
