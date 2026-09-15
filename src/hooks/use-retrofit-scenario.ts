"use client";

// src/hooks/use-retrofit-scenario.ts
//
// Bridges the existing material/recipe stores → per-category retrofit
// generators → economic-model knapsack. The result drives the Twin-stage
// CAPEX/ROI simulator UI.
//
// Inputs are kept narrow and explicit (rather than e.g. inferring everything
// from the building PK alone) so the hook stays pure and testable.
// BuildingScene already has the geometry on hand — passing it in avoids
// duplicate computation.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useScenarioStore } from "@/store/scenario-store";
import { generateRetrofitMeasures, type RetrofitCoreResult } from "@/lib/retrofit/retrofit-core";
export { usefulDemandFromEngine } from "@/lib/retrofit/retrofit-core";
import { type EconomicAssumptions, type BudgetSelection } from "@/lib/retrofit/economic-model";
import { DEFAULT_ECONOMIC_ASSUMPTIONS } from "@/lib/retrofit/cost-database";
import { climateFromRegion, getClimateData } from "@/lib/energy/climate-data";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import type { ClimateRegion } from "@/lib/energy/climate-region";

export interface RetrofitScenarioInputs {
  /**
   * kWp from the measured-roof layout (`usePvLayout`): modules that actually
   * fit the planes × 0.40. When present it is the system size the PV measure
   * is priced at; absent, the ratio estimate stands and the measure says so.
   */
  pvGeometricKWp?: number;
  /** Active building primary key (mgmBldrgstPk). Used to look up materials. */
  buildingPk: string;
  /** CAPEX budget in KRW. The knapsack picks the optimal subset within this. */
  /** Optional ceiling. `null` → recommendation = NPV-positive measures, no knapsack. */
  capexBudgetKrw: number | null;
  /** Total conditioned floor area (m²). From building geometry. */
  totalFloorArea: number;
  /** Footprint / roof area (m²). Drives solar potential. */
  footprintArea: number;
  /** Roof type for solar (defaults to "flat"). */
  roofType?: "flat" | "gable" | "hip" | "sawtooth";
  /** Resolved once at the payload boundary; null refuses PV. */
  climateRegion?: ClimateRegion | null;
  /** Annual lighting operating hours; defaults office (2500). */
  annualOperatingHours?: number;
  /** Annual USEFUL heating demand (kWh/yr); used by HVAC retrofits. Defaults to a coarse estimate. */
  annualHeatingDemand?: number;
  /** Annual USEFUL cooling demand (kWh/yr); used by HVAC retrofits. Defaults coarse. */
  annualCoolingDemand?: number;
  /**
   * The degree-day engine's own answer for this building — pass
   * `useEnergyMetrics(pk, sido)?.demand` straight in. Wins over
   * `annualHeatingDemand` / `annualCoolingDemand`, and is the only way to get
   * the measures priced against the same baseline the kWh/m² on screen came
   * from. Without it the hook falls back to `floorArea × 120` and `× 30`,
   * which on the two reference buildings is 1.35× and 3.30× their real
   * heating demand — so NPV and kWh on one frame described two buildings.
   *
   * NOTE the unit change this performs. `AnnualDemand` reports DELIVERED
   * energy (useful ÷ η, cooling ÷ COP) because that is what a meter reads,
   * while `generateHvacRetrofits` documents its input as USEFUL heat and
   * divides by η itself. Handing the delivered figure straight over would
   * inflate every boiler saving by 1/η. It is converted back below.
   */
  engineDemand?: { heatingDemand: number; coolingDemand: number };
  /**
   * The areas the engine actually priced, straight off its own heat-loss
   * elements. Every measure's cost AND saving is linear in its area
   * (`envelope-retrofits.ts`), so an area the engine did not use produces a
   * number that cannot be reconciled with the W/K on the same frame.
   *
   * Without it the hook derives areas from `materials.envelope.walls` and
   * `footprintArea`, which on the two reference buildings understates the
   * apartment's roof measure by 36 % (footprint 345.81 m² against a measured
   * roof surface of 542.96) and its window measure by 27 % (the ratio applied
   * to the NET wall rather than the gross the engine multiplies).
   *
   * `opaqueWallSqm` is the one figure that is deliberately NOT the engine's:
   * the engine's "Walls" element is `gross − aperture` with the doors inside
   * it, and a wall-insulation measure should not be sized over a door. The
   * caller subtracts a STATED door area or nothing at all.
   */
  engineEnvelopeAreas?: {
    opaqueWallSqm: number;
    windowSqm: number;
    roofSqm: number;
    groundFloorSqm: number;
  };
  /** Feed-in tariff (KRW/kWh) for solar. Defaults to 130. */
  feedInTariffKrw?: number;
  /**
   * Explicit economic assumptions for sensitivity analysis (custom discount
   * rate, escalation, etc.). The product uses the unsubsidized default.
   */
  assumptions?: EconomicAssumptions;
  /**
   * The work the USER chose, from `scenario-store.appliedMeasureIds`. When
   * given, `chosen` prices exactly this set.
   * `null`/omitted means nothing is chosen yet and the recommendation stands
   * in — the state a page is in for the moment before the HUD seeds it.
   *
   * Ids absent from the generated catalogue are ignored: a measure the
   * generators did not produce for this building cannot be priced for it.
   */
  chosenMeasureIds?: string[] | null;
}

export interface RetrofitScenario {
  /** Region is unknown: PV is withheld and other measures use a named legacy climate fallback. */
  regionUnresolved: boolean;
  unsavedEditCount: number;
  coreResult: RetrofitCoreResult | null;
  /** All technically-viable measures the engine produced (financially enriched). */
  allMeasures: RetrofitMeasure[];
  /**
   * The knapsack's RECOMMENDATION — NPV-maximising subset within the budget.
   * Since 2026-09-06 this is what the chips mark 추천; it is not what the frame
   * prices. `chosen` is.
   */
  selection: BudgetSelection | null;
  /**
   * The economics of the work the user actually chose, evaluated by the same
   * `evaluateMeasureSet` the knapsack ends with — one aggregation, two inputs.
   * Falls back to `selection` while nothing has been chosen; `null` only when
   * there are no measures at all.
   */
  chosen: BudgetSelection | null;
  /** The economic assumptions used (for display in the UI). */
  assumptions: EconomicAssumptions;
  /**
   * D₂.5 — CHOSEN-scenario energy saving as a fraction of the baseline annual
   * demand (heating + cooling + lighting), excluding renewable generation;
   * 0 when nothing is chosen or the baseline is unknown. It follows the chosen
   * work rather than the recommendation.
   */
  energyImprovementFraction: number;
}

/**
 * Read the engine's own element areas off a heat-loss result.
 *
 * Exported because two surfaces need them and must not each derive their own:
 * the instrument frame over the canvas and the retrofit list in the side
 * panel of `/models/[id]`. Returns `undefined` rather than a partial object
 * when any element is missing, so the hook falls back to its documented
 * derivation instead of being handed a hole.
 */
export function engineEnvelopeAreasFrom(
  elements: readonly { element: string; area: number }[],
  exteriorDoorSqm = 0,
): RetrofitScenarioInputs["engineEnvelopeAreas"] {
  const area = (name: string) => elements.find((e) => e.element === name)?.area;
  const walls = area("Walls");
  const windows = area("Windows");
  const roof = area("Roof");
  const ground = area("Ground Floor");
  if (walls == null || windows == null || roof == null || ground == null) {
    return undefined;
  }
  return {
    // The engine's wall element is `gross − aperture` with the doors inside
    // it (A-DOORS). Insulation does not go on a door, so a STATED door area
    // comes off — and where none is stated nothing is guessed.
    opaqueWallSqm: Math.max(0, walls - exteriorDoorSqm),
    windowSqm: windows,
    roofSqm: roof,
    groundFloorSqm: ground,
  };
}

export function useRetrofitScenario(inputs: RetrofitScenarioInputs): RetrofitScenario {
  const { buildingPk, climateRegion = null, capexBudgetKrw, chosenMeasureIds = null } = inputs;
  const materials = useMaterialStore(s => s.properties[buildingPk]);
  const editPaths = useMaterialStore(s => s.overridePaths[buildingPk]);
  const unsavedEditCount = editPaths?.length ?? 0;
  const recipe = useEffectiveRecipe(buildingPk);
  const publishedInputs = useScenarioStore(s => s.buildingInputs);
  const publishedPlanes = useScenarioStore(s => s.roofPlanes);
  const roofPlanes = publishedInputs?.buildingPk === buildingPk ? publishedPlanes : null;
  const assumptions = inputs.assumptions ?? DEFAULT_ECONOMIC_ASSUMPTIONS;
  const coreResult = useMemo(() => materials && inputs.totalFloorArea > 0 ? generateRetrofitMeasures({
    materials, recipe: recipe ?? null,
    climate: climateRegion ? climateFromRegion(climateRegion) : getClimateData(), climateRegion,
    conditionedFloorAreaSqm: inputs.totalFloorArea,
    roofPlanes: inputs.pvGeometricKWp !== undefined ? null : roofPlanes,
    pvGeometricKWp: inputs.pvGeometricKWp, roofType: inputs.roofType, capexBudgetKrw,
    engineEnvelopeAreas: inputs.engineEnvelopeAreas,
    programTrack: "none", measureIds: chosenMeasureIds, unsavedEditCount, assumptions,
    feedInTariffKrw: inputs.feedInTariffKrw,
    screening: { footprintArea: inputs.footprintArea, roofType: inputs.roofType ?? "flat", annualOperatingHours: inputs.annualOperatingHours ?? 2500, annualHeatingDemand: inputs.annualHeatingDemand, annualCoolingDemand: inputs.annualCoolingDemand, engineDemand: inputs.engineDemand, engineEnvelopeAreas: inputs.engineEnvelopeAreas },
  }) : null, [materials, recipe, climateRegion, inputs.totalFloorArea, roofPlanes, inputs.pvGeometricKWp, inputs.engineEnvelopeAreas, chosenMeasureIds, unsavedEditCount, assumptions, inputs.feedInTariffKrw, inputs.footprintArea, inputs.roofType, inputs.annualOperatingHours, inputs.annualHeatingDemand, inputs.annualCoolingDemand, inputs.engineDemand, capexBudgetKrw]);
  const allMeasures = useMemo(() => coreResult?.measures ?? [], [coreResult]);
  const selection = coreResult?.selection ?? null;
  const chosen = coreResult?.chosen ?? null;
  const baseline = coreResult?.delta?.before.sitePerSqm;
  const energyImprovementFraction = baseline
    ? Math.max(0, Math.min(1, -coreResult!.delta!.deltaSitePerSqm / baseline))
    : Math.max(0, Math.min(1, (chosen?.selected.filter(m => m.category !== "renewable").reduce((sum, m) => sum + m.annualEnergySaving, 0) ?? 0) / ((baseline ?? 150) * inputs.totalFloorArea || 1)));
  return { regionUnresolved: !climateRegion, unsavedEditCount, coreResult, allMeasures, selection, chosen, assumptions, energyImprovementFraction };
}
