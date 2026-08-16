// src/lib/bim/model/parameters.ts
// Built-in type/instance parameter definitions + family-catalog inference.

import type { AuthoringFamily } from "../family-catalog";
import { familySemantics } from "../family-semantics";
import type { BimParameterDef, BimParamValue, BimType } from "./types";

export const WALL_TYPE_PARAMS: BimParameterDef[] = [
  { name: "thicknessMm", labelKo: "두께", labelEn: "Thickness", dataType: "number", unitType: "mm", group: "dimensions", scope: "type" },
  { name: "structural", labelKo: "구조", labelEn: "Structural", dataType: "boolean", unitType: "none", group: "constraints", scope: "type" },
  { name: "roomBounding", labelKo: "실 경계", labelEn: "Room Bounding", dataType: "boolean", unitType: "none", group: "constraints", scope: "type" },
];

export const WALL_INSTANCE_PARAMS: BimParameterDef[] = [
  { name: "baseOffsetMm", labelKo: "하단 오프셋", labelEn: "Base Offset", dataType: "number", unitType: "mm", group: "constraints", scope: "instance" },
  { name: "unconnectedHeightM", labelKo: "비연결 높이", labelEn: "Unconnected Height", dataType: "number", unitType: "m", group: "constraints", scope: "instance" },
  { name: "mark", labelKo: "번호", labelEn: "Mark", dataType: "string", unitType: "none", group: "identity", scope: "instance" },
];

export const OPENING_TYPE_PARAMS: BimParameterDef[] = [
  { name: "widthMm", labelKo: "폭", labelEn: "Width", dataType: "number", unitType: "mm", group: "dimensions", scope: "type" },
  { name: "heightMm", labelKo: "높이", labelEn: "Height", dataType: "number", unitType: "mm", group: "dimensions", scope: "type" },
];

export const OPENING_INSTANCE_PARAMS: BimParameterDef[] = [
  { name: "sillHeightMm", labelKo: "창대 높이", labelEn: "Sill Height", dataType: "number", unitType: "mm", group: "constraints", scope: "instance" },
  { name: "mark", labelKo: "번호", labelEn: "Mark", dataType: "string", unitType: "none", group: "identity", scope: "instance" },
];

export const LEVEL_INSTANCE_PARAMS: BimParameterDef[] = [
  { name: "elevationM", labelKo: "레벨 고도", labelEn: "Elevation", dataType: "number", unitType: "m", group: "constraints", scope: "instance" },
  { name: "name", labelKo: "이름", labelEn: "Name", dataType: "string", unitType: "none", group: "identity", scope: "instance" },
];

export const ROOM_INSTANCE_PARAMS: BimParameterDef[] = [
  { name: "number", labelKo: "실 번호", labelEn: "Number", dataType: "string", unitType: "none", group: "identity", scope: "instance" },
  { name: "name", labelKo: "실명", labelEn: "Name", dataType: "string", unitType: "none", group: "identity", scope: "instance" },
  { name: "areaM2", labelKo: "면적", labelEn: "Area", dataType: "number", unitType: "m2", group: "dimensions", scope: "instance", readOnly: true },
];

const MM_IN_NAME = /(\d+(?:\.\d+)?)\s*mm/i;
const PAIR_MM = /(\d+)\s*[x×]\s*(\d+)/i;

export function inferMmFromLabel(label: string, fallback: number): number {
  const pair = PAIR_MM.exec(label);
  if (pair) return Number(pair[1]);
  const single = MM_IN_NAME.exec(label);
  if (single) return Number(single[1]);
  return fallback;
}

export function inferHeightMmFromLabel(label: string, fallback: number): number {
  const pair = PAIR_MM.exec(label);
  if (pair) return Number(pair[2]);
  return fallback;
}

export function typeFromAuthoringFamily(family: AuthoringFamily): BimType {
  const parameters: Record<string, BimParamValue> = {};
  if (family.tool === "wall" || family.tool === "floor" || family.tool === "roof" || family.tool === "ceiling") {
    parameters.thicknessMm = inferMmFromLabel(family.type, 200);
    parameters.structural = family.tool === "wall" && /struct|cmu|concrete|벽돌|콘크리트/i.test(family.type);
    parameters.roomBounding = family.tool === "wall" || family.tool === "floor";
  }
  if (family.tool === "door" || family.tool === "window") {
    parameters.widthMm = inferMmFromLabel(family.type, family.tool === "door" ? 910 : 1200);
    parameters.heightMm = inferHeightMmFromLabel(family.type, family.tool === "door" ? 2100 : 1500);
  }
  if (family.tool === "column") {
    parameters.widthMm = inferMmFromLabel(family.type, 400);
  }
  const semantics = familySemantics(family.id);
  if (semantics?.fireRating) parameters.fireRating = semantics.fireRating;
  return {
    id: family.id,
    category: family.category,
    categoryKo: family.categoryKo,
    family: family.family,
    familyKo: family.familyKo,
    typeName: family.type,
    typeNameKo: family.typeKo,
    parameters,
    layers: semantics?.layers,
    ifcClass: semantics?.ifcClass,
  };
}

export function parameterDefsForKind(kind: string): BimParameterDef[] {
  if (kind === "wall") return [...WALL_TYPE_PARAMS, ...WALL_INSTANCE_PARAMS];
  if (kind === "door" || kind === "window") return [...OPENING_TYPE_PARAMS, ...OPENING_INSTANCE_PARAMS];
  if (kind === "level") return LEVEL_INSTANCE_PARAMS;
  if (kind === "room") return ROOM_INSTANCE_PARAMS;
  return [
    { name: "mark", labelKo: "번호", labelEn: "Mark", dataType: "string", unitType: "none", group: "identity", scope: "instance" },
  ];
}

export function resolveParameter(
  type: BimType | undefined,
  instance: Record<string, BimParamValue>,
  name: string,
): BimParamValue | undefined {
  if (name in instance) return instance[name];
  return type?.parameters[name];
}
