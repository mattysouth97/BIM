// src/hooks/__tests__/use-retrofit-scenario.test.tsx
// P1-01 — sequential-demand damping: HVAC measures are generated against the
// POST-envelope residual heating demand, and the GR improvement fraction is
// physically bounded.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRetrofitScenario } from "../use-retrofit-scenario";
import { useMaterialStore } from "@/store/material-store";
import { makeMaterials } from "./test-fixtures";

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
    expect(hrv!.annualEnergySaving).toBeCloseTo(0.15 * residual, 3);
  });

  it("energyImprovementFraction stays within [0, 1]", () => {
    useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });

    const scenario = renderScenario(100_000);
    expect(scenario.energyImprovementFraction).toBeGreaterThanOrEqual(0);
    expect(scenario.energyImprovementFraction).toBeLessThanOrEqual(1);
  });
});
