// One baseline: the measures are priced against the engine's own demand.
//
// Until 2026-09-06 the instrument frame showed kWh/m² from the degree-day
// engine and, two rows above it, an NPV computed against `floorArea × 120`
// and `× 30`. Both were arithmetically correct and they described different
// buildings. These tests pin the join, and the unit conversion inside it that
// is easy to get wrong in the direction nobody notices.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRetrofitScenario, usefulDemandFromEngine } from "../use-retrofit-scenario";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getClimateData } from "@/lib/energy/climate-data";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

/** Hours the engine annualises the constant-ΔT ground loss over. */
const HEATING_SEASON_HOURS = 4380;

describe("usefulDemandFromEngine mirrors what calculateAnnualDemand divided out", () => {
  for (const id of ["bs-medical-dental-clinic", "schependomlaan"] as const) {
    it(`${id}: recovers the engine's own useful heat, clamps included`, () => {
      const energy = referenceBuildingEnergyInputs(id)!;
      const climate = getClimateData(energy.climate.sigunguCd);
      const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
      const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);

      // Rebuild `heatingRaw` the way annual-demand.ts builds it, from the
      // heat-loss elements — independent of the efficiency it then divides by.
      let hAir = 0;
      let groundAnnualKwh = 0;
      for (const el of heatLoss.elements) {
        if (el.element === "Ground Floor") {
          groundAnnualKwh = (el.hCoefficient * el.deltaT * HEATING_SEASON_HOURS) / 1000;
        } else {
          hAir += el.hCoefficient;
        }
      }
      const heatingRaw = (hAir * climate.hdd * 24) / 1000 + groundAnnualKwh;

      const useful = usefulDemandFromEngine(demand, energy.materials);

      // If annual-demand.ts ever changes its normalisation or its 0.3–6
      // clamp without this helper following, this is the assertion that goes
      // red rather than a saving quietly moving by 1/η.
      expect(useful.heating).toBeCloseTo(heatingRaw, 6);
      // And it is NOT the delivered figure the engine reports.
      expect(useful.heating).not.toBeCloseTo(demand.heatingDemand, 0);
    });
  }

  it("a building with no cooling system yields zero useful cooling, not a divide by zero", () => {
    const energy = referenceBuildingEnergyInputs("schependomlaan")!;
    const climate = getClimateData(energy.climate.sigunguCd);
    const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
    const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);

    expect(energy.materials.hvac.cooling.efficiency).toBe(0);
    expect(demand.coolingDemand).toBe(0);
    expect(usefulDemandFromEngine(demand, energy.materials).cooling).toBe(0);
  });
});

const PK = "TEST-PK-ONE-BASELINE";

/** The measure fields the baseline actually moves. */
function shape(measures: RetrofitMeasure[]) {
  return measures
    .map((m) => `${m.id}:${m.annualEnergySaving.toFixed(6)}:${m.estimatedCost.toFixed(6)}`)
    .sort();
}

describe("useRetrofitScenario prices against the engine, not against floorArea × 120", () => {
  beforeEach(() => {
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });

  for (const id of ["bs-medical-dental-clinic", "schependomlaan"] as const) {
    it(`${id}: engineDemand resolves to exactly the engine's useful demand`, () => {
      const energy = referenceBuildingEnergyInputs(id)!;
      const climate = getClimateData(energy.climate.sigunguCd);
      const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
      const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);
      const q = envelopeQuantities(energy.recipe);
      const useful = usefulDemandFromEngine(demand, energy.materials);

      useMaterialStore.setState({ properties: { [PK]: energy.materials } });
      useRecipeStore.setState({ baseRecipes: { [PK]: energy.recipe } });

      const base = {
        buildingPk: PK,
        capexBudgetKrw: 250_000_000,
        totalFloorArea: q.intensityFloorAreaSqm,
        footprintArea: q.planAreaSqm,
        sidoPrefix: energy.climate.sigunguCd.slice(0, 2),
      };

      const viaEngine = renderHook(() =>
        useRetrofitScenario({ ...base, engineDemand: demand }),
      ).result.current;
      // The same run, but with the useful figures stated explicitly. If the
      // conversion inside the hook is right these are the same measures down
      // to the last decimal — no re-implementation of the hook needed to say so.
      const viaExplicit = renderHook(() =>
        useRetrofitScenario({
          ...base,
          annualHeatingDemand: useful.heating,
          annualCoolingDemand: useful.cooling,
        }),
      ).result.current;

      expect(viaEngine.allMeasures.length).toBeGreaterThan(0);
      expect(shape(viaEngine.allMeasures)).toEqual(shape(viaExplicit.allMeasures));
      expect(viaEngine.energyImprovementFraction).toBeCloseTo(
        viaExplicit.energyImprovementFraction,
        12,
      );
    });

    it(`${id}: the old proxy baseline was a different building`, () => {
      const energy = referenceBuildingEnergyInputs(id)!;
      const climate = getClimateData(energy.climate.sigunguCd);
      const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
      const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);
      const q = envelopeQuantities(energy.recipe);
      const useful = usefulDemandFromEngine(demand, energy.materials);

      // The fallback the HUD used to hit, and how far off it was. These
      // ratios are quoted in the commit that made this change; they are
      // asserted so the claim cannot rot.
      const proxyHeating = q.intensityFloorAreaSqm * 120;
      const ratio = proxyHeating / useful.heating;
      const expected = id === "bs-medical-dental-clinic" ? 1.35 : 3.3;
      expect(ratio).toBeCloseTo(expected, 1);

      useMaterialStore.setState({ properties: { [PK]: energy.materials } });
      useRecipeStore.setState({ baseRecipes: { [PK]: energy.recipe } });
      const base = {
        buildingPk: PK,
        capexBudgetKrw: 250_000_000,
        totalFloorArea: q.intensityFloorAreaSqm,
        footprintArea: q.planAreaSqm,
        sidoPrefix: energy.climate.sigunguCd.slice(0, 2),
      };

      const viaEngine = renderHook(() =>
        useRetrofitScenario({ ...base, engineDemand: demand }),
      ).result.current;
      const viaProxy = renderHook(() => useRetrofitScenario(base)).result.current;

      // Not a cosmetic difference: the measure set the two baselines produce
      // is not the same set of numbers.
      expect(shape(viaEngine.allMeasures)).not.toEqual(shape(viaProxy.allMeasures));
    });
  }
});
