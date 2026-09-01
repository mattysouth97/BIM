// src/lib/cad-reconstruction/report.ts
//
// The written half of the deliverable. A CAD file without its evidence
// register, assumption ledger and conflict register is exactly the artefact
// this pipeline is built to avoid: a drawing that looks like a survey.
//
// Every document is generated from the same model as the DXF.

import { qaSummary } from "./qa";
import type {
  FieldVerificationItem,
  QaCheck,
  ReconstructionModel,
} from "./types";

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

function fmt(n: number | null | undefined, digits = 2): string {
  return n === null || n === undefined || !Number.isFinite(n)
    ? "-"
    : n.toFixed(digits);
}

function header(model: ReconstructionModel, docTitle: string): string {
  return [
    `# ${docTitle}`,
    "",
    `- 대상: **${model.building.name}**`,
    `- 주소: ${model.building.address ?? "-"}`,
    `- 리비전: **${model.revision}** (${model.titleKo})`,
    `- 생성: ${model.createdAt}`,
    `- 모델 ID: \`${model.id}\``,
    "",
    "> 이 문서는 실측 도서(as-built)가 아닙니다. 확보 가능한 증거로부터 복원한 " +
      "추정 현황이며, 모든 기하는 아래 증거 등급을 함께 읽어야 합니다.",
    "",
  ].join("\n");
}

export function evidenceRegisterMarkdown(model: ReconstructionModel): string {
  const sourceRows = model.sources.map((s) => [
    s.sourceId,
    s.sourceTitle,
    `T${s.authorityLevel}`,
    s.available ? "확보" : "미확보",
    s.confidence,
    s.coordinateSystem ?? "-",
    s.knownLimitations.join("; ") || "-",
  ]);

  const controlRows = model.controls.map((c) => [
    c.id,
    `${c.labelKo} / ${c.labelEn}`,
    typeof c.value === "number" ? fmt(c.value) : String(c.value ?? "-"),
    c.unit ?? "-",
    c.grade,
    c.sourceIds.join(", ") || "-",
    c.method,
  ]);

  const claimRows = model.claims.map((c) => [
    c.id,
    c.kind,
    String(c.value ?? "-"),
    c.unit ?? "-",
    c.grade,
    c.measured ? "실측 진술" : "일반 진술",
    `"${c.quote.replace(/\|/g, "/")}"`,
  ]);

  return [
    header(model, "증거 대장 / Evidence Register"),
    "## 1. 출처 목록",
    "",
    table(
      ["ID", "출처", "티어", "상태", "등급", "좌표계", "알려진 한계"],
      sourceRows,
    ),
    "",
    "## 2. 기하 통제망 (Geometric control network)",
    "",
    "높은 등급의 통제값이 낮은 등급의 기하를 구속합니다. 그 반대는 허용하지 않습니다.",
    "",
    table(["ID", "항목", "값", "단위", "등급", "출처", "취득 방법"], controlRows),
    "",
    "## 3. 사용자 진술",
    "",
    model.claims.length > 0
      ? table(["ID", "종류", "값", "단위", "등급", "성격", "원문"], claimRows)
      : "_사용자 진술이 없습니다._",
    "",
    "## 4. 좌표계",
    "",
    `- 작업 좌표계: \`${model.frame.projection}\``,
    `- 원점(WGS84): ${
      model.frame.originLngLat
        ? `${model.frame.originLngLat[0].toFixed(6)}, ${model.frame.originLngLat[1].toFixed(6)}`
        : "없음 — 지오레퍼런스 불가"
    }`,
    `- 진북과 도면북의 차이: ${model.frame.trueNorthDeg}°`,
    `- 수직 기준: ${model.frame.zDatum}`,
    `- 등급: ${model.frame.grade}`,
    "",
    "## 5. 외곽선 결정",
    "",
    `- 방법: ${model.footprint.method || "-"}`,
    `- 등급: **${model.footprint.grade}**`,
    `- 면적: ${fmt(model.footprint.areaSqm)} m²`,
    "",
  ].join("\n");
}

export function assumptionLedgerMarkdown(model: ReconstructionModel): string {
  if (model.assumptions.length === 0) {
    return [header(model, "가정 대장 / Assumption Ledger"), "_기록된 가정이 없습니다._", ""].join(
      "\n",
    );
  }
  const blocks = model.assumptions.map((a) =>
    [
      `### ${a.id} — ${a.element} (${a.floor})`,
      "",
      `- **가정**: ${a.assumption}`,
      `- **근거**: ${a.reason}`,
      `- **출처 맥락**: ${a.sourceContext}`,
      `- **신뢰도**: ${a.confidence}`,
      `- **틀렸을 때 영향**: ${a.impactIfWrong}`,
      `- **검증 방법**: ${a.verificationMethod}`,
      `- **상태**: ${a.status}`,
      "",
    ].join("\n"),
  );
  return [
    header(model, "가정 대장 / Assumption Ledger"),
    `총 ${model.assumptions.length}건. 모든 항목은 되돌릴 수 있으며, 더 나은 증거가 들어오면 대체됩니다.`,
    "",
    ...blocks,
  ].join("\n");
}

export function conflictRegisterMarkdown(model: ReconstructionModel): string {
  if (model.conflicts.length === 0) {
    return [
      header(model, "불일치 대장 / Conflict Register"),
      "_비교 가능한 출처 간 불일치가 발견되지 않았습니다._",
      "",
      "비교한 항목: 건축면적 대 GIS 외곽, 건폐율, 용적률, 연면적 대 층별개요 합계, " +
        "대장 층수 대 GIS 층수, 대장 높이 대 GIS 높이, 사용자 치수 대 건축면적.",
      "",
    ].join("\n");
  }
  const rows = model.conflicts.map((c) => [
    c.id,
    c.subject,
    `${c.sourceA}: ${c.valueA}`,
    `${c.sourceB}: ${c.valueB}`,
    c.magnitude,
    c.resolutionStatus,
    c.requiredVerification,
  ]);
  return [
    header(model, "불일치 대장 / Conflict Register"),
    "출처가 다투는 값은 어느 쪽도 삭제하지 않았습니다. 기하에 반영된 값은 권위가 높은 쪽이며, 낮은 쪽은 여기에 보존됩니다.",
    "",
    table(["ID", "주제", "출처 A", "출처 B", "차이", "상태", "필요한 확인"], rows),
    "",
    "## 설명 가설",
    "",
    ...model.conflicts.map((c) => `- **${c.id}**: ${c.possibleExplanation}`),
    "",
  ].join("\n");
}

export function qaReportMarkdown(
  model: ReconstructionModel,
  checks: readonly QaCheck[],
  plan: readonly FieldVerificationItem[],
): string {
  const summary = qaSummary(checks);
  const rows = checks.map((c) => [
    c.status === "PASS" ? "PASS" : c.status === "FAIL" ? "**FAIL**" : "SKIP",
    c.id,
    c.group,
    c.labelKo,
    c.detail.replace(/\|/g, "/"),
  ]);

  const areaRows = model.areaValidation.map((r) => [
    r.metric,
    fmt(r.sourceValue),
    fmt(r.modelValue),
    fmt(r.deltaSqm),
    r.deltaPct === null ? "-" : `${fmt(r.deltaPct, 1)}%`,
    r.status === "PASS" ? "PASS" : r.status === "REVIEW" ? "**REVIEW**" : "출처 없음",
  ]);

  const planRows = plan.map((p) => [
    String(p.rank),
    p.measurement,
    p.reason,
    p.eliminates,
    p.method,
  ]);

  return [
    header(model, "QA 보고서 / QA Report"),
    `## 결과 요약 — PASS ${summary.pass} · FAIL ${summary.fail} · SKIP ${summary.skip}`,
    "",
    table(["결과", "ID", "그룹", "검사", "상세"], rows),
    "",
    "## 면적 검증",
    "",
    "모델 면적은 링에서 매번 재계산합니다. 출처 값을 모델에 맞추어 수정하지 않았습니다.",
    "",
    table(["항목", "출처", "모델", "차이(m²)", "차이(%)", "결과"], areaRows),
    "",
    "## 의도적으로 생성하지 않은 것",
    "",
    "- **실내 칸막이**: 실 경계에 대한 증거가 없어 코어와 외곽 외의 벽은 작도하지 않았습니다. 근거 없는 평면을 그리는 것보다 비워두는 편이 정확합니다.",
    "- **MEP·전기·소방 도면**: 장비, 배관, 회로에 대한 증거가 전혀 없습니다. 해당 레이어(M-, E-, P-, F-)는 정의만 되어 있고 비어 있습니다.",
    "- **페이퍼스페이스 레이아웃**: 레이아웃 객체 대신 SHEET 레이어에 시트 테두리와 표제란을 모델스페이스로 작도했습니다.",
    "- **PDF 도면집**: 이 파이프라인은 DXF와 문서만 생성합니다.",
    "",
    "## 현장 확인 우선순위",
    "",
    planRows.length > 0
      ? table(["순위", "측정 항목", "이유", "해소되는 불확실성", "방법"], planRows)
      : "_추가 확인이 필요한 항목이 없습니다._",
    "",
    ...(model.blockers.length > 0
      ? ["## 차단 사유", "", ...model.blockers.map((b) => `- ${b}`), ""]
      : []),
  ].join("\n");
}

export function geometryJson(model: ReconstructionModel): string {
  return JSON.stringify(model, null, 2);
}

export function entityProvenanceCsv(model: ReconstructionModel): string {
  const rows: string[][] = [["entity_id", "entity_type", "floor", "grade", "source", "method"]];
  rows.push([
    "A-OUTLINE-01",
    "footprint",
    model.levels.find((l) => !l.below)?.name ?? "1F",
    model.footprint.grade,
    model.footprint.grade === "B-OBSERVED" ? "SRC-GIS-BLDG" : "SRC-REG-TITLE",
    model.footprint.method,
  ]);
  for (const level of model.levels) {
    rows.push([
      `A-PLATE-${level.id}`,
      "level_plate",
      level.name,
      level.plateGrade,
      "SRC-REG-FLOORS",
      `footprint × ${level.plateScale.toFixed(4)}`,
    ]);
  }
  for (const wall of model.walls) {
    rows.push([wall.id, "exterior_wall", wall.levelId, wall.grade, "derived", "plate offset inward"]);
  }
  for (const op of model.openings) {
    rows.push([
      op.id,
      op.type,
      op.levelId,
      op.grade,
      op.type === "door" ? "C12" : "SRC-CODE-ERA",
      op.type === "door" ? "entrance control" : "era window-to-wall ratio",
    ]);
  }
  if (model.core) {
    rows.push([model.core.id, "core", "all", model.core.grade, "C9/C10/C11", "use-based core ratio"]);
  }
  model.grid.columns.forEach((_c, i) => {
    rows.push([
      `S-COL-C${String(i + 1).padStart(3, "0")}`,
      "column",
      "all",
      model.grid.grade,
      "C7",
      "structure-type bay",
    ]);
  });
  return rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function areaValidationCsv(model: ReconstructionModel): string {
  const rows: string[][] = [["metric", "source_sqm", "model_sqm", "delta_sqm", "delta_pct", "status"]];
  for (const r of model.areaValidation) {
    rows.push([
      r.metric,
      fmt(r.sourceValue),
      fmt(r.modelValue),
      fmt(r.deltaSqm),
      fmt(r.deltaPct, 1),
      r.status,
    ]);
  }
  return rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
