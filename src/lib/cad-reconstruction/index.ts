// src/lib/cad-reconstruction/index.ts
//
// One entry point for the whole loop:
//
//   INGEST → EXTRACT → NORMALIZE → RECONSTRUCT → CALCULATE → VALIDATE → RENDER
//
// Callers hand in evidence and get back the canonical model, the DXF written
// from it, the QA verdict on that DXF (including a reopen through the app's own
// importer), and the documents that make the drawing defensible.

import { createSceneProjection } from "@/lib/gis/gis-transform";

import { writeDxf, type DxfResult } from "./dxf";
import { fieldVerificationPlan, qaSummary, runQa } from "./qa";
import {
  areaValidationCsv,
  assumptionLedgerMarkdown,
  conflictRegisterMarkdown,
  entityProvenanceCsv,
  evidenceRegisterMarkdown,
  geometryJson,
  qaReportMarkdown,
} from "./report";
import { reconstruct } from "./reconstruct";
import type {
  EvidenceInput,
  FieldVerificationItem,
  QaCheck,
  ReconstructionModel,
} from "./types";

export * from "./types";
export { parseClaimStatements, normaliseProvidedClaims, claimOf } from "./claims";
export { aggregateFloors, statedNumber } from "./evidence";
export { reconstruct, solvePlateForArea } from "./reconstruct";
export { writeDxf, LAYERS } from "./dxf";
export { runQa, qaSummary, fieldVerificationPlan } from "./qa";
export {
  evidenceRegisterMarkdown,
  assumptionLedgerMarkdown,
  conflictRegisterMarkdown,
  qaReportMarkdown,
  geometryJson,
} from "./report";

export interface ReconstructionDocument {
  /** File name, ready to download. */
  name: string;
  mediaType: string;
  content: string;
  labelKo: string;
  labelEn: string;
}

export interface ReconstructionPackage {
  model: ReconstructionModel;
  dxf: DxfResult;
  checks: QaCheck[];
  fieldPlan: FieldVerificationItem[];
  documents: ReconstructionDocument[];
  summary: { pass: number; fail: number; skip: number; ok: boolean };
}

function safeName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : "Building";
}

/**
 * Run the full reconstruction. Pure apart from `Date.now()` when the caller
 * does not pin `input.now`, so the same evidence yields the same drawing.
 */
export function runReconstruction(input: EvidenceInput): ReconstructionPackage {
  const model = reconstruct(input, {
    project: (originLng, originLat) => {
      const projection = createSceneProjection(originLng, originLat);
      return (lng: number, lat: number) => projection.project(lng, lat);
    },
  });

  const dxf = writeDxf(model);
  const checks = runQa(model, dxf);
  const fieldPlan = fieldVerificationPlan(model);
  const base = `${safeName(model.building.name)}_${model.revision}`;

  const documents: ReconstructionDocument[] = [
    {
      name: `${base}.dxf`,
      mediaType: "application/dxf",
      content: dxf.text,
      labelKo: "DXF 도면 (편집 가능)",
      labelEn: "Editable DXF",
    },
    {
      name: `${base}_Evidence_Register.md`,
      mediaType: "text/markdown",
      content: evidenceRegisterMarkdown(model),
      labelKo: "증거 대장",
      labelEn: "Evidence register",
    },
    {
      name: `${base}_Assumption_Ledger.md`,
      mediaType: "text/markdown",
      content: assumptionLedgerMarkdown(model),
      labelKo: "가정 대장",
      labelEn: "Assumption ledger",
    },
    {
      name: `${base}_Conflict_Register.md`,
      mediaType: "text/markdown",
      content: conflictRegisterMarkdown(model),
      labelKo: "불일치 대장",
      labelEn: "Conflict register",
    },
    {
      name: `${base}_QA_Report.md`,
      mediaType: "text/markdown",
      content: qaReportMarkdown(model, checks, fieldPlan),
      labelKo: "QA 보고서 · 현장 확인 계획",
      labelEn: "QA report and field plan",
    },
    {
      name: `${base}_Geometry.json`,
      mediaType: "application/json",
      content: geometryJson(model),
      labelKo: "기계 판독 기하 모델",
      labelEn: "Machine-readable geometry",
    },
    {
      name: `${base}_Entity_Provenance.csv`,
      mediaType: "text/csv",
      content: entityProvenanceCsv(model),
      labelKo: "객체 출처 매핑",
      labelEn: "Entity provenance",
    },
    {
      name: `${base}_Area_Validation.csv`,
      mediaType: "text/csv",
      content: areaValidationCsv(model),
      labelKo: "면적 검증표",
      labelEn: "Area validation",
    },
  ];

  return { model, dxf, checks, fieldPlan, documents, summary: qaSummary(checks) };
}
