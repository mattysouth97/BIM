/**
 * Generic Korean building-material thermal library.
 *
 * Traceability §5 in docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md.
 * Values come from one of two families, and each entry's `sourceNoteKo`
 * says which:
 *   (a) Korean practice — GENERIC mid-range figures from the
 *       에너지절약설계기준 단열재 등급분류(별표2 가~라) convention and
 *       KS-typical published bands (§5).
 *   (b) International tabulated design values — EN 12524:2000 Table 1
 *       (the predecessor table EN ISO 10456:2007 was built from),
 *       ISO 6946:2007 Table 2, and ASTM C1289 LTTR (§5.1). These exist so
 *       a non-Korean reference building can be modelled without dressing
 *       Korean 별표 values up as though they described it.
 * Neither family is a manufacturer's certified performance. That is a
 * §5 mission prohibition: the library exists so the UI can offer plausible
 * starting materials whose provenance honestly reads 표준 프로필/추정, while
 * certified datasheet values are entered by the user and carry their own
 * provenance. `confidence` is therefore hardwired to "generic" on every
 * entry.
 */

export type MaterialCategory =
  | "insulation"
  | "concrete"
  | "masonry"
  | "finish"
  | "wood"
  | "stone"
  | "metal"
  | "membrane"
  | "panel"
  | "air_cavity";

export type GenericMaterial = Readonly<{
  id: string;
  nameKo: string;
  nameEn: string;
  category: MaterialCategory;
  /** λ, W/(m·K). Absent for fixed-R entries (air cavities). */
  conductivityWPerMK?: number;
  /** Direct R for cavities/membranes, m²K/W. */
  fixedResistanceM2KPerW?: number;
  densityKgPerM3?: number;
  specificHeatJPerKgK?: number;
  /** Korean-practice source note shown verbatim in the UI provenance popover. */
  sourceNoteKo: string;
  confidence: "generic";
  /** Typical thickness presets (mm) to seed the editor; not a constraint. */
  typicalThicknessesMm?: readonly number[];
}>;

const M = (m: Omit<GenericMaterial, "confidence">): GenericMaterial =>
  Object.freeze({ ...m, confidence: "generic" as const });

const 단열재등급 = "에너지절약설계기준 단열재 등급분류 관행값(중간값) — 제조사 성적서 아님";
const KS관행 = "KS/해설서 통용 물성값 — 제조사 성적서 아님";
const EN12524 = "EN 12524:2000 표 1 설계값 (EN ISO 10456:2007 표의 선행판) — 제조사 성적서 아님";
const ISO6946 = "ISO 6946:2007 표 2 비환기 공기층 설계값 — 제조사 성적서 아님";

/**
 * The library. IDs are stable — persisted assemblies reference them.
 * Ranges behind each pick are recorded in ENERGY_STANDARD_TRACEABILITY.md §5.
 */
export const GENERIC_MATERIALS: readonly GenericMaterial[] = Object.freeze([
  // ── 단열재 ──────────────────────────────────────────────────────────
  M({
    id: "ins-eps1",
    nameKo: "비드법 단열재 1종 (EPS)",
    nameEn: "EPS type 1",
    category: "insulation",
    conductivityWPerMK: 0.036,
    densityKgPerM3: 15,
    specificHeatJPerKgK: 1450,
    sourceNoteKo: 단열재등급,
    typicalThicknessesMm: [50, 80, 100, 125, 150, 200, 250],
  }),
  M({
    id: "ins-eps2",
    nameKo: "비드법 단열재 2종 (네오폴 등)",
    nameEn: "EPS type 2 (graphite)",
    category: "insulation",
    conductivityWPerMK: 0.032,
    densityKgPerM3: 20,
    specificHeatJPerKgK: 1450,
    sourceNoteKo: 단열재등급,
    typicalThicknessesMm: [50, 80, 100, 125, 150, 200, 250],
  }),
  M({
    id: "ins-xps",
    nameKo: "압출법 단열재 (XPS)",
    nameEn: "XPS",
    category: "insulation",
    conductivityWPerMK: 0.029,
    densityKgPerM3: 30,
    specificHeatJPerKgK: 1450,
    sourceNoteKo: 단열재등급,
    typicalThicknessesMm: [50, 80, 100, 120, 150, 200],
  }),
  M({
    id: "ins-pir",
    nameKo: "경질 우레탄 보드 (PIR/PUR)",
    nameEn: "PIR/PUR board",
    category: "insulation",
    conductivityWPerMK: 0.025,
    densityKgPerM3: 35,
    specificHeatJPerKgK: 1400,
    sourceNoteKo: 단열재등급,
    typicalThicknessesMm: [40, 60, 80, 100, 130, 160],
  }),
  M({
    id: "ins-pf",
    nameKo: "페놀폼 보드 (PF)",
    nameEn: "Phenolic foam board",
    category: "insulation",
    conductivityWPerMK: 0.02,
    densityKgPerM3: 40,
    specificHeatJPerKgK: 1400,
    sourceNoteKo: 단열재등급,
    typicalThicknessesMm: [30, 50, 70, 90, 110, 140],
  }),
  M({
    id: "ins-gw",
    nameKo: "글라스울 (24K)",
    nameEn: "Glass wool 24K",
    category: "insulation",
    conductivityWPerMK: 0.036,
    densityKgPerM3: 24,
    specificHeatJPerKgK: 840,
    sourceNoteKo: 단열재등급,
    typicalThicknessesMm: [50, 75, 100, 125, 150, 200],
  }),
  M({
    id: "ins-mw",
    nameKo: "미네랄울 (암면)",
    nameEn: "Mineral wool",
    category: "insulation",
    conductivityWPerMK: 0.038,
    densityKgPerM3: 60,
    specificHeatJPerKgK: 840,
    sourceNoteKo: 단열재등급,
    typicalThicknessesMm: [50, 75, 100, 125, 150],
  }),
  // ── 구조/마감 ───────────────────────────────────────────────────────
  M({
    id: "st-rc",
    nameKo: "철근콘크리트",
    nameEn: "Reinforced concrete",
    category: "concrete",
    conductivityWPerMK: 2.3,
    densityKgPerM3: 2400,
    specificHeatJPerKgK: 880,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [150, 180, 200, 250, 300],
  }),
  M({
    id: "st-lwc",
    nameKo: "경량 기포콘크리트 (ALC)",
    nameEn: "Autoclaved lightweight concrete",
    category: "concrete",
    conductivityWPerMK: 0.16,
    densityKgPerM3: 500,
    specificHeatJPerKgK: 1000,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [100, 150, 200],
  }),
  M({
    id: "st-brick",
    nameKo: "콘크리트 벽돌",
    nameEn: "Concrete brick",
    category: "masonry",
    conductivityWPerMK: 0.8,
    densityKgPerM3: 1800,
    specificHeatJPerKgK: 880,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [90, 190],
  }),
  M({
    id: "st-redbrick",
    nameKo: "점토 벽돌 (적벽돌)",
    nameEn: "Clay brick",
    category: "masonry",
    conductivityWPerMK: 0.78,
    densityKgPerM3: 1700,
    specificHeatJPerKgK: 880,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [90, 190],
  }),
  M({
    id: "fin-mortar",
    nameKo: "시멘트 모르타르",
    nameEn: "Cement mortar",
    category: "finish",
    conductivityWPerMK: 1.4,
    densityKgPerM3: 2000,
    specificHeatJPerKgK: 920,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [15, 20, 25, 30, 40],
  }),
  M({
    id: "fin-gypsum",
    nameKo: "석고보드",
    nameEn: "Gypsum board",
    category: "finish",
    conductivityWPerMK: 0.18,
    densityKgPerM3: 750,
    specificHeatJPerKgK: 1090,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [9.5, 12.5, 15, 19],
  }),
  M({
    id: "wd-structural",
    nameKo: "구조용 목재",
    nameEn: "Structural timber",
    category: "wood",
    conductivityWPerMK: 0.14,
    densityKgPerM3: 500,
    specificHeatJPerKgK: 1600,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [38, 89, 140, 184],
  }),
  M({
    id: "sn-granite",
    nameKo: "화강석",
    nameEn: "Granite",
    category: "stone",
    conductivityWPerMK: 3.1,
    densityKgPerM3: 2650,
    specificHeatJPerKgK: 790,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [20, 30],
  }),
  M({
    id: "mt-alpanel",
    nameKo: "알루미늄 복합패널",
    nameEn: "Aluminium composite panel",
    category: "metal",
    conductivityWPerMK: 160,
    densityKgPerM3: 2700,
    specificHeatJPerKgK: 900,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [4],
  }),
  // ── 공기층 ─────────────────────────────────────────────────────────
  M({
    id: "air-20",
    nameKo: "비환기 공기층 (20mm 이상)",
    nameEn: "Unventilated air cavity ≥ 20 mm",
    category: "air_cavity",
    fixedResistanceM2KPerW: 0.17,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [20, 30, 50],
  }),
  M({
    id: "air-10",
    nameKo: "비환기 공기층 (10mm)",
    nameEn: "Unventilated air cavity 10 mm",
    category: "air_cavity",
    fixedResistanceM2KPerW: 0.14,
    sourceNoteKo: KS관행,
    typicalThicknessesMm: [10],
  }),
  // ── 국제 표값 (§5.1) — 비(非)한국 기준건물용 ────────────────────────
  // EN 12524:2000 표 1은 EN ISO 10456:2007이 승계한 표다. ISO 10456 본문을
  // 무료로 열람할 수 없으므로 선행판을 직접 인용한다. 2차 출처를 표준인 것처럼
  // 표기하지 않기 위해 인용한 표 이름을 그대로 적는다.
  M({
    id: "mb-epdm",
    nameKo: "EPDM 방수시트",
    nameEn: "EPDM roofing membrane",
    category: "membrane",
    conductivityWPerMK: 0.25,
    densityKgPerM3: 1150,
    specificHeatJPerKgK: 1000,
    sourceNoteKo: `${EN12524} · 항목 "Ethylene propylene diene monomer (EPDM)" (ρ 1 150, λ 0,25, c 1 000)`,
    typicalThicknessesMm: [1.1, 1.5, 2.3],
  }),
  M({
    id: "ins-polyiso",
    nameKo: "폴리이소 보드 (지붕용, LTTR 설계값)",
    nameEn: "Polyisocyanurate roof board (LTTR)",
    category: "insulation",
    // R-5.7 h·ft²·°F/Btu per inch → λ = 0,0254 / (5,7 × 0,1761102) = 0,02530
    conductivityWPerMK: 0.0253,
    // ρ 생략: EN 12524 표 2는 경질 PU 폼을 28~55 kg/m³ '범위'로만 제시한다.
    // 범위는 단일 설계값이 아니므로 지어내지 않고 비워 둔다.
    specificHeatJPerKgK: 1400,
    sourceNoteKo:
      "ASTM C1289 LTTR 설계값 R-5.7/in 환산 (λ 0,0253) · c는 EN 12524:2000 표 2 경질 PU 폼 1 400 — 제조사 성적서 아님",
    typicalThicknessesMm: [50, 76, 90, 100, 130, 150],
  }),
  M({
    id: "mt-steel-deck",
    nameKo: "강재 데크플레이트",
    nameEn: "Profiled steel decking",
    category: "metal",
    conductivityWPerMK: 50,
    densityKgPerM3: 7800,
    specificHeatJPerKgK: 450,
    // 열저항은 사실상 0 (38 mm에서 0,00076 m²K/W). 도면에 적힌 층을 조용히
    // 빼지 않으려고 등재할 뿐이다. 단열재를 '관통'하는 데크는 열교이며
    // ISO 6946의 층별 계산법으로는 표현되지 않는다 — 그런 구성에 재사용 금지.
    sourceNoteKo: `${EN12524} · 항목 "Steel" (ρ 7 800, λ 50, c 450). 열저항 ≈ 0 — 단열재를 관통하는 데크의 열교는 층별 계산법으로 표현되지 않음`,
    typicalThicknessesMm: [38, 50, 75],
  }),
  M({
    id: "wd-plywood",
    nameKo: "합판 (구조용 덮개)",
    nameEn: "Plywood sheathing",
    category: "wood",
    conductivityWPerMK: 0.13,
    densityKgPerM3: 500,
    specificHeatJPerKgK: 1600,
    sourceNoteKo: `${EN12524} · 항목 "Plywood" ρ 500 행 (λ 0,13, c 1 600)`,
    typicalThicknessesMm: [9, 12, 15, 18, 19, 24],
  }),
  M({
    id: "pnl-imp-pir42",
    nameKo: "PIR 심재 금속 샌드위치 패널 42mm",
    nameEn: "PIR-cored insulated metal panel, 42 mm",
    category: "panel",
    // 이것은 '재료'가 아니라 완제품이다. 제품 성능은 λ가 아니라 표기 두께에서의
    // R/U로 공표되므로 고정 R을 쓴다 — 두께를 바꾸면 이 값은 무효다.
    fixedResistanceM2KPerW: 1.75,
    sourceNoteKo:
      "제조사 공표 경년 R-6.0/in을 42 mm에 적용 (R 1,75 m²K/W). 표준 표값이 아니라 제조사 자료임 · 업계 공표 범위 R-6.0~6.5/in ⇒ 1,66~1,89 m²K/W · 패널 이음부·관통 파스너 열교 미포함",
    typicalThicknessesMm: [42],
  }),
  M({
    id: "air-iso-h25",
    nameKo: "비환기 공기층 ≥25mm (수평 열류, ISO)",
    nameEn: "Unventilated air layer >= 25 mm, horizontal heat flow",
    category: "air_cavity",
    fixedResistanceM2KPerW: 0.18,
    // ISO 6946:2007 표 2는 수평 열류에서 25/50/100/300 mm 모두 0,18로 평평하다.
    // 한계가 중요하다: 표 2는 스터드 등으로 '분할되지 않은' 공기층을 전제한다
    // (5.3.1). 금속 스터드가 지나가는 중공층에 그대로 쓰면 열교가 통째로 빠진다.
    sourceNoteKo: `${ISO6946} · 수평 열류 25~300 mm 구간 0,18 m²K/W. 주의: 금속 스터드로 분할된 중공층에는 그대로 적용할 수 없음 (열교 미반영, 5.3.1 전제 위반)`,
    typicalThicknessesMm: [25, 38, 50, 100, 152],
  }),
  M({
    id: "air-iso-u25",
    nameKo: "비환기 공기층 ≥25mm (상향 열류, ISO)",
    nameEn: "Unventilated air layer >= 25 mm, upward heat flow",
    category: "air_cavity",
    fixedResistanceM2KPerW: 0.16,
    // ISO 6946:2007 표 2는 열류 방향마다 값이 다르다. 상향은 25~300 mm 구간에서
    // 0,16으로 평평하지만 수평은 0,18이다. 지붕(상향)에 수평값을 쓰면 저항을
    // 과대평가해 U를 낮게 만든다 — 건물이 실제보다 좋아 보이는 방향이다.
    // 하향(바닥)은 두께에 따라 0,19~0,23으로 변하므로 단일 항목으로 만들지 않는다.
    sourceNoteKo: `${ISO6946} · 상향 열류 25~300 mm 구간 0,16 m²K/W. 수평(0,18)과 혼동 금지 — 지붕에 수평값을 쓰면 U가 낮게 나온다. 주의: 스터드·조이스트로 분할된 층에는 그대로 적용할 수 없음 (열교 미반영, 5.3.1 전제 위반)`,
    typicalThicknessesMm: [25, 38, 50, 100, 286],
  }),
  M({
    id: "fin-plasterboard-iso",
    nameKo: "석고보드 (ISO 표값)",
    nameEn: "Gypsum plasterboard (ISO tabulated)",
    category: "finish",
    conductivityWPerMK: 0.25,
    densityKgPerM3: 900,
    specificHeatJPerKgK: 1000,
    // 기존 fin-gypsum(0,18)은 KS 관행값이며 그대로 둔다. 두 값은 서로 다른
    // 출처이지 오타가 아니다 — 비한국 건물에는 이쪽을 쓴다.
    sourceNoteKo: `${EN12524} · 항목 "Gypsum plasterboard" (ρ 900, λ 0,25, c 1 000). 표 주석 (b): λ에 종이 라이너 효과 포함`,
    typicalThicknessesMm: [12.5, 15, 16, 19],
  }),
]);

const BY_ID = new Map(GENERIC_MATERIALS.map((m) => [m.id, m]));

export function genericMaterialById(id: string): GenericMaterial | undefined {
  return BY_ID.get(id);
}

export function genericMaterialsByCategory(category: MaterialCategory): readonly GenericMaterial[] {
  return GENERIC_MATERIALS.filter((m) => m.category === category);
}

/** Searchable palette: matches Korean or English names, case-insensitive. */
export function searchGenericMaterials(query: string): readonly GenericMaterial[] {
  const q = query.trim().toLowerCase();
  if (!q) return GENERIC_MATERIALS;
  return GENERIC_MATERIALS.filter(
    (m) => m.nameKo.toLowerCase().includes(q) || m.nameEn.toLowerCase().includes(q)
  );
}
