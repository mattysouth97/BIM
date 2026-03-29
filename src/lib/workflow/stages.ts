export type WorkflowStage = "select" | "assemble" | "configure" | "analyze" | "export";

export const STAGE_ORDER: WorkflowStage[] = [
  "select",
  "assemble",
  "configure",
  "analyze",
  "export",
];

export const STAGE_LABELS: Record<WorkflowStage, { ko: string; en: string }> = {
  select:    { ko: "건물 선택",  en: "Select Building" },
  assemble:  { ko: "구조 조립",  en: "Assemble" },
  configure: { ko: "속성 설정",  en: "Configure" },
  analyze:   { ko: "분석",      en: "Analyze" },
  export:    { ko: "내보내기",   en: "Export" },
};

// DAG prerequisite guards — pure functions.
// Return true if the user CAN leave this stage (advance forward).
// Guards are intentionally permissive in v3.0 — stages are suggested, not enforced.
export const STAGE_GUARDS: Partial<Record<WorkflowStage, () => boolean>> = {
  select:    () => true,
  assemble:  () => true,
  configure: () => true,
  analyze:   () => true,
  // "export" has no forward guard — it is the terminal stage.
};
