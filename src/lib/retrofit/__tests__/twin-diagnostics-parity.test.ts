import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { canonicalParityBuilding, paritySimulationRun } from "@/hooks/__tests__/test-fixtures";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { analyzeRetrofitEconomics } from "@/lib/energy-diagnostics/retrofit-bridge";
import { layoutRoofPlanes } from "../pv-layout";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";

function bothPaths() {
  const fixture = canonicalParityBuilding();
  const run = paritySimulationRun(fixture);
  useMaterialStore.getState().setProperties("parity", fixture.materials);
  useRecipeStore.getState().setBaseRecipe("parity", fixture.recipe);
  const q = envelopeQuantities(fixture.recipe);
  const hook = renderHook(() => useRetrofitScenario({
    buildingPk: "parity", totalFloorArea: q.intensityFloorAreaSqm, footprintArea: q.planAreaSqm,
    capexBudgetKrw: null, climateRegion: fixture.climateRegion,
    pvGeometricKWp: layoutRoofPlanes(fixture.roofPlanes).totalKWp,
    engineDemand: run.engineOutput!.annualDemand,
  }));
  const twin = hook.result.current;
  hook.unmount();
  return { twin, diagnostics: analyzeRetrofitEconomics(run)! };
}

describe("twin and diagnostics exact parity", () => {
  beforeEach(() => {
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });
  it("both paths generate the same measure ids", () => {
    const { twin, diagnostics } = bothPaths();
    expect(twin.allMeasures.map(m => m.id).sort()).toEqual(diagnostics.measures.map(m => m.id).sort());
  });
  it("both paths agree on kWh for every measure", () => {
    const { twin, diagnostics } = bothPaths();
    for (const measure of twin.allMeasures) {
      const other = diagnostics.measures.find(m => m.id === measure.id);
      expect(other, measure.id).toBeDefined();
      expect(measure.annualEnergySaving, measure.id).toBe(other!.annualEnergySaving);
    }
  });
  it("both paths agree on cost, saving and discounted financials for every measure", () => {
    const { twin, diagnostics } = bothPaths();
    for (const measure of twin.allMeasures) {
      const other = diagnostics.measures.find(m => m.id === measure.id);
      expect(other, measure.id).toBeDefined();
      expect(measure.estimatedCost).toBe(other!.estimatedCost);
      expect(measure.annualCostSaving).toBe(other!.annualCostSaving);
      expect(measure.financials).toEqual(other!.financials);
      for (const [field, value] of Object.entries(measure.financials!)) {
        if (typeof value === "number") expect(value).toBe(other!.financials[field as keyof NonNullable<typeof measure.financials>]);
      }
    }
  });
  it("both paths produce the same core result", () => {
    const { twin, diagnostics } = bothPaths();
    expect(twin.coreResult).toEqual(diagnostics.coreResult);
  });

});
