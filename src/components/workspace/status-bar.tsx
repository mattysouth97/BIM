"use client";

// src/components/workspace/status-bar.tsx
// Bottom shelf status bar: contextual tool prompts (left) + live energy metrics (right).
// Per D-01 (persistent status bar), D-02 (contextual prompts), D-05 / D-08 (energy display).

import React from "react";
import { usePlanStore } from "@/store/plan-store";
import { useAuthoringStore } from "@/store/authoring-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useAppStore } from "@/store/app-store";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import type { WorkflowStage } from "@/lib/workflow/stages";

export interface StatusBarProps {
  buildingPk: string;
  sigunguCd?: string;
}

// --- Contextual prompt helpers ---

type Lang = "ko" | "en";

interface PromptEntry {
  en: string;
  ko: string;
}

const TOOL_PROMPTS: Record<string, PromptEntry> = {
  "wall": {
    en: "Click to place wall start point — Escape to cancel",
    ko: "벽 시작점을 클릭하세요 — Escape로 취소",
  },
  "opening": {
    en: "Click a wall to place opening — Escape to cancel",
    ko: "개구부를 배치할 벽을 클릭하세요 — Escape로 취소",
  },
  "dimension": {
    en: "Click two points to measure — Escape to cancel",
    ko: "측정할 두 점을 클릭하세요 — Escape로 취소",
  },
  "area": {
    en: "Click to mark area boundary — Escape to cancel",
    ko: "면적 경계를 클릭하세요 — Escape로 취소",
  },
  "level": {
    en: "Click to set level marker",
    ko: "레벨 마커를 클릭하세요",
  },
  "section": {
    en: "Drag to set section plane",
    ko: "단면 평면을 드래그하여 설정하세요",
  },
};

const STAGE_HINTS: Record<WorkflowStage, PromptEntry> = {
  select: {
    en: "Select a building to begin",
    ko: "건물을 선택하여 시작하세요",
  },
  assemble: {
    en: "Draw walls to define spaces",
    ko: "공간을 정의하기 위해 벽을 그리세요",
  },
  configure: {
    en: "Configure materials and systems",
    ko: "재료 및 시스템을 설정하세요",
  },
  analyze: {
    en: "Review energy analysis results",
    ko: "에너지 분석 결과를 확인하세요",
  },
  export: {
    en: "Export your model",
    ko: "모델을 내보내세요",
  },
};

function getPrompt(
  drawingMode: "wall" | "opening" | null,
  annotationMode: "none" | "dimension" | "area" | "level" | "section",
  stage: WorkflowStage,
  lang: Lang
): { text: string; active: boolean } {
  // Tool-specific prompts take priority
  if (drawingMode === "wall") {
    return { text: TOOL_PROMPTS["wall"][lang], active: true };
  }
  if (drawingMode === "opening") {
    return { text: TOOL_PROMPTS["opening"][lang], active: true };
  }
  if (annotationMode !== "none") {
    const entry = TOOL_PROMPTS[annotationMode];
    if (entry) return { text: entry[lang], active: true };
  }
  // Fallback to stage hint
  const hint = STAGE_HINTS[stage];
  return { text: hint ? hint[lang] : (lang === "ko" ? "준비" : "Ready"), active: false };
}

// --- StatusBar component ---

export function StatusBar({ buildingPk, sigunguCd }: StatusBarProps) {
  const drawingMode = usePlanStore((s) => s.drawingMode);
  const annotationMode = useAuthoringStore((s) => s.annotationMode);
  const stage = useWorkflowStore((s) => s.stage);
  const language = useAppStore((s) => s.language);

  const metrics = useEnergyMetrics(buildingPk, sigunguCd);

  const { text: promptText, active: toolActive } = getPrompt(
    drawingMode,
    annotationMode,
    stage,
    language
  );

  return (
    <div className="flex h-full w-full items-center justify-between px-4">
      {/* Left: contextual tool prompt */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Indicator dot */}
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: toolActive ? "#22c55e" : "#9ca3af" }}
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground truncate">{promptText}</span>
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
