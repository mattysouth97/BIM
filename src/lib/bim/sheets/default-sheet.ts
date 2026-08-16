// src/lib/bim/sheets/default-sheet.ts
// Compose a default A3 landscape GX sheet from the live view + schedule set.

import type { ViewDefinition } from "@/lib/bim/views/view-definition";
import type { SheetDefinition, TitleBlockConfig, ViewportBlock } from "./sheet-types";

export interface DefaultSheetInput {
  buildingName: string;
  projectName?: string;
  locale?: "ko" | "en";
  views: ViewDefinition[];
  scheduleId?: string;
  date?: string;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildDefaultTitleBlock(
  input: DefaultSheetInput
): TitleBlockConfig {
  return {
    projectName: input.projectName ?? "한국 BIM 에너지 관리 시스템",
    buildingName: input.buildingName,
    architectName: "",
    auditorName: "GX",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    sheetNumber: "A-001",
    revision: "P1",
    locale: input.locale ?? "ko",
  };
}

/**
 * A3 landscape sheet: plan viewport + schedule viewport + Korean GX title block.
 */
export function createDefaultGxSheet(input: DefaultSheetInput): SheetDefinition {
  const plan = input.views.find((v) => v.kind === "plan") ?? input.views[0];
  const elev = input.views.find((v) => v.kind === "elevation");
  const scheduleId = input.scheduleId ?? "wall-schedule-v1";

  const viewports: ViewportBlock[] = [];
  if (plan) {
    viewports.push({
      id: uid("vp"),
      kind: "view",
      targetId: plan.id,
      x: 12,
      y: 12,
      width: 250,
      height: 200,
      scale: 100,
      title: plan.name,
    });
  }
  if (elev) {
    viewports.push({
      id: uid("vp"),
      kind: "view",
      targetId: elev.id,
      x: 12,
      y: 220,
      width: 250,
      height: 50,
      scale: 100,
      title: elev.name,
    });
  }
  viewports.push({
    id: uid("vp"),
    kind: "schedule",
    targetId: scheduleId,
    x: 272,
    y: 12,
    width: 136,
    height: 200,
    title: "Wall Schedule",
  });

  return {
    id: uid("sheet"),
    name: input.locale === "en" ? "A-001 Model & Schedule" : "A-001 모델·일람표",
    pageSize: "A3",
    orientation: "landscape",
    viewports,
    titleBlock: buildDefaultTitleBlock(input),
  };
}
