// src/lib/portfolio/__tests__/feature-extractor.test.ts
// TDD fixture suite for extractFeatures — Phase 35 Task 3.
// 9 matrix fixtures (3 eras × 3 use types) + 4 behavioural tests.
//
// PARITY NOTE: The JS implementation in scripts/extract-features.mjs must
// produce identical output to this TS extractor for every fixture. The smoke
// test in extract-features-cli.test.ts enforces this for the 2018 apt fixture.
// Task 11 adds a CI guard covering all 9.

import { describe, it, expect } from "vitest";
import { extractFeatures } from "../feature-extractor";
import type { BuildingRecord } from "../../types";
import type { FootprintGeometry } from "../types";
import type { PortfolioFeatureVector } from "../features";

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * BuildingRecord factory with sensible defaults.
 * pk format mirrors mgmBldrgstPk: first 5 chars = sigunguCd (e.g. "11110" = Seoul Jongno)
 */
function makeBuilding(overrides: Partial<BuildingRecord>): BuildingRecord {
  return {
    pk: "11110-100-00-0001",  // Seoul (sido prefix "11")
    name: "테스트 건물",
    address: "서울특별시 종로구 테스트로 1",
    useCode: "02000",          // office
    useName: "업무시설",
    structureCode: "21",       // RC
    structureName: "철근콘크리트구조",
    floorsAbove: 5,
    floorsBelow: 1,
    totalArea: 1000,
    buildingArea: 200,
    siteArea: 400,
    coverageRatio: 50,
    floorAreaRatio: 250,
    approvalDate: "20050101",
    permitDate: "20030601",
    constructionDate: "20040101",
    roofType: "01",
    height: 18,
    ...overrides,
  };
}

function makeGeometry(overrides: Partial<FootprintGeometry> = {}): FootprintGeometry {
  return {
    outerRing: [
      [126.977, 37.575],
      [126.987, 37.575],
      [126.987, 37.580],
      [126.977, 37.580],
    ],
    areaSqm: 200,
    perimeterM: 60,
    aspectRatio: 1.5,
    ...overrides,
  };
}

// Convenience: compute expected compactness
function compactness(areaSqm: number, perimeterM: number): number {
  const raw = (4 * Math.PI * areaSqm) / (perimeterM * perimeterM);
  return Math.min(1, Math.max(0, raw));
}

// ─── 9 fixture cases (3 eras × 3 use types) ─────────────────────────────────
// Era split used by the extractor for prior lookup:
//   pre-1990   → year < 1990  → BuildingEra "pre-1970" / "1970-1989"
//   1990-2010  → 1990 ≤ year < 2010  → BuildingEra "1990-1999" / "2000-2009"
//   post-2010  → year >= 2010  → BuildingEra "2010-2019" / "2020+"
//
// Climate zone coverage across fixtures:
//   Seoul (pk "11110…") → sido "11" → 0 (central)
//   Busan (pk "26110…") → sido "26" → 1 (southern)
//   Jeju  (pk "50110…") → sido "50" → 2 (jeju)

describe("extractFeatures — 9 fixture matrix", () => {
  // ── Pre-1990 ×  Residential  (1985 masonry apt, Seoul) ──
  it("pre-1990 × residential: 1985 masonry apt (Seoul, central zone)", () => {
    const b = makeBuilding({
      pk: "11110-100-00-1985",
      useCode: "01000",
      useName: "단독주택",
      structureCode: "22",       // masonry
      structureName: "조적식구조",
      floorsAbove: 3,
      floorsBelow: 0,
      totalArea: 360,
      buildingArea: 120,
      siteArea: 200,
      coverageRatio: 60,
      floorAreaRatio: 180,
      approvalDate: "19851215",
      permitDate: "19840601",
      constructionDate: "19850101",
      height: 8.1,
    });
    const g = makeGeometry({ areaSqm: 120, perimeterM: 48, aspectRatio: 1.3 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      // bldrgst
      gfaSqm: 360,
      floorCountAbove: 3,
      floorCountBelow: 0,
      buildingHeightM: 8.1,
      constructionYear: 1985,
      structureTypeCode: 0,        // masonry → 0
      useTypeCode: 0,              // residential → 0
      mainPurpsCode: 1000,         // "01000" → 1000
      bcRat: 60,
      vlRat: 180,
      platAreaSqm: 200,
      // geometry
      footprintAreaSqm: 120,
      aspectRatio: 1.3,
      perimeterM: 48,
      compactness: compactness(120, 48),
      // era_prior — 1985 → "1970-1989" era; residential
      wallUValuePrior: 1.05,       // WALL_U_VALUES["1970-1989"].residential
      windowUValuePrior: 3.84,     // WINDOW_U_VALUES["1970-1989"]
      windowShgcPrior: 0.76,       // WINDOW_SHGC["1970-1989"]
      lightingPowerDensityPrior: 12, // pre-1990 era prior (fluorescent era)
      // location
      climateZoneCode: 0,          // Seoul → central
    };
    expect(result).toEqual(expected);
  });

  // ── Pre-1990 × Office (1988 concrete office, Busan) ──
  it("pre-1990 × office: 1988 concrete office (Busan, southern zone)", () => {
    const b = makeBuilding({
      pk: "26110-100-00-1988",
      useCode: "14000",
      useName: "업무시설",
      structureCode: "21",       // RC
      structureName: "철근콘크리트구조",
      floorsAbove: 8,
      floorsBelow: 1,
      totalArea: 3200,
      buildingArea: 400,
      siteArea: 600,
      coverageRatio: 66.67,
      floorAreaRatio: 533.33,
      approvalDate: "19881001",
      permitDate: "19870301",
      constructionDate: "19870901",
      height: 32,
    });
    const g = makeGeometry({ areaSqm: 400, perimeterM: 80, aspectRatio: 1.2 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 3200,
      floorCountAbove: 8,
      floorCountBelow: 1,
      buildingHeightM: 32,
      constructionYear: 1988,
      structureTypeCode: 1,        // RC → 1
      useTypeCode: 1,              // office → 1
      mainPurpsCode: 14000,        // "14000" → 14000
      bcRat: 66.67,
      vlRat: 533.33,
      platAreaSqm: 600,
      footprintAreaSqm: 400,
      aspectRatio: 1.2,
      perimeterM: 80,
      compactness: compactness(400, 80),
      // era_prior — 1988 → "1970-1989"; non-residential
      wallUValuePrior: 1.2,        // WALL_U_VALUES["1970-1989"].nonResidential
      windowUValuePrior: 3.84,
      windowShgcPrior: 0.76,
      lightingPowerDensityPrior: 12,
      climateZoneCode: 1,          // Busan → southern
    };
    expect(result).toEqual(expected);
  });

  // ── Pre-1990 × Mixed (1987 concrete mixed, Jeju) ──
  it("pre-1990 × mixed: 1987 concrete mixed-use (Jeju, jeju zone)", () => {
    const b = makeBuilding({
      pk: "50110-100-00-1987",
      useCode: "04000",
      useName: "제1종근린생활시설",
      structureCode: "21",
      structureName: "철근콘크리트구조",
      floorsAbove: 4,
      floorsBelow: 0,
      totalArea: 800,
      buildingArea: 200,
      siteArea: 300,
      coverageRatio: 66.67,
      floorAreaRatio: 266.67,
      approvalDate: "19871201",
      permitDate: "19861001",
      constructionDate: "19870201",
      height: 14,
    });
    const g = makeGeometry({ areaSqm: 200, perimeterM: 60, aspectRatio: 1.6 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 800,
      floorCountAbove: 4,
      floorCountBelow: 0,
      buildingHeightM: 14,
      constructionYear: 1987,
      structureTypeCode: 1,        // RC → 1
      useTypeCode: 2,              // mixed → 2 (근린생활시설 → mixed)
      mainPurpsCode: 4000,         // "04000" → 4000
      bcRat: 66.67,
      vlRat: 266.67,
      platAreaSqm: 300,
      footprintAreaSqm: 200,
      aspectRatio: 1.6,
      perimeterM: 60,
      compactness: compactness(200, 60),
      wallUValuePrior: 1.2,        // "1970-1989" non-residential
      windowUValuePrior: 3.84,
      windowShgcPrior: 0.76,
      lightingPowerDensityPrior: 12,
      climateZoneCode: 2,          // Jeju → jeju
    };
    expect(result).toEqual(expected);
  });

  // ── 1990-2010 × Residential (2003 concrete apt, Seoul) ──
  it("1990-2010 × residential: 2003 concrete apt (Seoul, central zone)", () => {
    const b = makeBuilding({
      pk: "11110-200-00-2003",
      useCode: "02000",
      useName: "공동주택",
      structureCode: "21",
      structureName: "철근콘크리트구조",
      floorsAbove: 15,
      floorsBelow: 2,
      totalArea: 15000,
      buildingArea: 1000,
      siteArea: 3000,
      coverageRatio: 33.33,
      floorAreaRatio: 500,
      approvalDate: "20031201",
      permitDate: "20010601",
      constructionDate: "20020101",
      height: 45,
    });
    const g = makeGeometry({ areaSqm: 1000, perimeterM: 140, aspectRatio: 2.0 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 15000,
      floorCountAbove: 15,
      floorCountBelow: 2,
      buildingHeightM: 45,
      constructionYear: 2003,
      structureTypeCode: 1,        // RC → 1
      useTypeCode: 0,              // residential → 0 (공동주택 useCode "02000" → residential)
      mainPurpsCode: 2000,         // "02000" → 2000
      bcRat: 33.33,
      vlRat: 500,
      platAreaSqm: 3000,
      footprintAreaSqm: 1000,
      aspectRatio: 2.0,
      perimeterM: 140,
      compactness: compactness(1000, 140),
      // era_prior — 2003 → "2000-2009"; residential
      wallUValuePrior: 0.47,       // WALL_U_VALUES["2000-2009"].residential
      windowUValuePrior: 2.1,      // WINDOW_U_VALUES["2000-2009"]
      windowShgcPrior: 0.45,       // WINDOW_SHGC["2000-2009"]
      lightingPowerDensityPrior: 8,  // 2000s era — LED/compact fluorescent
      climateZoneCode: 0,
    };
    expect(result).toEqual(expected);
  });

  // ── 1990-2010 × Office (2005 concrete office, Busan) ──
  it("1990-2010 × office: 2005 concrete office (Busan, southern zone)", () => {
    const b = makeBuilding({
      pk: "26110-200-00-2005",
      useCode: "14000",
      useName: "업무시설",
      structureCode: "21",
      structureName: "철근콘크리트구조",
      floorsAbove: 10,
      floorsBelow: 2,
      totalArea: 8000,
      buildingArea: 800,
      siteArea: 1200,
      coverageRatio: 66.67,
      floorAreaRatio: 666.67,
      approvalDate: "20051015",
      permitDate: "20040101",
      constructionDate: "20040601",
      height: 40,
    });
    const g = makeGeometry({ areaSqm: 800, perimeterM: 120, aspectRatio: 1.8 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 8000,
      floorCountAbove: 10,
      floorCountBelow: 2,
      buildingHeightM: 40,
      constructionYear: 2005,
      structureTypeCode: 1,
      useTypeCode: 1,              // office → 1
      mainPurpsCode: 14000,
      bcRat: 66.67,
      vlRat: 666.67,
      platAreaSqm: 1200,
      footprintAreaSqm: 800,
      aspectRatio: 1.8,
      perimeterM: 120,
      compactness: compactness(800, 120),
      // era_prior — 2005 → "2000-2009"; non-residential
      wallUValuePrior: 0.58,       // WALL_U_VALUES["2000-2009"].nonResidential
      windowUValuePrior: 2.1,
      windowShgcPrior: 0.45,
      lightingPowerDensityPrior: 8,
      climateZoneCode: 1,
    };
    expect(result).toEqual(expected);
  });

  // ── 1990-2010 × Mixed (2007 concrete mixed, Jeju) ──
  it("1990-2010 × mixed: 2007 concrete mixed-use (Jeju, jeju zone)", () => {
    const b = makeBuilding({
      pk: "50110-200-00-2007",
      useCode: "04000",
      useName: "제1종근린생활시설",
      structureCode: "21",
      structureName: "철근콘크리트구조",
      floorsAbove: 5,
      floorsBelow: 1,
      totalArea: 2000,
      buildingArea: 400,
      siteArea: 600,
      coverageRatio: 66.67,
      floorAreaRatio: 333.33,
      approvalDate: "20071001",
      permitDate: "20060101",
      constructionDate: "20060701",
      height: 17.5,
    });
    const g = makeGeometry({ areaSqm: 400, perimeterM: 85, aspectRatio: 1.7 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 2000,
      floorCountAbove: 5,
      floorCountBelow: 1,
      buildingHeightM: 17.5,
      constructionYear: 2007,
      structureTypeCode: 1,
      useTypeCode: 2,              // mixed → 2
      mainPurpsCode: 4000,
      bcRat: 66.67,
      vlRat: 333.33,
      platAreaSqm: 600,
      footprintAreaSqm: 400,
      aspectRatio: 1.7,
      perimeterM: 85,
      compactness: compactness(400, 85),
      // era_prior — 2007 → "2000-2009"; non-residential
      wallUValuePrior: 0.58,
      windowUValuePrior: 2.1,
      windowShgcPrior: 0.45,
      lightingPowerDensityPrior: 8,
      climateZoneCode: 2,
    };
    expect(result).toEqual(expected);
  });

  // ── Post-2010 × Residential (2018 concrete apt, Seoul) ──
  it("post-2010 × residential: 2018 concrete apt (Seoul, central zone)", () => {
    const b = makeBuilding({
      pk: "11110-300-00-2018",
      useCode: "02000",
      useName: "공동주택",
      structureCode: "21",
      structureName: "철근콘크리트구조",
      floorsAbove: 25,
      floorsBelow: 3,
      totalArea: 25000,
      buildingArea: 1000,
      siteArea: 4000,
      coverageRatio: 25,
      floorAreaRatio: 625,
      approvalDate: "20181215",
      permitDate: "20160601",
      constructionDate: "20170101",
      height: 75,
    });
    const g = makeGeometry({ areaSqm: 1000, perimeterM: 130, aspectRatio: 1.4 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 25000,
      floorCountAbove: 25,
      floorCountBelow: 3,
      buildingHeightM: 75,
      constructionYear: 2018,
      structureTypeCode: 1,
      useTypeCode: 0,              // residential → 0
      mainPurpsCode: 2000,
      bcRat: 25,
      vlRat: 625,
      platAreaSqm: 4000,
      footprintAreaSqm: 1000,
      aspectRatio: 1.4,
      perimeterM: 130,
      compactness: compactness(1000, 130),
      // era_prior — 2018 → "2010-2019"; residential
      wallUValuePrior: 0.27,       // WALL_U_VALUES["2010-2019"].residential
      windowUValuePrior: 1.5,      // WINDOW_U_VALUES["2010-2019"]
      windowShgcPrior: 0.35,       // WINDOW_SHGC["2010-2019"]
      lightingPowerDensityPrior: 6,  // 2010s era — LED era
      climateZoneCode: 0,
    };
    expect(result).toEqual(expected);
  });

  // ── Post-2010 × Office (2020 steel office, Busan) ──
  it("post-2010 × office: 2020 steel office (Busan, southern zone)", () => {
    const b = makeBuilding({
      pk: "26110-300-00-2020",
      useCode: "14000",
      useName: "업무시설",
      structureCode: "13",       // steel
      structureName: "철골구조",
      floorsAbove: 20,
      floorsBelow: 3,
      totalArea: 40000,
      buildingArea: 2000,
      siteArea: 4000,
      coverageRatio: 50,
      floorAreaRatio: 1000,
      approvalDate: "20201101",
      permitDate: "20180601",
      constructionDate: "20190101",
      height: 90,
    });
    const g = makeGeometry({ areaSqm: 2000, perimeterM: 200, aspectRatio: 2.2 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 40000,
      floorCountAbove: 20,
      floorCountBelow: 3,
      buildingHeightM: 90,
      constructionYear: 2020,
      structureTypeCode: 2,        // steel → 2
      useTypeCode: 1,              // office → 1
      mainPurpsCode: 14000,
      bcRat: 50,
      vlRat: 1000,
      platAreaSqm: 4000,
      footprintAreaSqm: 2000,
      aspectRatio: 2.2,
      perimeterM: 200,
      compactness: compactness(2000, 200),
      // era_prior — 2020 → "2020+"; non-residential
      wallUValuePrior: 0.22,       // WALL_U_VALUES["2020+"].nonResidential
      windowUValuePrior: 0.9,      // WINDOW_U_VALUES["2020+"]
      windowShgcPrior: 0.25,       // WINDOW_SHGC["2020+"]
      lightingPowerDensityPrior: 6,  // 2020s era — high-efficiency LED
      climateZoneCode: 1,
    };
    expect(result).toEqual(expected);
  });

  // ── Post-2010 × Mixed (2019 steel mixed, Jeju) ──
  it("post-2010 × mixed: 2019 steel mixed-use (Jeju, jeju zone)", () => {
    const b = makeBuilding({
      pk: "50110-300-00-2019",
      useCode: "04000",
      useName: "제1종근린생활시설",
      structureCode: "13",       // steel
      structureName: "철골구조",
      floorsAbove: 6,
      floorsBelow: 1,
      totalArea: 3600,
      buildingArea: 600,
      siteArea: 900,
      coverageRatio: 66.67,
      floorAreaRatio: 400,
      approvalDate: "20191001",
      permitDate: "20180101",
      constructionDate: "20180601",
      height: 24,
    });
    const g = makeGeometry({ areaSqm: 600, perimeterM: 100, aspectRatio: 1.9 });

    const result = extractFeatures(b, g);

    const expected: PortfolioFeatureVector = {
      gfaSqm: 3600,
      floorCountAbove: 6,
      floorCountBelow: 1,
      buildingHeightM: 24,
      constructionYear: 2019,
      structureTypeCode: 2,        // steel → 2
      useTypeCode: 2,              // mixed → 2
      mainPurpsCode: 4000,
      bcRat: 66.67,
      vlRat: 400,
      platAreaSqm: 900,
      footprintAreaSqm: 600,
      aspectRatio: 1.9,
      perimeterM: 100,
      compactness: compactness(600, 100),
      // era_prior — 2019 → "2010-2019"; non-residential
      wallUValuePrior: 0.35,       // WALL_U_VALUES["2010-2019"].nonResidential
      windowUValuePrior: 1.5,
      windowShgcPrior: 0.35,
      lightingPowerDensityPrior: 6,
      climateZoneCode: 2,
    };
    expect(result).toEqual(expected);
  });
});

// ─── Behavioural tests ───────────────────────────────────────────────────────

describe("extractFeatures — behavioural", () => {
  const baseBuilding = makeBuilding({});
  const baseGeometry = makeGeometry({});

  it("is deterministic — same inputs produce same output twice", () => {
    const r1 = extractFeatures(baseBuilding, baseGeometry);
    const r2 = extractFeatures(baseBuilding, baseGeometry);
    expect(r1).toEqual(r2);
  });

  it("is pure — does not mutate the building input", () => {
    const building = makeBuilding({});
    const frozen = Object.freeze({ ...building }) as BuildingRecord;
    // Should not throw even with frozen object
    expect(() => extractFeatures(frozen, baseGeometry)).not.toThrow();
  });

  it("is pure — does not mutate the geometry input", () => {
    const geometry = makeGeometry({});
    const frozen = Object.freeze({ ...geometry, outerRing: Object.freeze([...geometry.outerRing]) }) as FootprintGeometry;
    expect(() => extractFeatures(baseBuilding, frozen)).not.toThrow();
  });

  it("compactness is clamped to [0, 1] — degenerate tiny perimeter", () => {
    // Huge area, tiny perimeter → compactness raw >> 1 → clamped to 1
    const degenerateGeo = makeGeometry({ areaSqm: 1_000_000, perimeterM: 1 });
    const result = extractFeatures(baseBuilding, degenerateGeo);
    expect(result.compactness).toBe(1);
  });

  it("compactness is clamped to [0, 1] — degenerate huge perimeter", () => {
    // Tiny area, huge perimeter → compactness raw ≈ 0
    const degenerateGeo = makeGeometry({ areaSqm: 0.001, perimeterM: 10_000 });
    const result = extractFeatures(baseBuilding, degenerateGeo);
    expect(result.compactness).toBeGreaterThanOrEqual(0);
    expect(result.compactness).toBeLessThanOrEqual(1);
  });

  it("handles zero-value sentinels without throwing", () => {
    const sentinelBuilding = makeBuilding({
      coverageRatio: 0,    // zero = data unavailable sentinel
      floorAreaRatio: 0,
      siteArea: 0,
    });
    let result: PortfolioFeatureVector | undefined;
    expect(() => {
      result = extractFeatures(sentinelBuilding, baseGeometry);
    }).not.toThrow();
    expect(result!.bcRat).toBe(0);
    expect(result!.vlRat).toBe(0);
    expect(result!.platAreaSqm).toBe(0);
  });

  it("infers buildingHeightM from floor count when height is 0 sentinel", () => {
    const b = makeBuilding({ height: 0, floorsAbove: 5 });
    const result = extractFeatures(b, baseGeometry);
    // 5 floors × 3 m/floor = 15
    expect(result.buildingHeightM).toBe(15);
  });

  it("mainPurpsCode defaults to 0 when useCode is empty/unparseable", () => {
    const b = makeBuilding({ useCode: "" });
    const result = extractFeatures(b, baseGeometry);
    expect(result.mainPurpsCode).toBe(0);
  });
});
