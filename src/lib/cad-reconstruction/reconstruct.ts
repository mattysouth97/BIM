// src/lib/cad-reconstruction/reconstruct.ts
//
// Evidence → geometric controls → one canonical building model.
//
// Everything downstream (DXF, elevations, sections, reports, the twin
// footprint) is generated FROM this model, so the drawings cannot disagree
// with each other. The model is the single source of geometry.
//
// Ordering rule, applied throughout: a higher-confidence control constrains
// lower-confidence geometry, never the reverse. An observed outline is not
// rescaled to hit a registered area — the disagreement is recorded instead.

import {
  FLOOR_HEIGHTS,
  WALL_LAYERS,
  WINDOW_RATIOS,
} from "@/lib/korean-building-codes";
import {
  ledgerFloorHeightCategory,
  ledgerUseCategory,
} from "@/lib/ledger/floor-rows";
import type { BuildingEra } from "@/lib/material-types";

import {
  aggregateFloors,
  buildControls,
  buildSourceInventory,
  controlValue,
  detectConflicts,
  eraOf,
  prepareGisRing,
  projectRingToMm,
  statedNumber,
  structureKeyOf,
  type ControlContext,
  type FloorAggregate,
} from "./evidence";
import { claimOf } from "./claims";
import {
  areaSqm,
  bbox,
  centroid,
  edgeFacing,
  longestEdgeIndex,
  offsetRingInward,
  pointInRing,
  rectRing,
  roundRing,
  scaleAbout,
  toCounterClockwise,
} from "./geometry";
import {
  chooseSetbackFace,
  insetEdgeToArea,
  type SetbackChoice,
} from "./setback";
import {
  OSM_SOURCE_ID,
  osmOutlineRing,
  osmReference,
} from "./osm-source";
import {
  reconcileOutlines,
  type OutlineCandidate,
} from "./outline-candidates";
import { regularizeRing } from "./outline-regularize";
import type {
  AreaValidationRow,
  OutlineRegularization,
  AssumptionEntry,
  ConflictEntry,
  EvidenceGrade,
  EvidenceInput,
  Orientation,
  PointMm,
  ReconCore,
  ReconElevation,
  ReconGrid,
  ReconLevel,
  ReconOpening,
  ReconSection,
  ReconWall,
  ReconstructionModel,
  RingMm,
} from "./types";
import { RECONSTRUCTION_MODEL_VERSION, weakerGrade } from "./types";

/** Structural bay by structure system, millimetres. Inference, not evidence. */
const BAY_MM: Record<string, number> = {
  rc: 6000,
  src: 7200,
  steel: 8400,
  masonry: 4500,
  timber: 3600,
};

const COLUMN_MM: Record<string, number> = {
  rc: 600,
  src: 700,
  steel: 400,
  masonry: 0,
  timber: 200,
};

/** Core area as a share of the plate, by use family. */
const CORE_RATIO: Record<string, number> = {
  residential: 0.12,
  office: 0.18,
  retail: 0.1,
  factory: 0.05,
  default: 0.15,
};

const SILL_MM = 900;
const HEAD_CLEARANCE_MM = 600;
const DOOR_WIDTH_MM = 1800;
const DOOR_HEIGHT_MM = 2100;
const MIN_OPENING_EDGE_MM = 1500;
const MAX_PLATE_DEPTH_M = 18;
const MAX_PLATE_ASPECT = 2.5;
/** Per-floor area tolerance for a conceptual reconstruction. */
const AREA_TOLERANCE_SQM = 1.0;
const AREA_TOLERANCE_PCT = 2.0;

export interface ProjectFn {
  (lng: number, lat: number): [number, number];
}

export interface ReconstructOptions {
  /**
   * WGS84 → local metres. Injected so this module holds no proj4 dependency
   * and stays unit-testable without a coordinate library.
   */
  project?: (originLng: number, originLat: number) => ProjectFn;
}

function wallThicknessMm(structureKey: string): number {
  const layers = WALL_LAYERS[structureKey] ?? WALL_LAYERS.rc;
  const total = layers.reduce((s, l) => s + l.thickness, 0);
  return Math.round(total / 10) * 10;
}

function ringCentroidLngLat(ring: number[][]): [number, number] | null {
  const valid = ring.filter(
    (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  if (valid.length === 0) return null;
  const lng = valid.reduce((s, p) => s + p[0], 0) / valid.length;
  const lat = valid.reduce((s, p) => s + p[1], 0) / valid.length;
  return [lng, lat];
}

/**
 * Solve a rectangular plate for a known area. Plate depth is kept within the
 * daylight-reasonable maximum where the area allows it, and the aspect ratio is
 * capped so a large area does not degenerate into a corridor.
 */
export function solvePlateForArea(targetSqm: number): {
  widthMm: number;
  depthMm: number;
} {
  const byDaylight = Math.min(
    MAX_PLATE_DEPTH_M,
    Math.max(6, Math.sqrt(targetSqm / 1.5)),
  );
  const byAspect = Math.sqrt(targetSqm / MAX_PLATE_ASPECT);
  const depth = Math.max(byDaylight, byAspect);
  const width = targetSqm / depth;
  return { widthMm: Math.round(width * 1000), depthMm: Math.round(depth * 1000) };
}

function resolveUseCategory(mainPurpsCd: string | undefined): string {
  return ledgerUseCategory((mainPurpsCd ?? "").trim());
}

function eraFloorHeightM(era: BuildingEra, mainPurpsCd: string | undefined): number {
  const cat = ledgerFloorHeightCategory((mainPurpsCd ?? "").trim());
  return FLOOR_HEIGHTS[era]?.[cat] ?? 3.2;
}

function wwrFor(era: BuildingEra, mainPurpsCd: string | undefined): number {
  const cat = resolveUseCategory(mainPurpsCd) as keyof (typeof WINDOW_RATIOS)[BuildingEra];
  const table = WINDOW_RATIOS[era];
  return table?.[cat] ?? table?.default ?? 0.3;
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

export function reconstruct(
  input: EvidenceInput,
  options: ReconstructOptions = {},
): ReconstructionModel {
  const now = input.now ?? new Date().toISOString();
  const title = input.title;
  const assumptions: AssumptionEntry[] = [];
  const blockers: string[] = [];
  let assumptionSeq = 0;

  const assume = (entry: Omit<AssumptionEntry, "id" | "status">) => {
    assumptionSeq += 1;
    assumptions.push({
      ...entry,
      id: `ASSUMPTION-${String(assumptionSeq).padStart(3, "0")}`,
      status: "open",
    });
  };

  /* --- frame + observed rings -------------------------------------- */

  const gisRingRaw = input.gis?.polygon?.[0] ?? null;
  const osmRingRaw = osmOutlineRing(input.osm ?? null);
  // The frame is anchored on the government outline when there is one, so a
  // building's local coordinates do not shift as OSM coverage changes. OSM
  // only supplies the origin when it is the sole ring available.
  const originLngLat = ringCentroidLngLat(gisRingRaw ?? osmRingRaw ?? []);

  let gisRingMm: RingMm | null = null;
  let osmRingMm: RingMm | null = null;
  if (originLngLat && options.project) {
    try {
      const project = options.project(originLngLat[0], originLngLat[1]);
      // Both rings are projected through the SAME origin, which is what makes
      // them comparable at all — reconciling them in different frames would
      // measure the projection difference rather than the buildings.
      if (gisRingRaw) gisRingMm = prepareGisRing(projectRingToMm(gisRingRaw, project));
      if (osmRingRaw) osmRingMm = prepareGisRing(projectRingToMm(osmRingRaw, project));
    } catch {
      // A coordinate outside the supported bounds is evidence we cannot use,
      // not a reason to fail the whole reconstruction.
      gisRingMm = null;
      osmRingMm = null;
    }
  }
  const gisIsParcel = input.gis?.source === "parcel";
  const osmRef = osmReference(input.osm ?? null);

  const ctx: ControlContext = {
    gisRing: gisRingMm,
    gisRingIsParcel: gisIsParcel,
    origin: originLngLat,
  };

  const sources = buildSourceInventory(input);
  const controls = buildControls(input, ctx);
  const conflicts: ConflictEntry[] = detectConflicts(input, ctx);
  const era = eraOf(input);
  const buildingEra = era.era as BuildingEra;
  const structureKey = structureKeyOf(title?.strctCd, title?.strctCdNm);
  const mainPurpsCd = title?.mainPurpsCd;

  if (!era.resolved) {
    assume({
      element: "건축 연대",
      floor: "all",
      assumption: `사용승인일/허가일이 없어 ${era.era} 연대표를 사용`,
      reason:
        "연대는 층고·창면적비·벽 구성 가정을 모두 좌우하므로 미해결 상태를 표시해야 합니다",
      sourceContext: "SRC-REG-TITLE (useAprDay, pmsDay 모두 비어 있음)",
      confidence: "X-UNRESOLVED",
      impactIfWrong: "층고, 창 크기, 외벽 두께가 모두 이동합니다",
      verificationMethod: "건축물대장 원본 또는 준공도서에서 사용승인일 확인",
    });
  }

  /* --- footprint --------------------------------------------------- */
  //
  // Every outline the evidence scan found is offered as a candidate and the
  // winner is reconciled against the others, rather than taken from whichever
  // if/else branch happened to match first. outline-candidates.ts holds the
  // three rules: a site ring is never a footprint, observed always outranks
  // solved, and a losing observed ring keeps its geometry on a conflict entry.

  const c2 = controlValue(controls, "C2");
  const archArea = statedNumber(title?.archArea);
  // Read from the CLAIMS, not from C5/C6: those controls also carry GIS-derived
  // values, and sourcing a "user stated" rectangle from them once attributed a
  // cadastral lot to a user who had said nothing.
  const widthClaim = claimOf(input.claims, "overall_width_m");
  const depthClaim = claimOf(input.claims, "overall_depth_m");

  const candidates: OutlineCandidate[] = [];

  // A lot observed ALONGSIDE a building outline. `gis` holds one ring and it
  // is either the building or the lot; this is the case where both exist.
  // It enters here as site-only so `reconcileOutlines` owns every ring —
  // Rule 1 keeps it out of the footprint, and `siteCandidates` carries it to
  // the setback. Skipped when `gis` already supplied a parcel, so one lot
  // never appears twice.
  if (!gisIsParcel && input.parcel?.polygon?.[0] && originLngLat && options.project) {
    try {
      const project = options.project(originLngLat[0], originLngLat[1]);
      const prepared = prepareGisRing(
        projectRingToMm(input.parcel.polygon[0], project),
      );
      const lot = prepared ? toCounterClockwise(roundRing(prepared)) : null;
      if (lot && lot.length >= 3) {
        candidates.push({
          id: "OUT-PARCEL-ALT",
          origin: "gis_parcel",
          sourceId: "SRC-GIS-PARCEL",
          labelKo: "VWorld 연속지적도 필지 경계 (건물 외곽과 병행)",
          ring: lot,
          areaSqm: areaSqm(lot),
          grade: "B-OBSERVED",
          observed: true,
          siteOnly: true,
          method: "연속지적도 필지 경계 — 대지 참조 전용",
        });
      }
    } catch {
      // A lot we cannot project is a lot we do not have. The setback then
      // reports its direction undetermined, which is the honest outcome.
    }
  }

  if (gisRingMm) {
    const ring = toCounterClockwise(roundRing(gisRingMm));
    candidates.push(
      gisIsParcel
        ? {
            id: "OUT-PARCEL",
            origin: "gis_parcel",
            sourceId: "SRC-GIS-PARCEL",
            labelKo: "VWorld 연속지적도 필지 경계",
            ring,
            areaSqm: areaSqm(ring),
            grade: "B-OBSERVED",
            observed: true,
            siteOnly: true,
            method: "연속지적도 필지 경계 — 대지 참조 전용",
          }
        : {
            id: "OUT-GIS",
            origin: "gis_building",
            sourceId: "SRC-GIS-BLDG",
            labelKo: "VWorld GIS 건물 외곽",
            ring,
            areaSqm: areaSqm(ring),
            grade: "B-OBSERVED",
            observed: true,
            siteOnly: false,
            method:
              "GIS건물통합정보 외곽을 부지 중심 횡메르카토르로 투영 후 측량 잡음 정리",
          },
    );
  }

  if (osmRingMm) {
    const ring = toCounterClockwise(roundRing(osmRingMm));
    candidates.push({
      id: "OUT-OSM",
      origin: "osm_building",
      sourceId: OSM_SOURCE_ID,
      labelKo: osmRef ? `OpenStreetMap 건물 외곽 (${osmRef})` : "OpenStreetMap 건물 외곽",
      ring,
      areaSqm: areaSqm(ring),
      grade: "B-OBSERVED",
      observed: true,
      siteOnly: false,
      method: "OpenStreetMap 기여자가 항공영상에서 추적한 외곽을 동일 원점으로 투영",
    });
  }

  if (widthClaim && depthClaim) {
    const w = Math.round(Number(widthClaim.value) * 1000);
    const d = Math.round(Number(depthClaim.value) * 1000);
    if (Number.isFinite(w) && Number.isFinite(d) && w > 0 && d > 0) {
      const ring = rectRing([0, 0], w, d);
      candidates.push({
        id: "OUT-USER",
        origin: "user_dimensions",
        sourceId: "SRC-USER",
        labelKo: "사용자 진술 치수",
        ring,
        areaSqm: areaSqm(ring),
        grade: weakerGrade(widthClaim.grade, depthClaim.grade),
        // Only a stated MEASUREMENT is an observation; a recollection is not.
        observed: widthClaim.measured && depthClaim.measured,
        siteOnly: false,
        method: "사용자가 진술한 전체 폭 × 깊이의 직사각형",
      });
    }
  }

  if (typeof c2?.value === "number" && c2.value > 0) {
    const solved = solvePlateForArea(c2.value);
    const ring = rectRing([0, 0], solved.widthMm, solved.depthMm);
    candidates.push({
      id: "OUT-AREA",
      origin: "register_area",
      sourceId: "SRC-REG-TITLE",
      labelKo: "건축면적 해석 직사각형",
      ring,
      areaSqm: areaSqm(ring),
      grade: "D-INFERRED",
      observed: false,
      siteOnly: false,
      method: `건축면적 ${c2.value.toFixed(1)} m²를 만족하도록 해석한 직사각형 (깊이 <= ${MAX_PLATE_DEPTH_M} m, 종횡비 <= ${MAX_PLATE_ASPECT}:1)`,
    });
  }

  const outlines = reconcileOutlines(candidates, { registeredFootprintSqm: archArea });
  conflicts.push(...outlines.conflicts);

  const chosenOutline = outlines.chosen;
  let footprintRing: RingMm | null = chosenOutline ? chosenOutline.ring : null;
  const footprintGrade: EvidenceGrade = chosenOutline?.grade ?? "X-UNRESOLVED";
  let footprintMethod = outlines.rationale;

  // Squaring up only makes sense on a TRACED outline. A solved rectangle is
  // already orthogonal, and a user's stated box carries no digitising noise.
  let regularization: OutlineRegularization | null = null;
  if (footprintRing && chosenOutline?.observed && !chosenOutline.siteOnly) {
    const squared = regularizeRing(footprintRing);
    regularization = {
      applied: squared.applied,
      rotationDeg: squared.rotationDeg,
      maxShiftMm: squared.maxShiftMm,
      areaDeltaPct: squared.areaDeltaPct,
      orthogonality: squared.orthogonality,
      reason: squared.reason,
    };
    if (squared.applied) {
      footprintRing = squared.ring;
      footprintMethod = `${footprintMethod} ${squared.reason}.`;
      assume({
        element: "외곽선 정형화",
        floor: "1F",
        assumption: `건물 축 ${squared.rotationDeg.toFixed(1)}°에 맞춰 벽면을 직각으로 정리 (최대 ${Math.round(squared.maxShiftMm)} mm 이동)`,
        reason:
          "관측 외곽은 항공영상에서 디지타이징된 선이라 모서리마다 수백 mm의 오차가 있습니다. " +
          "정리하지 않으면 실재하지 않는 사선 벽이 도면에 그대로 남습니다",
        sourceContext: `${chosenOutline.sourceId} + outline-regularize`,
        confidence: "C-CALCULATED",
        impactIfWrong: "벽 길이와 방위가 최대 이동량만큼 달라집니다",
        verificationMethod: "외벽 모서리 좌표 실측",
      });
    }
  }

  if (chosenOutline?.origin === "gis_building") {
    assume({
      element: "외곽선",
      floor: "1F",
      assumption: "GIS 건물 외곽을 지상 1층 외벽 외면으로 사용",
      reason:
        "GIS 외곽은 지붕 투영선일 수 있으나 이 건물에 대해 관측된 유일한 형상입니다",
      sourceContext: "SRC-GIS-BLDG",
      confidence: "B-OBSERVED",
      impactIfWrong: "모든 층의 평면 형상과 외피 면적이 이동합니다",
      verificationMethod: "1층 외벽 모서리 좌표 실측",
    });
  } else if (chosenOutline?.origin === "osm_building") {
    assume({
      element: "외곽선",
      floor: "1F",
      assumption: `OpenStreetMap 외곽(${osmRef ?? "출처 미상"})을 지상 1층 외벽 외면으로 사용`,
      reason:
        "정부 GIS 외곽을 얻지 못했습니다. OSM 외곽은 기여자가 항공영상에서 추적한 관측 형상이며, " +
        "측량 성과가 아니고 갱신 시점이 대장과 다를 수 있습니다",
      sourceContext: OSM_SOURCE_ID,
      confidence: "B-OBSERVED",
      impactIfWrong: "모든 층의 평면 형상과 외피 면적이 이동합니다",
      verificationMethod: "1층 외벽 모서리 좌표 실측 또는 GIS 외곽 재수집",
    });
  } else if (chosenOutline?.origin === "user_dimensions") {
    assume({
      element: "외곽선",
      floor: "1F",
      assumption: "진술된 폭·깊이로 직사각형 외곽을 구성",
      reason: "형상 자체에 대한 관측 증거가 없어 직사각형 외에는 선택할 수 없습니다",
      sourceContext: "SRC-USER",
      confidence: "D-INFERRED",
      impactIfWrong: "돌출부·요철이 누락되어 외피 면적이 과소평가됩니다",
      verificationMethod: "외곽 둘레 실측 또는 항공사진 트레이싱",
    });
  } else if (chosenOutline?.origin === "register_area") {
    assume({
      element: "외곽선",
      floor: "1F",
      assumption: chosenOutline.method,
      reason:
        "면적만 검증되어 있고 형상 증거가 없습니다. 면적은 계산값이지만 형상은 추정입니다",
      sourceContext: `SRC-REG-TITLE / C2 (${c2?.grade ?? "X-UNRESOLVED"})`,
      confidence: "D-INFERRED",
      impactIfWrong: "평면 비례와 외피 면적이 달라집니다 (면적은 유지)",
      verificationMethod: "정면 폭과 측면 깊이 실측",
    });
  }

  if (!footprintRing) {
    blockers.push(
      outlines.siteCandidates.length > 0
        ? "필지 경계만 확보되었습니다. 필지는 건물 외곽이 아니므로 외곽선을 만들 수 없습니다."
        : "건축면적·GIS 외곽·사용자 치수 중 어느 것도 없어 외곽선을 만들 수 없습니다.",
    );
    // A placeholder square keeps the downstream code total, but it is graded
    // as unresolved and the blocker above stops it being offered as a drawing.
    footprintMethod =
      "증거 없음 — 파이프라인을 완주시키기 위한 자리표시 사각형입니다. 도면으로 사용할 수 없습니다.";
  }

  const footprint = footprintRing ?? rectRing([0, 0], 10000, 10000);
  const footprintCcw = toCounterClockwise(roundRing(footprint));
  const footprintArea = areaSqm(footprintCcw);
  // (footprint bbox is derived per-sheet in the writer; not needed here)
  const footprintCentre = centroid(footprintCcw);

  /* --- site -------------------------------------------------------- */

  const platArea = statedNumber(title?.platArea);
  let siteRing: RingMm | null = null;
  let siteGrade: EvidenceGrade = "X-UNRESOLVED";
  let siteNote = "대지 경계 증거가 없습니다";
  if (gisRingMm && gisIsParcel) {
    siteRing = gisRingMm;
    siteGrade = "B-OBSERVED";
    siteNote = "연속지적도 필지 경계 (건물 외곽이 아님)";
  } else if (platArea) {
    const side = Math.sqrt(platArea) * 1000;
    siteRing = rectRing(footprintCentre, side, side);
    siteGrade = "D-INFERRED";
    siteNote =
      "대지면적만 기재되어 있어 건물을 중심에 둔 정사각형 대지로 표시 — 실제 필지 형상이 아님";
    assume({
      element: "대지 경계",
      floor: "site",
      assumption: `대지면적 ${platArea.toFixed(1)} m²의 정사각형을 건물 중심에 배치`,
      reason: "필지 형상 증거가 없어 면적만 재현했습니다",
      sourceContext: "SRC-REG-TITLE (platArea)",
      confidence: "D-INFERRED",
      impactIfWrong: "이격거리·배치도가 실제와 다릅니다",
      verificationMethod: "지적도 또는 경계복원측량",
    });
  }

  /* --- levels ------------------------------------------------------ */

  const floorRows = aggregateFloors(String(title?.mgmBldrgstPk ?? ""), input.floors);
  const grnd = statedNumber(title?.grndFlrCnt);
  const ugrndRaw = Number(title?.ugrndFlrCnt);
  const ugrnd = Number.isFinite(ugrndRaw) && ugrndRaw > 0 ? ugrndRaw : 0;
  const totArea = statedNumber(title?.totArea);

  const c8 = controlValue(controls, "C8");
  const f2fM =
    typeof c8?.value === "number" && c8.value > 0
      ? c8.value
      : eraFloorHeightM(buildingEra, mainPurpsCd);
  const f2fMm = Math.round(f2fM * 1000);
  const f2fGrade: EvidenceGrade = c8?.grade ?? "D-INFERRED";
  if (f2fGrade === "D-INFERRED") {
    assume({
      element: "층고",
      floor: "all",
      assumption: `${f2fM.toFixed(2)} m`,
      reason: `대장 높이가 없어 ${era.era} 연대·용도별 관행값을 사용`,
      sourceContext: "SRC-CODE-ERA (FLOOR_HEIGHTS)",
      confidence: "D-INFERRED",
      impactIfWrong: "입면·단면·전체 높이·계단 단수가 모두 달라집니다",
      verificationMethod: "실내 바닥-바닥 높이 실측",
    });
  }

  const levelSpecs = resolveLevelSpecs(floorRows, grnd, ugrnd, totArea);
  if (levelSpecs.synthetic && levelSpecs.specs.length > 0) {
    assume({
      element: "층 구성",
      floor: "all",
      assumption: `${levelSpecs.specs.length}개 층을 연면적 균등 분할로 생성`,
      reason: "층별개요를 읽지 못해 층별 면적을 개별 확인할 수 없었습니다",
      sourceContext: "SRC-REG-TITLE (totArea, grndFlrCnt)",
      confidence: "C-CALCULATED",
      impactIfWrong: "층별 면적 차이(필로티·후퇴)가 반영되지 않습니다",
      verificationMethod: "층별개요 재수집 또는 층별 실측",
    });
  }

  // P2-31: the parcel ring, when one was supplied alongside a building
  // outline. Projected with the SAME origin as the footprint so the two rings
  // share a frame; a parcel in a different frame would report nonsense slack.
  // The lot ring the setback reads its slack from. `reconcileOutlines` already
  // separates site-only rings from footprint candidates and projects them into
  // this frame, so there is one mechanism for "which rings does this building
  // have" rather than two. Prefer an observed lot over a solved one, then the
  // largest — a real cadastral parcel outranks a square derived from 대지면적.
  const siteCandidate =
    [...outlines.siteCandidates]
      .filter((c) => c.ring.length >= 3)
      .sort(
        (a, b) =>
          Number(b.observed) - Number(a.observed) || b.areaSqm - a.areaSqm,
      )[0] ?? null;

  // P2-31: one setback decision for the whole stack, taken from evidence —
  // 용도지역 (VWorld LT_C_UQ111) plus the slack the parcel actually shows.
  // The rule picks the FACE; 층별개요 already fixed how much comes off it.
  const setbackChoice = chooseSetbackFace({
    footprint: footprintCcw,
    // ONLY a lot that was actually observed. The square solved from 대지면적 is
    // not a lot — its own note says 실제 필지 형상이 아님 — and feeding it here
    // used to manufacture evidence: an off-centre or L-shaped footprint shows
    // "slack" against that square, and the ledger then read
    // "필지에서 south 측으로 1.7 m의 여유가 관측되어" citing SRC-GIS-PARCEL for a
    // parcel nobody fetched. No observed lot means the direction is
    // undetermined, which is the honest answer. A site ring is never a
    // footprint candidate (`reconcileOutlines` Rule 1), so this cannot leak a
    // lot into the plan either.
    parcel: siteCandidate?.observed ? siteCandidate.ring : null,
    district: input.zoning?.district ?? null,
  });
  if (setbackChoice.reason === "undetermined") {
    assume({
      element: "후퇴 방향",
      floor: "all",
      assumption: "층별 면적 축소를 중심 기준 균등 축소로 처리",
      reason: setbackChoice.note,
      sourceContext: setbackChoice.district
        ? `SRC-GIS-ZONING (${setbackChoice.district})`
        : "SRC-GIS-PARCEL / SRC-GIS-ZONING 모두 없음",
      confidence: "D-INFERRED",
      impactIfWrong:
        "층별 면적은 맞지만 방위별 외벽 면적과 일사 취득이 실제와 달라집니다",
      verificationMethod: "후퇴가 일어난 면을 현장 또는 항공사진으로 확인",
    });
  } else {
    assume({
      element: "후퇴 방향",
      floor: "all",
      assumption: `${setbackChoice.facing} 면으로 후퇴`,
      reason: setbackChoice.note,
      sourceContext:
        setbackChoice.reason === "daylight_setback"
          ? `건축법 시행령 제86조 + SRC-GIS-ZONING (${setbackChoice.district})`
          : `${siteCandidate?.sourceId ?? "SRC-GIS-PARCEL"} (필지 여유 형상)`,
      // Reached only when a lot was observed — see the `parcel` note above.
      confidence: "D-INFERRED",
      impactIfWrong: "후퇴 면이 다르면 방위별 외벽 면적과 일사 취득이 달라집니다",
      verificationMethod: "후퇴가 일어난 면을 현장 또는 항공사진으로 확인",
    });
  }

  const levels: ReconLevel[] = [];
  let elevationMm = 0;
  const below = levelSpecs.specs.filter((s) => s.below);
  const above = levelSpecs.specs.filter((s) => !s.below);

  // Below-grade levels stack downward from ±0.000.
  let belowElevation = 0;
  for (const spec of below) {
    belowElevation -= f2fMm;
    levels.push(
      makeLevel(spec, belowElevation, f2fMm, f2fGrade, footprintCcw, footprintArea, platArea, conflicts, setbackChoice),
    );
  }
  levels.reverse();

  for (const spec of above) {
    levels.push(
      makeLevel(spec, elevationMm, f2fMm, f2fGrade, footprintCcw, footprintArea, platArea, conflicts, setbackChoice),
    );
    elevationMm += f2fMm;
  }
  levels.sort((a, b) => a.elevationMm - b.elevationMm);

  const aboveLevels = levels.filter((l) => !l.below);
  const totalHeightMm =
    aboveLevels.length > 0
      ? aboveLevels[aboveLevels.length - 1].elevationMm + f2fMm
      : f2fMm;

  for (const level of levels) {
    if (level.plateScale !== 1 && level.registeredAreaSqm !== null) {
      assume({
        element: "층 외곽",
        floor: level.name,
        assumption: `1층 외곽을 ${level.plateScale.toFixed(3)}배 균등 축척하여 등록 면적 ${level.registeredAreaSqm.toFixed(1)} m²에 맞춤`,
        reason:
          "층별 형상 증거가 없어, 검증된 면적을 만족시키되 형상은 1층에서 파생시켰습니다",
        sourceContext: "SRC-REG-FLOORS",
        confidence: "D-INFERRED",
        impactIfWrong: "후퇴·돌출 위치가 실제와 다릅니다 (면적은 일치)",
        verificationMethod: "해당 층 평면 실측 또는 항공사진 확인",
      });
    }
  }

  /* --- exterior walls ---------------------------------------------- */

  const wallMm = wallThicknessMm(structureKey);
  assume({
    element: "외벽 두께",
    floor: "all",
    assumption: `${wallMm} mm (${structureKey} 복합 구성)`,
    reason:
      "대장은 구조 형식만 기재하므로 두께는 구조별 표준 벽 구성 합계에서 추정했습니다",
    sourceContext: "SRC-REG-TITLE (strctCdNm) + WALL_LAYERS",
    confidence: "D-INFERRED",
    impactIfWrong: "실내 순면적과 외피 면적이 층당 수 m² 이동합니다",
    verificationMethod: "창 개구부에서 벽 두께 실측",
  });

  const walls: ReconWall[] = [];
  const openings: ReconOpening[] = [];
  const wwr = wwrFor(buildingEra, mainPurpsCd);
  const bayMm = BAY_MM[structureKey] ?? 6000;

  const entranceControl = controlValue(controls, "C12");
  const entranceOrientation =
    typeof entranceControl?.value === "string" &&
    ["north", "east", "south", "west"].includes(entranceControl.value)
      ? (entranceControl.value as Orientation)
      : null;

  let openingSeq = 0;
  for (const level of levels) {
    const centreRing = offsetRingInward(level.plate, wallMm / 2) ?? level.plate;
    const plateCcw = toCounterClockwise(level.plate);
    const entranceEdge =
      level.elevationMm === 0
        ? pickEntranceEdge(plateCcw, entranceOrientation)
        : -1;

    for (let i = 0; i < centreRing.length; i++) {
      const a = centreRing[i];
      const b = centreRing[(i + 1) % centreRing.length];
      const wallId = `A-WALL-${level.id}-${String(i + 1).padStart(2, "0")}`;
      walls.push({
        id: wallId,
        levelId: level.id,
        centreline: [
          [Math.round(a[0]), Math.round(a[1])],
          [Math.round(b[0]), Math.round(b[1])],
        ],
        thicknessMm: wallMm,
        kind: "exterior",
        grade: weakerGrade(level.plateGrade, "D-INFERRED"),
      });

      const edgeLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (edgeLen < MIN_OPENING_EDGE_MM) continue;

      // Below-grade levels get no glazing; a basement window is a claim we
      // have no evidence for.
      if (!level.below) {
        const placed = placeWindowsOnEdge({
          a,
          b,
          edgeLen,
          bayMm,
          wwr,
          f2fMm,
          levelId: level.id,
          hostEdgeIndex: i,
          hostWallId: wallId,
          grade: weakerGrade(level.plateGrade, "D-INFERRED"),
          startSeq: openingSeq,
        });
        openingSeq += placed.length;
        openings.push(...placed);
      }

      if (i === entranceEdge) {
        openingSeq += 1;
        const t0 = 0.5 - DOOR_WIDTH_MM / 2 / edgeLen;
        const t1 = 0.5 + DOOR_WIDTH_MM / 2 / edgeLen;
        openings.push({
          id: `A-DOOR-D${String(openingSeq).padStart(3, "0")}`,
          levelId: level.id,
          type: "door",
          hostEdgeIndex: i,
          hostWallId: wallId,
          plan: [lerp(a, b, t0), lerp(a, b, t1)],
          widthMm: DOOR_WIDTH_MM,
          sillMm: 0,
          headMm: DOOR_HEIGHT_MM,
          grade: entranceOrientation ? "B-OBSERVED" : "D-INFERRED",
        });
      }
    }
  }

  assume({
    element: "창 개구부",
    floor: "above grade",
    assumption: `창면적비 ${(wwr * 100).toFixed(0)} % 를 각 외벽 면에 균등 배분`,
    reason: `${era.era} · ${resolveUseCategory(mainPurpsCd)} 연대표 값 — 대장은 창 정보를 기재하지 않습니다`,
    sourceContext: "SRC-CODE-ERA (WINDOW_RATIOS)",
    confidence: "D-INFERRED",
    impactIfWrong: "입면 개구부 위치·크기, 일사·열손실 추정이 달라집니다",
    verificationMethod: "정면 사진 또는 현장에서 개구부 실측",
  });
  if (!entranceOrientation) {
    assume({
      element: "주출입구",
      floor: "1F",
      assumption: "가장 긴 지상층 외벽 면 중앙에 배치",
      reason: "접도 방향 증거가 없습니다",
      sourceContext: "없음",
      confidence: "D-INFERRED",
      impactIfWrong: "배치도·동선·피난 검토가 달라집니다",
      verificationMethod: "현장 확인 또는 로드뷰",
    });
  }

  /* --- core -------------------------------------------------------- */

  const core = buildCore({
    levels,
    controls,
    useCategory: resolveUseCategory(mainPurpsCd),
    grnd,
    totArea,
  });
  if (core) {
    assume({
      element: "코어",
      floor: "all",
      assumption: `${core.areaSqm.toFixed(1)} m² 코어(계단 ${core.stairCount}개${core.hasElevator ? " + 승강기" : ""})를 전 층 동일 위치에 배치`,
      reason:
        "수직 동선은 반드시 존재하지만 위치·규모에 대한 도면 증거가 없습니다. 용도별 코어 비율로 산정했습니다",
      sourceContext: "SRC-CODE-ERA + C9/C10/C11",
      confidence: "D-INFERRED",
      impactIfWrong: "순면적, 실 배치, 단면 계획이 달라집니다",
      verificationMethod: "각 층 계단실·승강기 위치 실측",
    });
  }

  /* --- structural grid --------------------------------------------- */

  const grid = buildGrid({
    footprint: footprintCcw,
    bayMm,
    columnMm: COLUMN_MM[structureKey] ?? 500,
    core,
  });
  if (grid.columns.length > 0) {
    assume({
      element: "구조 그리드",
      floor: "all",
      assumption: `${(grid.bayXMm / 1000).toFixed(1)} × ${(grid.bayYMm / 1000).toFixed(1)} m 스팬, 기둥 ${grid.columnSizeMm} mm`,
      reason: `등록 구조형식(${structureKey})의 일반 스팬 — 구조도면 증거는 없습니다`,
      sourceContext: "SRC-REG-TITLE (strctCdNm)",
      confidence: "D-INFERRED",
      impactIfWrong: "기둥 위치가 실제와 다릅니다. 구조 검토 용도로 사용할 수 없습니다",
      verificationMethod: "실내 기둥 위치 실측",
    });
  }

  /* --- derived views ----------------------------------------------- */

  const elevations = buildElevations({
    levels,
    openings,
    totalHeightMm,
    f2fMm,
  });
  const sections = buildSections({
    levels,
    core,
    totalHeightMm,
    f2fMm,
  });

  /* --- area validation --------------------------------------------- */

  const areaValidation = buildAreaValidation({
    levels,
    footprintArea,
    archArea,
    totArea,
    platArea,
    siteRing,
  });

  const name =
    (title?.bldNm || "").trim() ||
    (title?.platPlcNm || "").trim() ||
    input.buildingPk;

  return {
    id: `RECON-${input.buildingPk || "unknown"}-R01`,
    schemaVersion: RECONSTRUCTION_MODEL_VERSION,
    revision: "R01",
    createdAt: now,
    building: {
      buildingPk: input.buildingPk,
      name,
      address: input.address ?? title?.platPlcNm ?? null,
      useType: title?.mainPurpsCdNm ?? null,
      structure: title?.strctCdNm ?? null,
      structureKey,
      era: era.era,
      eraResolved: era.resolved,
      approvalDate: era.approvalDate,
      storeysAbove: grnd,
      storeysBelow: ugrnd || null,
    },
    frame: {
      originLngLat,
      projection: originLngLat
        ? `+proj=tmerc +lat_0=${originLngLat[1]} +lon_0=${originLngLat[0]} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`
        : "local millimetre frame, no georeference",
      trueNorthDeg: 0,
      zDatum: "±0.000 = 지상 1층 바닥 마감면 (가정)",
      grade: originLngLat ? "C-CALCULATED" : "D-INFERRED",
    },
    sources,
    claims: input.claims,
    controls,
    site: {
      ring: siteRing ? roundRing(siteRing) : null,
      areaSqm: siteRing ? areaSqm(siteRing) : null,
      grade: siteGrade,
      note: siteNote,
    },
    footprint: {
      ring: footprintCcw,
      areaSqm: footprintArea,
      grade: footprintGrade,
      method: footprintMethod,
    },
    outlineScan: {
      // Site rings are included so the register shows what WAS found, not only
      // what was eligible — "a parcel answered and a building did not" is the
      // most important thing to say when the shape is weak.
      candidates: [...outlines.considered, ...outlines.siteCandidates],
      chosenId: chosenOutline?.id ?? null,
      agreements: outlines.agreements,
      regularization,
      rationale: outlines.rationale,
    },
    levels,
    walls,
    openings,
    core,
    grid,
    elevations,
    sections,
    assumptions,
    conflicts,
    areaValidation,
    titleKo: "추정 현황 복원 (Estimated Existing-Condition Reconstruction)",
    titleEn: "Estimated Existing-Condition Reconstruction",
    blockers,
  };
}

/* ------------------------------------------------------------------ */
/* Level helpers                                                       */
/* ------------------------------------------------------------------ */

interface LevelSpec {
  key: string;
  floorNo: number;
  below: boolean;
  name: string;
  registeredAreaSqm: number | null;
  use: string | null;
}

function resolveLevelSpecs(
  rows: FloorAggregate[],
  grnd: number | null,
  ugrnd: number,
  totArea: number | null,
): { specs: LevelSpec[]; synthetic: boolean } {
  const withArea = rows.filter((r) => r.areaSqm > 0);
  if (withArea.length > 0) {
    return {
      specs: withArea.map((r) => ({
        key: r.key,
        floorNo: r.floorNo,
        below: r.below,
        name: r.name,
        registeredAreaSqm: r.areaSqm,
        use: r.use,
      })),
      synthetic: false,
    };
  }

  const aboveCount = grnd ?? 0;
  const belowCount = ugrnd;
  if (aboveCount === 0 && belowCount === 0) return { specs: [], synthetic: false };

  const total = aboveCount + belowCount;
  const perFloor = totArea && total > 0 ? totArea / total : null;
  const specs: LevelSpec[] = [];
  for (let i = belowCount; i >= 1; i--) {
    specs.push({
      key: `B:${i}`,
      floorNo: -i,
      below: true,
      name: `지하 ${i}층`,
      registeredAreaSqm: perFloor,
      use: null,
    });
  }
  for (let i = 1; i <= aboveCount; i++) {
    specs.push({
      key: `F:${i}`,
      floorNo: i,
      below: false,
      name: `${i}층`,
      registeredAreaSqm: perFloor,
      use: null,
    });
  }
  return { specs, synthetic: true };
}

function makeLevel(
  spec: LevelSpec,
  elevationMm: number,
  f2fMm: number,
  f2fGrade: EvidenceGrade,
  footprint: RingMm,
  footprintArea: number,
  platArea: number | null,
  conflicts: ConflictEntry[],
  setback?: SetbackChoice,
): ReconLevel {
  const id = `L${spec.below ? "B" : ""}${Math.abs(spec.floorNo)}`;
  let plate = footprint;
  let scale = 1;
  let grade: EvidenceGrade = "D-INFERRED";
  let setbackFacing: Orientation | null = null;
  let setbackReason: SetbackChoice["reason"] = "undetermined";

  const target = spec.registeredAreaSqm;
  if (target && footprintArea > 0) {
    const raw = Math.sqrt(target / footprintArea);
    // A basement may legitimately reach beyond the above-grade footprint; an
    // above-grade floor that claims to be far larger is a contradiction, not a
    // scale factor.
    const upperLimit = spec.below ? (platArea ? Math.sqrt(platArea / footprintArea) : 1.6) : 1.05;
    if (raw > upperLimit || raw < 0.25) {
      conflicts.push({
        id: `CONFLICT-L-${id}`,
        subject: `${spec.name} 면적 대 1층 외곽`,
        sourceA: "SRC-REG-FLOORS",
        valueA: `${target.toFixed(1)} m²`,
        sourceB: "복원 1층 외곽",
        valueB: `${footprintArea.toFixed(1)} m²`,
        magnitude: `${((raw - 1) * 100).toFixed(1)}% 축척이 필요`,
        possibleExplanation:
          "해당 층이 별동이거나, 외곽 증거가 이 층을 포함하지 않거나, 층별개요가 다른 동을 가리킬 수 있습니다.",
        resolutionStatus: "unresolved",
        requiredVerification: "해당 층 외곽 실측",
      });
      grade = "X-UNRESOLVED";
    } else {
      scale = raw;
      grade = "D-INFERRED";

      // P2-31: take the area off ONE face when evidence says which. A
      // concentric shrink gets the area right and the shape wrong — it splits
      // one real step across four faces, so every face's wall area and every
      // orientation's solar gain lands where the building has no step.
      //
      // Only above-grade levels are directed. A basement that differs from the
      // footprint is not a daylight setback, and nothing observed says which
      // way it extends.
      let directed: RingMm | null = null;
      if (
        !spec.below &&
        setback &&
        setback.edgeIndex !== null &&
        raw < 1
      ) {
        directed = insetEdgeToArea(footprint, setback.edgeIndex, target);
        if (directed) {
          setbackFacing = setback.facing;
          setbackReason = setback.reason;
        } else {
          // The step is geometrically impossible off that face — a
          // contradiction between the stated area and the observed outline,
          // not a value to clamp. Fall back and say so.
          conflicts.push({
            id: `CONFLICT-SETBACK-${id}`,
            subject: `${spec.name} 후퇴 방향 대 면적`,
            sourceA: "SRC-REG-FLOORS",
            valueA: `${target.toFixed(1)} m²`,
            sourceB: `복원 외곽 ${setback.facing ?? "지정면"} 후퇴`,
            valueB: `${footprintArea.toFixed(1)} m²`,
            magnitude: "한 면 후퇴로는 이 면적을 만들 수 없습니다",
            possibleExplanation:
              "후퇴가 두 면 이상에 걸쳐 있거나, 이 층이 별동이거나, 외곽 증거가 이 층을 포함하지 않을 수 있습니다.",
            resolutionStatus: "documented",
            requiredVerification: "해당 층 외곽 실측",
          });
        }
      }

      plate = directed ?? roundRing(scaleAbout(footprint, raw));
    }
  }

  return {
    id,
    name: spec.name,
    floorNo: spec.floorNo,
    below: spec.below,
    registeredAreaSqm: target,
    registeredUse: spec.use,
    elevationMm,
    floorToFloorMm: f2fMm,
    floorToFloorGrade: f2fGrade,
    plate,
    plateGrade: grade,
    modelAreaSqm: areaSqm(plate),
    plateScale: scale,
    setbackFacing,
    setbackReason,
  };
}

function lerp(a: PointMm, b: PointMm, t: number): PointMm {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
}

function pickEntranceEdge(ring: RingMm, orientation: Orientation | null): number {
  if (!orientation) return longestEdgeIndex(ring);
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < ring.length; i++) {
    if (edgeFacing(ring, i) !== orientation) continue;
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best >= 0 ? best : longestEdgeIndex(ring);
}

interface PlaceWindowsArgs {
  a: PointMm;
  b: PointMm;
  edgeLen: number;
  bayMm: number;
  wwr: number;
  f2fMm: number;
  levelId: string;
  hostEdgeIndex: number;
  hostWallId: string;
  grade: EvidenceGrade;
  startSeq: number;
}

/**
 * Distribute windows along one wall so the glazed area meets the era WWR for
 * that wall. Width is snapped to 100 mm and capped at 80 % of its bay, so the
 * ratio is approached rather than forced — a forced value would be a fabricated
 * dimension.
 */
function placeWindowsOnEdge(args: PlaceWindowsArgs): ReconOpening[] {
  const { a, b, edgeLen, bayMm, wwr, f2fMm } = args;
  const headMm = Math.min(f2fMm - HEAD_CLEARANCE_MM, SILL_MM + 2400);
  const glassHeight = headMm - SILL_MM;
  if (glassHeight < 600) return [];

  const count = Math.max(1, Math.floor(edgeLen / bayMm));
  const targetArea = wwr * edgeLen * f2fMm;
  const perWindowArea = targetArea / count;
  const rawWidth = perWindowArea / glassHeight;
  const maxWidth = (edgeLen / count) * 0.8;
  const width = Math.max(600, Math.min(maxWidth, Math.round(rawWidth / 100) * 100));

  const out: ReconOpening[] = [];
  for (let i = 0; i < count; i++) {
    const centre = ((i + 0.5) / count) * edgeLen;
    const t0 = (centre - width / 2) / edgeLen;
    const t1 = (centre + width / 2) / edgeLen;
    if (t0 < 0.01 || t1 > 0.99) continue;
    out.push({
      id: `A-WIND-W${String(args.startSeq + out.length + 1).padStart(3, "0")}`,
      levelId: args.levelId,
      type: "window",
      hostEdgeIndex: args.hostEdgeIndex,
      hostWallId: args.hostWallId,
      plan: [lerp(a, b, t0), lerp(a, b, t1)],
      widthMm: width,
      sillMm: SILL_MM,
      headMm,
      grade: args.grade,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Core, grid                                                          */
/* ------------------------------------------------------------------ */

function buildCore(args: {
  levels: ReconLevel[];
  controls: ReturnType<typeof buildControls>;
  useCategory: string;
  grnd: number | null;
  totArea: number | null;
}): ReconCore | null {
  const { levels, controls, useCategory, grnd, totArea } = args;
  if (levels.length === 0) return null;

  // Fit the core to the SMALLEST plate so it is contained on every level —
  // vertical continuity is a property of the reconstruction, not a hope.
  const smallest = levels.reduce((min, l) =>
    l.modelAreaSqm < min.modelAreaSqm ? l : min,
  );
  const ratio = CORE_RATIO[useCategory] ?? CORE_RATIO.default;
  const targetSqm = Math.min(
    Math.max(smallest.modelAreaSqm * ratio, 12),
    smallest.modelAreaSqm * 0.35,
  );
  if (!Number.isFinite(targetSqm) || targetSqm <= 0) return null;

  const box = bbox(smallest.plate);
  const c = centroid(smallest.plate);
  const side = Math.sqrt(targetSqm) * 1000;
  const w = Math.min(side, box.widthMm * 0.6);
  const h = Math.min((targetSqm * 1e6) / Math.max(w, 1), box.heightMm * 0.6);

  const position =
    (controlValue(controls, "C9")?.value as string | undefined) ?? "centre";
  let cx = c[0];
  let cy = c[1];
  const inset = 1.2;
  if (position === "north") cy = box.maxY - (h / 2) * inset;
  else if (position === "south") cy = box.minY + (h / 2) * inset;
  else if (position === "east") cx = box.maxX - (w / 2) * inset;
  else if (position === "west") cx = box.minX + (w / 2) * inset;

  let ring = roundRing(rectRing([cx, cy], w, h));
  // A core pushed to an edge that no longer sits inside the plate falls back
  // to the centroid rather than being drawn outside the building.
  if (!ring.every((p) => pointInRing(p, smallest.plate))) {
    ring = roundRing(rectRing(c, w, h));
  }
  if (!ring.every((p) => pointInRing(p, smallest.plate))) return null;

  const hasElevator = (grnd ?? 0) >= 6 && (totArea ?? 0) >= 2000;
  const stairCount = (grnd ?? 0) >= 5 ? 2 : 1;

  return {
    id: "A-CORE-01",
    ring,
    areaSqm: areaSqm(ring),
    hasElevator,
    stairCount,
    levelIds: levels.map((l) => l.id),
    grade: "D-INFERRED",
  };
}

function buildGrid(args: {
  footprint: RingMm;
  bayMm: number;
  columnMm: number;
  core: ReconCore | null;
}): ReconGrid {
  const { footprint, bayMm, columnMm, core } = args;
  const box = bbox(footprint);
  const xLines: number[] = [];
  const yLines: number[] = [];
  if (box.widthMm > 0 && box.heightMm > 0 && bayMm > 0) {
    const nx = Math.max(1, Math.round(box.widthMm / bayMm));
    const ny = Math.max(1, Math.round(box.heightMm / bayMm));
    for (let i = 0; i <= nx; i++) {
      xLines.push(Math.round(box.minX + (box.widthMm * i) / nx));
    }
    for (let j = 0; j <= ny; j++) {
      yLines.push(Math.round(box.minY + (box.heightMm * j) / ny));
    }
  }

  const columns: PointMm[] = [];
  if (columnMm > 0) {
    for (const x of xLines) {
      for (const y of yLines) {
        const p: PointMm = [x, y];
        if (!pointInRing(p, footprint)) continue;
        if (core && pointInRing(p, core.ring)) continue;
        columns.push(p);
      }
    }
  }

  return {
    bayXMm: xLines.length > 1 ? Math.round(xLines[1] - xLines[0]) : bayMm,
    bayYMm: yLines.length > 1 ? Math.round(yLines[1] - yLines[0]) : bayMm,
    xLines,
    yLines,
    columnSizeMm: columnMm,
    columns,
    grade: "D-INFERRED",
  };
}

/* ------------------------------------------------------------------ */
/* Elevations and sections — derived, never drawn independently        */
/* ------------------------------------------------------------------ */

const FACINGS: Orientation[] = ["north", "east", "south", "west"];

function buildElevations(args: {
  levels: ReconLevel[];
  openings: ReconOpening[];
  totalHeightMm: number;
  f2fMm: number;
}): ReconElevation[] {
  const { levels, openings, totalHeightMm } = args;
  const aboveLevels = levels.filter((l) => !l.below);
  if (aboveLevels.length === 0) return [];

  const ground = aboveLevels[0];
  const groundCcw = toCounterClockwise(ground.plate);
  const box = bbox(groundCcw);

  return FACINGS.map((facing) => {
    const horizontal = facing === "north" || facing === "south";
    const widthMm = horizontal ? box.widthMm : box.heightMm;
    const origin = horizontal ? box.minX : box.minY;
    // South and east elevations are read left-to-right from outside, so the
    // along-axis direction flips for the opposite pair.
    const flip = facing === "south" || facing === "west";

    const facadeOpenings: ReconElevation["openings"] = [];
    for (const level of aboveLevels) {
      const levelPlate = toCounterClockwise(level.plate);
      for (const op of openings) {
        if (op.levelId !== level.id) continue;
        if (edgeFacing(levelPlate, op.hostEdgeIndex) !== facing) continue;
        const [p0, p1] = op.plan;
        const a0 = horizontal ? p0[0] : p0[1];
        const a1 = horizontal ? p1[0] : p1[1];
        let s = Math.min(a0, a1) - origin;
        let e = Math.max(a0, a1) - origin;
        if (flip) {
          const s2 = widthMm - e;
          e = widthMm - s;
          s = s2;
        }
        const y0 = level.elevationMm + op.sillMm;
        const y1 = level.elevationMm + op.headMm;
        facadeOpenings.push({
          id: op.id,
          rect: [
            [Math.round(s), Math.round(y0)],
            [Math.round(e), Math.round(y0)],
            [Math.round(e), Math.round(y1)],
            [Math.round(s), Math.round(y1)],
          ],
          grade: op.grade,
        });
      }
    }

    return {
      id: `ELEV-${facing.toUpperCase()}`,
      facing,
      outline: [
        [0, 0],
        [Math.round(widthMm), 0],
        [Math.round(widthMm), Math.round(totalHeightMm)],
        [0, Math.round(totalHeightMm)],
      ],
      floorLines: aboveLevels.map((l) => ({
        levelId: l.id,
        yMm: l.elevationMm,
        label: `${l.name} ±${(l.elevationMm / 1000).toFixed(2)}`,
      })),
      openings: facadeOpenings,
      grade: "D-INFERRED",
    };
  });
}

function buildSections(args: {
  levels: ReconLevel[];
  core: ReconCore | null;
  totalHeightMm: number;
  f2fMm: number;
}): ReconSection[] {
  const { levels, core, totalHeightMm } = args;
  if (levels.length === 0) return [];

  const ground = levels.find((l) => !l.below) ?? levels[0];
  const box = bbox(toCounterClockwise(ground.plate));
  const widthMm = box.widthMm;
  const lowest = levels[0];
  const baseMm = Math.min(0, lowest.elevationMm);

  const slabThickness = 200;
  const slabs: RingMm[] = levels.map((l) => {
    const y = l.elevationMm;
    return [
      [0, Math.round(y - slabThickness)],
      [Math.round(widthMm), Math.round(y - slabThickness)],
      [Math.round(widthMm), Math.round(y)],
      [0, Math.round(y)],
    ];
  });
  slabs.push([
    [0, Math.round(totalHeightMm - slabThickness)],
    [Math.round(widthMm), Math.round(totalHeightMm - slabThickness)],
    [Math.round(widthMm), Math.round(totalHeightMm)],
    [0, Math.round(totalHeightMm)],
  ]);

  let coreProfile: RingMm | null = null;
  if (core) {
    const cbox = bbox(core.ring);
    const s = Math.round(cbox.minX - box.minX);
    const e = Math.round(cbox.maxX - box.minX);
    coreProfile = [
      [s, Math.round(baseMm)],
      [e, Math.round(baseMm)],
      [e, Math.round(totalHeightMm)],
      [s, Math.round(totalHeightMm)],
    ];
  }

  return [
    {
      id: "SEC-A",
      label: "A-A 종단면 (코어 통과)",
      axis: "x",
      outline: [
        [0, Math.round(baseMm)],
        [Math.round(widthMm), Math.round(baseMm)],
        [Math.round(widthMm), Math.round(totalHeightMm)],
        [0, Math.round(totalHeightMm)],
      ],
      slabs,
      coreProfile,
      floorLines: levels.map((l) => ({
        levelId: l.id,
        yMm: l.elevationMm,
        label: `${l.name} ${(l.elevationMm / 1000).toFixed(2)}`,
      })),
      grade: "D-INFERRED",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Area validation                                                     */
/* ------------------------------------------------------------------ */

function row(
  metric: string,
  sourceValue: number | null,
  modelValue: number | null,
): AreaValidationRow {
  if (sourceValue === null || modelValue === null) {
    return {
      metric,
      sourceValue,
      modelValue,
      deltaSqm: null,
      deltaPct: null,
      status: "NO_SOURCE",
    };
  }
  const delta = modelValue - sourceValue;
  const deltaPct = sourceValue === 0 ? 0 : (delta / sourceValue) * 100;
  const pass =
    Math.abs(delta) <= AREA_TOLERANCE_SQM || Math.abs(deltaPct) <= AREA_TOLERANCE_PCT;
  return {
    metric,
    sourceValue: Number(sourceValue.toFixed(2)),
    modelValue: Number(modelValue.toFixed(2)),
    deltaSqm: Number(delta.toFixed(2)),
    deltaPct: Number(deltaPct.toFixed(2)),
    status: pass ? "PASS" : "REVIEW",
  };
}

function buildAreaValidation(args: {
  levels: ReconLevel[];
  footprintArea: number;
  archArea: number | null;
  totArea: number | null;
  platArea: number | null;
  siteRing: RingMm | null;
}): AreaValidationRow[] {
  const { levels, footprintArea, archArea, totArea, platArea, siteRing } = args;
  const rows: AreaValidationRow[] = [];

  rows.push(row("대지면적 / Site area", platArea, siteRing ? areaSqm(siteRing) : null));
  rows.push(row("건축면적 / Footprint", archArea, footprintArea));

  for (const level of levels) {
    rows.push(row(`${level.name}`, level.registeredAreaSqm, level.modelAreaSqm));
  }

  const modelTotal = levels.reduce((s, l) => s + l.modelAreaSqm, 0);
  rows.push(row("연면적 / Gross floor area", totArea, levels.length > 0 ? modelTotal : null));

  return rows;
}
