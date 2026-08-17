// Unit tests for the 외피 analysis overlay builders.
// Pure Three.js + pure functions — no React, no renderer.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { ElementHeatLoss } from "@/lib/energy/heat-loss";
import {
  analysisBandIndex,
  ANALYSIS_BAND_COUNT,
  edgeOutwardNormal,
  offsetRings,
  signedRingArea,
  type Ring,
} from "../analysis/overlay-types";
import {
  buildEnvelopeOverlay,
  computeEnvelopeShares,
  computeOrientationWwr,
} from "../analysis/envelope-overlay";

function element(
  name: string,
  hCoefficient: number,
  area = 100,
  uValue = 0.5,
): ElementHeatLoss {
  return {
    element: name,
    area,
    uValue,
    hCoefficient,
    deltaT: 25,
    heatLoss: hCoefficient * 25,
    heatLossPerSqm: 0,
  };
}

const HEAT_LOSS: ElementHeatLoss[] = [
  element("Walls", 200),
  element("Windows", 120),
  element("Roof", 40),
  element("Ground Floor", 30),
  element("Infiltration/Ventilation", 110),
];

function floors(count: number, height = 3): FloorSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * height,
    height,
    isGroundFloor: i === 0,
  }));
}

function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 10,
    floors: floors(3),
    totalHeight: 9,
    wallThickness: 0.2,
    column: { spacing: 6, size: 0.5, inset: 1 },
    slab: { thickness: 0.25, overhang: 0 },
    ...overrides,
  } as unknown as BuildingRecipe;
}

/** CCW square, 10 m per side, centred on the origin. */
const SQUARE: Ring = [
  [-5, -5],
  [5, -5],
  [5, 5],
  [-5, 5],
];

describe("analysisBandIndex", () => {
  it("is monotone non-decreasing in its input", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const band = analysisBandIndex(i / 100);
      expect(band).toBeGreaterThanOrEqual(previous);
      previous = band;
    }
  });

  it("clamps out-of-range and non-finite inputs to the ends", () => {
    expect(analysisBandIndex(-1)).toBe(0);
    expect(analysisBandIndex(Number.NaN)).toBe(0);
    expect(analysisBandIndex(0)).toBe(0);
    expect(analysisBandIndex(1)).toBe(ANALYSIS_BAND_COUNT - 1);
    expect(analysisBandIndex(4)).toBe(ANALYSIS_BAND_COUNT - 1);
  });
});

describe("ring helpers", () => {
  it("reports a CCW ring as positive area", () => {
    expect(signedRingArea(SQUARE)).toBeCloseTo(100, 6);
  });

  it("points the outer-ring normal away from the enclosed area", () => {
    // Edge 0 runs (-5,-5) → (5,-5); outward is -z.
    const [nx, nz] = edgeOutwardNormal(SQUARE, 0, false);
    expect(nx).toBeCloseTo(0, 6);
    expect(nz).toBeCloseTo(-1, 6);
  });

  it("points a hole-ring normal into the void", () => {
    // Same geometry treated as a courtyard ring flips the sense.
    const [, nz] = edgeOutwardNormal(SQUARE, 0, true);
    expect(nz).toBeCloseTo(1, 6);
  });

  it("grows an outer ring by the offset", () => {
    const [grown] = offsetRings([SQUARE], 1);
    // Corner normals average two edges, so each corner moves out by √2 in
    // both axes' direction — the ring stays a square, one metre larger on
    // every side measured along the diagonal.
    for (const [x, z] of grown) {
      expect(Math.abs(x)).toBeGreaterThan(5);
      expect(Math.abs(z)).toBeGreaterThan(5);
    }
  });
});

describe("computeEnvelopeShares", () => {
  it("normalises shares against the total heat-loss coefficient", () => {
    const shares = computeEnvelopeShares(HEAT_LOSS);
    const total = shares.reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(shares.find((s) => s.element === "Walls")!.share).toBeCloseTo(200 / 500, 10);
  });

  it("preserves the physics module's element order", () => {
    expect(computeEnvelopeShares(HEAT_LOSS).map((s) => s.element)).toEqual([
      "Walls",
      "Windows",
      "Roof",
      "Ground Floor",
      "Infiltration/Ventilation",
    ]);
  });

  it("bands monotonically with share", () => {
    const shares = computeEnvelopeShares(HEAT_LOSS);
    const sorted = [...shares].sort((a, b) => a.share - b.share);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].bandIndex).toBeGreaterThanOrEqual(sorted[i - 1].bandIndex);
    }
  });

  it("gives the ventilation term no surface", () => {
    const vent = computeEnvelopeShares(HEAT_LOSS).find(
      (s) => s.element === "Infiltration/Ventilation",
    )!;
    expect(vent.surface).toBe("none");
    expect(vent.share).toBeCloseTo(110 / 500, 10);
  });

  it("returns zero shares rather than NaN when nothing loses heat", () => {
    const shares = computeEnvelopeShares([element("Walls", 0)]);
    expect(shares[0].share).toBe(0);
    expect(shares[0].bandIndex).toBe(0);
  });
});

describe("computeOrientationWwr", () => {
  const wwr = { N: 0.2, S: 0.4, E: 0.3, W: 0.1 };

  it("returns null without a footprint polygon", () => {
    expect(computeOrientationWwr(makeRecipe(), wwr)).toBeNull();
  });

  it("buckets a square footprint into four equal faces", () => {
    const recipe = makeRecipe({ footprintPolygon: [SQUARE], totalHeight: 9 });
    const rows = computeOrientationWwr(recipe, wwr)!;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      // 10 m per face × 9 m tall.
      expect(row.grossWallAreaSqm).toBeCloseTo(90, 6);
      expect(row.windowAreaSqm).toBeCloseTo(90 * wwr[row.orientation], 6);
    }
  });

  it("assigns the +z face to North (x = east, z = north)", () => {
    // A wide, shallow footprint: the long faces point N and S.
    const wide: Ring = [
      [-10, -2],
      [10, -2],
      [10, 2],
      [-10, 2],
    ];
    const rows = computeOrientationWwr(
      makeRecipe({ footprintPolygon: [wide], totalHeight: 10 }),
      wwr,
    )!;
    const byOrientation = Object.fromEntries(rows.map((r) => [r.orientation, r]));
    expect(byOrientation.N.grossWallAreaSqm).toBeCloseTo(200, 6);
    expect(byOrientation.S.grossWallAreaSqm).toBeCloseTo(200, 6);
    expect(byOrientation.E.grossWallAreaSqm).toBeCloseTo(40, 6);
    expect(byOrientation.W.grossWallAreaSqm).toBeCloseTo(40, 6);
  });

  it("clamps out-of-range ratios", () => {
    const rows = computeOrientationWwr(
      makeRecipe({ footprintPolygon: [SQUARE] }),
      { N: -1, S: 5, E: Number.NaN, W: 0.5 },
    )!;
    const byOrientation = Object.fromEntries(rows.map((r) => [r.orientation, r]));
    expect(byOrientation.N.wwr).toBe(0);
    expect(byOrientation.S.wwr).toBe(1);
    expect(byOrientation.E.wwr).toBe(0);
    expect(byOrientation.W.wwr).toBe(0.5);
  });
});

describe("buildEnvelopeOverlay", () => {
  const recipe = makeRecipe({ footprintPolygon: [SQUARE], totalHeight: 9 });
  const shares = computeEnvelopeShares(HEAT_LOSS);

  it("draws one shell per drawable element class and none for ventilation", () => {
    const group = buildEnvelopeOverlay({ recipe, shares, avgWwr: 0.3 });
    const names = group.children.map((c) => c.name);
    expect(names).toEqual([
      "envelope-shell:Walls",
      "envelope-shell:Windows",
      "envelope-shell:Roof",
      "envelope-shell:Ground Floor",
    ]);
  });

  it("omits the glazing band when the WWR is zero", () => {
    const group = buildEnvelopeOverlay({ recipe, shares, avgWwr: 0 });
    expect(group.children.map((c) => c.name)).not.toContain("envelope-shell:Windows");
  });

  it("still builds shells from the bbox fallback when there is no polygon", () => {
    const group = buildEnvelopeOverlay({
      recipe: makeRecipe(),
      shares,
      avgWwr: 0.3,
    });
    expect(group.children.length).toBe(4);
  });

  it("is deterministic — two builds produce identical vertex buffers", () => {
    const a = buildEnvelopeOverlay({ recipe, shares, avgWwr: 0.3 });
    const b = buildEnvelopeOverlay({ recipe, shares, avgWwr: 0.3 });
    const dump = (g: THREE.Group) =>
      g.children.map((child) =>
        Array.from(
          ((child as THREE.Mesh).geometry.getAttribute("position") as THREE.BufferAttribute)
            .array,
        ),
      );
    expect(dump(a)).toEqual(dump(b));
  });

  it("carries the element's share into userData for inspection", () => {
    const group = buildEnvelopeOverlay({ recipe, shares, avgWwr: 0.3 });
    const walls = group.getObjectByName("envelope-shell:Walls")!;
    expect(walls.userData.hCoefficientWPerK).toBe(200);
    expect(walls.userData.share).toBeCloseTo(0.4, 10);
  });
});
