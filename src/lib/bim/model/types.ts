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
  layers?: string[];
  ifcClass?: string;
}

export interface BimPlacement {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export type BimKind =
  | ElementKind
  | "room"
  | "roof"
  | "ceiling"
  | "furniture"
  | "lighting"
  | "beam"
  // Generative additions — the brief requires stairs, shafts and railings to be
  // real semantic objects, not meshes.
  | "stair"
  | "railing"
  | "shaft";

export interface BimConnector {
  id: string;
  system: string;
  direction: string;
  connectedTo?: string;
}

export interface BimDocumentItem {
  id: string;
  kind: "tag" | "dimension" | "section" | "note";
  viewId: string | null;
  elementId?: string;
  text: string;
  start?: BimPlacement;
  end?: BimPlacement;
}

export interface BimViewVisibility {
  hiddenIds: string[];
  hiddenCategories: string[];
  isolatedIds: string[];
}

/**
 * Which building system an element belongs to. Drives semantic navigation,
 * system-level selection ("Isolate Core"), and system-level locking — you lock
 * "structure", not 42 individual columns.
 */
export type BimSystem =
  | "massing"
  | "structure"
  | "envelope"
  | "core"
  | "circulation"
  | "partitions"
  | "openings"
  | "mep"
  | "roof";

/**
 * How an element came to exist. `AUTHORED` is a human drawing it; `MODIFIED` is
 * a generated element a human has since edited — that distinction is what lets
 * regeneration preserve the architect's work instead of overwriting it.
 */
export type BimGenerationSourceType =
  | "GENERATED"
  | "AUTHORED"
  | "MODIFIED"
  | "IMPORTED";

export interface BimGenerationSource {
  type: BimGenerationSourceType;
  /** The generation that produced it, e.g. "GEN-0042". */
  generationId: string;
  /** Bumped whenever a regeneration rewrites this element. */
  version: number;
}

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
  assetId?: string;
  emsTag?: string;
  ifcClass?: string;
  connectors?: BimConnector[];

  /* --- generative additions (all optional: existing elements are unaffected) --- */

  /** Provenance. Absent on legacy elements, which are treated as AUTHORED. */
  generationSource?: BimGenerationSource;
  /**
   * User-protected. Regeneration must never alter or delete a locked element
   * without explicit authorisation.
   */
  locked?: boolean;
  /** Building system, for semantic selection and system-level locking. */
  system?: BimSystem;
  /**
   * Upstream ids this element was derived from (grid line, level, space, host
   * wall). This is the edge set of the dependency graph that makes partial
   * regeneration possible — without it, every edit is a full rebuild.
   */
  dependsOn?: string[];
  /** Spaces this element bounds. Walls use it; the validator reads it. */
  boundsSpaceIds?: string[];
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
  documents: BimDocumentItem[];
  visibility: Record<string, BimViewVisibility>;
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
export const GENERATED_CEILING_TYPE = "generated-ceiling";
export const GENERATED_ROOF_TYPE = "generated-roof";
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
