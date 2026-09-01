// src/lib/rendering/material-ontology.ts
// Semantic families the renderer understands. Engineering assemblies (λ, U)
// live in src/lib/energy-standards/. This tree is visual classification only.

import type { MaterialFamily, VisualMaterialId } from "./types";

export interface OntologyNode {
  id: VisualMaterialId;
  family: MaterialFamily;
  nameKo: string;
  nameEn: string;
}

export const MATERIAL_ONTOLOGY: readonly OntologyNode[] = Object.freeze([
  { id: "concrete-cast", family: "concrete", nameKo: "현장타설 콘크리트", nameEn: "Cast-in-place concrete" },
  { id: "concrete-precast", family: "concrete", nameKo: "프리캐스트 콘크리트", nameEn: "Precast concrete" },
  { id: "concrete-polished", family: "concrete", nameKo: "폴리싱 콘크리트", nameEn: "Polished concrete" },
  { id: "concrete-board-formed", family: "concrete", nameKo: "거푸집 콘크리트", nameEn: "Board-formed concrete" },
  { id: "concrete-exposed-aggregate", family: "concrete", nameKo: "노출골재 콘크리트", nameEn: "Exposed-aggregate concrete" },
  { id: "concrete-architectural", family: "concrete", nameKo: "건축용 콘크리트", nameEn: "Architectural concrete" },
  { id: "brick-red-clay", family: "brick", nameKo: "적벽돌", nameEn: "Red clay brick" },
  { id: "brick-brown-clay", family: "brick", nameKo: "갈벽돌", nameEn: "Brown clay brick" },
  { id: "brick-white", family: "brick", nameKo: "백벽돌", nameEn: "White brick" },
  { id: "brick-weathered", family: "brick", nameKo: "풍화 벽돌", nameEn: "Weathered brick" },
  { id: "brick-glazed", family: "brick", nameKo: "유약 벽돌", nameEn: "Glazed brick" },
  { id: "stone-granite", family: "stone", nameKo: "화강석", nameEn: "Granite" },
  { id: "stone-limestone", family: "stone", nameKo: "석회암", nameEn: "Limestone" },
  { id: "stone-marble", family: "stone", nameKo: "대리석", nameEn: "Marble" },
  { id: "stone-sandstone", family: "stone", nameKo: "사암", nameEn: "Sandstone" },
  { id: "stone-slate", family: "stone", nameKo: "슬레이트", nameEn: "Slate" },
  { id: "metal-aluminum", family: "metal", nameKo: "알루미늄", nameEn: "Aluminum" },
  { id: "metal-stainless", family: "metal", nameKo: "스테인리스 강", nameEn: "Stainless steel" },
  { id: "metal-galvanized", family: "metal", nameKo: "아연도금 강", nameEn: "Galvanized steel" },
  { id: "metal-painted-steel", family: "metal", nameKo: "도장 강판", nameEn: "Painted steel" },
  { id: "metal-copper", family: "metal", nameKo: "구리", nameEn: "Copper" },
  { id: "metal-zinc", family: "metal", nameKo: "아연", nameEn: "Zinc" },
  { id: "metal-weathering-steel", family: "metal", nameKo: "내후성강", nameEn: "Weathering steel" },
  { id: "glass-clear", family: "glass", nameKo: "투명 유리", nameEn: "Clear glazing" },
  { id: "glass-low-e", family: "glass", nameKo: "로이유리", nameEn: "Low-E glazing" },
  { id: "glass-tinted", family: "glass", nameKo: "착색 유리", nameEn: "Tinted glazing" },
  { id: "glass-reflective", family: "glass", nameKo: "반사 유리", nameEn: "Reflective glazing" },
  { id: "glass-frosted", family: "glass", nameKo: "프로스티드 유리", nameEn: "Frosted glazing" },
  { id: "glass-laminated", family: "glass", nameKo: "접합 유리", nameEn: "Laminated glazing" },
  { id: "wood-oak", family: "wood", nameKo: "참나무", nameEn: "Oak" },
  { id: "wood-pine", family: "wood", nameKo: "소나무", nameEn: "Pine" },
  { id: "wood-cedar", family: "wood", nameKo: "삼나무", nameEn: "Cedar" },
  { id: "wood-engineered", family: "wood", nameKo: "공학목재", nameEn: "Engineered timber" },
  { id: "wood-exterior-weathered", family: "wood", nameKo: "외부 풍화 목재", nameEn: "Exterior weathered wood" },
  { id: "roof-asphalt", family: "roof", nameKo: "아스팔트 지붕", nameEn: "Asphalt roof" },
  { id: "roof-membrane", family: "roof", nameKo: "방수 시트", nameEn: "Roof membrane" },
  { id: "roof-clay-tile", family: "roof", nameKo: "점토 기와", nameEn: "Clay tile" },
  { id: "roof-concrete-tile", family: "roof", nameKo: "콘크리트 기와", nameEn: "Concrete tile" },
  { id: "roof-standing-seam", family: "roof", nameKo: "거멀접기 금속지붕", nameEn: "Standing-seam metal" },
  { id: "roof-green", family: "roof", nameKo: "녹화 지붕", nameEn: "Green roof" },
  { id: "ground-asphalt", family: "ground", nameKo: "아스팔트 포장", nameEn: "Asphalt" },
  { id: "ground-concrete-pavement", family: "ground", nameKo: "콘크리트 포장", nameEn: "Concrete pavement" },
  { id: "ground-paver", family: "ground", nameKo: "블록 포장", nameEn: "Pavers" },
  { id: "ground-gravel", family: "ground", nameKo: "자갈", nameEn: "Gravel" },
  { id: "ground-soil", family: "ground", nameKo: "흙", nameEn: "Soil" },
  { id: "ground-grass", family: "ground", nameKo: "잔디", nameEn: "Grass" },
  { id: "paint-stucco", family: "paint", nameKo: "스터코 마감", nameEn: "Stucco" },
  { id: "interior-cavity", family: "paint", nameKo: "실내 공동", nameEn: "Interior cavity" },
]);

const BY_ID = new Map(MATERIAL_ONTOLOGY.map((n) => [n.id, n]));

export function getOntologyNode(id: VisualMaterialId): OntologyNode {
  const node = BY_ID.get(id);
  if (!node) throw new Error(`Unknown visual material id: ${id}`);
  return node;
}

export function familyOf(id: VisualMaterialId): MaterialFamily {
  return getOntologyNode(id).family;
}
