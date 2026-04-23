import { describe, it, expect } from "vitest";
import type { PortfolioFeatureVector } from "../features";
import { FEATURE_SCHEMA } from "../features";

function sample(): PortfolioFeatureVector {
  return {
    // bldrgst
    gfaSqm: 1200, floorCountAbove: 5, floorCountBelow: 1, buildingHeightM: 15,
    constructionYear: 2005, structureTypeCode: 1, useTypeCode: 1, mainPurpsCode: 14000,
    bcRat: 0.5, vlRat: 2.4, platAreaSqm: 400,
    // geometry
    footprintAreaSqm: 200, aspectRatio: 1.4, perimeterM: 62, compactness: 0.65,
    // era_prior
    wallUValuePrior: 0.4, windowUValuePrior: 2.0, windowShgcPrior: 0.5,
    lightingPowerDensityPrior: 8,
    // location
    climateZoneCode: 0,
  };
}

describe("PortfolioFeatureVector + FEATURE_SCHEMA", () => {
  it("has exactly 20 fields", () => {
    expect(Object.keys(sample())).toHaveLength(20);
  });

  it("every field is a finite number", () => {
    for (const [k, v] of Object.entries(sample())) {
      expect(typeof v, `${k} should be number`).toBe("number");
      expect(Number.isFinite(v), `${k} should be finite`).toBe(true);
    }
  });

  it("FEATURE_SCHEMA version is 1.0.0", () => {
    expect(FEATURE_SCHEMA.version).toBe("1.0.0");
  });

  it("FEATURE_SCHEMA.fields has exactly 20 entries", () => {
    expect(FEATURE_SCHEMA.fields).toHaveLength(20);
  });

  it("FEATURE_SCHEMA names match vector keys in order", () => {
    expect(FEATURE_SCHEMA.fields.map((f) => f.name)).toEqual(Object.keys(sample()));
  });

  it("FEATURE_SCHEMA groups are one of the four expected values", () => {
    const valid = new Set(["bldrgst", "geometry", "era_prior", "location"]);
    for (const f of FEATURE_SCHEMA.fields) {
      expect(valid.has(f.group), `unexpected group "${f.group}" for ${f.name}`).toBe(true);
    }
  });

  it("FEATURE_SCHEMA group counts: 11 bldrgst, 4 geometry, 4 era_prior, 1 location", () => {
    const counts: Record<string, number> = {};
    for (const f of FEATURE_SCHEMA.fields) counts[f.group] = (counts[f.group] ?? 0) + 1;
    expect(counts).toEqual({ bldrgst: 11, geometry: 4, era_prior: 4, location: 1 });
  });

  it("every field has a non-empty unit and description", () => {
    for (const f of FEATURE_SCHEMA.fields) {
      expect(f.unit.length, `${f.name}.unit`).toBeGreaterThan(0);
      expect(f.description.length, `${f.name}.description`).toBeGreaterThan(0);
    }
  });
});
