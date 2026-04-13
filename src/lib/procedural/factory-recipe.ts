// src/lib/procedural/factory-recipe.ts
// Dedicated recipe builder for factory/manufacturing buildings (mainPurpsCd 17000/18000).
// Produces large-span structures with minimal glazing on process areas,
// office section on one side, and loading dock bays.

import type { BuildingEra } from "@/lib/material-types";
import type {
  FacadeConfig,
  SlabConfig,
  ColumnConfig,
  RoofConfig,
  MaterialRefs,
  FactoryZone,
  CurtainWallConfig,
} from "./types";
import { WINDOW_RATIOS } from "@/lib/korean-building-codes";
import {
  getPBRMaterial,
  getGroundFloorMaterial,
  WINDOW_MATERIAL,
  ROOF_MATERIALS,
} from "@/lib/pbr-materials";

/** Column span by structure type for factory buildings (meters) */
function getFactoryColumnSpan(strctCd: string): number {
  if (["13"].includes(strctCd)) return 12; // Steel — wide portal frames
  if (["12", "41", "42"].includes(strctCd)) return 10; // SRC — moderate spans
  return 9; // RC, masonry — shorter spans
}

/** Factory floor heights are much taller than typical buildings */
function getFactoryFloorHeight(era: BuildingEra, totalHeight: number, floorCount: number): number {
  // If actual height data is available and reasonable for a factory, use it
  const computed = totalHeight / Math.max(1, floorCount);
  if (computed >= 4.0 && computed <= 15.0) return computed;

  // Default factory floor heights by era
  const defaults: Record<BuildingEra, number> = {
    "pre-1970": 4.5,
    "1970-1989": 5.0,
    "1990-1999": 5.5,
    "2000-2009": 6.0,
    "2010-2019": 6.0,
    "2020+": 6.5,
  };
  return defaults[era];
}

/** Factory facade: minimal windows on 3 sides, office treatment on front */
function getFactoryFacadeConfig(era: BuildingEra, mainPurpsCd: string): FacadeConfig {
  const factoryRatio = WINDOW_RATIOS[era]?.factory || 0.10;
  return {
    windowWidth: 1.2,
    windowHeight: 1.0,
    sillHeight: 2.0, // High sill — factories keep windows above equipment height
    windowSpacing: 3.0, // Wider spacing between windows
    windowRatio: factoryRatio,
    mullionDepth: 0.04,
    mullionWidth: 0.06,
    glassInset: 0.03,
    solidPanelChance: 0.4, // More solid panels on factory facades
    parapetHeight: 0.6,
    cornerInset: 0.10,
  };
}

/** Factory slab: thicker for heavy equipment loads */
function getFactorySlabConfig(strctCd: string): SlabConfig {
  const thickness = ["13"].includes(strctCd) ? 0.18 // Steel deck (heavier)
    : ["22", "23", "24", "25"].includes(strctCd) ? 0.30 // Masonry
    : 0.25; // RC — thicker for industrial loads
  return { thickness, overhang: 0.0 };
}

/** Factory columns: larger for industrial loads */
function getFactoryColumnConfig(strctCd: string): ColumnConfig {
  const spacing = getFactoryColumnSpan(strctCd);
  const size = ["13"].includes(strctCd) ? 0.35 // Steel H-section
    : 0.5; // RC — heavier columns
  return { spacing, size, inset: 0 };
}

/** Factory roof: sawtooth for north-light, or flat for warehouses */
function getFactoryRoofConfig(mainPurpsCd: string, era: BuildingEra): RoofConfig {
  // Warehouses (18000) get flat roofs; factories (17000) get sawtooth for clerestory lighting
  if (mainPurpsCd === "18000") {
    return { type: "flat", flatThickness: 0.4, gableHeight: 3.0, hipInset: 0.4 };
  }
  // Modern factories may use flat roofs with skylights; older ones use sawtooth
  const isModern = era === "2020+" || era === "2010-2019";
  if (isModern) {
    return { type: "flat", flatThickness: 0.4, gableHeight: 3.0, hipInset: 0.4 };
  }
  return {
    type: "sawtooth",
    flatThickness: 0.3,
    gableHeight: 2.5,
    hipInset: 0.4,
    sawtoothCount: 4,
    sawtoothHeight: 2.0,
  };
}

/** Factory materials: metal panels, industrial glass */
function getFactoryMaterialRefs(strctCd: string, mainPurpsCd: string, era: BuildingEra): MaterialRefs {
  return {
    wall: getPBRMaterial(strctCd, mainPurpsCd, era),
    glass: {
      ...WINDOW_MATERIAL,
      color: "#99AABB", // Industrial glass — slightly grayer
      opacity: 0.5,
    },
    mullion: { color: "#606870", roughness: 0.5, metalness: 0.5 },
    slab: getPBRMaterial(strctCd, undefined, era),
    column: getPBRMaterial(strctCd, undefined, era),
    roof: ROOF_MATERIALS["flat"],
    groundFloor: getGroundFloorMaterial(mainPurpsCd),
  };
}

/** Default factory zone layout */
function getFactoryZones(mainPurpsCd: string): FactoryZone[] {
  if (mainPurpsCd === "18000") {
    // Warehouse: mostly open storage
    return [
      {
        type: "warehouse",
        footprintFraction: 0.85,
        windowRatios: [0.05, 0.05, 0.05, 0.05],
        floorHeight: 6.0,
      },
      {
        type: "office",
        footprintFraction: 0.15,
        windowRatios: [0.40, 0.10, 0.30, 0.30],
        floorHeight: 3.2,
      },
    ];
  }
  // Factory (17000): process area + office + loading dock
  return [
    {
      type: "process",
      footprintFraction: 0.60,
      windowRatios: [0.10, 0.05, 0.08, 0.08],
      floorHeight: 6.0,
    },
    {
      type: "office",
      footprintFraction: 0.20,
      windowRatios: [0.40, 0.15, 0.30, 0.30],
      floorHeight: 3.2,
    },
    {
      type: "loading-dock",
      footprintFraction: 0.15,
      windowRatios: [0.0, 0.0, 0.0, 0.0],
      floorHeight: 5.0,
    },
    {
      type: "warehouse",
      footprintFraction: 0.05,
      windowRatios: [0.05, 0.05, 0.05, 0.05],
      floorHeight: 5.0,
    },
  ];
}

/**
 * Build a factory-specific recipe from structure code, era, and use code.
 * Called by recipe.ts when use category is "factory".
 */
export function getFactoryRecipe(
  strctCd: string,
  era: BuildingEra,
  mainPurpsCd: string,
) {
  return {
    facade: getFactoryFacadeConfig(era, mainPurpsCd),
    slab: getFactorySlabConfig(strctCd),
    column: getFactoryColumnConfig(strctCd),
    roof: getFactoryRoofConfig(mainPurpsCd, era),
    materials: getFactoryMaterialRefs(strctCd, mainPurpsCd, era),
    factoryZones: getFactoryZones(mainPurpsCd),
  };
}

export { getFactoryColumnSpan, getFactoryFloorHeight };
