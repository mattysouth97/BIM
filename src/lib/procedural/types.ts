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
  type: "flat" | "gable" | "hip" | "sawtooth" | "other";
  flatThickness: number;
  gableHeight: number;
  hipInset: number;
  /** Number of sawtooth ridges (factory clerestory roofs) */
  sawtoothCount?: number;
  /** Height of each sawtooth ridge */
  sawtoothHeight?: number;
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

/** Per-floor authoring patch written by 층 편집. */
export interface FloorEdit {
  height?: number;
  /** 주용도코드 (e.g. "14000") — optional override of the building use. */
  useCode?: string;
  /** Drop this floor from the twin + energy stack. */
  excluded?: boolean;
}

/** Authored service-core slot in footprint-local metres (XZ). */
export interface ServiceCoreSlot {
  x: number;
  z: number;
}

/** Minimal floor descriptor for procedural generation */
export interface FloorSpec {
  floorNo: number;
  label: string;
  type: "above" | "below";
  y: number;
  height: number;
  isGroundFloor: boolean;
  /** Optional 주용도코드 override from 층 편집. */
  useCode?: string;
}

/** Top-level building generation recipe — all parameters needed to procedurally generate a building */
export interface BuildingRecipe {
  footprintWidth: number;
  footprintDepth: number;
  /**
   * GeoJSON-style polygon rings in local [x, z] meter coordinates (post-projection).
   * First ring is the outer boundary; subsequent rings are interior holes.
   * Consumed by earcut-extrude.ts for cap triangulation and facade edge generation.
   */
  footprintPolygon?: [number, number][][];
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
  /** Curtain wall parameters (modern offices) */
  curtainWall?: CurtainWallConfig;
  /** Factory zone layout (factory/warehouse buildings) */
  factoryZones?: FactoryZone[];
  /** Mixed-use vertical sections with per-section facade */
  sections?: BuildingSection[];
  /**
   * Authored service-core centre in footprint-local metres.
   * When set, `computeCoreLayout` parks the elevator bank here instead of
   * the rear-wall default.
   */
  serviceCore?: ServiceCoreSlot;
}

/** Factory building zone descriptors */
export type FactoryZoneType = "process" | "office" | "warehouse" | "loading-dock";

export interface FactoryZone {
  type: FactoryZoneType;
  /** Fraction of building footprint this zone occupies (0-1) */
  footprintFraction: number;
  /** Per-side window ratios [front, back, left, right] */
  windowRatios: [number, number, number, number];
  /** Floor height override for this zone (meters) */
  floorHeight: number;
}

/** Curtain wall extension for modern office facades */
export interface CurtainWallConfig {
  enabled: boolean;
  /** Mullion width for curtain wall grid (thinner than punched window) */
  mullionWidth: number;
  /** Glass tint color (blue-green for curtain wall) */
  glassTint: string;
  /** Glass opacity override */
  glassOpacity: number;
}

/** A vertical section of a mixed-use building with its own sub-recipe */
export interface BuildingSection {
  /** First floor number in this section (1-based) */
  startFloor: number;
  /** Last floor number in this section (inclusive) */
  endFloor: number;
  /** Use code for this section */
  mainPurpsCd: string;
  /** Facade config override for this section */
  facade: FacadeConfig;
  /** Optional curtain wall config for this section */
  curtainWall?: CurtainWallConfig;
}

/** Partial overrides for user customization (from config panel) */
export type RecipeOverrides = Partial<{
  footprintWidth: number;
  footprintDepth: number;
  /**
   * GeoJSON-style polygon rings ([outer, ...holes]) in local [x, z] meter
   * coordinates. When set (e.g., parsed from an uploaded CAD file), the
   * procedural pipeline consumes this polygon instead of the rectangular
   * footprintWidth × footprintDepth box.
   */
  footprintPolygon: [number, number][][];
  floorCount: number;
  floorHeight: number;
  wallThickness: number;
  facade: Partial<FacadeConfig>;
  slab: Partial<SlabConfig>;
  column: Partial<ColumnConfig>;
  roof: Partial<RoofConfig>;
  curtainWall: Partial<CurtainWallConfig>;
  serviceCore: ServiceCoreSlot;
  /**
   * Per-floor patches keyed by `String(floorNo)`. Applied after
   * `floorCount` / `floorHeight` so a stack editor can refine one level.
   */
  floorEdits: Record<string, FloorEdit>;
}>;
