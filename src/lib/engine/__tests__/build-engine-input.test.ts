import { describe, it, expect } from "vitest";
import { buildEngineInput } from "../build-engine-input";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

// Minimal-but-complete BuildingRecipe fixture — buildEngineInput only reads
// footprintPolygon/footprintWidth/footprintDepth/floors, but the type is
// exercised as the real shape consumed at the call site.
const PBR = { color: "#ffffff", roughness: 0.5, metalness: 0.1 };

function makeFloors(aboveCount: number, belowCount = 0): FloorSpec[] {
  const floors: FloorSpec[] = [];
  for (let i = 0; i < belowCount; i++) {
    floors.push({ floorNo: -(i + 1), label: `B${i + 1}`, type: "below", y: -3.3 * (i + 1), height: 3.3, isGroundFloor: false });
  }
  for (let i = 0; i < aboveCount; i++) {
    floors.push({ floorNo: i + 1, label: `${i + 1}F`, type: "above", y: 3.3 * i, height: 3.3, isGroundFloor: i === 0 });
  }
  return floors;
}

function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  return {
    footprintWidth: 10,
    footprintDepth: 8,
    floors: makeFloors(3),
    totalHeight: 9.9,
    wallThickness: 0.3,
    era: "2000-2009",
    strctCd: "21",
    mainPurpsCd: "14000",
    facade: {
      windowWidth: 1.4, windowHeight: 1.6, sillHeight: 0.8, windowSpacing: 2.2,
      windowRatio: 0.3, mullionDepth: 0.06, mullionWidth: 0.05, glassInset: 0.03,
      solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 8, size: 0.4, inset: 0 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3.0, hipInset: 0.4 },
    materials: {
      wall: PBR, glass: PBR, mullion: PBR, slab: PBR, column: PBR, roof: PBR, groundFloor: PBR,
    },
    siteWidth: 20,
    siteDepth: 16,
    buildingName: "Test Building",
    address: "Test Address",
    ...overrides,
  };
}

describe("buildEngineInput", () => {
  it('returns null for footprintSource "parcel" (lot boundary != building outline)', () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe(),
      footprintSource: "parcel",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result).toBeNull();
  });

  it("returns null for footprintSource null (era-estimate rectangle, not a real footprint)", () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe(),
      footprintSource: null,
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result).toBeNull();
  });

  it('"cad" yields cadFootprint with source "cad-converted"', () => {
    const result = buildEngineInput({
      pk: "p1",
      title: "T",
      recipe: makeRecipe(),
      footprintSource: "cad",
      ledgerHeit: 12,
      measuredHeightM: null,
    });
    expect(result).not.toBeNull();
    expect(result?.cadFootprint?.source).toBe("cad-converted");
    expect(result?.vworldFootprint).toBeUndefined();
    expect(result?.ledger).toEqual({ heightM: 12 });
    expect(result?.params).toEqual({ floors: 3 });
  });

  it('"ifc" yields cadFootprint with source "cad-exact" (authoritative building outline)', () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe(),
      footprintSource: "ifc",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result?.cadFootprint?.source).toBe("cad-exact");
    expect(result?.ledger).toBeUndefined();
  });

  it('"building" yields vworldFootprint with groundFloors and measuredHeightM', () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe(),
      footprintSource: "building",
      ledgerHeit: 0,
      measuredHeightM: 13.5,
    });
    expect(result).not.toBeNull();
    expect(result?.cadFootprint).toBeUndefined();
    expect(result?.vworldFootprint?.measuredHeightM).toBe(13.5);
    expect(result?.vworldFootprint?.groundFloors).toBe(3);
    expect(result?.params).toEqual({ floors: 3 });
  });

  it('"building" with measuredHeightM null omits measuredHeightM (undefined, not null)', () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe(),
      footprintSource: "building",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result?.vworldFootprint?.measuredHeightM).toBeUndefined();
  });

  it("prefers the polygon override over the rectangle when footprintPolygon is set", () => {
    const polygon: [number, number][][] = [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]];
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe({ footprintPolygon: polygon }),
      footprintSource: "cad",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result?.cadFootprint?.rings).toBe(polygon);
  });

  it("builds a closed, origin-centered rectangle ring when no polygon is present", () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe({ footprintWidth: 10, footprintDepth: 8 }),
      footprintSource: "cad",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    const rings = result?.cadFootprint?.rings;
    expect(rings).toEqual([[
      [-5, -4],
      [5, -4],
      [5, 4],
      [-5, 4],
      [-5, -4],
    ]]);
    // closed ring: first === last
    const outer = rings![0];
    expect(outer[0]).toEqual(outer[outer.length - 1]);
  });

  it("floors = count of above-type floors when present, ignoring below-grade floors", () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe({ floors: makeFloors(4, 2) }),
      footprintSource: "cad",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result?.params).toEqual({ floors: 4 });
  });

  it("falls back to total floor count (min 1) when no floor has type 'above'", () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe({ floors: makeFloors(0, 2) }),
      footprintSource: "cad",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    // no "above" floors -> falls back to recipe.floors.length (2 below-grade floors)
    expect(result?.params).toEqual({ floors: 2 });
  });

  it("floors is never less than 1 even with an empty floors array", () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe({ floors: [] }),
      footprintSource: "cad",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result?.params).toEqual({ floors: 1 });
  });

  it("omits ledger when ledgerHeit is 0 (AFF-6: 0 means unavailable)", () => {
    const result = buildEngineInput({
      pk: "p1",
      recipe: makeRecipe(),
      footprintSource: "cad",
      ledgerHeit: 0,
      measuredHeightM: null,
    });
    expect(result?.ledger).toBeUndefined();
  });
});
