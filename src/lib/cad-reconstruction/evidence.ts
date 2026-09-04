// src/lib/cad-reconstruction/evidence.ts
//
// Source inventory, geometric control network, and conflict detection.
//
// Two rules govern everything here:
//
//   1. A documented zero (platArea=0, heit=0, archArea=0, bcRat=0) means the
//      register did not state the value. It becomes an absent control, never
//      a control worth 0.
//   2. When two sources disagree, both survive. A conflict is recorded and the
//      weaker source is not quietly deleted to make the geometry easier.

import { STRUCTURE_TO_WALL_KEY } from "@/lib/korean-building-codes";
import { classifyEraExplicit, isBelowGradeRow } from "@/lib/ledger/floor-rows";
import type { BrFloorInfo } from "@/lib/types";

import { areaSqm, bbox, simplifyRing, toCounterClockwise } from "./geometry";
import { claimOf } from "./claims";
import { osmTagFacts } from "./osm-source";
import { WEB_SOURCE_ID, webFactConflicts } from "./web-evidence";
import type {
  ConflictEntry,
  EvidenceInput,
  EvidenceGrade,
  GeometricControl,
  PointMm,
  RingMm,
  SourceRecord,
} from "./types";

/* ------------------------------------------------------------------ */
/* Register readers                                                    */
/* ------------------------------------------------------------------ */

/** A register number that was actually stated. 0 and NaN both mean absent. */
export function statedNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export interface FloorAggregate {
  key: string;
  floorNo: number;
  below: boolean;
  name: string;
  /** Sum of every register row for this floor — a floor can carry several uses. */
  areaSqm: number;
  use: string | null;
  structure: string | null;
  rowCount: number;
}

/**
 * Aggregate 층별개요 rows per physical floor.
 *
 * `normalizeFloorRows` keeps one representative row per floor, which is right
 * for picking a use or a structure and wrong for area: a floor with a shop row
 * and a parking row has the SUM of both as its plate area. Area control is the
 * spine of this pipeline, so the rows are summed here and the representative
 * row supplies the labels.
 */
export function aggregateFloors(
  titlePk: string,
  floors: readonly BrFloorInfo[],
): FloorAggregate[] {
  const scoped = floors.filter((f) => {
    const pk = String(f.mgmBldrgstPk || "");
    return !titlePk || !pk || pk === titlePk;
  });

  const byFloor = new Map<string, FloorAggregate & { bestRowArea: number }>();
  for (const row of scoped) {
    const floorNo = Number(row.flrNo);
    if (!Number.isFinite(floorNo)) continue;
    const below = isBelowGradeRow(row);
    const key = `${below ? "B" : "F"}:${floorNo}`;
    const area = Number(row.area);
    const rowArea = Number.isFinite(area) && area > 0 ? area : 0;
    const existing = byFloor.get(key);
    if (!existing) {
      byFloor.set(key, {
        key,
        floorNo,
        below,
        name: row.flrNoNm || `${below ? "지하 " : ""}${Math.abs(floorNo)}층`,
        areaSqm: rowArea,
        use: row.mainPurpsCdNm || row.etcPurps || null,
        structure: row.strctCdNm || null,
        rowCount: 1,
        bestRowArea: rowArea,
      });
      continue;
    }
    existing.areaSqm += rowArea;
    existing.rowCount += 1;
    if (rowArea > existing.bestRowArea) {
      existing.bestRowArea = rowArea;
      existing.use = row.mainPurpsCdNm || row.etcPurps || existing.use;
      existing.structure = row.strctCdNm || existing.structure;
    }
  }

  return [...byFloor.values()]
    .map(({ bestRowArea: _bestRowArea, ...rest }) => rest)
    .sort((a, b) => {
      if (a.below !== b.below) return a.below ? -1 : 1;
      return a.below ? b.floorNo - a.floorNo : a.floorNo - b.floorNo;
    });
}

export function structureKeyOf(
  strctCd: string | undefined,
  strctCdNm: string | undefined,
): string {
  const code = (strctCd ?? "").trim().slice(0, 2);
  if (code && STRUCTURE_TO_WALL_KEY[code]) return STRUCTURE_TO_WALL_KEY[code];
  const name = strctCdNm ?? "";
  if (/철골\s*철근|SRC/i.test(name)) return "src";
  if (/철골|강구조|steel/i.test(name)) return "steel";
  if (/조적|벽돌|블록/.test(name)) return "masonry";
  if (/목/.test(name)) return "timber";
  if (/철근|콘크리트/.test(name)) return "rc";
  return "rc";
}

/* ------------------------------------------------------------------ */
/* Source inventory                                                    */
/* ------------------------------------------------------------------ */

export function buildSourceInventory(input: EvidenceInput): SourceRecord[] {
  const accessDate = input.now ?? new Date().toISOString();
  const sources: SourceRecord[] = [];

  const register = (
    id: string,
    type: SourceRecord["sourceType"],
    title: string,
    endpoint: string,
    available: boolean,
    covers: string,
    limits: string[],
  ): SourceRecord => ({
    sourceId: id,
    sourceType: type,
    sourceTitle: title,
    sourceLocation: endpoint,
    accessDate,
    authorityLevel: 2,
    scaleAvailable: false,
    dimensionsAvailable: false,
    coordinateSystem: null,
    floorsCovered: covers,
    disciplinesCovered: "architectural (areas and counts only)",
    knownLimitations: limits,
    confidence: available ? "A-VERIFIED" : "X-UNRESOLVED",
    available,
  });

  sources.push(
    register(
      "SRC-REG-TITLE",
      "building_register_title",
      "건축물대장 표제부",
      "/api/bldrgst/title",
      input.title !== null,
      "building",
      [
        "면적·층수·높이·용도·구조·일자만 기재되며 도면 기하는 포함되지 않음",
        "0으로 표기된 값은 미기재를 뜻함 (실제 0이 아님)",
      ],
    ),
  );
  sources.push(
    register(
      "SRC-REG-RECAP",
      "building_register_recap",
      "건축물대장 총괄표제부",
      "/api/bldrgst/recap",
      input.recap !== null,
      "site (all dongs)",
      ["동 단위 구분 없음 — 단일 동 기하로 직접 쓸 수 없음"],
    ),
  );
  sources.push(
    register(
      "SRC-REG-FLOORS",
      "building_register_floors",
      "건축물대장 층별개요",
      "/api/bldrgst/floors",
      input.floors.length > 0,
      "per storey",
      [
        "한 층에 여러 용도 행이 존재할 수 있어 층 면적은 행의 합계",
        "층별 외곽 형상은 기재되지 않음",
      ],
    ),
  );
  sources.push(
    register(
      "SRC-REG-AREAS",
      "building_register_areas",
      "건축물대장 전유공용면적",
      "/api/bldrgst/areas",
      input.areas.length > 0,
      "per unit",
      ["전유/공용 구분만 제공 — 실 경계는 포함되지 않음"],
    ),
  );

  const gis = input.gis;
  const hasBuildingRing = !!gis?.polygon && gis.source === "building";
  const hasParcelRing = !!gis?.polygon && gis.source === "parcel";

  sources.push({
    sourceId: "SRC-GIS-BLDG",
    sourceType: "gis_building_outline",
    sourceTitle: "VWorld GIS건물통합정보 (LT_C_SPBD) 건물 외곽",
    sourceLocation: "/api/vworld/footprint",
    accessDate,
    authorityLevel: 3,
    scaleAvailable: true,
    dimensionsAvailable: true,
    coordinateSystem: "EPSG:4326 (WGS84)",
    floorsCovered: "grade level outline",
    disciplinesCovered: "architectural (outline only)",
    knownLimitations: [
      "지붕/처마 투영 외곽일 수 있어 지상층 벽 중심선과 다를 수 있음",
      "측량 성과가 아니며 정합 오차가 존재함",
    ],
    confidence: hasBuildingRing ? "B-OBSERVED" : "X-UNRESOLVED",
    available: hasBuildingRing,
  });

  sources.push({
    sourceId: "SRC-GIS-PARCEL",
    sourceType: "gis_parcel_outline",
    sourceTitle: "VWorld 연속지적도 (LP_PA_CBND_BUBUN) 필지 경계",
    sourceLocation: "/api/vworld/footprint",
    accessDate,
    authorityLevel: 3,
    scaleAvailable: true,
    dimensionsAvailable: true,
    coordinateSystem: "EPSG:4326 (WGS84)",
    floorsCovered: "site",
    disciplinesCovered: "civil (parcel boundary)",
    knownLimitations: ["필지 경계는 건물 외곽이 아님 — 대지 참조로만 사용"],
    confidence: hasParcelRing ? "B-OBSERVED" : "X-UNRESOLVED",
    available: hasParcelRing,
  });

  const attrs = gis?.attributes ?? null;
  const hasAttrs =
    !!attrs &&
    (statedNumber(attrs.height) !== null ||
      statedNumber(attrs.groundFloors) !== null);
  sources.push({
    sourceId: "SRC-GIS-ATTR",
    sourceType: "gis_measured_attributes",
    sourceTitle: "GIS건물통합정보 측정 속성 (높이·층수)",
    sourceLocation: "/api/vworld/footprint",
    accessDate,
    authorityLevel: 3,
    scaleAvailable: false,
    dimensionsAvailable: true,
    coordinateSystem: null,
    floorsCovered: "building",
    disciplinesCovered: "architectural",
    knownLimitations: ["0은 미제공을 뜻함", "갱신 시점이 대장과 다를 수 있음"],
    confidence: hasAttrs ? "B-OBSERVED" : "X-UNRESOLVED",
    available: hasAttrs,
  });

  // OpenStreetMap — a second observed outline, ranked BELOW the government
  // layer. Its geometry is a real trace, so it enters as observed; its tags are
  // contributor assertions and are never treated as measured evidence. Note
  // what this record does NOT say: no survey, no dimensioned vector geometry.
  const osmRing = input.osm?.polygon?.[0] ?? null;
  const hasOsmRing = !!osmRing && osmRing.length >= 4 && !input.osm?.error;
  sources.push({
    sourceId: "SRC-OSM-BLDG",
    sourceType: "osm_building_outline",
    sourceTitle: "OpenStreetMap 건물 외곽 (ODbL)",
    sourceLocation: "/api/osm/building",
    accessDate,
    authorityLevel: 4,
    scaleAvailable: true,
    dimensionsAvailable: true,
    coordinateSystem: "EPSG:4326 (WGS84)",
    floorsCovered: "grade level outline",
    disciplinesCovered: "architectural (outline only)",
    knownLimitations: [
      "기여자가 항공영상에서 추적한 선으로 측량 성과가 아님 — 정부 GIS보다 낮은 권위로 취급",
      "building:levels·height 등 태그는 기여자의 진술이며 실측값이 아님 (D-INFERRED)",
      "갱신 시점과 정확도가 지역·기여자별로 크게 다름",
      "ODbL 라이선스 — 출처 표시 필요",
    ],
    confidence: hasOsmRing ? "B-OBSERVED" : "X-UNRESOLVED",
    available: hasOsmRing,
  });

  // 용도지역. A legal designation, not geometry — it explains why a setback
  // rule applies; it never supplies a dimension.
  const zoningDistrict = input.zoning?.district?.trim() || null;
  const hasZoning = !!zoningDistrict && !input.zoning?.error;
  sources.push({
    sourceId: "SRC-GIS-ZONING",
    sourceType: "gis_zoning_district",
    sourceTitle: "VWorld 용도지역지구 (LT_C_UQ111)",
    sourceLocation: input.zoning?.source || "/api/vworld/zoning",
    accessDate,
    authorityLevel: 3,
    scaleAvailable: false,
    dimensionsAvailable: false,
    coordinateSystem: null,
    floorsCovered: "site",
    disciplinesCovered: "planning (legal designation)",
    knownLimitations: [
      "법적 지정일 뿐 기하 정보가 아님 — 치수의 출처가 될 수 없음",
      "필지가 둘 이상의 지역에 걸치면 대표값 하나만 반환됨",
    ],
    confidence: hasZoning ? "B-OBSERVED" : "X-UNRESOLVED",
    available: hasZoning,
  });

  // The open web. Weakest source in the inventory and the only one whose
  // authority comes from a link rather than an institution — so what it is
  // allowed to do is narrow, and the record says so.
  const webFacts = input.web?.facts ?? [];
  const webSearched = input.web?.searched === true;
  sources.push({
    sourceId: WEB_SOURCE_ID,
    sourceType: "web_search",
    sourceTitle: "웹 검색 (인용 URL 필수)",
    sourceLocation: "/api/cad/web-evidence",
    accessDate,
    authorityLevel: 5,
    scaleAvailable: false,
    dimensionsAvailable: false,
    coordinateSystem: null,
    floorsCovered: "as published",
    disciplinesCovered: "descriptive (published statements only)",
    knownLimitations: [
      "제3자의 진술이며 실측이 아님 — 항상 D-INFERRED",
      "기하를 생성하지 않으며 대장 값을 대체하지 않음. 대조 전용",
      "인용 URL이 없는 항목은 파이프라인 진입 전에 폐기됨",
      "동명이 건물을 잘못 가리킬 수 있어 주소 일치를 별도로 확인해야 함",
    ],
    confidence: webFacts.length > 0 ? "D-INFERRED" : "X-UNRESOLVED",
    // Searched-and-found-nothing and never-searched are different states, and
    // only the first one is evidence of anything.
    available: webSearched && webFacts.length > 0,
  });

  const measuredClaims = input.claims.filter((c) => c.measured).length;
  sources.push({
    sourceId: "SRC-USER",
    sourceType: "user_statement",
    sourceTitle: "사용자 진술 (프롬프트)",
    sourceLocation: "in-app prompt",
    accessDate,
    authorityLevel: measuredClaims > 0 ? 1 : 4,
    scaleAvailable: false,
    dimensionsAvailable: measuredClaims > 0,
    coordinateSystem: null,
    floorsCovered: "as stated",
    disciplinesCovered: "as stated",
    knownLimitations: [
      "실측이라고 명시한 값만 A-VERIFIED로 취급함",
      "나머지 진술은 D-INFERRED로 유지됨",
    ],
    confidence:
      input.claims.length === 0
        ? "X-UNRESOLVED"
        : measuredClaims > 0
          ? "A-VERIFIED"
          : "D-INFERRED",
    available: input.claims.length > 0,
  });

  sources.push({
    sourceId: "SRC-CODE-ERA",
    sourceType: "code_table",
    sourceTitle: "연대별 한국 건축 관행 표 (층고·창면적비·벽 구성)",
    sourceLocation: "src/lib/korean-building-codes.ts",
    accessDate,
    authorityLevel: 5,
    scaleAvailable: false,
    dimensionsAvailable: false,
    coordinateSystem: null,
    floorsCovered: "all",
    disciplinesCovered: "architectural",
    knownLimitations: [
      "이 건물에 대한 증거가 아니라 연대 통계값 — 항상 D-INFERRED",
    ],
    confidence: "D-INFERRED",
    available: true,
  });

  return sources;
}

/* ------------------------------------------------------------------ */
/* Control network                                                     */
/* ------------------------------------------------------------------ */

export interface ControlContext {
  /** Grade-level outline in the local mm frame, when GIS supplied one. */
  gisRing: RingMm | null;
  gisRingIsParcel: boolean;
  origin: [number, number] | null;
}

/**
 * Project a WGS84 ring into the local metric frame, in millimetres.
 * `project` is injected so this module stays free of proj4 and testable.
 */
export function projectRingToMm(
  ring: number[][],
  project: (lng: number, lat: number) => [number, number],
): RingMm {
  const out: RingMm = [];
  for (const pair of ring) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [lng, lat] = pair;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const [x, y] = project(lng, lat);
    out.push([x * 1000, y * 1000] as PointMm);
  }
  // GeoJSON repeats the first vertex; a ring here does not.
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1) out.pop();
  }
  return out;
}

export function buildControls(
  input: EvidenceInput,
  ctx: ControlContext,
): GeometricControl[] {
  const t = input.title;
  const controls: GeometricControl[] = [];
  const floors = aggregateFloors(String(t?.mgmBldrgstPk ?? ""), input.floors);

  const platArea = statedNumber(t?.platArea);
  const archArea = statedNumber(t?.archArea);
  const totArea = statedNumber(t?.totArea);
  const heit = statedNumber(t?.heit);
  const grnd = statedNumber(t?.grndFlrCnt);
  const ugrnd = Number.isFinite(Number(t?.ugrndFlrCnt))
    ? Number(t?.ugrndFlrCnt)
    : null;

  const siteClaim = claimOf(input.claims, "site_area_sqm");
  const footprintClaim = claimOf(input.claims, "footprint_area_sqm");
  const widthClaim = claimOf(input.claims, "overall_width_m");
  const depthClaim = claimOf(input.claims, "overall_depth_m");
  const f2fClaim = claimOf(input.claims, "floor_to_floor_m");
  const coreClaim = claimOf(input.claims, "core_position");
  const entranceClaim = claimOf(input.claims, "entrance_orientation");
  const roofClaim = claimOf(input.claims, "roof_form");

  const gisArea = ctx.gisRing && !ctx.gisRingIsParcel ? areaSqm(ctx.gisRing) : null;
  // The parcel guard belongs on BOTH readings of the ring. A lot's bounding box
  // is not the building's width and depth, and without this guard it became
  // C5/C6 at B-OBSERVED — after which reconstruct() built the footprint from
  // them and labelled a 7,000 m² lot as a user-stated building outline.
  const gisBox =
    ctx.gisRing && !ctx.gisRingIsParcel ? bbox(ctx.gisRing) : null;
  /** The lot ring, when that is what VWorld returned. Site evidence only. */
  const parcelRing = ctx.gisRing && ctx.gisRingIsParcel ? ctx.gisRing : null;

  const push = (c: GeometricControl) => controls.push(c);

  // C1 — site area. The parcel ring is the one thing a cadastral-only GIS
  // answer DOES describe, so it is read here rather than discarded.
  const parcelArea = parcelRing ? areaSqm(parcelRing) : null;
  const c1Value =
    platArea ?? (siteClaim ? Number(siteClaim.value) : null) ?? parcelArea;
  push({
    id: "C1",
    key: "site.area",
    labelKo: "대지면적",
    labelEn: "Site area",
    value: c1Value !== null ? Number(c1Value.toFixed(2)) : null,
    unit: "m2",
    grade: platArea
      ? "A-VERIFIED"
      : siteClaim
        ? siteClaim.grade
        : parcelArea !== null
          ? "B-OBSERVED"
          : "X-UNRESOLVED",
    sourceIds: platArea
      ? ["SRC-REG-TITLE"]
      : siteClaim
        ? ["SRC-USER"]
        : parcelArea !== null
          ? ["SRC-GIS-PARCEL"]
          : [],
    method: platArea
      ? "register field platArea"
      : siteClaim
        ? "user statement"
        : parcelArea !== null
          ? "연속지적도 필지 경계를 투영하여 산출한 면적"
          : "증거 없음",
    note: platArea ? undefined : "대장에 대지면적이 기재되지 않았습니다",
  });

  // C2 — building footprint area
  const c2Value =
    archArea ??
    (footprintClaim ? Number(footprintClaim.value) : null) ??
    gisArea ??
    (totArea && grnd ? totArea / grnd : null);
  push({
    id: "C2",
    key: "footprint.area",
    labelKo: "건축면적",
    labelEn: "Building footprint area",
    value: c2Value !== null ? Number(c2Value.toFixed(2)) : null,
    unit: "m2",
    grade: archArea
      ? "A-VERIFIED"
      : footprintClaim
        ? footprintClaim.grade
        : gisArea
          ? "B-OBSERVED"
          : c2Value !== null
            ? "C-CALCULATED"
            : "X-UNRESOLVED",
    sourceIds: archArea
      ? ["SRC-REG-TITLE"]
      : footprintClaim
        ? ["SRC-USER"]
        : gisArea
          ? ["SRC-GIS-BLDG"]
          : ["SRC-REG-TITLE"],
    method: archArea
      ? "register field archArea"
      : footprintClaim
        ? "user statement"
        : gisArea
          ? "GIS outline area, projected to a local metric CRS"
          : "연면적 ÷ 지상층수",
  });

  // C3 — gross floor area
  push({
    id: "C3",
    key: "building.grossArea",
    labelKo: "연면적",
    labelEn: "Gross floor area",
    value: totArea,
    unit: "m2",
    grade: totArea ? "A-VERIFIED" : "X-UNRESOLVED",
    sourceIds: ["SRC-REG-TITLE"],
    method: "register field totArea",
  });

  // C4 — floor-specific areas
  const withArea = floors.filter((f) => f.areaSqm > 0);
  push({
    id: "C4",
    key: "levels.area",
    labelKo: "층별 면적",
    labelEn: "Floor-specific area",
    value: withArea.length,
    unit: "floors",
    grade: withArea.length > 0 ? "A-VERIFIED" : "X-UNRESOLVED",
    sourceIds: ["SRC-REG-FLOORS"],
    method: "층별개요 rows summed per physical floor",
    note:
      withArea.length > 0
        ? `${withArea.length}개 층의 면적이 기재됨`
        : "층별개요를 읽지 못했습니다",
  });

  // C5 / C6 — overall width and depth
  const widthFromGis = gisBox ? gisBox.widthMm / 1000 : null;
  const depthFromGis = gisBox ? gisBox.heightMm / 1000 : null;
  push({
    id: "C5",
    key: "footprint.width",
    labelKo: "전체 폭",
    labelEn: "Overall width",
    value:
      widthClaim !== null
        ? Number(widthClaim.value)
        : widthFromGis !== null
          ? Number(widthFromGis.toFixed(2))
          : null,
    unit: "m",
    grade: widthClaim
      ? widthClaim.grade
      : widthFromGis !== null
        ? "B-OBSERVED"
        : c2Value !== null
          ? "C-CALCULATED"
          : "X-UNRESOLVED",
    sourceIds: widthClaim ? ["SRC-USER"] : widthFromGis !== null ? ["SRC-GIS-BLDG"] : [],
    method: widthClaim
      ? "user statement"
      : widthFromGis !== null
        ? "GIS outline bounding box (east-west)"
        : "solved from C2 with a daylight-bounded plate depth",
  });
  push({
    id: "C6",
    key: "footprint.depth",
    labelKo: "전체 깊이",
    labelEn: "Overall depth",
    value:
      depthClaim !== null
        ? Number(depthClaim.value)
        : depthFromGis !== null
          ? Number(depthFromGis.toFixed(2))
          : null,
    unit: "m",
    grade: depthClaim
      ? depthClaim.grade
      : depthFromGis !== null
        ? "B-OBSERVED"
        : c2Value !== null
          ? "C-CALCULATED"
          : "X-UNRESOLVED",
    sourceIds: depthClaim ? ["SRC-USER"] : depthFromGis !== null ? ["SRC-GIS-BLDG"] : [],
    method: depthClaim
      ? "user statement"
      : depthFromGis !== null
        ? "GIS outline bounding box (north-south)"
        : "solved from C2 with a daylight-bounded plate depth",
  });

  // C7 — structural grid
  const structureKey = structureKeyOf(t?.strctCd, t?.strctCdNm);
  push({
    id: "C7",
    key: "structure.grid",
    labelKo: "구조 그리드",
    labelEn: "Structural grid",
    value: structureKey,
    unit: null,
    grade: "D-INFERRED",
    sourceIds: ["SRC-REG-TITLE", "SRC-CODE-ERA"],
    method: "bay size inferred from the registered structure type",
    note: "도면 증거 없음 — X-VERIFY 레이어에 배치됨",
  });

  // C8 — floor-to-floor height
  const f2fCalculated = heit && grnd ? heit / grnd : null;
  push({
    id: "C8",
    key: "levels.floorToFloor",
    labelKo: "층고",
    labelEn: "Floor-to-floor height",
    value:
      f2fClaim !== null
        ? Number(f2fClaim.value)
        : f2fCalculated !== null
          ? Number(f2fCalculated.toFixed(3))
          : null,
    unit: "m",
    grade: f2fClaim
      ? f2fClaim.grade
      : f2fCalculated !== null
        ? "C-CALCULATED"
        : "D-INFERRED",
    sourceIds: f2fClaim
      ? ["SRC-USER"]
      : f2fCalculated !== null
        ? ["SRC-REG-TITLE"]
        : ["SRC-CODE-ERA"],
    method: f2fClaim
      ? "user statement"
      : f2fCalculated !== null
        ? "register 높이 ÷ 지상층수"
        : "era table",
    note:
      heit === null
        ? "대장 높이가 0(미기재)이라 연대 표를 사용했습니다"
        : undefined,
  });

  // C9 — core position
  push({
    id: "C9",
    key: "core.position",
    labelKo: "코어 위치",
    labelEn: "Core position",
    value: coreClaim ? String(coreClaim.value) : "centre",
    unit: null,
    grade: coreClaim ? coreClaim.grade : "D-INFERRED",
    sourceIds: coreClaim ? ["SRC-USER"] : [],
    method: coreClaim ? "user statement" : "plate centroid, vertically continuous",
  });

  // C10 / C11 — stair and elevator
  const storeysAbove = grnd ?? null;
  const elevatorLikely =
    storeysAbove !== null && storeysAbove >= 6 && (totArea ?? 0) >= 2000;
  push({
    id: "C10",
    key: "core.stair",
    labelKo: "계단실",
    labelEn: "Stair position",
    value: "core",
    unit: null,
    grade: "D-INFERRED",
    sourceIds: [],
    method: "stair placed inside the inferred core on every level",
  });
  push({
    id: "C11",
    key: "core.elevator",
    labelKo: "승강기",
    labelEn: "Elevator position",
    value: elevatorLikely ? "core" : "none",
    unit: null,
    grade: "D-INFERRED",
    sourceIds: ["SRC-REG-TITLE"],
    method:
      "6층 이상이고 연면적 2,000㎡ 이상인 경우에만 승강기를 가정 (설치 여부는 미확인)",
  });

  // C12 — entrance
  push({
    id: "C12",
    key: "entrance.position",
    labelKo: "주출입구",
    labelEn: "Entrance position",
    value: entranceClaim ? String(entranceClaim.value) : "longest-edge",
    unit: null,
    grade: entranceClaim ? entranceClaim.grade : "D-INFERRED",
    sourceIds: entranceClaim ? ["SRC-USER"] : [],
    method: entranceClaim ? "user statement" : "longest grade-level edge",
  });

  // C13 — roof
  const roofName = (t?.roofCdNm ?? "").trim();
  push({
    id: "C13",
    key: "roof.form",
    labelKo: "지붕 형식",
    labelEn: "Roof geometry",
    value: roofClaim ? String(roofClaim.value) : roofName || "flat",
    unit: null,
    grade: roofClaim ? roofClaim.grade : roofName ? "A-VERIFIED" : "D-INFERRED",
    sourceIds: roofClaim ? ["SRC-USER"] : roofName ? ["SRC-REG-TITLE"] : [],
    method: roofClaim
      ? "user statement"
      : roofName
        ? "register field roofCdNm"
        : "flat roof assumed",
  });

  // C14 — orientation
  push({
    id: "C14",
    key: "site.orientation",
    labelKo: "방위",
    labelEn: "Site orientation",
    value: ctx.origin ? 0 : null,
    unit: "deg",
    grade: ctx.origin ? "C-CALCULATED" : "X-UNRESOLVED",
    sourceIds: ctx.origin ? ["SRC-GIS-BLDG"] : [],
    method: ctx.origin
      ? "site-centred transverse Mercator: project north = grid north = true north at the origin"
      : "no coordinates available; project north is arbitrary",
  });

  void ugrnd;
  return controls;
}

export function controlValue(
  controls: readonly GeometricControl[],
  id: string,
): GeometricControl | null {
  return controls.find((c) => c.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Conflicts                                                           */
/* ------------------------------------------------------------------ */

function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a - b) / b) * 100;
}

/**
 * Cross-check every pair of sources that can be compared numerically.
 * Nothing here edits geometry — a conflict is a recorded disagreement, and the
 * reconstruction proceeds using the higher-authority control while saying so.
 */
export function detectConflicts(
  input: EvidenceInput,
  ctx: ControlContext,
): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const t = input.title;
  if (!t) return conflicts;

  const platArea = statedNumber(t.platArea);
  const archArea = statedNumber(t.archArea);
  const totArea = statedNumber(t.totArea);
  const heit = statedNumber(t.heit);
  const grnd = statedNumber(t.grndFlrCnt);
  const bcRat = statedNumber(t.bcRat);
  const vlRat = statedNumber(t.vlRat);
  const floors = aggregateFloors(String(t.mgmBldrgstPk ?? ""), input.floors);

  const add = (c: Omit<ConflictEntry, "id">) =>
    conflicts.push({ ...c, id: `CONFLICT-${String(conflicts.length + 1).padStart(3, "0")}` });

  // GIS outline area vs registered footprint area.
  if (ctx.gisRing && !ctx.gisRingIsParcel && archArea) {
    const gisArea = areaSqm(ctx.gisRing);
    const delta = pct(gisArea, archArea);
    if (Math.abs(delta) > 10 && Math.abs(gisArea - archArea) > 5) {
      add({
        subject: "건축면적 대 GIS 건물 외곽 면적",
        sourceA: "SRC-REG-TITLE (archArea)",
        valueA: `${archArea.toFixed(1)} m²`,
        sourceB: "SRC-GIS-BLDG (projected outline)",
        valueB: `${gisArea.toFixed(1)} m²`,
        magnitude: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}% (${(gisArea - archArea).toFixed(1)} m²)`,
        possibleExplanation:
          "GIS 외곽은 지붕/처마 투영선이거나 증축이 반영되지 않았을 수 있습니다. 건축면적은 건축선 기준 수평투영면적입니다.",
        resolutionStatus: "documented",
        requiredVerification: "현장에서 1층 외벽 모서리 간 거리 실측",
        geometry: ctx.gisRing,
      });
    }
  }

  // Registered coverage ratio vs the ratio implied by the stated areas.
  if (bcRat && platArea && archArea) {
    const computed = (archArea / platArea) * 100;
    if (Math.abs(computed - bcRat) > 2) {
      add({
        subject: "건폐율",
        sourceA: "SRC-REG-TITLE (bcRat)",
        valueA: `${bcRat.toFixed(2)} %`,
        sourceB: "계산값 (archArea ÷ platArea)",
        valueB: `${computed.toFixed(2)} %`,
        magnitude: `${(computed - bcRat).toFixed(2)} %p`,
        possibleExplanation:
          "부속건축물이 별도 대장에 있거나 대지 일부가 다른 동과 공유될 수 있습니다.",
        resolutionStatus: "documented",
        requiredVerification: "총괄표제부의 동별 건축면적 합계 확인",
      });
    }
  }

  if (vlRat && platArea && totArea) {
    const computed = (totArea / platArea) * 100;
    // 용적률 excludes below-grade area, so a positive gap is expected; only a
    // model that exceeds the stated ratio is a genuine contradiction.
    if (computed - vlRat > 5) {
      add({
        subject: "용적률",
        sourceA: "SRC-REG-TITLE (vlRat)",
        valueA: `${vlRat.toFixed(2)} %`,
        sourceB: "계산값 (totArea ÷ platArea)",
        valueB: `${computed.toFixed(2)} %`,
        magnitude: `${(computed - vlRat).toFixed(2)} %p`,
        possibleExplanation:
          "연면적에는 지하층·주차장이 포함되지만 용적률 산정 연면적에는 제외됩니다. 차이가 지하 면적과 일치하는지 확인이 필요합니다.",
        resolutionStatus: "documented",
        requiredVerification: "층별개요에서 지하층 면적 합계 대조",
      });
    }
  }

  // Floor rows summed vs the registered gross area.
  if (totArea && floors.length > 0) {
    const sum = floors.reduce((s, f) => s + f.areaSqm, 0);
    if (sum > 0 && Math.abs(pct(sum, totArea)) > 5) {
      add({
        subject: "연면적 대 층별개요 합계",
        sourceA: "SRC-REG-TITLE (totArea)",
        valueA: `${totArea.toFixed(1)} m²`,
        sourceB: "SRC-REG-FLOORS (rows summed)",
        valueB: `${sum.toFixed(1)} m²`,
        magnitude: `${pct(sum, totArea).toFixed(1)}%`,
        possibleExplanation:
          "층별개요가 일부 층만 반환되었거나 옥탑·부속 행이 누락/중복되었을 수 있습니다.",
        resolutionStatus: "documented",
        requiredVerification: "층별개요 원본 행 수 확인 후 재수집",
      });
    }
  }

  // GIS attributes vs the register.
  const attrs = input.gis?.attributes ?? null;
  const gisFloors = statedNumber(attrs?.groundFloors);
  if (gisFloors && grnd && gisFloors !== grnd) {
    add({
      subject: "지상 층수",
      sourceA: "SRC-REG-TITLE (grndFlrCnt)",
      valueA: `${grnd}`,
      sourceB: "SRC-GIS-ATTR (groundFloors)",
      valueB: `${gisFloors}`,
      magnitude: `${gisFloors - grnd} 층`,
      possibleExplanation:
        "증축 또는 대장 갱신 시점 차이. 옥탑을 층으로 계수했을 수 있습니다.",
      resolutionStatus: "documented",
      requiredVerification: "현장 외관에서 층수 계수",
    });
  }

  const gisHeight = statedNumber(attrs?.height);
  if (gisHeight && heit && Math.abs(pct(gisHeight, heit)) > 15) {
    add({
      subject: "건물 높이",
      sourceA: "SRC-REG-TITLE (heit)",
      valueA: `${heit.toFixed(1)} m`,
      sourceB: "SRC-GIS-ATTR (buld_hg)",
      valueB: `${gisHeight.toFixed(1)} m`,
      magnitude: `${(gisHeight - heit).toFixed(1)} m`,
      possibleExplanation:
        "대장 높이는 건축물 높이 산정 기준(옥탑 제외 등)이 달라 실측 높이와 다를 수 있습니다.",
      resolutionStatus: "documented",
      requiredVerification: "레이저 거리계로 처마/파라펫 높이 측정",
    });
  }

  // OpenStreetMap's own reading of the building, against the register.
  //
  // These tags never overwrite a register value — an independent source that
  // disagrees about how many storeys the building has is exactly the sort of
  // thing the user should be shown, and exactly the sort of thing that must not
  // silently win. The register keeps the value; the disagreement is recorded.
  const osmFacts = input.osm ? osmTagFacts(input.osm.tags ?? {}) : null;
  if (osmFacts?.storeysAbove && grnd && osmFacts.storeysAbove !== grnd) {
    add({
      subject: "지상 층수 (대장 대 OpenStreetMap)",
      sourceA: "SRC-REG-TITLE (grndFlrCnt)",
      valueA: `${grnd}`,
      sourceB: "SRC-OSM-BLDG (building:levels)",
      valueB: `${osmFacts.storeysAbove}`,
      magnitude: `${osmFacts.storeysAbove - grnd} 층`,
      possibleExplanation:
        "증축 후 대장 갱신 시점 차이이거나, OSM 기여자가 옥탑·필로티를 층으로 계수했을 수 있습니다. " +
        "OSM 태그는 기여자의 진술이며 실측이 아닙니다.",
      resolutionStatus: "documented",
      requiredVerification: "현장 외관에서 층수 계수",
    });
  }
  if (osmFacts?.heightM && heit && Math.abs(pct(osmFacts.heightM, heit)) > 15) {
    add({
      subject: "건물 높이 (대장 대 OpenStreetMap)",
      sourceA: "SRC-REG-TITLE (heit)",
      valueA: `${heit.toFixed(1)} m`,
      sourceB: "SRC-OSM-BLDG (height)",
      valueB: `${osmFacts.heightM.toFixed(1)} m`,
      magnitude: `${(osmFacts.heightM - heit).toFixed(1)} m`,
      possibleExplanation:
        "대장 높이의 산정 기준(옥탑 제외 등)이 다르거나, OSM 높이가 층수 × 3 m 로 추정 입력되었을 수 있습니다.",
      resolutionStatus: "documented",
      requiredVerification: "레이저 거리계로 처마/파라펫 높이 측정",
    });
  }

  // What the open web says, compared against the register. The register keeps
  // every value; this only records that a cited source says otherwise.
  conflicts.push(...webFactConflicts(input.web?.facts ?? [], t));

  // A stated width × depth that cannot hold the registered footprint area.
  const w = claimOf(input.claims, "overall_width_m");
  const d = claimOf(input.claims, "overall_depth_m");
  if (w && d && archArea) {
    const boxArea = Number(w.value) * Number(d.value);
    if (Math.abs(pct(boxArea, archArea)) > 20) {
      add({
        subject: "사용자 진술 치수 대 건축면적",
        sourceA: "SRC-REG-TITLE (archArea)",
        valueA: `${archArea.toFixed(1)} m²`,
        sourceB: `SRC-USER (${w.value} m × ${d.value} m)`,
        valueB: `${boxArea.toFixed(1)} m²`,
        magnitude: `${pct(boxArea, archArea).toFixed(1)}%`,
        possibleExplanation:
          "건물이 직사각형이 아니거나 진술한 치수가 일부 구간만을 가리킬 수 있습니다.",
        resolutionStatus: "unresolved",
        requiredVerification: "외곽 전체 둘레 실측 후 폴리곤 재작성",
      });
    }
  }

  return conflicts;
}

/* ------------------------------------------------------------------ */
/* Era + naming                                                        */
/* ------------------------------------------------------------------ */

export function eraOf(input: EvidenceInput): {
  era: string;
  resolved: boolean;
  approvalDate: string | null;
  grade: EvidenceGrade;
} {
  const resolution = classifyEraExplicit({
    useAprDay: input.title?.useAprDay,
    pmsDay: input.title?.pmsDay,
  });
  return {
    era: resolution.era,
    resolved: resolution.resolved,
    approvalDate: resolution.rawValue,
    grade: resolution.resolved ? "A-VERIFIED" : "X-UNRESOLVED",
  };
}

/** Cleaned, simplified GIS ring in the local mm frame — or null. */
export function prepareGisRing(ring: RingMm | null): RingMm | null {
  if (!ring || ring.length < 3) return null;
  const simplified = simplifyRing(toCounterClockwise(ring));
  return simplified.length >= 3 ? simplified : null;
}
