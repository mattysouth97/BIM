// src/components/energy-diagnostics/diagnosis-stage.ts
//
// The diagnosis workflow's stages: what they are, what they are called in each
// locale, which of them the top navigation shows, and what counts as having
// finished one.
//
// Extracted from energy-diagnosis-workspace.tsx, which was carrying ~200 lines
// of static locale tables and stage predicates around its React state. None of
// this needs a component to be true.

import type {
  DegreeDaySimulationRun,
} from "@/lib/energy-diagnostics/adapter";
import type { DrawingSetIngestionResult } from "@/lib/energy-diagnostics/ingestion";
import type {
  CanonicalEnergyModel,
  DrawingDocumentType,
} from "@/lib/energy-diagnostics/types";
import type { CanonicalModelValidation } from "@/lib/energy-diagnostics/validation";

import { diagnosisCopy } from "./copy";
import type { DiagnosisEntryStage, DiagnosisLocale } from "./types";

/**
 * The stages of the diagnosis workflow.
 *
 * Defined as `DiagnosisEntryStage | "assumptions"` rather than as its own
 * seven-member list, because that is the actual relationship: every stage an
 * entry method may open on is a stage, and "assumptions" is the one stage you
 * can reach but never enter on. Spelling both unions out separately let them
 * drift; this way the compiler keeps them in step.
 */
export type DiagnosisStage = DiagnosisEntryStage | "assumptions";

/** A long-running action the workspace is currently performing. */
export type DiagnosisOperation =
  | "reference"
  | "upload"
  | "baseline"
  | "scenario"
  | "save"
  | "reload"
  | null;

export const NAVIGATION_STAGES = [
  "drawings",
  "model",
  "preflight",
  "simulation",
  "compare",
] as const satisfies readonly DiagnosisStage[];

export const NAVIGATION_LABEL: Record<
  DiagnosisLocale,
  Record<(typeof NAVIGATION_STAGES)[number], string>
> = {
  ko: {
    drawings: "건물 입력",
    model: "건물 모델",
    preflight: "검증",
    simulation: "진단 실행",
    compare: "결과",
  },
  en: {
    drawings: "Building input",
    model: "Building model",
    preflight: "Validate",
    simulation: "Run diagnostic",
    compare: "Results",
  },
};

export function navigationStage(stage: DiagnosisStage): (typeof NAVIGATION_STAGES)[number] {
  if (stage === "review") return "drawings";
  if (stage === "assumptions") return "preflight";
  return stage;
}

export const STAGE_LABEL: Record<DiagnosisLocale, Record<DiagnosisStage, string>> = {
  ko: {
    drawings: "도면 세트",
    review: "추출 검토",
    model: "건물 모델",
    assumptions: "가정 및 누락값",
    preflight: "모델 검사",
    simulation: "시뮬레이션",
    compare: "진단 결과",
  },
  en: {
    drawings: "Drawing set",
    review: "Extraction review",
    model: "Building model",
    assumptions: "Assumptions",
    preflight: "Preflight",
    simulation: "Run diagnostic",
    compare: "Diagnostic results",
  },
};

const DOCUMENT_LABEL: Record<DiagnosisLocale, Partial<Record<DrawingDocumentType, string>>> = {
  ko: {
    site_plan: "배치도",
    floor_plan: "평면도",
    elevation: "입면도",
    section: "단면도",
    window_schedule: "창호 일람표",
    wall_detail: "외벽 상세",
    hvac_equipment_schedule: "공조 장비 일람표",
    lighting_plan: "조명 평면도",
    material_schedule: "재료 일람표",
    unknown: "미분류",
  },
  en: {
    site_plan: "Site plan",
    floor_plan: "Floor plan",
    elevation: "Elevation",
    section: "Section",
    window_schedule: "Window schedule",
    wall_detail: "Wall detail",
    hvac_equipment_schedule: "HVAC schedule",
    lighting_plan: "Lighting plan",
    material_schedule: "Material schedule",
    unknown: "Unclassified",
  },
};

export function documentTypeLabel(type: DrawingDocumentType, locale: DiagnosisLocale): string {
  return DOCUMENT_LABEL[locale][type] ?? type.replaceAll("_", " ");
}

export function operationLabel(operation: Exclude<DiagnosisOperation, null>, locale: DiagnosisLocale): string {
  const copy = diagnosisCopy(locale);
  if (operation === "reference") return copy.loadingReference;
  if (operation === "upload") return copy.readingFiles;
  if (operation === "baseline" || operation === "scenario") return copy.running;
  if (operation === "save") return locale === "ko" ? "프로젝트를 저장하는 중…" : "Saving project…";
  return locale === "ko" ? "저장본을 여는 중…" : "Loading saved project…";
}

export function stageComplete(
  stage: DiagnosisStage,
  model: CanonicalEnergyModel | null,
  ingestion: DrawingSetIngestionResult | null,
  validation: CanonicalModelValidation | null,
  baselineRun: DegreeDaySimulationRun | null,
): boolean {
  if (stage === "drawings") {
    return Boolean(
      (ingestion || model?.drawingSet.documents.length) &&
        model?.drawingSet.documents.every(
          (document) => document.classification.documentType !== "unknown",
        ),
    );
  }
  if (stage === "review") return Boolean(model && model.conflicts.every((conflict) => conflict.resolutionStatus !== "unresolved"));
  if (stage === "model") {
    return Boolean(
      model &&
        model.geometry.thermalZones.length > 0 &&
        model.envelope.constructions.length > 0 &&
        model.envelope.infiltrationAirChangesPerHour.value != null &&
        model.systems.hvac.length > 0,
    );
  }
  if (stage === "assumptions") return Boolean(model && model.missingValues.every((missing) => !missing.blocking));
  if (stage === "preflight") return validation?.validForSimulation ?? false;
  if (stage === "simulation") return baselineRun?.status === "succeeded";
  return baselineRun?.status === "succeeded";
}
