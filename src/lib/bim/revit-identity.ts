// src/lib/bim/revit-identity.ts
// Revit Category → Family → Type identity for procedural / IFC / MEP elements.
// Honest display metadata — not a full family editor (deferred to v7/v8).

import type { ElementKind } from "./element-id";
import {
  classifyElement,
  structureFamilyFor,
  FAMILY_LABELS,
  type StructureFamily,
} from "./ifc-classification";
import type { DataSource } from "@/lib/material-types";
import type { SelectableType, SelectedEquipmentInfo } from "@/store/selection-store";
import { identitySlotFor, type BimAssetSlotId } from "./asset-slots";

export type LodLevel = 100 | 200 | 300 | 350;

export type FamilyKind = "system" | "loadable";

export interface RevitIdentity {
  category: string;
  categoryKo: string;
  family: string;
  familyKo: string;
  type: string;
  typeKo: string;
  familyKind: FamilyKind;
  lod: LodLevel;
  ifcClass?: string;
  /** Slot the 3D-asset session fills; procedural fallback until published. */
  assetSlot: BimAssetSlotId;
  displayEn: string;
  displayKo: string;
}

export interface IdentityContext {
  elementType?: string;
  kind?: ElementKind | SelectableType;
  strctCd?: string;
  curtainWall?: boolean;
  wallThicknessM?: number;
  columnSizeM?: number;
  materialSource?: DataSource;
  equipment?: SelectedEquipmentInfo | null;
}

const CATEGORY: Record<string, { en: string; ko: string; familyKind: FamilyKind }> = {
  wall: { en: "Walls", ko: "벽", familyKind: "system" },
  slab: { en: "Floors", ko: "바닥", familyKind: "system" },
  roof: { en: "Roofs", ko: "지붕", familyKind: "system" },
  column: { en: "Structural Columns", ko: "구조 기둥", familyKind: "system" },
  window: { en: "Windows", ko: "창", familyKind: "loadable" },
  door: { en: "Doors", ko: "문", familyKind: "loadable" },
  room: { en: "Rooms", ko: "실", familyKind: "system" },
  mep: { en: "Mechanical Equipment", ko: "기계 설비", familyKind: "loadable" },
  lighting: { en: "Lighting Fixtures", ko: "조명 기구", familyKind: "loadable" },
  electrical: { en: "Electrical Equipment", ko: "전기 설비", familyKind: "loadable" },
  annotation: { en: "Generic Annotations", ko: "일반 주석", familyKind: "loadable" },
  level: { en: "Levels", ko: "레벨", familyKind: "system" },
  grid: { en: "Grids", ko: "그리드", familyKind: "system" },
};

const MEP_FAMILY: Record<string, { en: string; ko: string; category: keyof typeof CATEGORY }> = {
  chiller: { en: "Chiller", ko: "칠러", category: "mep" },
  boiler: { en: "Boiler", ko: "보일러", category: "mep" },
  ahu: { en: "Air Handling Unit", ko: "공조기", category: "mep" },
  dhw: { en: "DHW Tank", ko: "급탕 탱크", category: "mep" },
  lightingFixture: { en: "Lighting Fixture", ko: "조명 기구", category: "lighting" },
  electricalPanel: { en: "Electrical Panel", ko: "분전반", category: "electrical" },
};

export function inferLod(source?: DataSource): LodLevel {
  if (source === "user-input" || source === "energy-cert") return 350;
  if (source === "ifc-import" || source === "ifc-model") return 300;
  return 200;
}

function mm(meters: number | undefined, fallback: number): number {
  const n = meters ?? fallback;
  return Math.round(n * 1000);
}

function pack(identity: Omit<RevitIdentity, "displayEn" | "displayKo">): RevitIdentity {
  return {
    ...identity,
    displayEn: `${identity.category} : ${identity.family} : ${identity.type}`,
    displayKo: `${identity.categoryKo} : ${identity.familyKo} : ${identity.typeKo}`,
  };
}

function structureTypeLabel(family: StructureFamily, thicknessMm: number): {
  en: string;
  ko: string;
} {
  const mat = FAMILY_LABELS[family];
  return {
    en: `Exterior – ${mat.en} ${thicknessMm}mm`,
    ko: `외부 – ${mat.ko} ${thicknessMm}mm`,
  };
}

/**
 * Resolve Category / Family / Type for a selected or classified element.
 */
export function resolveRevitIdentity(ctx: IdentityContext): RevitIdentity {
  const lod = inferLod(ctx.materialSource);
  const family = structureFamilyFor(ctx.strctCd);
  const mat = FAMILY_LABELS[family];

  if (ctx.equipment) {
    const raw = ctx.equipment.componentType;
    const mapped =
      MEP_FAMILY[raw] ??
      MEP_FAMILY[ctx.equipment.subLayerId === "lighting" ? "lightingFixture" : ""] ??
      null;
    const catKey = mapped?.category ?? "mep";
    const cat = CATEGORY[catKey];
    const famEn = mapped?.en ?? "MEP Equipment";
    const famKo = mapped?.ko ?? "MEP 설비";
    const typeEn = ctx.equipment.specs?.categoryEn ?? ctx.equipment.componentType;
    const typeKo = ctx.equipment.specs?.categoryKo ?? ctx.equipment.componentType;
    return pack({
      category: cat.en,
      categoryKo: cat.ko,
      family: famEn,
      familyKo: famKo,
      type: typeEn,
      typeKo: typeKo,
      familyKind: cat.familyKind,
      lod,
      ifcClass: "IfcBuildingElementProxy",
      assetSlot: identitySlotFor(raw, { mepType: raw }),
    });
  }

  const elementType = ctx.elementType ?? ctx.kind ?? "wall";
  const classified = classifyElement(String(elementType), {
    strctCd: ctx.strctCd,
    curtainWall: ctx.curtainWall,
  });

  const kind = (ctx.kind ?? mapTypeToKind(elementType)) ?? "wall";

  if (kind === "window" || elementType === "glass") {
    const cat = ctx.curtainWall ? CATEGORY.wall : CATEGORY.window;
    return pack({
      category: ctx.curtainWall ? cat.en : CATEGORY.window.en,
      categoryKo: ctx.curtainWall ? cat.ko : CATEGORY.window.ko,
      family: ctx.curtainWall ? "Curtain Wall" : "Fixed Window",
      familyKo: ctx.curtainWall ? "커튼월" : "고정창",
      type: classified?.ifcClass === "IfcCurtainWall" ? "Curtain Wall System" : "Generic Glazing",
      typeKo: classified?.ifcClass === "IfcCurtainWall" ? "커튼월 시스템" : "일반 유리",
      familyKind: ctx.curtainWall ? "system" : "loadable",
      lod,
      ifcClass: classified?.ifcClass,
      assetSlot: identitySlotFor("window", { curtainWall: ctx.curtainWall }),
    });
  }

  if (kind === "door") {
    return pack({
      category: CATEGORY.door.en,
      categoryKo: CATEGORY.door.ko,
      family: "Single-Flush",
      familyKo: "단여닫이",
      type: "Generic 910mm",
      typeKo: "일반 910mm",
      familyKind: "loadable",
      lod,
      ifcClass: "IfcDoor",
      assetSlot: identitySlotFor("door"),
    });
  }

  if (kind === "column" || elementType === "column" || elementType === "structural-column") {
    const size = mm(ctx.columnSizeM, 0.5);
    return pack({
      category: CATEGORY.column.en,
      categoryKo: CATEGORY.column.ko,
      family: "Rectangular Column",
      familyKo: "각형 기둥",
      type: `${size} x ${size} mm`,
      typeKo: `${size} x ${size} mm`,
      familyKind: "system",
      lod,
      ifcClass: classified?.ifcClass ?? "IfcColumn",
      assetSlot: identitySlotFor("column"),
    });
  }

  if (kind === "slab" || elementType === "slab" || elementType === "roof") {
    const isRoof = elementType === "roof";
    const cat = isRoof ? CATEGORY.roof : CATEGORY.slab;
    return pack({
      category: cat.en,
      categoryKo: cat.ko,
      family: isRoof ? "Basic Roof" : "Floor",
      familyKo: isRoof ? "기본 지붕" : "바닥",
      type: `${mat.en} ${isRoof ? "Roof" : "Floor"}`,
      typeKo: `${mat.ko} ${isRoof ? "지붕" : "바닥"}`,
      familyKind: "system",
      lod,
      ifcClass: classified?.ifcClass,
      assetSlot: identitySlotFor(isRoof ? "roof" : "slab"),
    });
  }

  if (kind === "room") {
    return pack({
      category: CATEGORY.room.en,
      categoryKo: CATEGORY.room.ko,
      family: "Room",
      familyKo: "실",
      type: "Occupiable Space",
      typeKo: "점유 공간",
      familyKind: "system",
      lod,
      ifcClass: "IfcSpace",
      assetSlot: "family.floor.basic",
    });
  }

  if (kind === "annotation") {
    return pack({
      category: CATEGORY.annotation.en,
      categoryKo: CATEGORY.annotation.ko,
      family: "Tag",
      familyKo: "태그",
      type: "By Category",
      typeKo: "카테고리별",
      familyKind: "loadable",
      lod: 200,
      assetSlot: "family.wall.basic",
    });
  }

  if (kind === "level") {
    return pack({
      category: CATEGORY.level.en,
      categoryKo: CATEGORY.level.ko,
      family: "Level",
      familyKo: "레벨",
      type: "Story Level",
      typeKo: "층 레벨",
      familyKind: "system",
      lod: 200,
      assetSlot: "family.wall.basic",
    });
  }

  if (kind === "grid") {
    return pack({
      category: CATEGORY.grid.en,
      categoryKo: CATEGORY.grid.ko,
      family: "Grid",
      familyKo: "그리드",
      type: "Structural Grid",
      typeKo: "구조 그리드",
      familyKind: "system",
      lod: 200,
      assetSlot: "family.wall.basic",
    });
  }

  const thickness = mm(ctx.wallThicknessM, 0.2);
  const typeLabel = structureTypeLabel(family, thickness);
  const isCurtain = Boolean(ctx.curtainWall);
  return pack({
    category: CATEGORY.wall.en,
    categoryKo: CATEGORY.wall.ko,
    family: isCurtain ? "Curtain Wall" : "Basic Wall",
    familyKo: isCurtain ? "커튼월" : "기본 벽",
    type: typeLabel.en,
    typeKo: typeLabel.ko,
    familyKind: "system",
    lod,
    ifcClass: classified?.ifcClass ?? "IfcWall",
    assetSlot: identitySlotFor("wall", { curtainWall: isCurtain }),
  });
}

function mapTypeToKind(elementType: string): ElementKind | SelectableType | undefined {
  switch (elementType) {
    case "solidPanel":
    case "wall":
      return "wall";
    case "slab":
      return "slab";
    case "roof":
      return "slab";
    case "column":
    case "structural-column":
      return "column";
    case "glass":
    case "window":
      return "window";
    case "door":
      return "door";
    case "room":
      return "room";
    default:
      return undefined;
  }
}
