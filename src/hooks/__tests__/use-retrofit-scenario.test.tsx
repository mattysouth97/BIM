// src/hooks/__tests__/use-retrofit-scenario.test.tsx
// P1-01 — sequential-demand damping: HVAC measures are generated against the
// POST-envelope residual heating demand, and the GR improvement fraction is
// physically bounded.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRetrofitScenario } from "../use-retrofit-scenario";
import { useMaterialStore } from "@/store/material-store";
import { makeMaterials } from "./test-fixtures";
import { DEFAULT_ECONOMIC_ASSUMPTIONS } from "@/lib/retrofit/cost-database";
import { computeFinancials, effectiveDiscountRate } from "@/lib/retrofit/economic-model";

const PK = "TEST-PK-RETRO";

function renderScenario(annualHeatingDemand = 100_000) {
  return renderHook(() =>
    useRetrofitScenario({
      buildingPk: PK,
      capexBudgetKrw: 250_000_000,
      totalFloorArea: 840,
      footprintArea: 84,
      annualHeatingDemand,
      annualCoolingDemand: 30_000,
    })
  ).result.current;
}

describe("useRetrofitScenario sequential damping (P1-01)", () => {
  beforeEach(() => {
    useMaterialStore.setState({ properties: {} });
  });

  it("HRV saving is 15% of the POST-envelope residual heating demand, not the baseline", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });

    const scenario = renderScenario(100_000);
    const envelopeSaving = scenario.allMeasures
      .filter((m) => m.category === "envelope")
      .reduce((s, m) => s + m.annualEnergySaving, 0);
    expect(envelopeSaving).toBeGreaterThan(0); // precondition: envelope measures exist

    const hrv = scenario.allMeasures.find((m) => m.id === "hvac-hrv");
    expect(hrv).toBeDefined();

    const residual = Math.max(0, 100_000 - envelopeSaving);
    // Demand-side 15% recovered, converted to fuel by / η (accuracy wave).
    expect(hrv!.annualEnergySaving).toBeCloseTo((0.15 * residual) / 0.87, 3);
  });

  it("threads district heating from the material store into measure pricing (P1-03)", () => {
    const dhMaterials = makeMaterials();
    dhMaterials.hvac.heating.fuelType = "district-heat";
    dhMaterials.hvac.heating.systemType = "district";
    useMaterialStore.setState({ properties: { [PK]: dhMaterials } });

    const scenario = renderScenario(100_000);
    const wall = scenario.allMeasures.find((m) => m.id === "envelope-wall-insulation");
    expect(wall).toBeDefined();
    expect(wall!.fuel).toBe("districtHeating");
    // 90 KRW/kWh district-heat tariff, not the 75 KRW gas price.
    expect(wall!.annualCostSaving).toBeCloseTo(wall!.annualEnergySaving * 90, 4);
  });

  it("energyImprovementFraction stays within [0, 1]", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });

    const scenario = renderScenario(100_000);
    expect(scenario.energyImprovementFraction).toBeGreaterThanOrEqual(0);
    expect(scenario.energyImprovementFraction).toBeLessThanOrEqual(1);
  });

  it("uses unsubsidized costs and DCF even when a legacy caller supplies a funding track", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
    for (const programTrack of ["public-local", "public-seoul-or-central", "private-base", "private-tier2", "private-high-perf"]) {
      // A runtime legacy object may have extra keys even though the hook's
      // public input type no longer offers programTrack.
      const legacyInputs = {
        buildingPk: PK,
        capexBudgetKrw: 250_000_000,
        totalFloorArea: 840,
        footprintArea: 84,
        annualHeatingDemand: 100_000,
        annualCoolingDemand: 30_000,
        chosenMeasureIds: ["envelope-wall-insulation"],
        programTrack,
      };
      const { result, unmount } = renderHook(() => useRetrofitScenario(legacyInputs));
      const scenario = result.current;
      expect(scenario.assumptions).toBe(DEFAULT_ECONOMIC_ASSUMPTIONS);
      expect(effectiveDiscountRate(scenario.assumptions)).toBe(0.05);
      expect(scenario.chosen?.selected.map((measure) => measure.id)).toEqual(legacyInputs.chosenMeasureIds);
      const chosen = scenario.chosen!.selected[0];
      expect(scenario.chosen!.effectiveCapex).toBe(chosen.estimatedCost);
      expect(scenario.chosen!.npv).toBeCloseTo(computeFinancials(chosen, DEFAULT_ECONOMIC_ASSUMPTIONS).npv, 6);
      expect(scenario).not.toHaveProperty("suggestedPrivateTrack");
      unmount();
    }
  });
});
