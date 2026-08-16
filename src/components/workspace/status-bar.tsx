"use client";

// src/components/workspace/status-bar.tsx
// Bottom shelf status bar: contextual stage hints (left) + live energy metrics (right).
// Per D-01 (persistent status bar), D-05 / D-08 (energy display).

import { useWorkflowStore } from "@/store/workflow-store";
import { useAppStore } from "@/store/app-store";
import { useActiveBuildingPk, useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { useSelectionStore } from "@/store/selection-store";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { getWorkMode } from "@/lib/workflow/revit-workflow";
import { resolveRevitIdentity } from "@/lib/bim/revit-identity";
import { useBimModelStore } from "@/store/bim-model-store";
import { lastCommandName } from "@/lib/bim/model";
import type { WorkflowStage } from "@/lib/workflow/stages";

export interface StatusBarProps {
  /** Optional override — if omitted, derives from the material store. */
  buildingPk?: string;
  sigunguCd?: string;
}

type Lang = "ko" | "en";

interface PromptEntry {
  en: string;
  ko: string;
}

const STAGE_HINTS: Record<WorkflowStage, PromptEntry> = {
  search: {
    en: "Search for a building to begin",
    ko: "건물을 검색하여 시작하세요",
  },
  upload: {
    en: "Upload a CAD floor plan (.dxf) for this building",
    ko: "건물의 CAD 도면(.dxf)을 업로드하세요",
  },
  // P2-24 — cad-first only; ledger mode never reaches this stage id
  params: {
    en: "Enter floors, year, and region for this draft",
    ko: "층수·준공연도·지역을 입력하세요",
  },
  twin: {
    en: "View and configure the digital twin",
    ko: "층을 고치거나(2) 코어·설비를 확인하세요(3). 저장은 자동입니다.",
  },
  report: {
    en: "Generate reports and export data",
    ko: "보고서를 생성하고 데이터를 내보내세요",
  },
};

function getStageHint(stage: WorkflowStage, lang: Lang): string {
  const hint = STAGE_HINTS[stage];
  return hint ? hint[lang] : (lang === "ko" ? "준비" : "Ready");
}

export function StatusBar({ buildingPk: buildingPkProp, sigunguCd }: StatusBarProps) {
  const stage = useWorkflowStore((s) => s.stage);
  const language = useAppStore((s) => s.language);

  const buildingPk = useActiveBuildingPk(buildingPkProp);

  // P1-08 (d): fall back to the active building's sigunguCd so the status bar
  // and every other panel compute from the same regional climate.
  const activeSigunguCd = useActiveSigunguCd();
  const metrics = useEnergyMetrics(buildingPk, sigunguCd ?? activeSigunguCd);

  const promptText = getStageHint(stage, language);
  const workMode = useRevitWorkflowStore((s) => s.workMode);
  const selectedType = useSelectionStore((s) => s.selectedType);
  const selectedEquipment = useSelectionStore((s) => s.selectedEquipment);
  const bimElement = useBimModelStore((s) => {
    const id = s.selectedElementId;
    return id ? s.snapshot?.elements.find((el) => el.id === id) ?? null : null;
  });
  const lastTx = useBimModelStore((s) => lastCommandName(s.log));
  const identity =
    stage === "twin"
      ? resolveRevitIdentity({
          kind: selectedType ?? "wall",
          equipment: selectedEquipment,
        })
      : null;
  const modeHint =
    stage === "twin" || stage === "report"
      ? language === "ko"
        ? getWorkMode(workMode).hintKo
        : getWorkMode(workMode).hintEn
      : promptText;

  return (
    <div className="flex h-full w-full items-center justify-between px-4">
      {/* Left: stage hint + Revit identity (status bar analog) */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground truncate">{modeHint}</span>
        {bimElement && (
          <span className="hidden truncate text-[10px] text-foreground/80 md:inline" data-testid="status-bim-mark">
            {bimElement.category} · {bimElement.mark}
          </span>
        )}
        {identity && !bimElement && (
          <span className="hidden truncate text-[10px] text-muted-foreground/80 md:inline">
            {language === "ko" ? identity.displayKo : identity.displayEn}
          </span>
        )}
        {lastTx && (
          <span className="hidden truncate text-[10px] text-muted-foreground/70 lg:inline">
            {lastTx}
          </span>
        )}
      </div>

      {/* Right: energy status */}
      <div className="flex items-center gap-3 shrink-0">
        {metrics === null ? (
          <span className="text-xs text-muted-foreground/50">
            {language === "ko" ? "건물 데이터 없음" : "No building data"}
          </span>
        ) : (
          <>
            {/* Grade badge */}
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
              style={{
                backgroundColor: metrics.gradeColor + "22",
                color: metrics.gradeColor,
                border: `1px solid ${metrics.gradeColor}55`,
              }}
              title={language === "ko" ? "에너지효율등급" : "Energy Grade"}
            >
              {metrics.grade}
            </span>

            {/* Demand */}
            <span className="text-xs tabular-nums text-muted-foreground">
              ~{metrics.demand.demandPerSqm.toFixed(1)} kWh/m²
            </span>

            {/* CO2 */}
            <span className="text-xs tabular-nums text-muted-foreground">
              ~{metrics.co2.co2PerSqm.toFixed(1)} kgCO₂/m²
            </span>

            {/* Approximate model disclaimer badge */}
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              간이 모델
            </span>
          </>
        )}
      </div>
    </div>
  );
}
