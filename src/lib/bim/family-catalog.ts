// Typed index of the Blender-authored Revit Architecture family library.
// Geometry files: public/models/authoring/*.glb
// Slot defaults used by workflow/views: public/bim-assets/*.glb

export type AuthoringFamilyKind = "system" | "loadable";

export type AuthoringToolId =
  | "wall"
  | "door"
  | "window"
  | "column"
  | "floor"
  | "roof"
  | "ceiling"
  | "stair"
  | "railing"
  | "furniture"
  | "plumbing"
  | "lighting"
  | "planting";

export type AuthoringPlacement =
  | "linear"
  | "point"
  | "hosted"
  | "sketch-boundary"
  | "sketch-footprint"
  | "sketch-or-auto"
  | "sketch"
  | "component"
  | "component-run"
  | "component-landing";

export interface AuthoringToolDef {
  id: AuthoringToolId;
  labelEn: string;
  labelKo: string;
  categoryEn: string;
  categoryKo: string;
}

export interface AuthoringFamily {
  id: string;
  file: string;
  path: string;
  tool: AuthoringToolId;
  category: string;
  categoryKo: string;
  family: string;
  familyKo: string;
  type: string;
  typeKo: string;
  familyKind: AuthoringFamilyKind;
  host: string;
  origin: string;
  placement: AuthoringPlacement;
  courseRef: string;
}

export const AUTHORING_FAMILY_BASE = "/models/authoring";

/** Architecture-tab tools for the building authoring aspect. */
export const AUTHORING_TOOLS: AuthoringToolDef[] = [
  { id: "wall", labelEn: "Wall", labelKo: "벽", categoryEn: "Walls", categoryKo: "벽" },
  { id: "door", labelEn: "Door", labelKo: "문", categoryEn: "Doors", categoryKo: "문" },
  { id: "window", labelEn: "Window", labelKo: "창", categoryEn: "Windows", categoryKo: "창" },
  { id: "column", labelEn: "Column", labelKo: "기둥", categoryEn: "Columns", categoryKo: "기둥" },
  { id: "floor", labelEn: "Floor", labelKo: "바닥", categoryEn: "Floors", categoryKo: "바닥" },
  { id: "roof", labelEn: "Roof", labelKo: "지붕", categoryEn: "Roofs", categoryKo: "지붕" },
  { id: "ceiling", labelEn: "Ceiling", labelKo: "천장", categoryEn: "Ceilings", categoryKo: "천장" },
  { id: "stair", labelEn: "Stair", labelKo: "계단", categoryEn: "Stairs", categoryKo: "계단" },
  { id: "railing", labelEn: "Railing", labelKo: "난간", categoryEn: "Railings", categoryKo: "난간" },
  { id: "lighting", labelEn: "Light", labelKo: "조명", categoryEn: "Lighting Fixtures", categoryKo: "조명 기구" },
  { id: "furniture", labelEn: "Furniture", labelKo: "가구", categoryEn: "Furniture", categoryKo: "가구" },
  { id: "plumbing", labelEn: "Plumbing", labelKo: "위생", categoryEn: "Plumbing Fixtures", categoryKo: "위생기구" },
  { id: "planting", labelEn: "Planting", labelKo: "식재", categoryEn: "Planting", categoryKo: "식재" },
];

function fam(
  id: string,
  tool: AuthoringToolId,
  category: string,
  categoryKo: string,
  family: string,
  familyKo: string,
  type: string,
  typeKo: string,
  familyKind: AuthoringFamilyKind,
  host: string,
  origin: string,
  placement: AuthoringPlacement,
  courseRef: string
): AuthoringFamily {
  return {
    id,
    file: `${id}.glb`,
    path: `${AUTHORING_FAMILY_BASE}/${id}.glb`,
    tool,
    category,
    categoryKo,
    family,
    familyKo,
    type,
    typeKo,
    familyKind,
    host,
    origin,
    placement,
    courseRef,
  };
}

export const AUTHORING_FAMILIES: AuthoringFamily[] = [
  fam("wall-basic-generic-200", "wall", "Walls", "벽", "Basic Wall", "기본 벽", "Generic 200mm", "일반 200mm", "system", "level", "start-centerline-base", "linear", "Generic Wall Type"),
  fam("wall-exterior-brick-on-cmu", "wall", "Walls", "벽", "Basic Wall", "기본 벽", "Exterior – Brick on CMU", "외부 – 벽돌+CMU", "system", "level", "start-centerline-base", "linear", "Exterior – Brick on CMU"),
  fam("wall-exterior-cmu-insulated", "wall", "Walls", "벽", "Basic Wall", "기본 벽", "Exterior – CMU Insulated", "외부 – 단열 CMU", "system", "level", "start-centerline-base", "linear", "Exterior – CMU Insulated"),
  fam("wall-interior-partition", "wall", "Walls", "벽", "Basic Wall", "기본 벽", "Interior – Partition", "내부 – 칸막이", "system", "level", "start-centerline-base", "linear", "Interior – Partition"),
  fam("wall-stacked-brick-cmu", "wall", "Walls", "벽", "Stacked Wall", "적층 벽", "Exterior – Brick Base + CMU", "외부 – 벽돌 하단 + CMU", "system", "level", "start-centerline-base", "linear", "Stacked Walls"),
  fam("curtain-mullion-rect-50x150", "wall", "Curtain Wall Mullions", "커튼월 멀리언", "Rectangular Mullion", "각형 멀리언", "50 x 150mm", "50 × 150mm", "system", "curtain-grid", "center-axis", "linear", "Mullions and panels"),
  fam("curtain-panel-glazed", "wall", "Curtain Panels", "커튼월 패널", "System Panel", "시스템 패널", "Glazed", "유리", "system", "curtain-grid", "bottom-center", "hosted", "Mullions and panels"),
  fam("curtain-wall-storefront", "wall", "Walls", "벽", "Curtain Wall", "커튼월", "Storefront", "스토어프론트", "system", "level", "start-centerline-base", "linear", "Curtain Wall"),
  fam("door-single-flush-910", "door", "Doors", "문", "Single-Flush", "단여닫이", "Generic 910mm", "일반 910mm", "loadable", "wall", "opening-center-floor", "hosted", "Generic 910mm"),
  fam("door-single-flush-810", "door", "Doors", "문", "Single-Flush", "단여닫이", "Generic 810mm", "일반 810mm", "loadable", "wall", "opening-center-floor", "hosted", "Doors"),
  fam("door-double-flush-1800", "door", "Doors", "문", "Double-Flush", "양여닫이", "Generic 1800mm", "일반 1800mm", "loadable", "wall", "opening-center-floor", "hosted", "Doors"),
  fam("door-glass-storefront", "door", "Doors", "문", "Glass", "유리문", "Storefront 1000mm", "스토어프론트 1000mm", "loadable", "wall", "opening-center-floor", "hosted", "Doors"),
  fam("window-fixed-1200x1500", "window", "Windows", "창", "Fixed", "고정창", "Fixed 1200 x 1500mm", "고정 1200 × 1500mm", "loadable", "wall", "opening-center", "hosted", "Windows"),
  fam("window-casement-900x1200", "window", "Windows", "창", "Casement", "여닫이창", "Casement 900 x 1200mm", "여닫이 900 × 1200mm", "loadable", "wall", "opening-center", "hosted", "Windows"),
  fam("window-sliding-1800x1500", "window", "Windows", "창", "Sliding", "미서기창", "Sliding 1800 x 1500mm", "미서기 1800 × 1500mm", "loadable", "wall", "opening-center", "hosted", "Windows"),
  fam("window-awning-900x600", "window", "Windows", "창", "Awning", "프로젝트창", "Awning 900 x 600mm", "프로젝트 900 × 600mm", "loadable", "wall", "opening-center", "hosted", "Windows"),
  fam("column-struct-round-450", "column", "Structural Columns", "구조 기둥", "Round Column", "원형 기둥", "450 mm", "450 mm", "system", "level", "base-center", "point", "Round columns 450 mm"),
  fam("column-struct-round-600", "column", "Structural Columns", "구조 기둥", "Round Column", "원형 기둥", "600 mm", "600 mm", "system", "level", "base-center", "point", "Round columns 600 mm"),
  fam("column-struct-rect-450x600", "column", "Structural Columns", "구조 기둥", "Rectangular Column", "각형 기둥", "450x600mm", "450x600mm", "system", "level", "base-center", "point", "Rectangular 450x600"),
  fam("column-struct-rect-600x750", "column", "Structural Columns", "구조 기둥", "Rectangular Column", "각형 기둥", "600x750mm", "600x750mm", "system", "level", "base-center", "point", "Rectangular 600x750"),
  fam("column-arch-rect-400", "column", "Columns", "건축 기둥", "Rectangular Column", "각형 기둥", "Architectural Wrap 400mm", "건축 마감 400mm", "system", "level", "base-center", "point", "Architectural column wrap"),
  fam("floor-generic-150", "floor", "Floors", "바닥", "Floor", "바닥", "Generic 150mm", "일반 150mm", "system", "level", "center-top", "sketch-boundary", "Floors"),
  fam("floor-concrete-200", "floor", "Floors", "바닥", "Floor", "바닥", "Concrete 200mm", "콘크리트 200mm", "system", "level", "center-top", "sketch-boundary", "Floors"),
  fam("floor-wood-finish", "floor", "Floors", "바닥", "Floor", "바닥", "Wood Finish 186mm", "목재 마감 186mm", "system", "level", "center-top", "sketch-boundary", "Floors"),
  fam("roof-basic-flat", "roof", "Roofs", "지붕", "Basic Roof", "기본 지붕", "Warm Roof – Flat", "평지붕", "system", "level", "center-bottom", "sketch-footprint", "Roof by Footprint"),
  fam("roof-pitched-module", "roof", "Roofs", "지붕", "Basic Roof", "기본 지붕", "Pitched 30° Tile", "경사 30° 기와", "system", "level", "eave-center", "sketch-footprint", "Pitched roof"),
  fam("ceiling-generic-gypsum", "ceiling", "Ceilings", "천장", "Compound Ceiling", "복합 천장", "Gypsum 15mm", "석고 15mm", "system", "level", "center-top", "sketch-or-auto", "Ceilings"),
  fam("ceiling-acoustic-tile", "ceiling", "Ceilings", "천장", "Compound Ceiling", "복합 천장", "600 x 600mm Acoustic", "600 × 600mm 흡음", "system", "level", "center-top", "sketch-or-auto", "Ceilings"),
  fam("stair-run-8riser", "stair", "Stairs", "계단", "Assembled Stair", "조립식 계단", "8 Riser 175/280", "8단 175/280", "system", "level-to-level", "first-riser-nosing", "component-run", "Stairs by Component"),
  fam("stair-landing-1200", "stair", "Stairs", "계단", "Stair Landing", "계단참", "1200 x 1200mm", "1200 × 1200mm", "system", "stair", "center-top", "component-landing", "Landings"),
  fam("railing-guard-1m", "railing", "Railings", "난간", "Guardrail", "난간", "1100mm Pipe", "1100mm 파이프", "system", "stair-or-floor", "start-base", "sketch", "Railings"),
  fam("railing-handrail-1m", "railing", "Railings", "난간", "Handrail", "손스침", "Circular 42mm", "원형 42mm", "system", "wall-or-stair", "start-mount", "sketch", "Handrails"),
  fam("ramp-module", "stair", "Ramps", "램프", "Ramp", "램프", "1:12 Concrete", "1:12 콘크리트", "system", "level", "bottom-center", "sketch", "Ramps"),
  fam("light-troffer-600", "lighting", "Lighting Fixtures", "조명 기구", "Troffer", "매립등", "LED 600 x 600mm", "LED 600 × 600mm", "loadable", "ceiling", "ceiling-plane", "hosted", "Ceiling-hosted lights"),
  fam("light-pendant", "lighting", "Lighting Fixtures", "조명 기구", "Pendant Light", "펜던트", "Dome 400mm", "돔 400mm", "loadable", "ceiling", "ceiling-plane", "hosted", "Lights"),
  fam("light-downlight", "lighting", "Lighting Fixtures", "조명 기구", "Downlight", "다운라이트", "Recessed 90mm", "매립 90mm", "loadable", "ceiling", "ceiling-plane", "hosted", "Lights"),
  fam("furniture-desk", "furniture", "Furniture", "가구", "Desk", "책상", "1400 x 700mm", "1400 × 700mm", "loadable", "level", "base-center", "component", "Furniture"),
  fam("furniture-task-chair", "furniture", "Furniture", "가구", "Chair", "의자", "Task Chair", "사무용 의자", "loadable", "level", "base-center", "component", "Furniture"),
  fam("furniture-sofa-2seat", "furniture", "Furniture", "가구", "Sofa", "소파", "2-Seat", "2인용", "loadable", "level", "base-center", "component", "Furniture"),
  fam("furniture-dining-table", "furniture", "Furniture", "가구", "Table", "테이블", "Round 1200mm", "원형 1200mm", "loadable", "level", "base-center", "component", "Furniture"),
  fam("furniture-bed-queen", "furniture", "Furniture", "가구", "Bed", "침대", "Queen 1600mm", "퀸 1600mm", "loadable", "level", "base-center", "component", "Furniture"),
  fam("plumbing-toilet", "plumbing", "Plumbing Fixtures", "위생기구", "Toilet", "변기", "Floor Mounted", "바닥 설치", "loadable", "level", "base-center", "component", "Plumbing Fixtures"),
  fam("plumbing-lavatory", "plumbing", "Plumbing Fixtures", "위생기구", "Lavatory", "세면기", "Pedestal", "페데스탈", "loadable", "level", "base-center", "component", "Plumbing Fixtures"),
  fam("plumbing-kitchen-sink", "plumbing", "Plumbing Fixtures", "위생기구", "Sink", "싱크", "Single Bowl 800mm", "싱글볼 800mm", "loadable", "level", "base-center", "component", "Plumbing Fixtures"),
  fam("planting-tree-deciduous", "planting", "Planting", "식재", "RPC Tree", "수목", "Deciduous", "낙엽수", "loadable", "toposurface", "base-center", "component", "Planting"),
  fam("planting-shrub", "planting", "Planting", "식재", "RPC Shrub", "관목", "Generic", "일반", "loadable", "toposurface", "base-center", "component", "Planting"),
];

/** Every family authored from the Revit basic-course authoring set. */
export const AUTHORING_FAMILY_IDS = AUTHORING_FAMILIES.map((f) => f.id);

export function getAuthoringFamily(id: string | null | undefined): AuthoringFamily | undefined {
  if (!id) return undefined;
  return AUTHORING_FAMILIES.find((f) => f.id === id);
}

export function familiesForTool(tool: AuthoringToolId): AuthoringFamily[] {
  return AUTHORING_FAMILIES.filter((f) => f.tool === tool);
}

export function defaultFamilyForTool(tool: AuthoringToolId): AuthoringFamily {
  const list = familiesForTool(tool);
  if (list.length === 0) {
    throw new Error(`No authoring families for tool: ${tool}`);
  }
  return list[0];
}

export function getAuthoringTool(id: AuthoringToolId): AuthoringToolDef {
  const found = AUTHORING_TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown authoring tool: ${id}`);
  return found;
}

export function familyTypeLabel(family: AuthoringFamily, lang: "ko" | "en"): string {
  return lang === "ko"
    ? `${family.familyKo} : ${family.typeKo}`
    : `${family.family} : ${family.type}`;
}

export function familyIdentityLabel(family: AuthoringFamily, lang: "ko" | "en"): string {
  return lang === "ko"
    ? `${family.categoryKo} : ${family.familyKo} : ${family.typeKo}`
    : `${family.category} : ${family.family} : ${family.type}`;
}

export type AuthoringFamilyId = (typeof AUTHORING_FAMILIES)[number]["id"];

export function authoringFamilyUrl(id: AuthoringFamilyId | string): string {
  return `${AUTHORING_FAMILY_BASE}/${id}.glb`;
}
