// src/lib/procedural/types.ts
// Type definitions for the procedural building generation pipeline.

import type { BuildingEra } from "@/lib/material-types";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";

/** Facade grid subdivision and instancing parameters */
export interface FacadeConfig {
  windowWidth: number;
  windowHeight: number;
  sillHeight: number;
  windowSpacing: number;
  windowRatio: number;
  mullionDepth: number;
  mullionWidth: number;
  glassInset: number;
  solidPanelChance: number;
  parapetHeight: number;
  cornerInset: number;
}

/** Floor slab parameters */
export interface SlabConfig {
  thickness: number;
  overhang: number;
}

/** Structural column parameters */
export interface ColumnConfig {
  spacing: number;
  size: number;
  inset: number;
}

/** Roof geometry parameters */
export interface RoofConfig {
  type: "flat" | "gable" | "other";
  flatThickness: number;
  gableHeight: number;
  hipInset: number;
}

/** Material references for each building element (PBR configs, not Three.js objects) */
export interface MaterialRefs {
  wall: PBRMaterialConfig;
  glass: PBRMaterialConfig;
  mullion: PBRMaterialConfig;
  slab: PBRMaterialConfig;
  column: PBRMaterialConfig;
  roof: PBRMaterialConfig;
  groundFloor: PBRMaterialConfig;
}

/** Minimal floor descriptor for procedural generation */
export interface FloorSpec {
  floorNo: number;
  label: string;
  type: "above" | "below";
  y: number;
  height: number;
  isGroundFloor: boolean;
}

/** Top-level building generation recipe — all parameters needed to procedurally generate a building */
export interface BuildingRecipe {
  footprintWidth: number;
  footprintDepth: number;
  footprintPolygon?: [number, number][];
  floors: FloorSpec[];
  totalHeight: number;
  wallThickness: number;
  era: BuildingEra;
  strctCd: string;
  mainPurpsCd: string;
  facade: FacadeConfig;
  slab: SlabConfig;
  column: ColumnConfig;
  roof: RoofConfig;
  materials: MaterialRefs;
  siteWidth: number;
  siteDepth: number;
  buildingName: string;
  address: string;
}

/** Partial overrides for user customization (from config panel) */
export type RecipeOverrides = Partial<{
  footprintWidth: number;
  footprintDepth: number;
  floorCount: number;
  floorHeight: number;
  wallThickness: number;
  facade: Partial<FacadeConfig>;
  slab: Partial<SlabConfig>;
  column: Partial<ColumnConfig>;
  roof: Partial<RoofConfig>;
}>;
