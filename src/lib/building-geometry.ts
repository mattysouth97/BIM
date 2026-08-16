// src/lib/building-geometry.ts

import type { BrTitleInfo, BrFloorInfo } from "./types";
import type { BuildingEra } from "./material-types";
import { classifyEra } from "./material-types";
import { FLOOR_HEIGHTS, WINDOW_RATIOS, WALL_LAYERS, STRUCTURE_TO_WALL_KEY } from "./korean-building-codes";
import { ROOF_MATERIALS } from "./pbr-materials";
import type { BuildingRecipe } from "./procedural/types";
import { getRecipe } from "./procedural/recipe";

export interface FloorGeometry {
  floorNo: number;
  label: string;
  type: "above" | "below";
  y: number;
  height: number;
  width: number;
  depth: number;
  area: number;
  use: string;
  useCode: string;
  structure: string;
  structureCode: string;
  color: string;
  isGroundFloor: boolean;
}

export interface BuildingGeometry {
  floors: FloorGeometry[];
  totalHeight: number;
  footprintWidth: number;
  footprintDepth: number;
  siteWidth: number;
  siteDepth: number;
  roofType: "flat" | "gable" | "hip" | "sawtooth" | "other";
  buildingName: string;
  address: string;
  era: BuildingEra;
  strctCd: string;
  mainPurpsCd: string;
  windowRatio: number;
  footprintPolygon?: [number, number][][];
  /** totArea when > 0; omitted when unavailable (AFF-6). */
  officialFloorAreaSqm?: number;
  wallThickness: number;
  slabThickness: number;
  columnSpacing: number;
  columnSize: number;
}

const USE_COLOR_MAP: Record<string, string> = {
  "01000": "#8B4513",
  "02000": "#4169E1",
  "03000": "#FF8C00",
  "04000": "#FFA500",
  "05000": "#9370DB",
  "09000": "#FF6347",
  "10000": "#20B2AA",
  "14000": "#4682B4",
  "17000": "#A0522D",
  "18000": "#708090",
  "20000": "#696969",
};

const DEFAULT_COLOR = "#B0C4DE";

function estimateFootprint(area: number): { width: number; depth: number } {
  if (!area || area <= 0) return { width: 10, depth: 10 };
  const width = Math.sqrt(area * 1.5);
  const depth = Math.sqrt(area / 1.5);
  return { width: Math.round(width * 10) / 10, depth: Math.round(depth * 10) / 10 };
}

/**
 * The floor-outline endpoint can return rows for multiple building registers
 * and multiple use/area rows for one physical floor. Scope them to the chosen
 * title and keep one representative per floor so geometry is never duplicated.
 */
function normalizeFloorRows(title: BrTitleInfo, floors: BrFloorInfo[]): BrFloorInfo[] {
  const titlePk = String(title.mgmBldrgstPk || "");
  const scoped = floors.filter((floor) => {
    const floorPk = String(floor.mgmBldrgstPk || "");
    return !titlePk || !floorPk || floorPk === titlePk;
  });
  const byFloor = new Map<string, BrFloorInfo>();

  for (const floor of scoped) {
    const floorNo = Number(floor.flrNo);
    if (!Number.isFinite(floorNo)) continue;
    const key = `${floor.flrGbCd || (floorNo < 0 ? "below" : "above")}:${floorNo}`;
    const existing = byFloor.get(key);
    if (!existing || Number(floor.area) > Number(existing.area)) {
      byFloor.set(key, floor);
    }
  }

  return [...byFloor.values()];
}

function getUseCategory(mainPurpsCd: string): "residential" | "office" | "factory" | "retail" | "default" {
  if (["01000", "02000"].includes(mainPurpsCd)) return "residential";
  if (mainPurpsCd === "14000") return "office";
  if (["17000", "18000"].includes(mainPurpsCd)) return "factory";
  if (["07000", "11000"].includes(mainPurpsCd)) return "retail";
  return "default";
}

function getFloorHeightCategory(mainPurpsCd: string): "residential" | "commercial" | "factory" {
  if (["01000", "02000"].includes(mainPurpsCd)) return "residential";
  if (["17000", "18000"].includes(mainPurpsCd)) return "factory";
  return "commercial";
}

export interface GenerateGeometryOptions {
  /**
   * Measured building height in meters from an external GIS source
   * (VWorld GIS건물통합정보 `buld_hg`, P2-25). Height fallback chain:
   * ledger `heit` → measuredHeightM → era-based floor-count estimate.
   */
  measuredHeightM?: number;
}

export function generateBuildingGeometry(
  title: BrTitleInfo,
  floors: BrFloorInfo[],
  opts?: GenerateGeometryOptions
): BuildingGeometry {
  const era = classifyEra(title.pmsDay);
  const mainPurpsCd = title.mainPurpsCd || "";
  const strctCd = title.strctCd || "11";
  const useCategory = getUseCategory(mainPurpsCd);
  const floorHeightCat = getFloorHeightCategory(mainPurpsCd);

  const eraFloorHeight = FLOOR_HEIGHTS[era]?.[floorHeightCat] || 3.2;
  const aboveCount = Number(title.grndFlrCnt) || 1;
  // Height fallback chain (named, per AFF-6): ledger heit → VWorld measured → era estimate.
  const measuredHeight = Number(opts?.measuredHeightM);
  const totalHeight =
    Number(title.heit) ||
    (Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : aboveCount * eraFloorHeight);
  const floorHeight = totalHeight / aboveCount;
  const basementFloorHeight = 3.0;

  const windowRatio = WINDOW_RATIOS[era]?.[useCategory] || WINDOW_RATIOS[era]?.default || 0.3;

  const totArea = Number(title.totArea);
  const officialFloorAreaSqm = totArea > 0 ? totArea : undefined;
  const buildingFootprint = estimateFootprint(Number(title.archArea) || 100);
  const siteFootprint = estimateFootprint(Number(title.platArea) || Number(title.archArea) * 2);

  const roofCode = title.roofCd || title.roofCdNm || "";
  const roofType: "flat" | "gable" | "hip" | "sawtooth" | "other" =
    roofCode.includes("평") || roofCode === "1" ? "flat" :
    roofCode.includes("박공") || roofCode === "2" ? "gable" :
    roofCode.includes("모임") || roofCode === "3" ? "hip" : "flat";

  const floorGeometries: FloorGeometry[] = [];
  const normalizedFloors = normalizeFloorRows(title, floors);

  if (normalizedFloors.length > 0) {
    for (const f of normalizedFloors) {
      const flrNo = Number(f.flrNo);
      const isBelow = (f.flrGbCdNm || "").includes("지하") || flrNo < 0;
      const absFloor = Math.abs(flrNo);

      // Use building-level footprint for consistent vertical alignment.
      // Per-floor area is kept for metadata only — real buildings share a footprint.
      floorGeometries.push({
        floorNo: flrNo,
        label: f.flrNoNm || `${isBelow ? "B" : ""}${absFloor}F`,
        type: isBelow ? "below" : "above",
        y: isBelow ? -(absFloor * basementFloorHeight) : (flrNo - 1) * floorHeight,
        height: isBelow ? basementFloorHeight : floorHeight,
        width: buildingFootprint.width,
        depth: buildingFootprint.depth,
        area: Number(f.area) || 0,
        use: f.mainPurpsCdNm || f.etcPurps || "",
        useCode: f.mainPurpsCd || mainPurpsCd,
        structure: f.strctCdNm || "",
        structureCode: f.strctCd || strctCd,
        color: USE_COLOR_MAP[f.mainPurpsCd] || USE_COLOR_MAP[mainPurpsCd] || DEFAULT_COLOR,
        isGroundFloor: flrNo === 1,
      });
    }
  } else {
    const aboveCount = Number(title.grndFlrCnt) || 1;
    const belowCount = Number(title.ugrndFlrCnt) || 0;

    for (let i = belowCount; i >= 1; i--) {
      floorGeometries.push({
        floorNo: -i, label: `B${i}F`, type: "below",
        y: -(i * basementFloorHeight), height: basementFloorHeight,
        width: buildingFootprint.width, depth: buildingFootprint.depth,
        area: Number(title.archArea) || 0, use: title.mainPurpsCdNm || "",
        useCode: mainPurpsCd, structure: title.strctCdNm || "", structureCode: strctCd,
        color: "#666666", isGroundFloor: false,
      });
    }
    for (let i = 1; i <= aboveCount; i++) {
      floorGeometries.push({
        floorNo: i, label: `${i}F`, type: "above",
        y: (i - 1) * floorHeight, height: floorHeight,
        width: buildingFootprint.width, depth: buildingFootprint.depth,
        area: Number(title.archArea) || 0, use: title.mainPurpsCdNm || "",
        useCode: mainPurpsCd, structure: title.strctCdNm || "", structureCode: strctCd,
        color: USE_COLOR_MAP[mainPurpsCd] || DEFAULT_COLOR, isGroundFloor: i === 1,
      });
    }
  }

  floorGeometries.sort((a, b) => a.floorNo - b.floorNo);

  // Structural dimensions from building code data
  const wallKey = STRUCTURE_TO_WALL_KEY[strctCd] || "rc";
  const wallLayers = WALL_LAYERS[wallKey] || WALL_LAYERS["rc"];
  const wallThickness = wallLayers.reduce((sum, l) => sum + l.thickness, 0) / 1000; // mm → m

  // Slab thickness by structure type (meters)
  const slabThickness = ["13"].includes(strctCd) ? 0.15 // steel deck
    : ["22", "23", "24", "25"].includes(strctCd) ? 0.25 // masonry
    : 0.20; // RC, SRC, precast, timber

  // Column spacing by structure type (meters)
  const columnSpacing = ["13"].includes(strctCd) ? 9.0 // steel: wider spans
    : ["12", "41", "42"].includes(strctCd) ? 8.0 // SRC
    : ["15"].includes(strctCd) ? 4.5 // timber: shorter spans
    : 6.0; // RC, masonry default

  // Column cross-section size (meters)
  const isLargeBuilding = (Number(title.archArea) || 0) > 500;
  const columnSize = ["13"].includes(strctCd) ? 0.3 // steel H-section equivalent
    : isLargeBuilding ? 0.6 // large RC
    : 0.4; // small RC

  return {
    floors: floorGeometries, totalHeight,
    footprintWidth: buildingFootprint.width, footprintDepth: buildingFootprint.depth,
    siteWidth: siteFootprint.width, siteDepth: siteFootprint.depth,
    roofType, buildingName: title.bldNm || "", address: title.platPlcNm || "",
    officialFloorAreaSqm,
    era, strctCd, mainPurpsCd, windowRatio,
    wallThickness, slabThickness, columnSpacing, columnSize,
  };
}

/** Convert a BuildingGeometry into a complete BuildingRecipe for procedural generation */
export function toRecipe(geo: BuildingGeometry): BuildingRecipe {
  const isLarge = geo.footprintWidth * geo.footprintDepth > 500;
  const defaults = getRecipe(geo.strctCd, geo.era, geo.mainPurpsCd, isLarge);

  const floors = geo.floors.map(f => ({
    floorNo: f.floorNo,
    label: f.label,
    type: f.type,
    y: f.y,
    height: f.height,
    isGroundFloor: f.isGroundFloor,
  }));

  // Use API-derived roof type if explicitly set (non-flat), otherwise use smart selection from recipe
  const effectiveRoofType = geo.roofType !== "flat" ? geo.roofType : defaults.roof.type;

  const parapetHeight = effectiveRoofType === "gable" || effectiveRoofType === "sawtooth" ? 0.3
    : effectiveRoofType === "hip" || effectiveRoofType === "other" ? 0.6
    : 0.9;

  const roofMatKey = effectiveRoofType === "gable" || effectiveRoofType === "hip" || effectiveRoofType === "sawtooth" ? "gable" : "flat";

  return {
    footprintWidth: geo.footprintWidth,
    footprintDepth: geo.footprintDepth,
    footprintPolygon: geo.footprintPolygon,
    officialFloorAreaSqm: geo.officialFloorAreaSqm,
    floors,
    totalHeight: geo.totalHeight,
    wallThickness: geo.wallThickness,
    era: geo.era,
    strctCd: geo.strctCd,
    mainPurpsCd: geo.mainPurpsCd,
    facade: {
      ...defaults.facade,
      parapetHeight,
    },
    slab: {
      ...defaults.slab,
      thickness: geo.slabThickness,
    },
    column: {
      ...defaults.column,
      spacing: geo.columnSpacing,
      size: geo.columnSize,
      inset: geo.wallThickness + geo.columnSize / 2 + 0.05,
    },
    roof: {
      ...defaults.roof,
      type: effectiveRoofType,
    },
    materials: {
      ...defaults.materials,
      roof: ROOF_MATERIALS[roofMatKey] || ROOF_MATERIALS.flat,
    },
    siteWidth: geo.siteWidth,
    siteDepth: geo.siteDepth,
    buildingName: geo.buildingName,
    address: geo.address,
    // Pass through curtain wall and factory zones from recipe defaults
    ...("curtainWall" in defaults && defaults.curtainWall ? { curtainWall: defaults.curtainWall } : {}),
    ...("factoryZones" in defaults && defaults.factoryZones ? { factoryZones: defaults.factoryZones } : {}),
  };
}
