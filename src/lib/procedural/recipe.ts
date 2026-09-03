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
  CurtainWallConfig,
  FloorSpec,
} from "./types";
import { WINDOW_RATIOS } from "@/lib/korean-building-codes";
import {
  getPBRMaterial,
  getGroundFloorMaterial,
  WINDOW_MATERIAL,
  ROOF_MATERIALS,
} from "@/lib/pbr-materials";
import { resolveVisualMaterialId } from "@/lib/rendering/bim-material-mapping";
import { getFactoryRecipe } from "./factory-recipe";

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

/**
 * Office-specific facade config: curtain wall for post-2000, punched window for pre-2000.
 * Also handles podium treatment (ground floor retail with higher floor height / larger openings).
 */
function getOfficeConfig(era: BuildingEra, mainPurpsCd: string): {
  facade: FacadeConfig;
  curtainWall?: CurtainWallConfig;
} {
  const baseFacade = getFacadeConfig(era, mainPurpsCd);
  const isModern = era === "2020+" || era === "2010-2019" || era === "2000-2009";

  if (isModern) {
    // Curtain wall facade: high window ratio, thin mullions
    const curtainFacade: FacadeConfig = {
      ...baseFacade,
      windowRatio: Math.max(baseFacade.windowRatio, 0.70),
      mullionWidth: 0.03,
      mullionDepth: baseFacade.mullionDepth * 0.6, // Thinner structural mullions
      sillHeight: 0.4, // Lower sill for floor-to-ceiling glass
      windowHeight: Math.min(baseFacade.windowHeight * 1.2, 2.8),
      solidPanelChance: 0.03, // Almost no solid panels
      cornerInset: 0.03,
    };
    const curtainWall: CurtainWallConfig = {
      enabled: true,
      mullionWidth: 0.03,
      glassTint: "#88BBCC", // Slight blue-green tint
      glassOpacity: 0.45,
    };
    return { facade: curtainFacade, curtainWall };
  }

  // Pre-2000 offices: punched-window facade (use default config)
  return { facade: baseFacade };
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

function getRoofConfig(mainPurpsCd?: string, era?: BuildingEra): RoofConfig {
  const useCategory = mainPurpsCd ? getUseCategory(mainPurpsCd) : "default";
  const isOld = era === "pre-1970" || era === "1970-1989" || era === "1990-1999";

  // Factory: sawtooth for older factories, flat for warehouses/modern
  if (useCategory === "factory") {
    if (mainPurpsCd === "18000") {
      return { type: "flat", flatThickness: 0.4, gableHeight: 3.0, hipInset: 0.4 };
    }
    if (isOld) {
      return {
        type: "sawtooth", flatThickness: 0.3, gableHeight: 2.5, hipInset: 0.4,
        sawtoothCount: 4, sawtoothHeight: 2.0,
      };
    }
    return { type: "flat", flatThickness: 0.4, gableHeight: 3.0, hipInset: 0.4 };
  }

  // Residential pre-2000: gable or hip depending on era
  if (useCategory === "residential" && isOld) {
    if (era === "pre-1970") {
      return { type: "hip", flatThickness: 0.3, gableHeight: 2.5, hipInset: 0.35 };
    }
    return { type: "gable", flatThickness: 0.3, gableHeight: 3.0, hipInset: 0.4 };
  }

  // Institutional / default older buildings: hip roof
  if (useCategory === "default" && isOld) {
    return { type: "hip", flatThickness: 0.3, gableHeight: 2.8, hipInset: 0.35 };
  }

  // Commercial and modern buildings: flat (default, correct)
  return { type: "flat", flatThickness: 0.3, gableHeight: 3.0, hipInset: 0.4 };
}

function getMaterialRefs(strctCd: string, mainPurpsCd: string, era: BuildingEra, roofType?: string): MaterialRefs {
  const roofMatKey = roofType === "gable" || roofType === "hip" || roofType === "sawtooth" ? "gable" : "flat";
  const q = { strctCd, mainPurpsCd, era, roofType };
  return {
    wall: {
      ...getPBRMaterial(strctCd, mainPurpsCd, era),
      visualId: resolveVisualMaterialId({ ...q, role: "wall" }),
    },
    glass: {
      ...WINDOW_MATERIAL,
      visualId: resolveVisualMaterialId({ ...q, role: "glass" }),
    },
    mullion: {
      color: "#808890",
      roughness: 0.4,
      metalness: 0.6,
      visualId: resolveVisualMaterialId({ ...q, role: "mullion" }),
    },
    slab: {
      ...getPBRMaterial(strctCd, undefined, era),
      visualId: resolveVisualMaterialId({ ...q, role: "slab" }),
    },
    column: {
      ...getPBRMaterial(strctCd, undefined, era),
      visualId: resolveVisualMaterialId({ ...q, role: "column" }),
    },
    roof: {
      ...(ROOF_MATERIALS[roofMatKey] || ROOF_MATERIALS["flat"]),
      visualId: resolveVisualMaterialId({ ...q, role: "roof" }),
    },
    groundFloor: {
      ...getGroundFloorMaterial(mainPurpsCd),
      visualId: resolveVisualMaterialId({ ...q, role: "wall" }),
    },
  };
}

/**
 * Build a recipe from structure code, era, and use code.
 * This produces sensible defaults for all generation parameters.
 * Routes to specialized builders for factory and office types.
 */
export function getRecipe(
  strctCd: string,
  era: BuildingEra,
  mainPurpsCd: string,
  large = false,
) {
  const useCategory = getUseCategory(mainPurpsCd);

  // Factory/warehouse: dedicated recipe with large spans, minimal glazing
  if (useCategory === "factory") {
    return getFactoryRecipe(strctCd, era, mainPurpsCd);
  }

  const roof = getRoofConfig(mainPurpsCd, era);

  // Office: curtain wall for modern, punched window for older
  if (useCategory === "office") {
    const officeConfig = getOfficeConfig(era, mainPurpsCd);
    return {
      facade: officeConfig.facade,
      slab: getSlabConfig(strctCd),
      column: getColumnConfig(strctCd, large),
      roof,
      materials: getMaterialRefs(strctCd, mainPurpsCd, era, roof.type),
      ...(officeConfig.curtainWall ? { curtainWall: officeConfig.curtainWall } : {}),
    };
  }

  return {
    facade: getFacadeConfig(era, mainPurpsCd),
    slab: getSlabConfig(strctCd),
    column: getColumnConfig(strctCd, large),
    roof,
    materials: getMaterialRefs(strctCd, mainPurpsCd, era, roof.type),
  };
}

/**
 * Single source of truth for merging RecipeOverrides into a BuildingRecipe.
 *
 * Called by both `applyOverrides` (here) and `useRecipeStore.getEffectiveRecipe`
 * (src/store/recipe-store.ts). Keeping the merge shape in one function prevents
 * drift — historically, adding `footprintPolygon` to only one of the two sites
 * broke the CAD upload workflow (the 3D viewport consumed the other site).
 */
/**
 * Rebuild the floor stack from count/height/per-floor edits.
 * Basement floors are preserved; above-ground floors are resized, then
 * `floorEdits` can drop or retag individual levels. `y` and `totalHeight`
 * are always recomputed so energy + 3D stay aligned.
 */
export function applyFloorOverrides(
  floors: FloorSpec[],
  overrides: Pick<RecipeOverrides, "floorCount" | "floorHeight" | "floorEdits">,
): { floors: FloorSpec[]; totalHeight: number } {
  const below = floors.filter((f) => f.type === "below");
  let above = floors.filter((f) => f.type !== "below");

  if (overrides.floorCount !== undefined) {
    const target = Math.max(1, Math.round(overrides.floorCount));
    const fallbackH = overrides.floorHeight ?? above[0]?.height ?? 3.0;
    const next: FloorSpec[] = [];
    for (let i = 0; i < target; i++) {
      const existing = above[i];
      next.push({
        floorNo: i + 1,
        label: existing?.label ?? `${i + 1}F`,
        type: "above",
        y: 0,
        height: existing?.height ?? fallbackH,
        isGroundFloor: i === 0,
        useCode: existing?.useCode,
        // A resized stack keeps whatever plate the surviving level had; a
        // level invented past the end of the original stack has none, and
        // falls back to the footprint (P2-30).
        ...(existing?.plate ? { plate: existing.plate } : {}),
      });
    }
    above = next;
  }

  if (overrides.floorHeight !== undefined) {
    const h = overrides.floorHeight;
    above = above.map((f) => ({ ...f, height: h }));
  }

  if (overrides.floorEdits) {
    const edits = overrides.floorEdits;
    above = above
      .map((f) => {
        const edit = edits[String(f.floorNo)];
        if (!edit) return f;
        if (edit.excluded) return null;
        return {
          ...f,
          height: edit.height ?? f.height,
          useCode: edit.useCode ?? f.useCode,
        };
      })
      .filter((f): f is FloorSpec => f !== null);

    below.forEach((f, i) => {
      const edit = edits[String(f.floorNo)];
      if (!edit) return;
      if (edit.excluded) {
        below[i] = { ...f, height: 0 };
        return;
      }
      below[i] = {
        ...f,
        height: edit.height ?? f.height,
        useCode: edit.useCode ?? f.useCode,
      };
    });
  }

  const keptBelow = below.filter((f) => f.height > 0);

  // Stack above from y=0 upward; basement downward from 0.
  let y = 0;
  const stackedAbove = above.map((f, i) => {
    const next = {
      ...f,
      y,
      isGroundFloor: i === 0,
      label: f.label || `${f.floorNo}F`,
    };
    y += f.height;
    return next;
  });
  const totalHeight = y;

  let by = 0;
  const stackedBelow = [...keptBelow]
    .sort((a, b) => Math.abs(a.floorNo) - Math.abs(b.floorNo))
    .map((f) => {
      by -= f.height;
      return { ...f, y: by, isGroundFloor: false };
    });

  return { floors: [...stackedBelow, ...stackedAbove], totalHeight };
}

export function mergeRecipeOverrides(
  recipe: BuildingRecipe,
  overrides: RecipeOverrides
): BuildingRecipe {
  const floorTouched =
    overrides.floorCount !== undefined ||
    overrides.floorHeight !== undefined ||
    overrides.floorEdits !== undefined;
  const floorResult = floorTouched
    ? applyFloorOverrides(recipe.floors, overrides)
    : { floors: recipe.floors, totalHeight: recipe.totalHeight };

  return {
    ...recipe,
    ...(overrides.footprintWidth !== undefined ? { footprintWidth: overrides.footprintWidth } : {}),
    ...(overrides.footprintDepth !== undefined ? { footprintDepth: overrides.footprintDepth } : {}),
    ...(overrides.footprintPolygon !== undefined ? { footprintPolygon: overrides.footprintPolygon } : {}),
    ...(overrides.wallThickness !== undefined ? { wallThickness: overrides.wallThickness } : {}),
    ...(overrides.facade ? { facade: { ...recipe.facade, ...overrides.facade } } : {}),
    ...(overrides.slab ? { slab: { ...recipe.slab, ...overrides.slab } } : {}),
    ...(overrides.column ? { column: { ...recipe.column, ...overrides.column } } : {}),
    ...(overrides.roof ? { roof: { ...recipe.roof, ...overrides.roof } } : {}),
    ...(overrides.serviceCore ? { serviceCore: overrides.serviceCore } : {}),
    ...(overrides.cadRooms !== undefined ? { cadRooms: overrides.cadRooms } : {}),
    ...(floorTouched
      ? { floors: floorResult.floors, totalHeight: floorResult.totalHeight }
      : {}),
  };
}

/** @deprecated Prefer `mergeRecipeOverrides`. Kept as an alias for existing callers. */
export function applyOverrides(recipe: BuildingRecipe, overrides: RecipeOverrides): BuildingRecipe {
  return mergeRecipeOverrides(recipe, overrides);
}
