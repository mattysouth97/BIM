"use client";

// src/components/twin/twin-stage-overlay.tsx
// Composes the CAPEX/ROI investment-scenario surface that overlays the 3D
// viewport on the Twin stage. Pulls retrofit candidates + knapsack
// selection via `useRetrofitScenario`, lets the user drive the CAPEX
// budget via the bottom-center slider and the 그린리모델링 track via the
// chip group, and surfaces results in the scenario rail (top), ROI
// readout (left), and retrofit manifest (right).
//
// D₃: scenario state (budget, program track, derived building inputs)
// lives in `useScenarioStore` so the SceneOutliner left dock reads the
// exact same inputs and the two surfaces always agree.

import { useEffect, useMemo } from "react";
import type { BrTitleInfo } from "@/lib/types";
import type { FootprintGeometry } from "@/lib/portfolio/types";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { useScenarioStore } from "@/store/scenario-store";
import { ScenarioRail } from "./scenario-rail";
import { RoiReadout } from "./roi-readout";
import { RetrofitManifest } from "./retrofit-manifest";
import { CapexInput } from "./capex-input";
import { ProgramTrackSelector } from "./program-track-selector";

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

  const selectedIds = useMemo(
    () => new Set(scenario.selection?.selected.map((m) => m.id) ?? []),
    [scenario.selection],
  );

  const summary = useMemo(() => {
    if (!scenario.selection) return undefined;
    const sel = scenario.selection.selected.length;
    const total = scenario.allMeasures.length;
    return `${sel}/${total} measures`;
  }, [scenario.selection, scenario.allMeasures.length]);

  return (
    <>
      <ScenarioRail
        capexBudgetKrw={capexBudgetKrw}
        selection={scenario.selection}
        assumptions={scenario.assumptions}
        totalCandidateMeasures={scenario.allMeasures.length}
      />

      <ProgramTrackSelector value={programTrack} onChange={setProgramTrack} />

      <RoiReadout
        selection={scenario.selection}
        assumptions={scenario.assumptions}
        isLoading={!scenario.selection && scenario.allMeasures.length === 0}
      />

      <RetrofitManifest
        measures={scenario.allMeasures}
        selectedIds={selectedIds}
      />

      <CapexInput
        value={capexBudgetKrw}
        onChange={setCapexBudget}
        summary={summary}
      />
    </>
  );
}
