"use client";

// src/components/twin/twin-stage-overlay.tsx
// Mounts the energy instrument on the ledger twin: derives the five inputs
// the HUD needs from the 건축물대장 title + footprint geometry, and decides
// whether the HUD belongs on the current view at all. The instrument itself
// is `EnergyInstrumentHud`, shared with the reference-building model page.

import type { BrTitleInfo } from "@/lib/types";
import type { FootprintGeometry } from "@/lib/portfolio/types";
import { EnergyInstrumentHud } from "./energy-instrument-hud";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useViewStore } from "@/lib/bim/views/view-store";

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
  // Derive scenario inputs from title + footprint geometry.
  const buildingPk = String(title.mgmBldrgstPk ?? "unknown");
  const totalFloorArea = title.totArea ?? 0;
  const footprintArea = footprintGeometry?.areaSqm ?? title.archArea ?? 0;
  const sidoPrefix = String(title.sigunguCd ?? "11").slice(0, 2);
  const roofType = inferRoofType(title.roofCdNm);

  const workMode = useRevitWorkflowStore((s) => s.workMode);
  const activeViewId = useViewStore((s) => s.activeViewId);
  const views = useViewStore((s) => s.views);
  const activeKind = views.find((v) => v.id === activeViewId)?.kind ?? "3d";
  // The HUD belongs on the energy/FM 3D twin — it was covering plans,
  // sections, and authoring.
  const showHud = workMode === "energy" && activeKind === "3d";

  if (!showHud) return null;

  return (
    <EnergyInstrumentHud
      buildingPk={buildingPk}
      totalFloorArea={totalFloorArea}
      footprintArea={footprintArea}
      roofType={roofType}
      sidoPrefix={sidoPrefix}
    />
  );
}
