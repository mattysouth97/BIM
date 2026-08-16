// Auto-compose a small sheet set from the twin. No user layout —
// plan + south elevation + wall/window schedule + MEP schedule.

import type { SheetDefinition } from "./sheet-types";

export interface ComposeSheetsInput {
  buildingName: string;
  projectName?: string;
  locale: "ko" | "en";
  date?: string;
  planViewId?: string;
  elevationViewId?: string;
}

export function composeDefaultSheets(input: ComposeSheetsInput): SheetDefinition[] {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const locale = input.locale;
  const projectName = input.projectName ?? (locale === "ko" ? "BIMFIT 트윈" : "BIMFIT twin");
  const buildingName = input.buildingName || (locale === "ko" ? "건물" : "Building");

  const title = (
    sheetNumber: string,
    revision = "A",
  ): SheetDefinition["titleBlock"] => ({
    projectName,
    buildingName,
    architectName: "BIMFIT",
    auditorName: "—",
    date,
    sheetNumber,
    revision,
    locale,
  });

  const planId = input.planViewId ?? "plan-1";
  const elevId = input.elevationViewId ?? "elev-front";

  return [
    {
      id: "sheet-a101",
      name: locale === "ko" ? "A-101 평면도" : "A-101 Floor Plan",
      pageSize: "A3",
      orientation: "landscape",
      viewports: [
        {
          id: "vp-plan",
          kind: "view",
          targetId: planId,
          x: 20,
          y: 20,
          width: 360,
          height: 240,
          scale: 100,
          title: locale === "ko" ? "1층 평면도" : "Level 1 plan",
        },
      ],
      titleBlock: title("A-101"),
    },
    {
      id: "sheet-a201",
      name: locale === "ko" ? "A-201 입면도" : "A-201 Elevation",
      pageSize: "A3",
      orientation: "landscape",
      viewports: [
        {
          id: "vp-elev",
          kind: "view",
          targetId: elevId,
          x: 20,
          y: 20,
          width: 360,
          height: 240,
          scale: 100,
          title: locale === "ko" ? "남측 입면" : "South elevation",
        },
      ],
      titleBlock: title("A-201"),
    },
    {
      id: "sheet-s101",
      name: locale === "ko" ? "S-101 벽체·창호 일람표" : "S-101 Wall / Opening Schedule",
      pageSize: "A3",
      orientation: "landscape",
      viewports: [
        {
          id: "vp-wall",
          kind: "schedule",
          targetId: "wall-schedule-v1",
          x: 15,
          y: 15,
          width: 200,
          height: 250,
          title: locale === "ko" ? "벽체 일람표" : "Wall schedule",
        },
        {
          id: "vp-open",
          kind: "schedule",
          targetId: "window-door-schedule-v1",
          x: 225,
          y: 15,
          width: 180,
          height: 250,
          title: locale === "ko" ? "창호 일람표" : "Window / door schedule",
        },
      ],
      titleBlock: title("S-101"),
    },
    {
      id: "sheet-e101",
      name: locale === "ko" ? "E-101 설비 일람표" : "E-101 Equipment Schedule",
      pageSize: "A3",
      orientation: "landscape",
      viewports: [
        {
          id: "vp-mep",
          kind: "schedule",
          targetId: "mep-equipment-schedule-v1",
          x: 20,
          y: 20,
          width: 360,
          height: 240,
          title: locale === "ko" ? "설비 일람표" : "MEP schedule",
        },
      ],
      titleBlock: title("E-101"),
    },
  ];
}
