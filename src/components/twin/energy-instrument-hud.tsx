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

import { useEffect, useMemo } from "react";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { useScenarioStore } from "@/store/scenario-store";
import { TwinInstrumentFrame } from "./twin-instrument-frame";
import { ScenarioRail } from "./scenario-rail";
import { CapexInput } from "./capex-input";
import { ProgramTrackSelector } from "./program-track-selector";
import { SelectedMeasuresStrip } from "./selected-measures-strip";
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

  const scenario = useRetrofitScenario({
    buildingPk,
    capexBudgetKrw,
    totalFloorArea,
    footprintArea,
    roofType,
    sidoPrefix,
    programTrack,
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
