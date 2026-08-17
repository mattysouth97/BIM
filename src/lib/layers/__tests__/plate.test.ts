import { describe, expect, it } from "vitest";

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import {
  keepOnPlate,
  plateRings,
  pointInPlate,
  samplePlateGrid,
} from "../plate";

function floors(n: number): FloorSpec[] {
  return Array.from({ length: n }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * 3,
    height: 3,
    isGroundFloor: i === 0,
  }));
}

function recipe(
  overrides: Partial<BuildingRecipe> = {},
): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 16,
    floors: floors(3),
    totalHeight: 9,
    wallThickness: 0.2,
    era: "2020+",
    strctCd: "21",
    mainPurpsCd: "14000",
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
    siteWidth: 28,
    siteDepth: 24,
    buildingName: "Plate test",
    address: "",
    materials: {
      wall: { color: "#ccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88a", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaa", roughness: 0.9, metalness: 0 },
      column: { color: "#bbb", roughness: 0.8, metalness: 0.1 },
      roof: { color: "#999", roughness: 0.9, metalness: 0 },
      groundFloor: { color: "#ddd", roughness: 0.9, metalness: 0 },
    },
    ...overrides,
  };
}

/** L: missing north-east quadrant. */
const L: [number, number][][] = [
  [
    [-10, -8],
    [10, -8],
    [10, 0],
    [0, 0],
    [0, 8],
    [-10, 8],
  ],
];

describe("plateRings / pointInPlate", () => {
  it("falls back to the bbox rectangle when no polygon is set", () => {
    const rings = plateRings(recipe());
    expect(pointInPlate(0, 0, rings)).toBe(true);
    expect(pointInPlate(12, 0, rings)).toBe(false);
  });

  it("rejects the missing arm of an L and a courtyard hole", () => {
    expect(pointInPlate(6, 4, L)).toBe(false);
    expect(pointInPlate(-6, -4, L)).toBe(true);

    const court: [number, number][][] = [
      [
        [-10, -8],
        [10, -8],
        [10, 8],
        [-10, 8],
      ],
      [
        [2, 2],
        [2, -2],
        [-2, -2],
        [-2, 2],
      ],
    ];
    expect(pointInPlate(0, 0, court)).toBe(false);
    expect(pointInPlate(6, 0, court)).toBe(true);
  });
});

describe("keepOnPlate / samplePlateGrid", () => {
  it("pulls a bbox-centre that sits in a courtyard back onto the plate", () => {
    const court: [number, number][][] = [
      [
        [-10, -8],
        [10, -8],
        [10, 8],
        [-10, 8],
      ],
      [
        [3, 3],
        [3, -3],
        [-3, -3],
        [-3, 3],
      ],
    ];
    const parked = keepOnPlate(0, 0, court, 0.4);
    expect(pointInPlate(parked.x, parked.z, court)).toBe(true);
    expect(Math.hypot(parked.x, parked.z)).toBeGreaterThan(2);
  });

  it("samples fixtures only on the solid L, never in the missing quadrant", () => {
    const points = samplePlateGrid(recipe({ footprintPolygon: L }), 2, 1);
    expect(points.length).toBeGreaterThan(8);
    for (const p of points) {
      expect(pointInPlate(p.x, p.z, L), `${p.x},${p.z}`).toBe(true);
      expect(p.x > 1 && p.z > 1, `${p.x},${p.z} in missing arm`).toBe(false);
    }
  });
});
