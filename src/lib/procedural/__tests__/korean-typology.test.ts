import { describe, it, expect } from "vitest";
import { toRecipe } from "@/lib/building-geometry";
import { getRecipe } from "../recipe";
import type { BuildingGeometry, FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";

/**
 * Korean building typology benchmark tests.
 * Validates that procedural generation produces geometrically reasonable
 * output for 3 representative Korean building types.
 */

/** Helper: build a BuildingGeometry from known parameters */
function makeBuildingGeometry(params: {
  archArea: number;
  floorCount: number;
  era: BuildingEra;
  strctCd: string;
  mainPurpsCd: string;
  totalHeight: number;
  floorHeight: number;
  buildingName: string;
}): BuildingGeometry {
  const footprintArea = params.archArea;
  // Estimate footprint with 1.5:1 aspect ratio (same as building-geometry.ts)
  const width = Math.round(Math.sqrt(footprintArea * 1.5) * 10) / 10;
  const depth = Math.round(Math.sqrt(footprintArea / 1.5) * 10) / 10;

  const floors: FloorGeometry[] = Array.from({ length: params.floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * params.floorHeight,
    height: params.floorHeight,
    width,
    depth,
    area: params.archArea,
    use: "",
    useCode: params.mainPurpsCd,
    structure: "",
    structureCode: params.strctCd,
    color: "#B0C4DE",
    isGroundFloor: i === 0,
  }));

  // Wall thickness from WALL_LAYERS (same logic as building-geometry.ts)
  const WALL_THICKNESSES: Record<string, number> = {
    "rc": 0.332, "src": 0.297, "steel": 0.164, "masonry": 0.272, "timber": 0.272,
  };
  const STRCT_TO_KEY: Record<string, string> = {
    "11": "rc", "21": "rc", "12": "src", "42": "src",
    "13": "steel", "14": "rc", "15": "timber",
    "22": "masonry", "23": "masonry", "24": "masonry", "25": "masonry",
  };
  const wallKey = STRCT_TO_KEY[params.strctCd] || "rc";
  const wallThickness = WALL_THICKNESSES[wallKey] || 0.332;

  const slabThickness = ["13"].includes(params.strctCd) ? 0.15
    : ["22", "23", "24", "25"].includes(params.strctCd) ? 0.25
    : 0.20;

  const columnSpacing = ["13"].includes(params.strctCd) ? 9.0
    : ["12", "41", "42"].includes(params.strctCd) ? 8.0
    : ["15"].includes(params.strctCd) ? 4.5
    : 6.0;

  const isLarge = footprintArea > 500;
  const columnSize = ["13"].includes(params.strctCd) ? 0.3
    : isLarge ? 0.6
    : 0.4;

  return {
    floors,
    totalHeight: params.totalHeight,
    footprintWidth: width,
    footprintDepth: depth,
    siteWidth: width * 2,
    siteDepth: depth * 2,
    roofType: "flat",
    buildingName: params.buildingName,
    address: "Seoul",
    era: params.era,
    strctCd: params.strctCd,
    mainPurpsCd: params.mainPurpsCd,
    windowRatio: 0.35,
    wallThickness,
    slabThickness,
    columnSpacing,
    columnSize,
  };
}

describe("Korean Building Typology Benchmarks", () => {
  describe("Standard Apartment (아파트) — 84m2, 15F, RC, 2010s", () => {
    const geo = makeBuildingGeometry({
      archArea: 84,
      floorCount: 15,
      era: "2010-2019",
      strctCd: "11", // RC
      mainPurpsCd: "02000", // apartment
      totalHeight: 43.5,
      floorHeight: 2.9,
      buildingName: "Test Apartment",
    });
    const recipe = toRecipe(geo);

    it("footprint dimensions within +-20% of expected ~10m x 8.4m", () => {
      // 84m2 with 1.5:1 ratio -> sqrt(126)=11.2m x sqrt(56)=7.5m
      expect(recipe.footprintWidth).toBeGreaterThan(8);
      expect(recipe.footprintWidth).toBeLessThan(14);
      expect(recipe.footprintDepth).toBeGreaterThan(6);
      expect(recipe.footprintDepth).toBeLessThan(10);
      // Area should be approximately 84m2
      const area = recipe.footprintWidth * recipe.footprintDepth;
      expect(area).toBeGreaterThan(84 * 0.8);
      expect(area).toBeLessThan(84 * 1.2);
    });

    it("floor height ~2.9m and total height ~43.5m", () => {
      expect(recipe.floors).toHaveLength(15);
      expect(recipe.floors[0].height).toBeCloseTo(2.9, 1);
      expect(recipe.totalHeight).toBeCloseTo(43.5, 1);
    });

    it("era is 2010-2019", () => {
      expect(recipe.era).toBe("2010-2019");
    });

    it("wall thickness ~0.3m (RC with insulation)", () => {
      expect(recipe.wallThickness).toBeGreaterThan(0.2);
      expect(recipe.wallThickness).toBeLessThan(0.5);
    });

    it("window ratio 30-40% for residential 2010s", () => {
      expect(recipe.facade.windowRatio).toBeGreaterThanOrEqual(0.3);
      expect(recipe.facade.windowRatio).toBeLessThanOrEqual(0.4);
    });

    it("total wall area is geometrically correct", () => {
      const perimeter = 2 * (recipe.footprintWidth + recipe.footprintDepth);
      const grossWallArea = perimeter * recipe.totalHeight;
      // Should be reasonable for a 15-story apartment
      expect(grossWallArea).toBeGreaterThan(1000);
      expect(grossWallArea).toBeLessThan(3000);
    });

    it("roof area matches footprint", () => {
      const roofArea = recipe.footprintWidth * recipe.footprintDepth;
      expect(roofArea).toBeGreaterThan(60);
      expect(roofArea).toBeLessThan(110);
    });

    it("window area is a fraction of gross wall area", () => {
      const perimeter = 2 * (recipe.footprintWidth + recipe.footprintDepth);
      const grossWallArea = perimeter * recipe.totalHeight;
      const windowArea = grossWallArea * recipe.facade.windowRatio;
      expect(windowArea).toBeGreaterThan(grossWallArea * 0.2);
      expect(windowArea).toBeLessThan(grossWallArea * 0.5);
    });
  });

  describe("Office Building (업무시설) — 500m2, 8F, Steel, 2020s", () => {
    const geo = makeBuildingGeometry({
      archArea: 500,
      floorCount: 8,
      era: "2020+",
      strctCd: "13", // Steel
      mainPurpsCd: "14000", // office
      totalHeight: 28,
      floorHeight: 3.5,
      buildingName: "Test Office",
    });
    const recipe = toRecipe(geo);

    it("footprint dimensions within +-20% of expected ~25m x 20m", () => {
      // 500m2 with 1.5:1 ratio -> sqrt(750)=27.4m x sqrt(333)=18.3m
      expect(recipe.footprintWidth).toBeGreaterThan(20);
      expect(recipe.footprintWidth).toBeLessThan(35);
      expect(recipe.footprintDepth).toBeGreaterThan(14);
      expect(recipe.footprintDepth).toBeLessThan(24);
      const area = recipe.footprintWidth * recipe.footprintDepth;
      expect(area).toBeGreaterThan(500 * 0.8);
      expect(area).toBeLessThan(500 * 1.2);
    });

    it("floor height ~3.5m", () => {
      expect(recipe.floors).toHaveLength(8);
      expect(recipe.floors[0].height).toBeCloseTo(3.5, 1);
    });

    it("era is 2020+", () => {
      expect(recipe.era).toBe("2020+");
    });

    it("window ratio 65-75% for office (curtain wall facade)", () => {
      // 2020+ offices get curtain wall with high window ratio
      expect(recipe.facade.windowRatio).toBeGreaterThanOrEqual(0.65);
      expect(recipe.facade.windowRatio).toBeLessThanOrEqual(0.75);
    });

    it("steel structure has wider column spacing (9m)", () => {
      expect(recipe.column.spacing).toBe(9.0);
    });

    it("steel slab is thinner (0.15m deck)", () => {
      expect(recipe.slab.thickness).toBe(0.15);
    });

    it("facade has curtain wall dimensions for 2020+ era", () => {
      expect(recipe.facade.windowWidth).toBe(1.8);
      expect(recipe.facade.windowHeight).toBe(2.4);
      expect(recipe.facade.mullionDepth).toBe(0.06);
    });
  });

  describe("Single Family House (단독주택) — 120m2, 2F, Masonry, 1990s", () => {
    const geo = makeBuildingGeometry({
      archArea: 120,
      floorCount: 2,
      era: "1990-1999",
      strctCd: "22", // Masonry (brick)
      mainPurpsCd: "01000", // single-family residential
      totalHeight: 5.4,
      floorHeight: 2.7,
      buildingName: "Test House",
    });
    const recipe = toRecipe(geo);

    it("footprint dimensions within +-20% of expected ~10m x 12m", () => {
      // 120m2 with 1.5:1 ratio -> sqrt(180)=13.4m x sqrt(80)=8.9m
      expect(recipe.footprintWidth).toBeGreaterThan(9);
      expect(recipe.footprintWidth).toBeLessThan(18);
      expect(recipe.footprintDepth).toBeGreaterThan(6);
      expect(recipe.footprintDepth).toBeLessThan(13);
      const area = recipe.footprintWidth * recipe.footprintDepth;
      expect(area).toBeGreaterThan(120 * 0.8);
      expect(area).toBeLessThan(120 * 1.2);
    });

    it("floor height ~2.7m and total height ~5.4m", () => {
      expect(recipe.floors).toHaveLength(2);
      expect(recipe.floors[0].height).toBeCloseTo(2.7, 1);
      expect(recipe.totalHeight).toBeCloseTo(5.4, 1);
    });

    it("era is 1990-1999", () => {
      expect(recipe.era).toBe("1990-1999");
    });

    it("window ratio 20-30% for residential 1990s", () => {
      // WINDOW_RATIOS["1990-1999"].residential = 0.25
      expect(recipe.facade.windowRatio).toBeGreaterThanOrEqual(0.2);
      expect(recipe.facade.windowRatio).toBeLessThanOrEqual(0.3);
    });

    it("masonry wall thickness ~0.27m (brick + insulation)", () => {
      expect(recipe.wallThickness).toBeGreaterThan(0.2);
      expect(recipe.wallThickness).toBeLessThan(0.4);
    });

    it("masonry slab is thicker (0.25m)", () => {
      expect(recipe.slab.thickness).toBe(0.25);
    });

    it("facade has 1990s-era window dimensions", () => {
      expect(recipe.facade.windowWidth).toBe(1.2);
      expect(recipe.facade.windowHeight).toBe(1.4);
      expect(recipe.facade.mullionDepth).toBe(0.05);
    });

    it("total wall area is reasonable for 2-story house", () => {
      const perimeter = 2 * (recipe.footprintWidth + recipe.footprintDepth);
      const grossWallArea = perimeter * recipe.totalHeight;
      // Small house: ~40m perimeter * 5.4m = ~216 m2
      expect(grossWallArea).toBeGreaterThan(100);
      expect(grossWallArea).toBeLessThan(500);
    });
  });

  describe("getRecipe facade config matches era expectations", () => {
    it("pre-1970 RC residential has small windows", () => {
      const recipe = getRecipe("11", "pre-1970", "02000");
      expect(recipe.facade.windowWidth).toBe(0.8);
      expect(recipe.facade.windowRatio).toBe(0.15);
    });

    it("2020+ steel office has large windows and high window ratio (curtain wall)", () => {
      const recipe = getRecipe("13", "2020+", "14000");
      expect(recipe.facade.windowWidth).toBe(1.8);
      expect(recipe.facade.windowRatio).toBe(0.7);
    });

    it("1990s masonry residential has moderate windows", () => {
      const recipe = getRecipe("22", "1990-1999", "01000");
      expect(recipe.facade.windowWidth).toBe(1.2);
      expect(recipe.facade.windowRatio).toBe(0.25);
    });
  });
});
