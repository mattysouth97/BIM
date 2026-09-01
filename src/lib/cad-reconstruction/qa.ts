// src/lib/cad-reconstruction/qa.ts
//
// Automated QA. Every check recomputes from the model or from the written DXF —
// nothing here trusts a cached number, and `saveas()` succeeding is not treated
// as evidence that the file is valid.
//
// The round-trip check deliberately reuses the application's OWN DXF reader
// (`parseDxfText`), the same code path an uploaded drawing takes. If the
// generated file cannot be read back by the importer, the reconstruction has
// failed regardless of how the geometry looked in memory.

import { parseDxfText } from "@/lib/cad/dxf-parser";

import { areaSqm, bbox, isSelfIntersecting, pointInRing } from "./geometry";
import { LAYERS, type DxfResult } from "./dxf";
import type {
  FieldVerificationItem,
  QaCheck,
  ReconstructionModel,
} from "./types";

const REQUIRED_LAYERS = LAYERS.map((l) => l.name);
const REQUIRED_BLOCKS = ["A-DOOR-SINGLE", "A-WIND-CASEMENT", "NORTH-ARROW", "SEC-MARK"];

function check(
  id: string,
  group: QaCheck["group"],
  labelKo: string,
  labelEn: string,
  ok: boolean,
  detail: string,
): QaCheck {
  return { id, group, labelKo, labelEn, status: ok ? "PASS" : "FAIL", detail };
}

function skip(
  id: string,
  group: QaCheck["group"],
  labelKo: string,
  labelEn: string,
  detail: string,
): QaCheck {
  return { id, group, labelKo, labelEn, status: "SKIP", detail };
}

export function runQa(model: ReconstructionModel, dxf: DxfResult): QaCheck[] {
  const checks: QaCheck[] = [];

  /* ---- polygon checks --------------------------------------------- */

  const rings: Array<{ name: string; ring: readonly (readonly [number, number])[] }> = [
    { name: "footprint", ring: model.footprint.ring },
    ...model.levels.map((l) => ({ name: `${l.name} plate`, ring: l.plate })),
    ...(model.core ? [{ name: "core", ring: model.core.ring }] : []),
    ...(model.site.ring ? [{ name: "site", ring: model.site.ring }] : []),
  ];

  const open = rings.filter((r) => r.ring.length < 3);
  checks.push(
    check(
      "QA-POLY-CLOSED",
      "polygon",
      "모든 폴리곤이 닫혀 있음",
      "All polygons closed",
      open.length === 0,
      open.length === 0
        ? `${rings.length}개 링 모두 3정점 이상`
        : `열린 링: ${open.map((r) => r.name).join(", ")}`,
    ),
  );

  const selfInt = rings.filter((r) => isSelfIntersecting(r.ring as [number, number][]));
  checks.push(
    check(
      "QA-POLY-SIMPLE",
      "polygon",
      "자기교차 없음",
      "No self-intersections",
      selfInt.length === 0,
      selfInt.length === 0
        ? "검사한 모든 링이 단순 다각형"
        : `자기교차: ${selfInt.map((r) => r.name).join(", ")}`,
    ),
  );

  const zero = rings.filter((r) => areaSqm(r.ring as [number, number][]) < 0.5);
  checks.push(
    check(
      "QA-POLY-AREA",
      "polygon",
      "영(0) 면적 폴리곤 없음",
      "No zero-area polygons",
      zero.length === 0,
      zero.length === 0
        ? "모든 링의 면적이 0.5 m² 초과"
        : `면적 없음: ${zero.map((r) => r.name).join(", ")}`,
    ),
  );

  /* ---- line checks ------------------------------------------------- */

  const zeroLen = model.walls.filter(
    (w) =>
      Math.hypot(
        w.centreline[1][0] - w.centreline[0][0],
        w.centreline[1][1] - w.centreline[0][1],
      ) < 1,
  );
  checks.push(
    check(
      "QA-LINE-ZERO",
      "line",
      "길이 0 선분 없음",
      "No zero-length lines",
      zeroLen.length === 0,
      `벽 ${model.walls.length}개 중 길이 0: ${zeroLen.length}개`,
    ),
  );

  const wallKeys = new Set<string>();
  let duplicates = 0;
  for (const w of model.walls) {
    const key = `${w.levelId}|${w.centreline[0].join(",")}|${w.centreline[1].join(",")}`;
    if (wallKeys.has(key)) duplicates += 1;
    wallKeys.add(key);
  }
  checks.push(
    check(
      "QA-LINE-DUP",
      "line",
      "중복 선분 없음",
      "No duplicate lines",
      duplicates === 0,
      `중복 벽 ${duplicates}개`,
    ),
  );

  /* ---- building checks --------------------------------------------- */

  const wallIds = new Set(model.walls.map((w) => w.id));
  const orphanOpenings = model.openings.filter((o) => !wallIds.has(o.hostWallId));
  checks.push(
    check(
      "QA-HOST",
      "building",
      "모든 개구부가 벽에 호스팅됨",
      "Every door and window is hosted by a wall",
      orphanOpenings.length === 0,
      `개구부 ${model.openings.length}개 중 미호스팅 ${orphanOpenings.length}개`,
    ),
  );

  if (model.core) {
    const outside = model.levels.filter(
      (l) => !model.core!.ring.every((p) => pointInRing(p, l.plate)),
    );
    checks.push(
      check(
        "QA-CORE-CONTAINED",
        "building",
        "코어가 모든 층 외곽 내부에 있음",
        "Core sits inside every level plate",
        outside.length === 0,
        outside.length === 0
          ? `${model.levels.length}개 층 모두 포함`
          : `벗어난 층: ${outside.map((l) => l.name).join(", ")}`,
      ),
    );
    checks.push(
      check(
        "QA-CORE-VERTICAL",
        "building",
        "코어 수직 연속성",
        "Core is vertically continuous",
        model.core.levelIds.length === model.levels.length,
        `코어가 ${model.core.levelIds.length}/${model.levels.length}개 층에 존재`,
      ),
    );
  } else {
    checks.push(
      skip(
        "QA-CORE-CONTAINED",
        "building",
        "코어 검사",
        "Core checks",
        "코어를 생성하지 않았습니다 (평면이 너무 작거나 층 정보 없음)",
      ),
    );
  }

  const stackIssues: string[] = [];
  for (let i = 1; i < model.levels.length; i++) {
    const below = model.levels[i - 1];
    const above = model.levels[i];
    if (above.elevationMm <= below.elevationMm) {
      stackIssues.push(`${above.name} ≤ ${below.name}`);
    }
  }
  checks.push(
    check(
      "QA-LEVEL-STACK",
      "building",
      "층 레벨이 단조 증가",
      "Levels stack monotonically",
      stackIssues.length === 0,
      stackIssues.length === 0
        ? `${model.levels.length}개 층 레벨 정합`
        : stackIssues.join(", "),
    ),
  );

  /* ---- area checks (recomputed, never cached) ---------------------- */

  const recomputed = model.levels.map((l) => ({
    name: l.name,
    stored: l.modelAreaSqm,
    fresh: areaSqm(l.plate),
  }));
  const drifted = recomputed.filter((r) => Math.abs(r.stored - r.fresh) > 0.05);
  checks.push(
    check(
      "QA-AREA-RECOMPUTE",
      "area",
      "층 면적 재계산 일치",
      "Floor areas recompute identically",
      drifted.length === 0,
      drifted.length === 0
        ? `${recomputed.length}개 층 재계산 일치`
        : drifted.map((d) => `${d.name}: ${d.stored.toFixed(2)} vs ${d.fresh.toFixed(2)}`).join(", "),
    ),
  );

  const reviewRows = model.areaValidation.filter((r) => r.status === "REVIEW");
  checks.push(
    check(
      "QA-AREA-CONTROL",
      "area",
      "면적이 검증된 통제값과 일치",
      "Areas match verified controls",
      reviewRows.length === 0,
      reviewRows.length === 0
        ? "모든 비교 항목이 허용 오차 이내"
        : `허용 오차 초과: ${reviewRows.map((r) => `${r.metric} ${r.deltaPct?.toFixed(1)}%`).join(", ")}`,
    ),
  );

  /* ---- cross-drawing checks ---------------------------------------- */

  // Elevations are generated from the plan, so every above-grade opening must
  // appear exactly once across the four facades. Below-grade openings have no
  // elevation to appear on.
  const aboveIds = new Set(model.levels.filter((l) => !l.below).map((l) => l.id));
  const planAboveCount = model.openings.filter((o) => aboveIds.has(o.levelId)).length;
  const elevationCount = model.elevations.reduce((s, e) => s + e.openings.length, 0);
  checks.push(
    check(
      "QA-XD-OPENINGS",
      "cross-drawing",
      "평면 개구부 = 입면 개구부",
      "Plan openings equal elevation openings",
      model.elevations.length === 0 || planAboveCount === elevationCount,
      `지상 평면 ${planAboveCount}개 / 입면 ${elevationCount}개`,
    ),
  );

  const sectionLevelCount = model.sections[0]?.floorLines.length ?? 0;
  checks.push(
    check(
      "QA-XD-SECTION",
      "cross-drawing",
      "단면 레벨 = 모델 레벨",
      "Section levels equal model levels",
      model.sections.length === 0 || sectionLevelCount === model.levels.length,
      `단면 레벨 ${sectionLevelCount} / 모델 레벨 ${model.levels.length}`,
    ),
  );

  const elevFloorLines = model.elevations[0]?.floorLines.length ?? 0;
  const aboveCount = model.levels.filter((l) => !l.below).length;
  checks.push(
    check(
      "QA-XD-ELEV-LEVELS",
      "cross-drawing",
      "입면 층선 = 지상 층수",
      "Elevation floor lines equal above-grade levels",
      model.elevations.length === 0 || elevFloorLines === aboveCount,
      `입면 층선 ${elevFloorLines} / 지상층 ${aboveCount}`,
    ),
  );

  /* ---- DXF checks --------------------------------------------------- */

  const missingLayers = REQUIRED_LAYERS.filter(
    (name) => !dxf.text.includes(`\r\n${name}\r\n`),
  );
  checks.push(
    check(
      "QA-DXF-LAYERS",
      "dxf",
      "표준 레이어가 모두 정의됨",
      "Every standard layer is defined",
      missingLayers.length === 0,
      missingLayers.length === 0
        ? `${REQUIRED_LAYERS.length}개 레이어 정의됨`
        : `누락: ${missingLayers.join(", ")}`,
    ),
  );

  const missingBlocks = REQUIRED_BLOCKS.filter((name) => !dxf.text.includes(name));
  checks.push(
    check(
      "QA-DXF-BLOCKS",
      "dxf",
      "블록 정의 존재",
      "Blocks defined",
      missingBlocks.length === 0,
      missingBlocks.length === 0
        ? REQUIRED_BLOCKS.join(", ")
        : `누락: ${missingBlocks.join(", ")}`,
    ),
  );

  checks.push(
    check(
      "QA-DXF-UNITS",
      "dxf",
      "단위가 밀리미터로 선언됨",
      "Units declared as millimetres",
      /\$INSUNITS\r\n70\r\n4\r\n/.test(dxf.text),
      "$INSUNITS = 4 (mm), $MEASUREMENT = 1 (metric)",
    ),
  );

  checks.push(
    check(
      "QA-DXF-TEXT",
      "dxf",
      "문자 엔티티 존재",
      "Text entities present",
      (dxf.entityCounts.TEXT ?? 0) > 0,
      `TEXT ${dxf.entityCounts.TEXT ?? 0}개`,
    ),
  );

  checks.push(
    check(
      "QA-DXF-DIMS",
      "dxf",
      "치수 엔티티 존재",
      "Dimension entities present",
      (dxf.entityCounts.DIMENSION ?? 0) > 0,
      `DIMENSION ${dxf.entityCounts.DIMENSION ?? 0}개 (각각 익명 블록 *D n 을 참조)`,
    ),
  );

  checks.push(
    skip(
      "QA-DXF-LAYOUTS",
      "dxf",
      "페이퍼스페이스 레이아웃",
      "Paper-space layouts",
      "레이아웃 객체는 생성하지 않았습니다. 시트 테두리·표제란은 SHEET 레이어에 모델스페이스로 작도되어 있습니다.",
    ),
  );

  /* ---- round trip ---------------------------------------------------- */

  let reparsed: ReturnType<typeof parseDxfText> | null = null;
  try {
    reparsed = parseDxfText(dxf.text);
  } catch (err) {
    checks.push(
      check(
        "QA-RT-REOPEN",
        "round-trip",
        "DXF 재열기",
        "DXF reopens",
        false,
        err instanceof Error ? err.message : String(err),
      ),
    );
  }

  if (reparsed) {
    const fatal = reparsed.warnings.filter((w) => w.startsWith("DXF parse failed"));
    checks.push(
      check(
        "QA-RT-REOPEN",
        "round-trip",
        "DXF 재열기",
        "DXF reopens",
        fatal.length === 0,
        fatal.length === 0
          ? `앱의 DXF 리더로 재열기 성공 · 후보 외곽 ${reparsed.candidates.length}개`
          : fatal.join("; "),
      ),
    );

    checks.push(
      check(
        "QA-RT-UNITS",
        "round-trip",
        "재열기 단위 스케일",
        "Unit scale survives the round trip",
        Math.abs(reparsed.unitScaleToMeters - 0.001) < 1e-9,
        `unitScaleToMeters = ${reparsed.unitScaleToMeters}`,
      ),
    );

    const outline = reparsed.candidates.find((c) => /^bim[_-]?outline$/i.test(c.layer));
    if (outline) {
      const delta = outline.areaSqm - model.footprint.areaSqm;
      const pct =
        model.footprint.areaSqm > 0
          ? (delta / model.footprint.areaSqm) * 100
          : 0;
      checks.push(
        check(
          "QA-RT-AREA",
          "round-trip",
          "재열기 외곽 면적 일치",
          "Reopened outline area matches the model",
          Math.abs(pct) < 0.5,
          `모델 ${model.footprint.areaSqm.toFixed(2)} m² / 재열기 ${outline.areaSqm.toFixed(2)} m² (${pct.toFixed(3)}%)`,
        ),
      );
      checks.push(
        check(
          "QA-RT-VERTS",
          "round-trip",
          "재열기 정점 수 일치",
          "Reopened vertex count matches",
          outline.vertexCount === model.footprint.ring.length,
          `모델 ${model.footprint.ring.length} / 재열기 ${outline.vertexCount}`,
        ),
      );

      const modelBox = bbox(model.footprint.ring);
      const rtBox = bbox(outline.polygon.map(([x, y]) => [x * 1000, y * 1000]));
      const wOk = Math.abs(rtBox.widthMm - modelBox.widthMm) < 2;
      const hOk = Math.abs(rtBox.heightMm - modelBox.heightMm) < 2;
      checks.push(
        check(
          "QA-RT-BBOX",
          "round-trip",
          "재열기 외곽 치수 일치",
          "Reopened bounding box matches",
          wOk && hOk,
          `모델 ${(modelBox.widthMm / 1000).toFixed(3)} × ${(modelBox.heightMm / 1000).toFixed(3)} m / ` +
            `재열기 ${(rtBox.widthMm / 1000).toFixed(3)} × ${(rtBox.heightMm / 1000).toFixed(3)} m`,
        ),
      );
    } else {
      checks.push(
        check(
          "QA-RT-AREA",
          "round-trip",
          "재열기 외곽 면적 일치",
          "Reopened outline area matches the model",
          false,
          "BIM_OUTLINE 레이어의 외곽선을 재열기에서 찾지 못했습니다",
        ),
      );
    }
  }

  return checks;
}

/**
 * What to measure next, ranked by how much uncertainty each measurement
 * removes from this specific reconstruction.
 */
export function fieldVerificationPlan(
  model: ReconstructionModel,
): FieldVerificationItem[] {
  const items: Array<Omit<FieldVerificationItem, "rank">> = [];

  if (model.footprint.grade === "D-INFERRED" || model.footprint.grade === "X-UNRESOLVED") {
    items.push({
      measurement: "건물 전체 폭과 깊이",
      reason: `외곽 형상이 ${model.footprint.grade} 상태입니다 — 면적만 맞춰진 직사각형입니다`,
      eliminates: "모든 평면·입면·단면의 형상 불확실성",
      method: "레이저 거리계로 외벽 모서리 간 거리 측정 (4변)",
    });
  } else if (model.footprint.grade === "B-OBSERVED") {
    items.push({
      measurement: "1층 외벽 모서리 좌표",
      reason: "GIS 외곽은 관측값이지만 치수 검증되지 않았습니다",
      eliminates: "지붕 투영 대 벽면 차이",
      method: "모서리 2점 이상 실측 후 폴리곤 정합",
    });
  }

  const f2f = model.levels[0]?.floorToFloorGrade;
  if (f2f === "D-INFERRED") {
    items.push({
      measurement: "층별 바닥-바닥 높이",
      reason: "대장 높이가 없어 연대표 값을 사용했습니다",
      eliminates: "전체 높이·입면·단면·계단 기하",
      method: "계단실에서 층별 높이 실측",
    });
  }

  if (model.core) {
    items.push({
      measurement: "계단실·승강기 위치와 크기",
      reason: "코어는 전적으로 추정입니다 (D-INFERRED)",
      eliminates: "순면적, 실 배치, 단면 계획",
      method: "각 층 코어 외벽 4점 측정",
    });
  }

  const unresolvedLevels = model.levels.filter((l) => l.plateGrade === "X-UNRESOLVED");
  if (unresolvedLevels.length > 0) {
    items.push({
      measurement: `${unresolvedLevels.map((l) => l.name).join(", ")} 외곽`,
      reason: "등록 면적과 1층 외곽이 정합하지 않습니다",
      eliminates: "해당 층의 면적 모순",
      method: "해당 층 외벽 실측 또는 항공사진 대조",
    });
  }

  items.push({
    measurement: "외벽 개구부 위치와 크기",
    reason: "창은 연대별 창면적비로 배분한 추정입니다",
    eliminates: "입면 정합, 일사·열손실 추정",
    method: "정면 사진 측정 또는 개구부 실측",
  });

  if (model.grid.columns.length > 0) {
    items.push({
      measurement: "실내 기둥 위치",
      reason: "구조 그리드는 구조형식에서 추정한 값입니다",
      eliminates: "구조 스팬 가정",
      method: "실내에서 기둥 중심 간 거리 측정",
    });
  }

  if (model.site.grade === "D-INFERRED") {
    items.push({
      measurement: "대지 경계",
      reason: "대지면적만 있고 필지 형상이 없습니다",
      eliminates: "배치도, 이격거리",
      method: "지적도 열람 또는 경계복원측량",
    });
  }

  for (const conflict of model.conflicts) {
    if (conflict.resolutionStatus === "unresolved") {
      items.push({
        measurement: conflict.requiredVerification,
        reason: `${conflict.id} ${conflict.subject} 불일치 (${conflict.magnitude})`,
        eliminates: "출처 간 모순",
        method: conflict.requiredVerification,
      });
    }
  }

  return items.map((item, i) => ({ ...item, rank: i + 1 }));
}

export function qaSummary(checks: readonly QaCheck[]): {
  pass: number;
  fail: number;
  skip: number;
  ok: boolean;
} {
  const pass = checks.filter((c) => c.status === "PASS").length;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  const skipped = checks.filter((c) => c.status === "SKIP").length;
  return { pass, fail, skip: skipped, ok: fail === 0 };
}
