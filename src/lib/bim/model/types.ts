// src/lib/bim/model/types.ts
// Semantic BIM objects. Adapts the existing ElementRecord + family catalog
// rather than replacing the procedural twin.

import type { ElementKind } from "../element-id";

export type BimOrigin = "generated" | "authored";

export type BimPhase = "existing" | "demolition" | "new";

export type BimParamDataType = "number" | "string" | "boolean";

export type BimUnitType =
  | "none"
  | "mm"
  | "m"
  | "m2"
  | "m3"
  | "deg"
  | "kW";

export type BimParamGroup =
  | "constraints"
  | "dimensions"
  | "identity"
  | "materials"
  | "mechanical";

export type BimParamScope = "type" | "instance";

export interface BimParameterDef {
  name: string;
  labelKo: string;
  labelEn: string;
  dataType: BimParamDataType;
  unitType: BimUnitType;
  group: BimParamGroup;
  scope: BimParamScope;
  readOnly?: boolean;
}

export type BimParamValue = string | number | boolean;

export interface BimType {
  id: string;
  category: string;
  categoryKo: string;
  family: string;
  familyKo: string;
  typeName: string;
  typeNameKo: string;
  /** Type parameters. Changing these updates every instance of this type. */
  parameters: Record<string, BimParamValue>;
}

export interface BimPlacement {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export type BimKind = ElementKind | "room" | "roof" | "ceiling" | "furniture" | "lighting";

export interface BimElement {
  id: string;
  origin: BimOrigin;
  kind: BimKind;
  category: string;
  family: string;
  typeId: string;
  buildingPk: string;
  levelId: string | null;
  hostId: string | null;
  mark: string;
  instanceParameters: Record<string, BimParamValue>;
  placement: BimPlacement;
  phaseCreated: BimPhase;
  visible: boolean;
}

export interface BimLevel {
  id: string;
  name: string;
  /** World Y in metres (same as recipe FloorSpec.y). */
  elevation: number;
  /** Storey height in metres (same as recipe FloorSpec.height). */
  height: number;
  floorNo: number;
  associatedViewId: string;
}

export interface BimGrid {
  id: string;
  name: string;
  axis: "x" | "z";
  offset: number;
}

export interface BimModelSnapshot {
  buildingPk: string;
  levels: BimLevel[];
  grids: BimGrid[];
  types: Record<string, BimType>;
  elements: BimElement[];
}

export interface BimQuery {
  category?: string;
  kind?: BimKind;
  levelId?: string;
  typeId?: string;
  origin?: BimOrigin;
  hostId?: string;
}

export const GENERATED_WALL_TYPE = "generated-wall-exterior";
export const GENERATED_FLOOR_TYPE = "generated-floor";
export const GENERATED_DOOR_TYPE = "generated-door";
export const GENERATED_WINDOW_TYPE = "generated-window";
export const GENERATED_ROOM_TYPE = "generated-room";
export const GENERATED_MEP_TYPE = "generated-mep";

export function levelIdForFloor(floorNo: number): string {
  return `level:${floorNo}`;
}

export function parseFloorNoFromLevelId(levelId: string): number | null {
  const m = /^level:(-?\d+)$/.exec(levelId);
  return m ? Number(m[1]) : null;
}
