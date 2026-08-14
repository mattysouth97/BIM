"use client";

// src/components/twin/twin-stage-overlay.tsx
// Composes the twin instrument: top answer bar (NPV + 그린리모델링 chips)
// and bottom budget grip (CAPEX). Side catalogs live in WorkspaceShell
// drawers so they cannot cover the numbers.
//
// D₃: scenario state (budget, program track, derived building inputs)
// lives in `useScenarioStore` so the SceneOutliner left dock reads the
// exact same inputs and the two surfaces always agree.

import { useEffect, useMemo } from "react";
import type { BrTitleInfo } from "@/lib/types";
import type { FootprintGeometry } from "@/lib/portfolio/types";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { useScenarioStore } from "@/store/scenario-store";
import { TwinInstrumentFrame } from "./twin-instrument-frame";
import { ScenarioRail } from "./scenario-rail";
import { CapexInput } from "./capex-input";
import { ProgramTrackSelector } from "./program-track-selector";
import { SelectedMeasuresStrip } from "./selected-measures-strip";
import { EnergyCards } from "@/components/viewer/energy-cards";

interface TwinStageOverlayProps {
  title: BrTitleInfo;
  /** Pre-projected footprint geometry info (area/perimeter/aspect). */
  footprintGeometry: FootprintGeometry | null;
}

/** Roof typology heuristic from the title's roof code name. */
function inferRoofType(roofCdNm: string | undefined): "flat" | "gable" | "hip" | "sawtooth" {
  const code = (roofCdNm ?? "").toLowerCase();
  if (code.includes("평") || code.includes("flat")) return "flat";
  if (code.includes("박공") || code.includes("gable")) return "gable";
  if (code.includes("우진") || code.includes("hip")) return "hip";
  return "flat";
}

export function TwinStageOverlay({ title, footprintGeometry }: TwinStageOverlayProps) {
  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const programTrack = useScenarioStore((s) => s.programTrack);
  const setCapexBudget = useScenarioStore((s) => s.setCapexBudget);
  const setProgramTrack = useScenarioStore((s) => s.setProgramTrack);
  const setBuildingInputs = useScenarioStore((s) => s.setBuildingInputs);

  // Derive scenario inputs from title + footprint geometry.
  const buildingPk = String(title.mgmBldrgstPk ?? "unknown");
  const totalFloorArea = title.totArea ?? 0;
  const footprintArea = footprintGeometry?.areaSqm ?? title.archArea ?? 0;
  const sidoPrefix = String(title.sigunguCd ?? "11").slice(0, 2);
  const roofType = inferRoofType(title.roofCdNm);

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
