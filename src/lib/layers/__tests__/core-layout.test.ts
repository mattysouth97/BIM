// src/lib/layers/__tests__/core-layout.test.ts
// The shared parametric core layout must (a) scale with the footprint,
// (b) keep every slot inside the slab, and (c) keep the coordinated systems
// (elevator bank, wet riser, electrical riser, roof plant) from overlapping.

import { describe, it, expect } from "vitest";
import { computeCoreLayout } from "../core-layout";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

function makeFloors(count: number, height = 3.0): FloorSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * height,
    height,
    isGroundFloor: i === 0,
  }));
}

function makeRecipe(
  footprintWidth: number,
  footprintDepth: number,
  floorCount: number
): BuildingRecipe {
  const floors = makeFloors(floorCount);
  return {
    footprintWidth,
    footprintDepth,
    floors,
    totalHeight: floorCount * 3.0,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "02000",
    column: { spacing: 6, size: 0.4, inset: 1 },
    slab: { thickness: 0.2, overhang: 0 },
    facade: {
      windowWidth: 1.4,
      windowHeight: 1.6,
      sillHeight: 0.9,
      windowSpacing: 0.5,
      windowRatio: 0.6,
      mullionDepth: 0.06,
      mullionWidth: 0.05,
      glassInset: 0.04,
      solidPanelChance: 0.15,
      parapetHeight: 0.9,
      cornerInset: 0.2,
    },
    roof: { type: "flat", flatThickness: 0.15, gableHeight: 0, hipInset: 0 },
    siteWidth: footprintWidth + 8,
    siteDepth: footprintDepth + 8,
    buildingName: "Test Building",
    address: "Seoul, Korea",
    materials: {
      wall: { color: "#cccccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0.0 },
      column: { color: "#bbbbbb", roughness: 0.8, metalness: 0.1 },
      roof: { color: "#999999", roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: "#dddddd", roughness: 0.9, metalness: 0.0 },
    },
  };
}

describe("computeCoreLayout — elevator bank", () => {
  it("honours an authored serviceCore slot", () => {
    const recipe = makeRecipe(20, 16, 3);
    recipe.serviceCore = { x: 3, z: -1 };
    const layout = computeCoreLayout(recipe);
    expect(layout.elevator.bankZ).toBeCloseTo(-1, 5);
    expect(layout.elevator.shafts[0].x).toBeCloseTo(3, 5);
    expect(layout.serviceRiser.x).toBeGreaterThan(layout.elevator.maxX);
  });

  it("places the bank against the rear (-Z) wall, not the footprint centre", () => {
    const layout = computeCoreLayout(makeRecipe(12, 10, 3));
    // bankZ = -(hd - 0.5 - shaftDepth/2) = -(5 - 0.5 - 1.0)
    expect(layout.elevator.bankZ).toBeCloseTo(-3.5, 5);
    expect(layout.elevator.shafts).toHaveLength(1);
    expect(layout.elevator.shafts[0]).toEqual({ x: 0, z: -3.5 });
  });

  it("scales shaft count with floor count (1 / 2 / 3)", () => {
    expect(computeCoreLayout(makeRecipe(30, 20, 3)).elevator.shafts).toHaveLength(1);
    expect(computeCoreLayout(makeRecipe(30, 20, 10)).elevator.shafts).toHaveLength(2);
    expect(computeCoreLayout(makeRecipe(30, 20, 20)).elevator.shafts).toHaveLength(3);
  });

  it("clamps shaft count on narrow footprints so the bank stays inside the slab", () => {
    // 20 floors wants 3 shafts, but a 6 m wide building can only fit 1-2.
    const layout = computeCoreLayout(makeRecipe(6, 10, 20));
    expect(layout.elevator.shafts.length).toBeLessThan(3);
    expect(layout.elevator.minX).toBeGreaterThanOrEqual(-3);
    expect(layout.elevator.maxX).toBeLessThanOrEqual(3);
  });

  it("keeps multi-shaft banks centred and inside the footprint", () => {
    const layout = computeCoreLayout(makeRecipe(30, 20, 20));
    const hw = 15;
    for (const s of layout.elevator.shafts) {
      expect(Math.abs(s.x)).toBeLessThan(hw);
      expect(s.z).toBeCloseTo(layout.elevator.bankZ, 5);
    }
    // Bank symmetric about x=0
    const xs = layout.elevator.shafts.map((s) => s.x);
    expect(xs[0]).toBeCloseTo(-xs[xs.length - 1], 5);
  });
});

describe("computeCoreLayout — coordinated risers and plant", () => {
  it("separates the wet riser, electrical riser, and elevator bank", () => {
    const layout = computeCoreLayout(makeRecipe(20, 14, 10));
    // Wet riser to the right of the bank, electrical to the left
    expect(layout.serviceRiser.x).toBeGreaterThan(layout.elevator.maxX);
    expect(layout.electricalRiser.x).toBeLessThan(layout.elevator.minX);
  });

  it("keeps every slot inside the footprint on a small building", () => {
    const layout = computeCoreLayout(makeRecipe(8, 8, 3));
    const hw = 4;
    const hd = 4;
    const slots = [
      layout.serviceRiser,
      layout.electricalRiser,
      layout.roofChiller,
      layout.basementDhw,
      ...layout.roofAshp,
      ...layout.elevator.shafts,
    ];
    for (const s of slots) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(hw);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(hd);
    }
  });

  it("lands the roof chiller on the wet riser (continuous vertical system)", () => {
    const layout = computeCoreLayout(makeRecipe(20, 14, 10));
    expect(layout.roofChiller.x).toBeCloseTo(layout.serviceRiser.x, 5);
    expect(layout.roofChiller.z).toBeCloseTo(layout.serviceRiser.z, 5);
  });

  it("reserves a rear roof band covering the plant slots", () => {
    const layout = computeCoreLayout(makeRecipe(20, 14, 10));
    expect(layout.roofPlantBandMaxZ).toBeGreaterThan(layout.elevator.bankZ);
    expect(layout.roofChiller.z).toBeLessThanOrEqual(layout.roofPlantBandMaxZ);
    for (const s of layout.roofAshp) {
      expect(s.z).toBeLessThanOrEqual(layout.roofPlantBandMaxZ);
    }
  });

  it("does not park the bank in the missing arm of an L-plate", () => {
    const L: [number, number][] = [
      [-10, -8],
      [10, -8],
      [10, 0],
      [0, 0],
      [0, 8],
      [-10, 8],
    ];
    const recipe = makeRecipe(20, 16, 5);
    recipe.footprintPolygon = [L];
    // Bbox rear-centre is on the plate; the NE void is the trap.
    recipe.serviceCore = { x: 6, z: 5 };
    const layout = computeCoreLayout(recipe);
    const shaft = layout.elevator.shafts[0];
    // The missing arm is x>0 and z>0. The bank must not sit there.
    expect(shaft.x > 0 && shaft.z > 0).toBe(false);
  });

  it("is deterministic — identical recipes yield identical layouts", () => {
    const a = computeCoreLayout(makeRecipe(20, 14, 10));
    const b = computeCoreLayout(makeRecipe(20, 14, 10));
    expect(a).toEqual(b);
  });
});
