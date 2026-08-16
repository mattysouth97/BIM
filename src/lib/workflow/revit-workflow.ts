// src/lib/workflow/revit-workflow.ts
// Revit Basic Course (García / Martínez, UEM 2013/14) → this app.
// Revit is a tool. BIM is the process. The GX outer stages stay:
//   search → upload → params → twin → report
// Inside Twin/Report, these work modes are the Revit-aligned authoring path.

export type RevitWorkMode =
  | "model"
  | "views"
  | "annotate"
  | "schedules"
  | "sheets"
  | "energy";

export type RevitFeatureStatus = "wired" | "library" | "deferred";

export type RevitElementGroup = "model" | "annotation" | "view" | "datum";

export interface RevitWorkModeDef {
  id: RevitWorkMode;
  labelKo: string;
  labelEn: string;
  hintKo: string;
  hintEn: string;
  courseChapters: string[];
}

export interface RevitFeatureMapEntry {
  id: string;
  courseTopic: string;
  revitConcept: string;
  appCapability: string;
  workMode: RevitWorkMode | "ingest" | "export";
  status: RevitFeatureStatus;
}

export const REVIT_WORK_MODES: RevitWorkModeDef[] = [
  {
    id: "model",
    labelKo: "모델",
    labelEn: "Model",
    hintKo: "단일 3D 모델이 원본입니다. 카테고리·패밀리·타입으로 요소를 읽습니다.",
    hintEn: "The 3D model is the source of truth. Elements carry Category / Family / Type.",
    courseChapters: ["LOD", "Category/Family/Type", "Hosts & components", "Levels"],
  },
  {
    id: "views",
    labelKo: "뷰",
    labelEn: "Views",
    hintKo: "평면·입면·단면·3D는 같은 모델의 라이브 창입니다.",
    hintEn: "Plans, elevations, sections, and 3D are live windows on the same model.",
    courseChapters: ["Views", "View Control Bar", "Project Browser"],
  },
  {
    id: "annotate",
    labelKo: "주석",
    labelEn: "Annotate",
    hintKo: "치수·태그·레벨은 뷰 전용 2D이며 모델 속성을 보고합니다.",
    hintEn: "Dimensions, tags, and levels are view-specific 2D that report model properties.",
    courseChapters: ["Tags", "Details/2D", "Annotation families"],
  },
  {
    id: "schedules",
    labelKo: "일람표",
    labelEn: "Schedules",
    hintKo: "일람표는 라이브 뷰입니다. 모델이 바뀌면 표가 따라갑니다.",
    hintEn: "Schedules are live views. Model edits update the table.",
    courseChapters: ["Live schedules", "Filter/Sort/Group", "Legends"],
  },
  {
    id: "sheets",
    labelKo: "시트",
    labelEn: "Sheets",
    hintKo: "뷰와 일람표를 타이틀 블록 시트에 배치하고 PDF로 냅니다.",
    hintEn: "Compose views and schedules onto a title-block sheet and export PDF.",
    courseChapters: ["Sheets", "Title blocks", "Plotting", "Publishing"],
  },
  {
    id: "energy",
    labelKo: "에너지·FM",
    labelEn: "Energy / FM",
    hintKo: "동일 모델이 에너지 분석·개보수·시설관리로 이어집니다.",
    hintEn: "The same model feeds energy analysis, retrofit, and facility operations.",
    courseChapters: ["Energy analysis", "5D quantities", "Facility management"],
  },
];

/**
 * Course-to-product map. Status:
 *   wired    — user-visible in this integration
 *   library  — engine exists, not yet a first-class authoring tool
 *   deferred — later milestone (v7+ family editor, phasing, constraints)
 */
export const REVIT_FEATURE_MAP: RevitFeatureMapEntry[] = [
  {
    id: "single-model",
    courseTopic: "BIM vs CAD",
    revitConcept: "One coordinated 3D model; views cannot go out of sync",
    appCapability: "Procedural / IFC twin is the single source; views/schedules/sheets read it",
    workMode: "model",
    status: "wired",
  },
  {
    id: "lod",
    courseTopic: "Level of Development",
    revitConcept: "Generic type vs construction-layer type",
    appCapability: "LOD 200 ledger twin → LOD 300 IFC / user materials → LOD 350 calibrated",
    workMode: "model",
    status: "wired",
  },
  {
    id: "cft",
    courseTopic: "Category / Family / Type",
    revitConcept: "Built-in categories; system vs loadable families; types",
    appCapability: "Revit identity on selection (IFC class + structure family + type label)",
    workMode: "model",
    status: "wired",
  },
  {
    id: "element-groups",
    courseTopic: "Model / Annotation / View / Datum",
    revitConcept: "Four element groups",
    appCapability: "ElementKind + annotation store + view store + floor levels as datums",
    workMode: "model",
    status: "wired",
  },
  {
    id: "project-browser",
    courseTopic: "Project Browser",
    revitConcept: "TOC of views, schedules, sheets, families",
    appCapability: "Project Browser dock in Twin",
    workMode: "views",
    status: "wired",
  },
  {
    id: "properties-palette",
    courseTopic: "Properties Palette",
    revitConcept: "Type vs instance properties",
    appCapability: "Properties dock shows identity + instance energy/equipment params",
    workMode: "model",
    status: "wired",
  },
  {
    id: "live-views",
    courseTopic: "Plans / Elevations / Sections",
    revitConcept: "Views are windows on the model",
    appCapability: "view-engine + view-store + camera/clipping bridge",
    workMode: "views",
    status: "wired",
  },
  {
    id: "schedules",
    courseTopic: "Schedules",
    revitConcept: "Live tabular view; edit either graphic or table",
    appCapability: "schedule-engine over recipe/materials/MEP; CSV export",
    workMode: "schedules",
    status: "wired",
  },
  {
    id: "tags",
    courseTopic: "Tags",
    revitConcept: "Tag asks a property of the host; does not own the value",
    appCapability: "Annotation store + identity line; auto-updating tag templates later",
    workMode: "annotate",
    status: "library",
  },
  {
    id: "details",
    courseTopic: "Details / 2D",
    revitConcept: "View-specific dimensions, text, filled regions",
    appCapability: "annotation-store (dimension, area, level, section)",
    workMode: "annotate",
    status: "library",
  },
  {
    id: "dwg-link",
    courseTopic: "DWG link / import",
    revitConcept: "Link keeps connection; import embeds",
    appCapability: "CAD upload stage (DXF/DWG footprint)",
    workMode: "ingest",
    status: "wired",
  },
  {
    id: "rvt-link",
    courseTopic: "Revit links",
    revitConcept: "Discipline / multi-building links",
    appCapability: "IFC upload + campus composite",
    workMode: "ingest",
    status: "library",
  },
  {
    id: "sheets",
    courseTopic: "Sheets + title blocks",
    revitConcept: "Place views on sheets; auto references",
    appCapability: "sheet-store + Korean GX title block composer",
    workMode: "sheets",
    status: "wired",
  },
  {
    id: "export-print",
    courseTopic: "Export / Print / PDF",
    revitConcept: "DWG/DXF/DGN + sheet sets",
    appCapability: "CSV schedules, energy PDF/JSON, sheet preview",
    workMode: "export",
    status: "wired",
  },
  {
    id: "energy-fm",
    courseTopic: "Energy + facility management",
    revitConcept: "Model as database for analysis and operations",
    appCapability: "Twin energy, retrofit, ECO2 export, equipment insight",
    workMode: "energy",
    status: "wired",
  },
  {
    id: "family-editor",
    courseTopic: "Loadable families",
    revitConcept: "User-authored families",
    appCapability: "v8 family editor",
    workMode: "model",
    status: "deferred",
  },
  {
    id: "phasing-5d",
    courseTopic: "4D / 5D",
    revitConcept: "Phases + quantities → budget",
    appCapability: "v8 phasing; schedule areas already quantify",
    workMode: "schedules",
    status: "deferred",
  },
];

export function getWorkMode(id: RevitWorkMode): RevitWorkModeDef {
  const found = REVIT_WORK_MODES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown Revit work mode: ${id}`);
  return found;
}

export function featuresForMode(
  mode: RevitWorkMode | "ingest" | "export"
): RevitFeatureMapEntry[] {
  return REVIT_FEATURE_MAP.filter((f) => f.workMode === mode);
}

export function defaultLeftDockTab(
  mode: RevitWorkMode
): "insights" | "browser" {
  return mode === "energy" ? "insights" : "browser";
}
