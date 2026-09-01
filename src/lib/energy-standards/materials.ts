/**
 * Generic Korean building-material thermal library.
 *
 * Traceability §5 in docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md.
 * Every λ/ρ/c value here is a GENERIC mid-range figure from the
 * 에너지절약설계기준 단열재 등급분류(별표2 가~라) convention and KS-typical
 * published bands — never a manufacturer's certified performance. That is a
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
