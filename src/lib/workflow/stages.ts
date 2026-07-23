import {
  isCadDraftParamsValid,
  type CadDraftParams,
  type WorkflowMode,
} from "./cad-draft";

export type { WorkflowMode } from "./cad-draft";

export type WorkflowStage = "search" | "upload" | "params" | "twin" | "report";

/** Ledger-mode stage order — unchanged since P0; "params" never appears here. */
export const STAGE_ORDER: WorkflowStage[] = [
  "search",
  "upload",
  "twin",
  "report",
];

/** P2-24 — cad-first mode: begin at upload (CAD is the entry point), then
 *  enter the minimal manual parameters the ledger would otherwise supply. */
const CAD_FIRST_STAGE_ORDER: WorkflowStage[] = [
  "upload",
  "params",
  "twin",
  "report",
];

export function getStageOrder(mode?: WorkflowMode): WorkflowStage[] {
  return mode === "cad-first" ? CAD_FIRST_STAGE_ORDER : STAGE_ORDER;
}

export const STAGE_LABELS: Record<WorkflowStage, { ko: string; en: string }> = {
  search: { ko: "건물 검색", en: "Search" },
  upload: { ko: "도면 업로드", en: "Upload CAD" },
  params: { ko: "정보 입력", en: "Building Info" },
  twin:   { ko: "디지털 트윈", en: "Twin" },
  report: { ko: "보고서", en: "Report" },
};

/** Runtime context passed to stage guards so they can gate on store values
 *  without importing store modules (keeps stages.ts free of store/React deps). */
export interface StageGuardContext {
  /** GeoJSON-style [outer, ...holes] polygon rings in world meters for the
   *  currently selected building. Used by the `upload` guard. */
  footprintPolygon?: [number, number][][];
  /** P2-17 — the user explicitly chose to proceed without a CAD drawing for
   *  the active building. The twin then falls back to the public-data
   *  (ledger/VWorld) footprint instead of a CAD-derived one. */
  cadSkipped?: boolean;
  /** P2-24 — workflow mode, derived from the active PK prefix (cad-…).
   *  Defaults to "ledger" when absent so every existing callsite is unchanged. */
  mode?: WorkflowMode;
  /** P2-24 — manual parameters of a cad-first draft; gates the params stage. */
  cadParams?: CadDraftParams;
}

// DAG prerequisite guards — pure functions.
// Return true if the user CAN leave this stage (advance forward).
export const STAGE_GUARDS: Partial<Record<WorkflowStage, (ctx?: StageGuardContext) => boolean>> = {
  search: () => true,
  upload: (ctx) => {
    // P2-24: in cad-first mode the CAD drawing IS the entry point — the P2-17
    // skip escape hatch does not apply.
    if (ctx?.mode !== "cad-first" && ctx?.cadSkipped === true) return true;
    const rings = ctx?.footprintPolygon;
    return Array.isArray(rings) && rings.length > 0 && Array.isArray(rings[0]) && rings[0].length >= 3;
  },
  params: (ctx) => isCadDraftParamsValid(ctx?.cadParams),
  twin:   () => true,
  // "report" has no forward guard — it is the terminal stage.
};

// P1-08 (b) — user-facing reason why a stage's FORWARD guard blocks.
// Keyed by the blocking stage; text must state the real guard condition
// (upload guard = ≥3-point CAD footprint polygon), never an invented string.
export const STAGE_LOCK_REASONS: Partial<Record<WorkflowStage, { ko: string; en: string }>> = {
  upload: {
    ko: "도면 업로드 또는 'CAD 없이 계속' 필요 (3점 이상 외곽 폴리곤)",
    en: "Upload a CAD footprint (outer polygon with ≥3 points) or choose 'Continue without CAD'",
  },
  params: {
    ko: "층수 · 준공연도 · 지역 입력 필요",
    en: "Enter floor count, completion year, and region first",
  },
};

// P2-24 — in cad-first mode there is no skip path, so the upload lock reason
// must not advertise one (honesty: never name an option that doesn't exist).
const CAD_FIRST_UPLOAD_LOCK_REASON = {
  ko: "도면 업로드 필요 (3점 이상 외곽 폴리곤)",
  en: "Upload a CAD footprint (outer polygon with ≥3 points)",
};

/** Mode-aware lock reason lookup. Falls back to the static table. */
export function getStageLockReason(
  stage: WorkflowStage,
  mode?: WorkflowMode
): { ko: string; en: string } | undefined {
  if (mode === "cad-first" && stage === "upload") return CAD_FIRST_UPLOAD_LOCK_REASON;
  return STAGE_LOCK_REASONS[stage];
}

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
  const order = getStageOrder(ctx?.mode);
  const currentIdx = order.indexOf(current);
  const targetIdx = order.indexOf(target);
  if (targetIdx <= currentIdx) return null;
  for (let i = currentIdx; i < targetIdx; i++) {
    const stage = order[i];
    const guard = STAGE_GUARDS[stage];
    if (guard && !guard(ctx)) return stage;
  }
  return null;
}
