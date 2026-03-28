// src/lib/__tests__/structural-codes.test.ts
// Unit tests for structural-codes.ts — KBC 2016 load tables, calculation functions

import { describe, it, expect } from "vitest";
import {
  KBC_2016_DEAD_LOADS,
  KBC_2016_LIVE_LOADS,
  KBC_COLUMN_SIZING,
  calcColumnLoad,
  calcColumnCapacity,
  getRecommendedColumnSize,
  getColumnPositions,
  getStressColor,
} from "../structural-codes";
import type { BuildingRecipe } from "../procedural/types";

// Minimal recipe for testing
function makeRecipe(
  overrides: Partial<BuildingRecipe> = {}
): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 15,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3, height: 3, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6, height: 3, isGroundFloor: false },
      { floorNo: 4, label: "4F", type: "above", y: 9, height: 3, isGroundFloor: false },
      { floorNo: 5, label: "5F", type: "above", y: 12, height: 3, isGroundFloor: false },
    ],
    totalHeight: 15,
    wallThickness: 0.2,
    era: "2000-2009",
    strctCd: "RC",
    mainPurpsCd: "02000",
    facade: {
      windowWidth: 1.2,
      windowHeight: 1.5,
      sillHeight: 0.9,
      windowSpacing: 0.3,
      windowRatio: 0.4,
      mullionDepth: 0.05,
      mullionWidth: 0.05,
      glassInset: 0.05,
      solidPanelChance: 0.15,
      parapetHeight: 0.8,
      cornerInset: 0.3,
    },
    slab: { thickness: 0.2, overhang: 0.1 },
    column: { spacing: 5, size: 0.4, inset: 2.5 },
    roof: { type: "flat", flatThickness: 0.2, gableHeight: 0, hipInset: 0 },
    materials: {
      wall: { color: 0xcccccc, roughness: 0.8, metalness: 0 },
      glass: { color: 0x88aacc, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.4 },
      mullion: { color: 0x888888, roughness: 0.5, metalness: 0.3 },
      slab: { color: 0xaaaaaa, roughness: 0.9, metalness: 0 },
      column: { color: 0x999999, roughness: 0.8, metalness: 0 },
      roof: { color: 0xbbbbbb, roughness: 0.9, metalness: 0 },
      groundFloor: { color: 0x999999, roughness: 0.9, metalness: 0 },
    },
    siteWidth: 25,
    siteDepth: 20,
    buildingName: "Test Building",
    address: "Seoul",
    ...overrides,
  };
}

describe("KBC_2016_DEAD_LOADS", () => {
  it("residential (02000) = 5.0 kN/m2", () => {
    expect(KBC_2016_DEAD_LOADS["02000"]).toBe(5.0);
  });

  it("commercial (14000) = 6.0 kN/m2", () => {
    expect(KBC_2016_DEAD_LOADS["14000"]).toBe(6.0);
  });

  it("default fallback = 5.0", () => {
    expect(KBC_2016_DEAD_LOADS["default"]).toBe(5.0);
  });
});

describe("KBC_2016_LIVE_LOADS", () => {
  it("residential (02000) = 2.0 kN/m2", () => {
    expect(KBC_2016_LIVE_LOADS["02000"]).toBe(2.0);
  });

  it("commercial (14000) = 2.5 kN/m2", () => {
    expect(KBC_2016_LIVE_LOADS["14000"]).toBe(2.5);
  });

  it("roof = 1.0 kN/m2", () => {
    expect(KBC_2016_LIVE_LOADS["roof"]).toBe(1.0);
  });
});

describe("KBC_COLUMN_SIZING", () => {
  it("has entries in ascending maxLoad order", () => {
    for (let i = 1; i < KBC_COLUMN_SIZING.length; i++) {
      expect(KBC_COLUMN_SIZING[i].maxLoad).toBeGreaterThan(KBC_COLUMN_SIZING[i - 1].maxLoad);
    }
  });

  it("last entry has maxLoad = Infinity", () => {
    expect(KBC_COLUMN_SIZING[KBC_COLUMN_SIZING.length - 1].maxLoad).toBe(Infinity);
  });
});

describe("calcColumnLoad", () => {
  it("returns per-floor cumulative loads for 5-floor residential 20x15m with 12 columns", () => {
    const recipe = makeRecipe({ mainPurpsCd: "02000" });
    const loads = calcColumnLoad(recipe, 12);

    // tributaryArea = 300/12 = 25 m2
    // floorLoad = (5.0 + 2.0) * 25 = 175 kN
    // Ground floor column (index 0): load = 175 * 5 = 875 kN
    expect(loads[0]).toBeCloseTo(875, 1);

    // Top floor column (index 4): load = 175 * 1 = 175 kN
    expect(loads[4]).toBeCloseTo(175, 1);
  });

  it("returns array with same length as floors", () => {
    const recipe = makeRecipe();
    const loads = calcColumnLoad(recipe, 12);
    expect(loads).toHaveLength(recipe.floors.length);
  });

  it("loads decrease monotonically from bottom to top", () => {
    const recipe = makeRecipe();
    const loads = calcColumnLoad(recipe, 12);
    for (let i = 1; i < loads.length; i++) {
      expect(loads[i]).toBeLessThanOrEqual(loads[i - 1]);
    }
  });

  it("uses default fallback for unknown mainPurpsCd", () => {
    const recipe = makeRecipe({ mainPurpsCd: "99999" });
    const loadsUnknown = calcColumnLoad(recipe, 12);
    const recipeDefault = makeRecipe({ mainPurpsCd: "02000" });
    const loadsDefault = calcColumnLoad(recipeDefault, 12);
    // Both default to 5.0 dead + 2.0 live = same result
    expect(loadsUnknown[0]).toBeCloseTo(loadsDefault[0], 1);
  });
});

describe("calcColumnCapacity", () => {
  it("returns correct kN for 0.4m column", () => {
    const recipe = makeRecipe({ column: { spacing: 5, size: 0.4, inset: 2.5 } });
    const capacity = calcColumnCapacity(recipe);

    // sizeMm = 400, Ag = 160000
    // Pu = 0.65 * 0.80 * 0.85 * 25 * 160000 / 1000 = 1768 kN
    expect(capacity).toBeCloseTo(1768, 0);
  });

  it("larger column has higher capacity", () => {
    const small = makeRecipe({ column: { spacing: 5, size: 0.3, inset: 2 } });
    const large = makeRecipe({ column: { spacing: 5, size: 0.6, inset: 2 } });
    expect(calcColumnCapacity(large)).toBeGreaterThan(calcColumnCapacity(small));
  });
});

describe("getRecommendedColumnSize", () => {
  it("200 kN -> 300x300mm RC column", () => {
    expect(getRecommendedColumnSize(200)).toBe("300x300mm RC column");
  });

  it("500 kN -> 400x400mm RC column", () => {
    expect(getRecommendedColumnSize(500)).toBe("400x400mm RC column");
  });

  it("1500 kN -> 600x600mm RC column", () => {
    expect(getRecommendedColumnSize(1500)).toBe("600x600mm RC column");
  });

  it("very small load -> 300x300mm", () => {
    expect(getRecommendedColumnSize(50)).toBe("300x300mm RC column");
  });

  it("very large load -> 700x700mm", () => {
    expect(getRecommendedColumnSize(10000)).toBe("700x700mm RC column");
  });
});

describe("getStressColor", () => {
  it("ratio < 0.6 -> green 0x22c55e", () => {
    expect(getStressColor(0.3)).toBe(0x22c55e);
    expect(getStressColor(0.0)).toBe(0x22c55e);
    expect(getStressColor(0.59)).toBe(0x22c55e);
  });

  it("0.6 <= ratio < 0.85 -> yellow 0xeab308", () => {
    expect(getStressColor(0.7)).toBe(0xeab308);
    expect(getStressColor(0.6)).toBe(0xeab308);
    expect(getStressColor(0.84)).toBe(0xeab308);
  });

  it("ratio >= 0.85 -> red 0xef4444", () => {
    expect(getStressColor(0.9)).toBe(0xef4444);
    expect(getStressColor(0.85)).toBe(0xef4444);
    expect(getStressColor(1.5)).toBe(0xef4444);
  });
});

describe("getColumnPositions", () => {
  it("returns array of {x, z} positions", () => {
    const recipe = makeRecipe();
    const positions = getColumnPositions(recipe);
    expect(positions).toBeInstanceOf(Array);
    expect(positions.length).toBeGreaterThan(0);
    positions.forEach((p) => {
      expect(typeof p.x).toBe("number");
      expect(typeof p.z).toBe("number");
    });
  });

  it("returns empty array when footprint is too small for spacing", () => {
    const recipe = makeRecipe({
      footprintWidth: 3,
      footprintDepth: 3,
      column: { spacing: 5, size: 0.3, inset: 0.5 },
    });
    const positions = getColumnPositions(recipe);
    expect(positions).toHaveLength(0);
  });

  it("matches expected grid count for known recipe", () => {
    // 20x15m, spacing=5, inset=2.5
    // innerW = 15, innerD = 10
    // colsX = max(2, round(15/5)+1) = max(2, 4) = 4
    // colsZ = max(2, round(10/5)+1) = max(2, 3) = 3
    // total = 4*3 = 12
    const recipe = makeRecipe({
      footprintWidth: 20,
      footprintDepth: 15,
      column: { spacing: 5, size: 0.4, inset: 2.5 },
    });
    const positions = getColumnPositions(recipe);
    expect(positions).toHaveLength(12);
  });
});
