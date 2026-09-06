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
import { meanWindowToWallRatio } from "@/lib/energy/heat-loss";
import { normalizeEfficiency } from "@/lib/energy/annual-demand";
import type { MaterialProperties } from "@/lib/material-types";
import { generateEnvelopeRetrofits, KOREAN_2020_TARGET_U_VALUES } from "@/lib/retrofit/envelope-retrofits";
import { generateHvacRetrofits } from "@/lib/retrofit/hvac-retrofits";
import { generateLightingRetrofits } from "@/lib/retrofit/lighting-retrofits";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import {
  selectMeasuresForBudget,
  evaluateMeasureSet,
  computeFinancials,
  resolveHeatingFuel,
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
  /** Lower-cased region key for solar irradiance (defaults "seoul"). */
  region?: string;
  /** Sido code prefix (2 digits) for HDD lookup; defaults to Seoul. */
  sidoPrefix?: string;
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
  /**
   * The work the USER chose, from `scenario-store.appliedMeasureIds`. When
   * given, `chosen` prices exactly this set and the GR tier hint follows it.
   * `null`/omitted means nothing is chosen yet and the recommendation stands
   * in — the state a page is in for the moment before the HUD seeds it.
   *
   * Ids absent from the generated catalogue are ignored: a measure the
   * generators did not produce for this building cannot be priced for it.
   */
  chosenMeasureIds?: string[] | null;
}

export interface RetrofitScenario {
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
   * demand (heating + cooling + lighting). Drives the private-tier suggestion;
   * 0 when nothing is chosen or the baseline is unknown. It follows the chosen
   * work rather than the recommendation, because the tier a building qualifies
   * for depends on the work it actually does.
   */
  energyImprovementFraction: number;
  /** GR private-track tier the improvement fraction qualifies for (UI hint only). */
  suggestedPrivateTrack: ProgramTrack;
}

/**
 * Turn the engine's DELIVERED annual demand back into the USEFUL heat and
 * cooling the retrofit generators are documented to take.
 *
 * `calculateAnnualDemand` divides by the heating efficiency and the cooling
 * COP before it reports (`annual-demand.ts`, "heatingDemand = heatingRaw /
 * heatingEfficiency"), and `generateHvacRetrofits` divides by the efficiency
 * AGAIN to get fuel input. Multiplying back here is what stops the same η
 * being applied twice — for the Clinic's 0.85 boiler that is an 18 %
 * overstatement of every heating-side saving.
 *
 * The clamps mirror `annual-demand.ts` exactly, and `usefulDemandRoundTrip`
 * in the tests fails if that file's clamps ever move without this one.
 */
export function usefulDemandFromEngine(
  demand: { heatingDemand: number; coolingDemand: number },
  materials: MaterialProperties,
): { heating: number; cooling: number } {
  const eta = Math.min(
    Math.max(normalizeEfficiency(materials.hvac.heating.efficiency), 0.3),
    6,
  );
  const copRaw = normalizeEfficiency(materials.hvac.cooling.efficiency);
  const cop = copRaw > 0 ? Math.max(copRaw, 1) : 0;
  return {
    heating: demand.heatingDemand * eta,
    // A building with no cooling system has a COP of 0 and a cooling demand
    // of 0; the product is 0, which is the right answer and not a divide.
    cooling: demand.coolingDemand * cop,
  };
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
    engineDemand,
    engineEnvelopeAreas,
    pvGeometricKWp,
    feedInTariffKrw = 130,
    programTrack = "none",
    assumptions: assumptionsOverride,
    chosenMeasureIds = null,
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

    // P1-03: resolve the building's heating fuel ONCE and thread it into
    // both heating-side generators (pricing, CO2, escalation).
    const heatingFuel = resolveHeatingFuel(materials.hvac.heating);

    // ── Envelope ──
    const wallAgg = aggregateWalls(materials.envelope.walls);
    // Total wall area including windows. Windows live ON the walls, so
    // window area is wallAgg.area × WWR. The ratio comes from the engine's
    // own function — area-weighted on a measured envelope, unweighted
    // otherwise — so the measures and `calculateHeatLoss` cannot end up
    // multiplying by two different means of the same four numbers.
    const avgWwr = meanWindowToWallRatio(materials);
    // The engine's own element areas when the caller has them, and only then
    // the derived ones. `footprintArea` standing in for the roof is the
    // single largest of the old errors: it is the GROUND slab, and a building
    // whose roof steps, pitches or oversails does not have a roof the size of
    // its footprint.
    const opaqueWallArea =
      engineEnvelopeAreas?.opaqueWallSqm ?? wallAgg.area * (1 - avgWwr);
    const windowArea = engineEnvelopeAreas?.windowSqm ?? wallAgg.area * avgWwr;
    const roofArea = engineEnvelopeAreas?.roofSqm ?? footprintArea;
    const groundFloorArea = engineEnvelopeAreas?.groundFloorSqm ?? footprintArea;

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
        roof: roofArea,
        window: windowArea,
        floor: groundFloorArea,
      },
      hdd,
      materials.hvac.heating.efficiency,
      heatingFuel, // P1-03
    );

    // ── HVAC ──
    // The engine's own answer first, converted delivered → useful; then an
    // explicitly-passed useful figure; then, only for a caller that has run
    // no engine at all, the coarse proxy. The proxy is a floor-area rule of
    // thumb and it is wrong by 1.35× on the Clinic and 3.30× on the
    // apartment — anything that shows kWh beside NPV must not reach it.
    const engineUseful = engineDemand
      ? usefulDemandFromEngine(engineDemand, materials)
      : null;
    const heatingDemand =
      engineUseful?.heating ??
      annualHeatingDemand ??
      // crude proxy: ~120 kWh/m²/yr × heating efficiency (older buildings)
      totalFloorArea * 120;
    const coolingDemand =
      engineUseful?.cooling ?? annualCoolingDemand ?? totalFloorArea * 30;
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
      heatingFuel, // P1-03
    );

    // ── Lighting ──
    const lightingMeasures = generateLightingRetrofits(
      materials.lighting.lightingPowerDensity,
      totalFloorArea,
      annualOperatingHours,
    );

    // ── Solar PV ──
    // Panels go on the ROOF, and the roof is not the footprint. The
    // utilisation factor already discounts for pitch and orientation
    // (flat 0.7, gable 0.5), so the area to hand it is the roof surface the
    // engine priced — the same one the roof-insulation measure covers.
    const solar = calculateSolarPotential(
      roofArea,
      roofType,
      region,
      feedInTariffKrw,
      undefined,
      // SIXTH argument, deliberately: the fifth is the electricity price.
      pvGeometricKWp,
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
    pvGeometricKWp,
    annualOperatingHours,
    annualHeatingDemand,
    annualCoolingDemand,
    engineDemand,
    engineEnvelopeAreas,
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

  // RECOMMENDATION: within the budget when one is set; otherwise every
  // measure whose NPV is positive over the horizon. The knapsack is never
  // handed a null — it returns an empty selection at budget ≤ 0, and an
  // empty recommendation would read as "nothing is worth doing".
  const selection = useMemo<BudgetSelection | null>(() => {
    if (allMeasures.length === 0) return null;
    if (capexBudgetKrw === null) {
      const positive = allMeasures.filter((m) => (computeFinancials(m, assumptions).npv ?? 0) > 0);
      return evaluateMeasureSet(positive, assumptions);
    }
    return selectMeasuresForBudget(allMeasures, capexBudgetKrw, assumptions);
  }, [allMeasures, capexBudgetKrw, assumptions]);

  // The economics of the CHOSEN work. The same `evaluateMeasureSet` the
  // knapsack ends with, so a hand-picked set and the optimum are one
  // computation on two inputs rather than two implementations that agree
  // today. Deliberately NOT budget-clamped: the user is allowed to choose
  // more work than the budget covers, and the rail says so — silently
  // dropping their last click would be worse than an honest overrun.
  const chosen = useMemo<BudgetSelection | null>(() => {
    if (allMeasures.length === 0) return null;
    if (chosenMeasureIds == null) return selection;
    const wanted = new Set(chosenMeasureIds);
    const picked = allMeasures.filter((m) => wanted.has(m.id));
    return evaluateMeasureSet(picked, assumptions);
  }, [allMeasures, chosenMeasureIds, assumptions, selection]);

  // D₂.5 — improvement vs baseline for the GR private-tier suggestion.
  // Baseline mirrors the demand resolution used for measure generation above,
  // in the same order — a tier hint computed against a different baseline
  // from the measures it is hinting about would be the same bug one level up.
  const energyImprovementFraction = useMemo(() => {
    if (!chosen || !materials || totalFloorArea <= 0) return 0;
    const useful = engineDemand ? usefulDemandFromEngine(engineDemand, materials) : null;
    const heatingDemand = useful?.heating ?? annualHeatingDemand ?? totalFloorArea * 120;
    const coolingDemand = useful?.cooling ?? annualCoolingDemand ?? totalFloorArea * 30;
    const lightingDemand =
      (materials.lighting.lightingPowerDensity * totalFloorArea * annualOperatingHours) / 1000;
    const baseline = heatingDemand + coolingDemand + lightingDemand;
    if (baseline <= 0) return 0;
    // Exclude renewable: solar annualEnergySaving is FULL generation
    // (self-consumption + grid feed-in), and exported energy does not
    // improve the building's own performance — counting it would suggest
    // GR tiers the building doesn't qualify for. Knapsack/ROI still use
    // full generation; only this eligibility input excludes it.
    const saved = chosen.selected.reduce(
      (s, m) => (m.category === "renewable" ? s : s + m.annualEnergySaving),
      0,
    );
    // P1-01: measures are generated with sequential damping (HVAC sees the
    // post-envelope residual), so this sum is already physically bounded;
    // the clamp guards degenerate inputs so the GR tier hint never exceeds
    // a 100% improvement claim.
    return Math.max(0, Math.min(1, saved / baseline));
  }, [
    chosen,
    materials,
    totalFloorArea,
    annualHeatingDemand,
    annualCoolingDemand,
    engineDemand,
    annualOperatingHours,
  ]);

  return {
    allMeasures: enriched,
    selection,
    chosen,
    assumptions,
    energyImprovementFraction,
    suggestedPrivateTrack: suggestPrivateTrack(energyImprovementFraction),
  };
}
