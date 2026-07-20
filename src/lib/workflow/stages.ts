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

// P1-08 (b) — user-facing reason why a stage's FORWARD guard blocks.
// Keyed by the blocking stage; text must state the real guard condition
// (upload guard = ≥3-point CAD footprint polygon), never an invented string.
export const STAGE_LOCK_REASONS: Partial<Record<WorkflowStage, { ko: string; en: string }>> = {
  upload: {
    ko: "도면 업로드 필요 (3점 이상 외곽 폴리곤)",
    en: "CAD footprint required (outer polygon with ≥3 points)",
  },
};

/**
 * P1-08 (b) — pure navigation check for jumping current → target.
 * Backward and same-stage moves are always allowed (returns null).
 * A forward jump requires the forward guard of EVERY stage from `current`
 * up to (but excluding) `target` to pass — otherwise the first blocking
 * stage is returned so callers can surface its lock reason.
 */
export function getBlockingStage(
  current: WorkflowStage,
  target: WorkflowStage,
  ctx?: StageGuardContext
): WorkflowStage | null {
  const currentIdx = STAGE_ORDER.indexOf(current);
  const targetIdx = STAGE_ORDER.indexOf(target);
  if (targetIdx <= currentIdx) return null;
  for (let i = currentIdx; i < targetIdx; i++) {
    const stage = STAGE_ORDER[i];
    const guard = STAGE_GUARDS[stage];
    if (guard && !guard(ctx)) return stage;
  }
  return null;
}
