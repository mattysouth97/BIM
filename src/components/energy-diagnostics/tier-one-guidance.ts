import type { TierOneExtractionOnlyReason } from "@/lib/energy-diagnostics/tier-one-model";

import type { DiagnosisLocale } from "./types";

export type TierOneGuidance = Readonly<{
  what: string;
  fix: string;
  /** The user can resolve this by assigning the document type in place. */
  fixableByClassification: boolean;
}>;

const KO: Record<TierOneExtractionOnlyReason, TierOneGuidance> = {
  rejected_source: {
    what: "업로드한 파일 중 일부가 안전성·형식 검증을 통과하지 못했습니다.",
    fix: "거부된 파일을 제외하고 DXF 평면도 한 장만 다시 등록해 보세요.",
    fixableByClassification: false,
  },
  unsupported_source_set: {
    what: "자동 모델 생성은 평면도 한 장에서만 시작할 수 있습니다.",
    fix: "우선 대표 평면도 한 장만 등록해 초기 모델을 만들고, 나머지 도면은 이후에 근거로 추가하세요.",
    fixableByClassification: false,
  },
  not_floor_plan: {
    what: "이 도면이 평면도로 분류되지 않아 형상을 모델로 사용하지 않았습니다.",
    fix: "아래 도면 유형에서 ‘평면도’를 직접 지정하면 추출된 외곽선으로 모델을 만듭니다.",
    fixableByClassification: true,
  },
  classification_uncertain: {
    what: "자동 분류 신뢰도가 낮아 평면도라고 단정하지 않았습니다.",
    fix: "아래 도면 유형에서 ‘평면도’를 직접 지정해 확인해 주세요.",
    fixableByClassification: true,
  },
  uncalibrated_units: {
    what: "도면의 실제 단위·축척이 확인되지 않아 치수를 신뢰할 수 없습니다.",
    fix: "단위(m/mm)가 기록된 DXF로 다시 내보내거나, 축척 정보가 있는 도면을 사용하세요.",
    fixableByClassification: false,
  },
  no_valid_boundary: {
    what: "닫힌 바닥 외곽선을 도면에서 찾지 못했습니다.",
    fix: "외곽선이 하나의 닫힌 폴리라인으로 그려져 있는지 확인한 뒤 다시 등록하세요.",
    fixableByClassification: false,
  },
  ambiguous_boundary: {
    what: "닫힌 외곽선이 여러 개 발견되어 건물 외곽을 특정하지 못했습니다.",
    fix: "건물 외곽선만 남긴 도면으로 다시 등록하거나, 대표 외곽선 하나만 포함한 레이어를 사용하세요.",
    fixableByClassification: false,
  },
  invalid_boundary: {
    what: "추출된 외곽선이 유효한 단순 다각형이 아닙니다.",
    fix: "자기 교차나 중복 꼭짓점이 없는지 도면에서 외곽선을 정리한 뒤 다시 등록하세요.",
    fixableByClassification: false,
  },
  geometry_mismatch: {
    what: "기록된 바닥면적과 외곽선에서 계산한 면적이 1% 이상 다릅니다.",
    fix: "도면 축척과 외곽선을 확인하세요. 축척이 맞으면 기록 면적 주석을 수정해야 합니다.",
    fixableByClassification: false,
  },
  unresolved_conflict: {
    what: "추출값 사이에 해결되지 않은 충돌이 있습니다.",
    fix: "추출 검토 단계에서 충돌 값을 확인·선택한 뒤 다시 시도하세요.",
    fixableByClassification: false,
  },
  unsupported_missing_value: {
    what: "필수 추출값이 누락되었고 Tier-1 템플릿으로도 대체할 수 없습니다.",
    fix: "누락된 값이 포함된 도면을 추가하거나, 대표 세트로 워크플로를 먼저 익혀 보세요.",
    fixableByClassification: false,
  },
  unsupported_extraction_stage: {
    what: "이 형식의 도면에서 형상을 추출하는 단계가 아직 지원되지 않습니다.",
    fix: "DXF 평면도로 다시 내보내 등록하면 벡터 외곽선을 직접 추출할 수 있습니다.",
    fixableByClassification: false,
  },
};

const EN: Record<TierOneExtractionOnlyReason, TierOneGuidance> = {
  rejected_source: {
    what: "Some uploaded files failed safety or format validation.",
    fix: "Remove the rejected files and register a single DXF floor plan.",
    fixableByClassification: false,
  },
  unsupported_source_set: {
    what: "Automatic model generation starts from exactly one floor plan.",
    fix: "Register one representative floor plan first; add the other drawings later as evidence.",
    fixableByClassification: false,
  },
  not_floor_plan: {
    what: "This drawing was not classified as a floor plan, so its geometry stayed extraction-only.",
    fix: "Assign the document type “Floor plan” below to build a model from the extracted boundary.",
    fixableByClassification: true,
  },
  classification_uncertain: {
    what: "Automatic classification was not confident enough to call this a floor plan.",
    fix: "Assign the document type “Floor plan” below to confirm it.",
    fixableByClassification: true,
  },
  uncalibrated_units: {
    what: "The drawing's physical units/scale could not be confirmed, so dimensions are untrusted.",
    fix: "Re-export the DXF with recorded units (m/mm), or use a drawing that carries scale data.",
    fixableByClassification: false,
  },
  no_valid_boundary: {
    what: "No closed floor boundary was found in the drawing.",
    fix: "Make sure the outline is a single closed polyline, then register again.",
    fixableByClassification: false,
  },
  ambiguous_boundary: {
    what: "Multiple closed boundaries were found, so the building outline is ambiguous.",
    fix: "Register a drawing with only the building outline, or a layer containing one boundary.",
    fixableByClassification: false,
  },
  invalid_boundary: {
    what: "The extracted boundary is not a valid simple polygon.",
    fix: "Clean self-intersections or duplicate vertices in the outline, then register again.",
    fixableByClassification: false,
  },
  geometry_mismatch: {
    what: "The recorded floor area differs from the polygon area by more than 1%.",
    fix: "Check the drawing scale and boundary; if the scale is right, correct the recorded area.",
    fixableByClassification: false,
  },
  unresolved_conflict: {
    what: "The extraction contains unresolved value conflicts.",
    fix: "Resolve the conflicting values in extraction review and try again.",
    fixableByClassification: false,
  },
  unsupported_missing_value: {
    what: "A required extracted value is missing and the Tier-1 template cannot cover it.",
    fix: "Add a drawing carrying the missing value, or explore the representative set first.",
    fixableByClassification: false,
  },
  unsupported_extraction_stage: {
    what: "Geometry extraction for this file format is not supported yet.",
    fix: "Re-export the plan as DXF; vector boundaries are extracted directly from DXF.",
    fixableByClassification: false,
  },
};

export function tierOneGuidance(
  reason: TierOneExtractionOnlyReason,
  locale: DiagnosisLocale,
): TierOneGuidance {
  return (locale === "en" ? EN : KO)[reason];
}
