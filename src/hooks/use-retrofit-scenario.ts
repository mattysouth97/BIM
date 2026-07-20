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
import { generateEnvelopeRetrofits, KOREAN_2020_TARGET_U_VALUES } from "@/lib/retrofit/envelope-retrofits";
import { generateHvacRetrofits } from "@/lib/retrofit/hvac-retrofits";
import { generateLightingRetrofits } from "@/lib/retrofit/lighting-retrofits";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import {
  selectMeasuresForBudget,
  computeFinancials,
  type EconomicAssumptions,
  type BudgetSelection,
} from "@/lib/retrofit/economic-model";
import {
  DEFAULT_ECONOMIC_ASSUMPTIONS,
  KOREAN_GR_PRESETS,
  suggestPrivateTrack,
  type ProgramTrack,
} from "@/lib/retrofit/cost-database";
import { SEOUL_CLIMATE, REGIONAL_CLIMATE } from "@/lib/energy/climate-data";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

export interface RetrofitScenarioInputs {
  /** Active building primary key (mgmBldrgstPk). Used to look up materials. */
  buildingPk: string;
  /** CAPEX budget in KRW. The knapsack picks the optimal subset within this. */
  capexBudgetKrw: number;
  /** Total conditioned floor area (m²). From building geometry. */
  totalFloorArea: number;
  /** Footprint / roof area (m²). Drives solar potential. */
  footprintArea: number;
  /** Roof type for solar (defaults to "flat"). */
  roofType?: "flat" | "gable" | "hip" | "sawtooth";
  /** Lower-cased region key for solar irradiance (defaults "seoul"). */
  region?: string;
  /** Sido code prefix (2 digits) for HDD lookup; defaults to Seoul. */
  sidoPrefix?: string;
  /** Annual lighting operating hours; defaults office (2500). */
  annualOperatingHours?: number;
  /** Annual heating demand (kWh/yr); used by HVAC retrofits. Defaults to a coarse estimate. */
  annualHeatingDemand?: number;
  /** Annual cooling demand (kWh/yr); used by HVAC retrofits. Defaults coarse. */
  annualCoolingDemand?: number;
  /** Feed-in tariff (KRW/kWh) for solar. Defaults to 130. */
  feedInTariffKrw?: number;
  /**
   * 그린리모델링 사업 program track to apply. Default `"none"` (unsubsidised).
   * Public tracks apply 50/70% category-level CAPEX subsidy; private tracks
   * apply interest-rate buy-down via `financingMix` (WACC adjustment).
   * If `assumptions` is also provided, it wins over the preset.
   */
  programTrack?: ProgramTrack;
  /**
   * Explicit economic assumptions; overrides `programTrack`. Use for
   * sensitivity analysis (custom discount rate, escalation, etc.) when the
   * built-in presets don't fit.
   */
  assumptions?: EconomicAssumptions;
}

export interface RetrofitScenario {
  /** All technically-viable measures the engine produced (financially enriched). */
  allMeasures: RetrofitMeasure[];
  /** Knapsack-selected subset within capexBudgetKrw, NPV-maximising. */
  selection: BudgetSelection | null;
  /** The economic assumptions used (for display in the UI). */
  assumptions: EconomicAssumptions;
  /**
   * D₂.5 — selected-scenario energy saving as a fraction of the baseline
   * annual demand (heating + cooling + lighting). Drives the private-tier
   * suggestion; 0 when nothing is selected or baseline is unknown.
   */
  energyImprovementFraction: number;
  /** GR private-track tier the improvement fraction qualifies for (UI hint only). */
  suggestedPrivateTrack: ProgramTrack;
}

/**
 * Aggregate per-orientation walls into a single (uValue, area) pair using
 * area-weighted average uValue.
 */
function aggregateWalls(walls: { uValue: number; surfaceArea: number }[]): {
  uValue: number;
  area: number;
} {
  let area = 0;
  let weightedU = 0;
  for (const w of walls) {
    area += w.surfaceArea;
    weightedU += w.uValue * w.surfaceArea;
  }
  return { area, uValue: area > 0 ? weightedU / area : 0 };
}

export function useRetrofitScenario(inputs: RetrofitScenarioInputs): RetrofitScenario {
  const {
    buildingPk,
    capexBudgetKrw,
    totalFloorArea,
    footprintArea,
    roofType = "flat",
    region = "seoul",
    sidoPrefix,
    annualOperatingHours = 2_500,
    annualHeatingDemand,
    annualCoolingDemand,
    feedInTariffKrw = 130,
    programTrack = "none",
    assumptions: assumptionsOverride,
  } = inputs;

  // Resolve effective assumptions: explicit override > program-track preset >
  // unsubsidized default. Memoised so identity is stable across renders when
  // only the unrelated inputs change.
  const assumptions = useMemo<EconomicAssumptions>(() => {
    if (assumptionsOverride) return assumptionsOverride;
    return KOREAN_GR_PRESETS[programTrack] ?? DEFAULT_ECONOMIC_ASSUMPTIONS;
  }, [assumptionsOverride, programTrack]);

  const materials = useMaterialStore((s) => s.properties[buildingPk]);

  // Build all candidate measures from current materials.
  const allMeasures = useMemo<RetrofitMeasure[]>(() => {
    if (!materials || totalFloorArea <= 0) return [];

    // Climate: regional HDD lookup with Seoul fallback.
    const climate = sidoPrefix && REGIONAL_CLIMATE[sidoPrefix]
      ? { ...SEOUL_CLIMATE, ...REGIONAL_CLIMATE[sidoPrefix] }
      : SEOUL_CLIMATE;
    const hdd = climate.hdd;

    // ── Envelope ──
    const wallAgg = aggregateWalls(materials.envelope.walls);
    const wwr = materials.envelope.windows.windowToWallRatio;
    // Total wall area including windows. Windows live ON the walls, so
    // window area is wallAgg.area × WWR (averaged over orientations).
    const avgWwr = (wwr.N + wwr.S + wwr.E + wwr.W) / 4;
    const opaqueWallArea = wallAgg.area * (1 - avgWwr);
    const windowArea = wallAgg.area * avgWwr;

    const envelopeMeasures = generateEnvelopeRetrofits(
      {
        wall: wallAgg.uValue,
        roof: materials.envelope.roof.uValue,
        window: materials.envelope.windows.uValue,
        floor: materials.envelope.groundFloor.uValue,
      },
      KOREAN_2020_TARGET_U_VALUES,
      {
        wall: opaqueWallArea,
        roof: footprintArea,
        window: windowArea,
        floor: footprintArea,
      },
      hdd,
      materials.hvac.heating.efficiency,
    );

    // ── HVAC ──
    // If annual demand isn't provided, do a coarse degree-day estimate so
    // the hook still returns something useful. Real callers should pass
    // pre-computed values from the energy engine.
    const heatingDemand =
      annualHeatingDemand ??
      // crude proxy: ~120 kWh/m²/yr × heating efficiency (older buildings)
      totalFloorArea * 120;
    const coolingDemand = annualCoolingDemand ?? totalFloorArea * 30;
    // P1-01 sequential damping: HVAC measures act on the demand REMAINING
    // after the envelope package (physical order: envelope first). Passing
    // the post-envelope residual prevents double-counting the same heating
    // kWh across envelope and HRV/boiler savings.
    const envelopeHeatingSaving = envelopeMeasures.reduce(
      (s, m) => s + m.annualEnergySaving,
      0,
    );
    const residualHeatingDemand = Math.max(0, heatingDemand - envelopeHeatingSaving);
    const hvacMeasures = generateHvacRetrofits(
      {
        heatingType: materials.hvac.heating.systemType,
        heatingEfficiency: materials.hvac.heating.efficiency,
        coolingType: materials.hvac.cooling.systemType,
        coolingEfficiency: materials.hvac.cooling.efficiency,
      },
      totalFloorArea,
      residualHeatingDemand, // post-envelope residual (P1-01)
      coolingDemand,
    );

    // ── Lighting ──
    const lightingMeasures = generateLightingRetrofits(
      materials.lighting.lightingPowerDensity,
      totalFloorArea,
      annualOperatingHours,
    );

    // ── Solar PV ──
    const solar = calculateSolarPotential(
      footprintArea,
      roofType,
      region,
      feedInTariffKrw,
    );
    const solarMeasures: RetrofitMeasure[] = solar.annualGenerationKWh > 0 ? [solar] : [];

    return [...envelopeMeasures, ...hvacMeasures, ...lightingMeasures, ...solarMeasures];
  }, [
    materials,
    totalFloorArea,
    footprintArea,
    roofType,
    region,
    sidoPrefix,
    annualOperatingHours,
    annualHeatingDemand,
    annualCoolingDemand,
    feedInTariffKrw,
  ]);

  // Enrich every measure with financials so the UI can show NPV/IRR
  // regardless of whether it's selected within budget.
  const enriched = useMemo<RetrofitMeasure[]>(() => {
    return allMeasures.map((m) => ({
      ...m,
      financials: computeFinancials(m, assumptions),
    }));
  }, [allMeasures, assumptions]);

  // Knapsack selection within budget.
  const selection = useMemo<BudgetSelection | null>(() => {
    if (allMeasures.length === 0) return null;
    return selectMeasuresForBudget(allMeasures, capexBudgetKrw, assumptions);
  }, [allMeasures, capexBudgetKrw, assumptions]);

  // D₂.5 — improvement vs baseline for the GR private-tier suggestion.
  // Baseline mirrors the demand fallbacks used for measure generation above.
  const energyImprovementFraction = useMemo(() => {
    if (!selection || !materials || totalFloorArea <= 0) return 0;
    const heatingDemand = annualHeatingDemand ?? totalFloorArea * 120;
    const coolingDemand = annualCoolingDemand ?? totalFloorArea * 30;
    const lightingDemand =
      (materials.lighting.lightingPowerDensity * totalFloorArea * annualOperatingHours) / 1000;
    const baseline = heatingDemand + coolingDemand + lightingDemand;
    if (baseline <= 0) return 0;
    // Exclude renewable: solar annualEnergySaving is FULL generation
    // (self-consumption + grid feed-in), and exported energy does not
    // improve the building's own performance — counting it would suggest
    // GR tiers the building doesn't qualify for. Knapsack/ROI still use
    // full generation; only this eligibility input excludes it.
    const saved = selection.selected.reduce(
      (s, m) => (m.category === "renewable" ? s : s + m.annualEnergySaving),
      0,
    );
    // P1-01: measures are generated with sequential damping (HVAC sees the
    // post-envelope residual), so this sum is already physically bounded;
    // the clamp guards degenerate inputs so the GR tier hint never exceeds
    // a 100% improvement claim.
    return Math.max(0, Math.min(1, saved / baseline));
  }, [
    selection,
    materials,
    totalFloorArea,
    annualHeatingDemand,
    annualCoolingDemand,
    annualOperatingHours,
  ]);

  return {
    allMeasures: enriched,
    selection,
    assumptions,
    energyImprovementFraction,
    suggestedPrivateTrack: suggestPrivateTrack(energyImprovementFraction),
  };
}
