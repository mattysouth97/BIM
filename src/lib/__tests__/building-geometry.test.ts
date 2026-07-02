import { describe, it, expect } from "vitest";
import { generateBuildingGeometry, toRecipe } from "../building-geometry";
import type { BrTitleInfo, BrFloorInfo } from "../types";

function makeTitle(overrides?: Partial<BrTitleInfo>): BrTitleInfo {
  return {
    mgmBldrgstPk: "test-pk-001",
    bldNm: "Test Building",
    platPlcNm: "Seoul Gangnam-gu",
    mainPurpsCd: "02000",
    mainPurpsCdNm: "Apartment",
    strctCd: "11",
    strctCdNm: "RC",
    roofCd: "1",
    roofCdNm: "평지붕",
    grndFlrCnt: 15,
    ugrndFlrCnt: 2,
    archArea: 84,
    platArea: 200,
    heit: 43.5,
    pmsDay: "20150301",
    ...overrides,
  } as BrTitleInfo;
}

describe("generateBuildingGeometry", () => {
  it("creates correct floor count from title data", () => {
    const title = makeTitle();
    const geo = generateBuildingGeometry(title, []);

    // 15 above + 2 below = 17 floors
    expect(geo.floors).toHaveLength(17);
    const aboveFloors = geo.floors.filter((f) => f.type === "above");
    const belowFloors = geo.floors.filter((f) => f.type === "below");
    expect(aboveFloors).toHaveLength(15);
    expect(belowFloors).toHaveLength(2);
  });

  it("totalHeight matches heit field", () => {
    const title = makeTitle({ heit: 43.5 });
    const geo = generateBuildingGeometry(title, []);
    expect(geo.totalHeight).toBe(43.5);
  });

  it("footprint dimensions are positive and reasonable", () => {
    const title = makeTitle({ archArea: 84 });
    const geo = generateBuildingGeometry(title, []);

    expect(geo.footprintWidth).toBeGreaterThan(0);
    expect(geo.footprintDepth).toBeGreaterThan(0);
    // Area should approximate 84m2
    const area = geo.footprintWidth * geo.footprintDepth;
    expect(area).toBeGreaterThan(50);
    expect(area).toBeLessThan(150);
  });

  it("classifies era from pmsDay", () => {
    expect(generateBuildingGeometry(makeTitle({ pmsDay: "19650101" }), []).era).toBe("pre-1970");
    expect(generateBuildingGeometry(makeTitle({ pmsDay: "19850101" }), []).era).toBe("1970-1989");
    expect(generateBuildingGeometry(makeTitle({ pmsDay: "19950101" }), []).era).toBe("1990-1999");
    expect(generateBuildingGeometry(makeTitle({ pmsDay: "20050101" }), []).era).toBe("2000-2009");
    expect(generateBuildingGeometry(makeTitle({ pmsDay: "20150101" }), []).era).toBe("2010-2019");
    expect(generateBuildingGeometry(makeTitle({ pmsDay: "20230101" }), []).era).toBe("2020+");
  });

  it("handles zero heit by calculating from floor count", () => {
    const title = makeTitle({ heit: 0, grndFlrCnt: 5 });
    const geo = generateBuildingGeometry(title, []);
    // Should calculate height from floor count * era floor height
    expect(geo.totalHeight).toBeGreaterThan(10);
    expect(geo.totalHeight).toBeLessThan(25);
  });

  it("wall thickness comes from structure code layers", () => {
    const rcGeo = generateBuildingGeometry(makeTitle({ strctCd: "11" }), []);
    expect(rcGeo.wallThickness).toBeGreaterThan(0.1);
    expect(rcGeo.wallThickness).toBeLessThan(1.0);
  });
});

describe("toRecipe", () => {
  it("converts BuildingGeometry to BuildingRecipe", () => {
    const title = makeTitle();
    const geo = generateBuildingGeometry(title, []);
    const recipe = toRecipe(geo);

    expect(recipe.footprintWidth).toBe(geo.footprintWidth);
    expect(recipe.footprintDepth).toBe(geo.footprintDepth);
    expect(recipe.totalHeight).toBe(geo.totalHeight);
    expect(recipe.era).toBe(geo.era);
    expect(recipe.strctCd).toBe(geo.strctCd);
  });

  it("totalHeight equals sum-like check from floors", () => {
    const title = makeTitle({ heit: 43.5, grndFlrCnt: 15 });
    const geo = generateBuildingGeometry(title, []);
    const recipe = toRecipe(geo);

    // totalHeight should match the geo value
    expect(recipe.totalHeight).toBe(43.5);
    // Floors should exist
    expect(recipe.floors.length).toBeGreaterThan(0);
  });

  it("recipe floor count matches geometry floor count", () => {
    const title = makeTitle();
    const geo = generateBuildingGeometry(title, []);
    const recipe = toRecipe(geo);
    expect(recipe.floors.length).toBe(geo.floors.length);
  });

  it("recipe has valid facade, slab, column, roof configs", () => {
    const title = makeTitle();
    const geo = generateBuildingGeometry(title, []);
    const recipe = toRecipe(geo);

    expect(recipe.facade.windowWidth).toBeGreaterThan(0);
    expect(recipe.slab.thickness).toBeGreaterThan(0);
    expect(recipe.column.spacing).toBeGreaterThan(0);
    expect(recipe.roof.type).toBe("flat");
  });

  it("column inset accounts for wall thickness", () => {
    const title = makeTitle();
    const geo = generateBuildingGeometry(title, []);
    const recipe = toRecipe(geo);

    // inset = wallThickness + columnSize/2 + 0.05
    const expectedInset = geo.wallThickness + geo.columnSize / 2 + 0.05;
    expect(recipe.column.inset).toBeCloseTo(expectedInset, 3);
  });
});
