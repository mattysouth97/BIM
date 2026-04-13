export type WorkflowStage = "search" | "upload" | "twin" | "report";

export const STAGE_ORDER: WorkflowStage[] = [
  "search",
  "upload",
  "twin",
  "report",
];

export const STAGE_LABELS: Record<WorkflowStage, { ko: string; en: string }> = {
  search: { ko: "건물 검색", en: "Search" },
  upload: { ko: "도면 업로드", en: "Upload CAD" },
  twin:   { ko: "디지털 트윈", en: "Twin" },
  report: { ko: "보고서", en: "Report" },
};

/** Runtime context passed to stage guards so they can gate on store values
 *  without importing store modules (keeps stages.ts free of store/React deps). */
export interface StageGuardContext {
  /** GeoJSON-style [outer, ...holes] polygon rings in world meters for the
   *  currently selected building. Used by the `upload` guard. */
  footprintPolygon?: [number, number][][];
}

// DAG prerequisite guards — pure functions.
// Return true if the user CAN leave this stage (advance forward).
export const STAGE_GUARDS: Partial<Record<WorkflowStage, (ctx?: StageGuardContext) => boolean>> = {
  search: () => true,
  upload: (ctx) => {
    const rings = ctx?.footprintPolygon;
    return Array.isArray(rings) && rings.length > 0 && Array.isArray(rings[0]) && rings[0].length >= 3;
  },
  twin:   () => true,
  // "report" has no forward guard — it is the terminal stage.
};
