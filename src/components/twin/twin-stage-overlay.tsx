"use client";

// src/components/twin/twin-stage-overlay.tsx
// Composes the CAPEX/ROI investment-scenario surface that overlays the 3D
// viewport on the Twin stage. Pulls retrofit candidates + knapsack
// selection via `useRetrofitScenario`, lets the user drive the CAPEX
// budget via the bottom-center slider, and surfaces results in the
// scenario rail (top), ROI readout (left), and retrofit manifest (right).

import { useMemo, useState } from "react";
import type { BrTitleInfo } from "@/lib/types";
import type { FootprintGeometry } from "@/lib/portfolio/types";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { ScenarioRail } from "./scenario-rail";
import { RoiReadout } from "./roi-readout";
import { RetrofitManifest } from "./retrofit-manifest";
import { CapexInput } from "./capex-input";

interface TwinStageOverlayProps {
  title: BrTitleInfo;
  /** Pre-projected footprint geometry info (area/perimeter/aspect). */
  footprintGeometry: FootprintGeometry | null;
}

const DEFAULT_CAPEX_KRW = 250_000_000; // ₩2.5억 default scenario

/** Roof typology heuristic from the title's roof code name. */
function inferRoofType(roofCdNm: string | undefined): "flat" | "gable" | "hip" | "sawtooth" {
  const code = (roofCdNm ?? "").toLowerCase();
  if (code.includes("평") || code.includes("flat")) return "flat";
  if (code.includes("박공") || code.includes("gable")) return "gable";
  if (code.includes("우진") || code.includes("hip")) return "hip";
  return "flat";
}

export function TwinStageOverlay({ title, footprintGeometry }: TwinStageOverlayProps) {
  const [capexBudgetKrw, setCapexBudgetKrw] = useState(DEFAULT_CAPEX_KRW);

  // Derive scenario inputs from title + footprint geometry.
  const buildingPk = String(title.mgmBldrgstPk ?? "unknown");
  const totalFloorArea = title.totArea ?? 0;
  const footprintArea = footprintGeometry?.areaSqm ?? title.archArea ?? 0;
  const sidoPrefix = String(title.sigunguCd ?? "11").slice(0, 2);
  const roofType = inferRoofType(title.roofCdNm);

  const scenario = useRetrofitScenario({
    buildingPk,
    capexBudgetKrw,
    totalFloorArea,
    footprintArea,
    roofType,
    sidoPrefix,
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
        onChange={setCapexBudgetKrw}
        summary={summary}
      />
    </>
  );
}
