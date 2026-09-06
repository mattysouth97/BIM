"use client";

// src/components/twin/energy-instrument-hud.tsx
// The energy instrument itself: top answer bar (NPV + 그린리모델링 chips,
// program track) and bottom strip (grade / kWh / CO₂ / heat loss, selected
// measures, CAPEX grip). Extracted from TwinStageOverlay on 2026-09-04 so a
// building that is not a 건축물대장 row — a reference model whose inputs are
// measured from its IFC — can carry the identical frame without faking a
// register title to get it. What the HUD needs is five numbers and a store
// key; where they come from is the caller's business.
//
// D₃: scenario state (budget, program track, derived building inputs)
// lives in `useScenarioStore` so the SceneOutliner left dock reads the
// exact same inputs and the two surfaces always agree.
//
// ONE BASELINE (2026-09-06). The bottom strip's kWh/m² and the top bar's NPV
// used to come from two different buildings: `EnergyCards` ran the degree-day
// engine, while `useRetrofitScenario`, handed no demand, priced every measure
// against `floorArea × 120`. On the Clinic that proxy is 1.35× the engine's
// heating demand and on the apartment 3.30×. The HUD now runs the engine
// itself — with the SAME `(buildingPk, sigunguCd)` pair `EnergyCards` uses, so
// the two calls memoise to one answer rather than to two that happen to
// agree — and hands the result to the scenario hook.

import { useEffect, useMemo } from "react";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import { useScenarioStore } from "@/store/scenario-store";
import { TwinInstrumentFrame } from "./twin-instrument-frame";
import { ScenarioRail } from "./scenario-rail";
import { CapexInput } from "./capex-input";
import { ProgramTrackSelector } from "./program-track-selector";
import { SelectedMeasuresStrip } from "./selected-measures-strip";
import { RetrofitDeltaStrip } from "./retrofit-delta-strip";
import { EnergyCards } from "@/components/viewer/energy-cards";

export interface EnergyInstrumentHudProps {
  /** Store key the material and recipe stores were seeded under. */
  buildingPk: string;
  /** Conditioned floor area, m² — the intensity denominator. */
  totalFloorArea: number;
  /** Footprint / roof area, m² — drives solar potential. */
  footprintArea: number;
  roofType: "flat" | "gable" | "hip" | "sawtooth";
  /** Two-digit 시도 prefix for the regional climate. */
  sidoPrefix: string;
}

export function EnergyInstrumentHud({
  buildingPk,
  totalFloorArea,
  footprintArea,
  roofType,
  sidoPrefix,
}: EnergyInstrumentHudProps) {
  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const programTrack = useScenarioStore((s) => s.programTrack);
  const setCapexBudget = useScenarioStore((s) => s.setCapexBudget);
  const setProgramTrack = useScenarioStore((s) => s.setProgramTrack);
  const setBuildingInputs = useScenarioStore((s) => s.setBuildingInputs);

  // Publish the derived inputs so other surfaces (SceneOutliner) feed the
  // engine from the same record instead of re-deriving their own.
  useEffect(() => {
    setBuildingInputs({
      buildingPk,
      totalFloorArea,
      footprintArea,
      roofType,
      sidoPrefix,
    });
  }, [buildingPk, totalFloorArea, footprintArea, roofType, sidoPrefix, setBuildingInputs]);

  // The same call `EnergyCards` makes, so the demand behind NPV and the kWh
  // on the strip below it are one number and not two. `sigunguCd` is the
  // active-building store's, exactly as `EnergyCards` reads it, with the
  // caller's 시도 prefix only as the fallback — `getClimateData` reads the
  // first two digits of either.
  const sigunguCd = useActiveSigunguCd();
  const metrics = useEnergyMetrics(buildingPk, sigunguCd ?? sidoPrefix);

  const scenario = useRetrofitScenario({
    buildingPk,
    capexBudgetKrw,
    totalFloorArea,
    footprintArea,
    roofType,
    sidoPrefix,
    programTrack,
    // Undefined until the stores are seeded; the hook then falls back to its
    // coarse proxy, which is the honest state for a frame with no engine
    // answer yet rather than a number pretending to be one.
    engineDemand: metrics?.demand,
  });

  // Publish the knapsack selection so the 3D MEP layers can physically swap
  // equipment (boiler→condensing/ASHP, fluorescent→LED, PV on/off) whenever
  // the budget or program track changes the selected measures.
  const setSelectedMeasureIds = useScenarioStore((s) => s.setSelectedMeasureIds);
  useEffect(() => {
    if (!scenario.selection) return;
    const ids = scenario.selection.selected.map((m) => m.id).sort();
    setSelectedMeasureIds(ids);
  }, [scenario.selection, setSelectedMeasureIds]);

  const summary = useMemo(() => {
    if (!scenario.selection) return undefined;
    const sel = scenario.selection.selected.length;
    const total = scenario.allMeasures.length;
    return `${sel}/${total} measures`;
  }, [scenario.selection, scenario.allMeasures.length]);

  return (
    <TwinInstrumentFrame
      top={
        <section className="overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-md">
          <ScenarioRail
            capexBudgetKrw={capexBudgetKrw}
            selection={scenario.selection}
            assumptions={scenario.assumptions}
            totalCandidateMeasures={scenario.allMeasures.length}
          />
          <div className="border-t border-border">
            <ProgramTrackSelector
              value={programTrack}
              onChange={setProgramTrack}
              suggestedTrack={scenario.suggestedPrivateTrack}
            />
          </div>
        </section>
      }
      bottom={
        <section className="overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-md">
          <EnergyCards buildingPk={buildingPk} variant="strip" />
          <RetrofitDeltaStrip />
          <SelectedMeasuresStrip
            measures={scenario.selection?.selected ?? []}
          />
          <CapexInput
            value={capexBudgetKrw}
            onChange={setCapexBudget}
            summary={summary}
          />
        </section>
      }
    />
  );
}
