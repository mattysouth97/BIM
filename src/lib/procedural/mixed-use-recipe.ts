// src/lib/procedural/mixed-use-recipe.ts
// Detects and builds recipes for mixed-use buildings where different floor ranges
// have different use codes (e.g., retail on lower floors, residential above).

import type { BuildingEra } from "@/lib/material-types";
import type {
  BuildingSection,
  FacadeConfig,
  CurtainWallConfig,
} from "./types";
import { WINDOW_RATIOS } from "@/lib/korean-building-codes";

/** Facade window dimensions by era — same table as recipe.ts */
const FACADE_WINDOW_DIMS: Record<BuildingEra, { w: number; h: number; sill: number; spacing: number }> = {
  "pre-1970": { w: 0.8, h: 1.0, sill: 0.9, spacing: 1.6 },
  "1970-1989": { w: 1.0, h: 1.2, sill: 0.85, spacing: 1.8 },
  "1990-1999": { w: 1.2, h: 1.4, sill: 0.8, spacing: 2.0 },
  "2000-2009": { w: 1.4, h: 1.6, sill: 0.8, spacing: 2.2 },
  "2010-2019": { w: 1.6, h: 1.8, sill: 0.7, spacing: 2.4 },
  "2020+":     { w: 1.8, h: 2.0, sill: 0.6, spacing: 2.6 },
};

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

/** Build a FacadeConfig for a specific use code within a mixed-use section */
function getSectionFacadeConfig(era: BuildingEra, mainPurpsCd: string): FacadeConfig {
  const dims = FACADE_WINDOW_DIMS[era];
  const useCategory = getUseCategory(mainPurpsCd);

  // Retail/commercial ground floors get larger openings
  const isRetail = useCategory === "retail";
  const windowRatio = WINDOW_RATIOS[era]?.[useCategory] || WINDOW_RATIOS[era]?.default || 0.3;

  return {
    windowWidth: isRetail ? Math.min(dims.w * 1.3, 2.4) : dims.w,
    windowHeight: isRetail ? Math.min(dims.h * 1.2, 2.5) : dims.h,
    sillHeight: isRetail ? 0.3 : dims.sill, // Retail: low sill for display windows
    windowSpacing: dims.spacing,
    windowRatio,
    mullionDepth: MULLION_DEPTH[era],
    mullionWidth: 0.05,
    glassInset: 0.03,
    solidPanelChance: isRetail ? 0.05 : 0.15,
    parapetHeight: 0.9,
    cornerInset: 0.05,
  };
}

/** Determine if a section should get curtain wall treatment */
function getSectionCurtainWall(
  era: BuildingEra,
  mainPurpsCd: string,
): CurtainWallConfig | undefined {
  const useCategory = getUseCategory(mainPurpsCd);
  const isModern = era === "2020+" || era === "2010-2019" || era === "2000-2009";

  if (useCategory === "office" && isModern) {
    return {
      enabled: true,
      mullionWidth: 0.03,
      glassTint: "#88BBCC",
      glassOpacity: 0.45,
    };
  }
  return undefined;
}

/**
 * Floor data with per-floor use codes — used to detect mixed-use buildings.
 */
export interface FloorUseInfo {
  floorNo: number;
  mainPurpsCd: string;
}

/**
 * Detect whether a building is mixed-use by examining per-floor use codes.
 * Returns true if there are 2+ distinct use categories across floors.
 */
export function isMixedUse(floorUses: FloorUseInfo[]): boolean {
  if (floorUses.length < 2) return false;
  const categories = new Set(floorUses.map(f => getUseCategory(f.mainPurpsCd)));
  return categories.size >= 2;
}

/**
 * Group consecutive floors with the same use category into BuildingSections.
 * Each section gets its own facade config based on its use code.
 */
export function buildSections(
  floorUses: FloorUseInfo[],
  era: BuildingEra,
): BuildingSection[] {
  if (floorUses.length === 0) return [];

  // Sort by floor number ascending
  const sorted = [...floorUses].sort((a, b) => a.floorNo - b.floorNo);

  const sections: BuildingSection[] = [];
  let currentCategory = getUseCategory(sorted[0].mainPurpsCd);
  let currentCode = sorted[0].mainPurpsCd;
  let startFloor = sorted[0].floorNo;

  for (let i = 1; i < sorted.length; i++) {
    const cat = getUseCategory(sorted[i].mainPurpsCd);
    if (cat !== currentCategory) {
      // Close previous section
      sections.push({
        startFloor,
        endFloor: sorted[i - 1].floorNo,
        mainPurpsCd: currentCode,
        facade: getSectionFacadeConfig(era, currentCode),
        curtainWall: getSectionCurtainWall(era, currentCode),
      });
      // Start new section
      currentCategory = cat;
      currentCode = sorted[i].mainPurpsCd;
      startFloor = sorted[i].floorNo;
    }
  }

  // Close last section
  sections.push({
    startFloor,
    endFloor: sorted[sorted.length - 1].floorNo,
    mainPurpsCd: currentCode,
    facade: getSectionFacadeConfig(era, currentCode),
    curtainWall: getSectionCurtainWall(era, currentCode),
  });

  return sections;
}

/**
 * Find the BuildingSection that a given floor belongs to.
 * Returns undefined if the floor is not in any section.
 */
export function getSectionForFloor(
  floorNo: number,
  sections: BuildingSection[],
): BuildingSection | undefined {
  return sections.find(s => floorNo >= s.startFloor && floorNo <= s.endFloor);
}
