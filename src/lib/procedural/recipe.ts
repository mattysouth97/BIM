// src/lib/procedural/recipe.ts
// Recipe factory: converts structure code + era + use code into procedural generation parameters.

import type { BuildingEra } from "@/lib/material-types";
import type {
  BuildingRecipe,
  FacadeConfig,
  SlabConfig,
  ColumnConfig,
  RoofConfig,
  MaterialRefs,
  RecipeOverrides,
} from "./types";
import { WINDOW_RATIOS } from "@/lib/korean-building-codes";
import {
  getPBRMaterial,
  getGroundFloorMaterial,
  WINDOW_MATERIAL,
  ROOF_MATERIALS,
} from "@/lib/pbr-materials";

/** Facade window dimensions by era (meters) — replicated from wall-geometry.ts WIN table */
const FACADE_WINDOW_DIMS: Record<BuildingEra, { w: number; h: number; sill: number; spacing: number }> = {
  "pre-1970": { w: 0.8, h: 1.0, sill: 0.9, spacing: 1.6 },
  "1970-1989": { w: 1.0, h: 1.2, sill: 0.85, spacing: 1.8 },
  "1990-1999": { w: 1.2, h: 1.4, sill: 0.8, spacing: 2.0 },
  "2000-2009": { w: 1.4, h: 1.6, sill: 0.8, spacing: 2.2 },
  "2010-2019": { w: 1.6, h: 1.8, sill: 0.7, spacing: 2.4 },
  "2020+":     { w: 1.8, h: 2.0, sill: 0.6, spacing: 2.6 },
};

/** Mullion extrusion depth by era (meters) — more depth = more modern detailing */
const MULLION_DEPTH: Record<BuildingEra, number> = {
  "pre-1970": 0.03,
  "1970-1989": 0.04,
  "1990-1999": 0.05,
  "2000-2009": 0.06,
  "2010-2019": 0.08,
  "2020+": 0.10,
};

function getUseCategory(mainPurpsCd: string): "residential" | "office" | "factory" | "retail" | "default" {
  if (["01000", "02000"].includes(mainPurpsCd)) return "residential";
  if (mainPurpsCd === "14000") return "office";
  if (["17000", "18000"].includes(mainPurpsCd)) return "factory";
  if (["07000", "11000"].includes(mainPurpsCd)) return "retail";
  return "default";
}

function getFacadeConfig(era: BuildingEra, mainPurpsCd: string): FacadeConfig {
  const dims = FACADE_WINDOW_DIMS[era];
  const useCategory = getUseCategory(mainPurpsCd);
  return {
    windowWidth: dims.w,
    windowHeight: dims.h,
    sillHeight: dims.sill,
    windowSpacing: dims.spacing,
    windowRatio: WINDOW_RATIOS[era]?.[useCategory] || WINDOW_RATIOS[era]?.default || 0.3,
    mullionDepth: MULLION_DEPTH[era],
    mullionWidth: 0.05,
    glassInset: 0.03,
    solidPanelChance: 0.15,
    parapetHeight: 0.9,
    cornerInset: 0.05,
  };
}

function getSlabConfig(strctCd: string): SlabConfig {
  const thickness = ["13"].includes(strctCd) ? 0.15
    : ["22", "23", "24", "25"].includes(strctCd) ? 0.25
    : 0.20;
  return { thickness, overhang: 0.0 };
}

function getColumnConfig(strctCd: string, large = false): ColumnConfig {
  const spacing = ["13"].includes(strctCd) ? 9.0
    : ["12", "41", "42"].includes(strctCd) ? 8.0
    : ["15"].includes(strctCd) ? 4.5
    : 6.0;
  const size = ["13"].includes(strctCd) ? 0.3
    : large ? 0.6
    : 0.4;
  return { spacing, size, inset: 0 }; // inset computed in toRecipe when wallThickness is known
}

function getRoofConfig(): RoofConfig {
  return { type: "flat", flatThickness: 0.3, gableHeight: 3.0, hipInset: 0.4 };
}

function getMaterialRefs(strctCd: string, mainPurpsCd: string, era: BuildingEra): MaterialRefs {
  return {
    wall: getPBRMaterial(strctCd, mainPurpsCd, era),
    glass: WINDOW_MATERIAL,
    mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
    slab: getPBRMaterial(strctCd, undefined, era),
    column: getPBRMaterial(strctCd, undefined, era),
    roof: ROOF_MATERIALS["flat"],
    groundFloor: getGroundFloorMaterial(mainPurpsCd),
  };
}

/**
 * Build a recipe from structure code, era, and use code.
 * This produces sensible defaults for all generation parameters.
 */
export function getRecipe(
  strctCd: string,
  era: BuildingEra,
  mainPurpsCd: string,
  large = false,
) {
  return {
    facade: getFacadeConfig(era, mainPurpsCd),
    slab: getSlabConfig(strctCd),
    column: getColumnConfig(strctCd, large),
    roof: getRoofConfig(),
    materials: getMaterialRefs(strctCd, mainPurpsCd, era),
  };
}

/**
 * Merge user overrides into a recipe immutably.
 */
export function applyOverrides(recipe: BuildingRecipe, overrides: RecipeOverrides): BuildingRecipe {
  return {
    ...recipe,
    ...(overrides.footprintWidth !== undefined ? { footprintWidth: overrides.footprintWidth } : {}),
    ...(overrides.footprintDepth !== undefined ? { footprintDepth: overrides.footprintDepth } : {}),
    ...(overrides.wallThickness !== undefined ? { wallThickness: overrides.wallThickness } : {}),
    facade: { ...recipe.facade, ...overrides.facade },
    slab: { ...recipe.slab, ...overrides.slab },
    column: { ...recipe.column, ...overrides.column },
    roof: { ...recipe.roof, ...overrides.roof },
  };
}
