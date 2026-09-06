// The twin's roof planes must describe the SAME roof the frame prices.
//
// `envelopeQuantities(recipe).roofAreaSqm` is what the delta strip and the
// roof measure are sized on. If the planes PV is laid out over sum to
// anything else, the legend's "사용 가능 312 / 611 m²" and the roof area two
// rows above it are two different roofs — reported with equal confidence.
// So the binding assertion here is the identity, not a plane count.

import { describe, it, expect } from "vitest";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { finishedRoofTopY } from "@/lib/procedural/roof-surface";
import { twinRoofPlanes, totalProjectedSqm } from "../twin-roof-planes";

/** Square ring of side `s`, centred on the origin. */
function square(s: number): [number, number][] {
  const h = s / 2;
  return [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
}

function makeRecipe(plates: (([number, number][][]) | undefined)[]): BuildingRecipe {
  const floorHeight = 3;
  const floors: FloorSpec[] = plates.map((plate, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * floorHeight,
    height: floorHeight,
    isGroundFloor: i === 0,
    ...(plate ? { plate } : {}),
  }));

  return {
    footprintWidth: 20,
    footprintDepth: 20,
    floors,
    totalHeight: plates.length * floorHeight,
    wallThickness: 0.3,
    era: "1990-1999",
    strctCd: "21",
    mainPurpsCd: "14000",
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.3, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.5 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    },
    siteWidth: 40,
    siteDepth: 40,
    buildingName: "Twin Roof Planes Test",
    address: "Seoul",
  };
}

/** Three storeys stepping in: 20×20, 16×16, 10×10 — two terraces and a top. */
const SETBACK = makeRecipe([[square(20)], [square(16)], [square(10)]]);
/** No per-storey plates at all: every storey falls back to the base footprint. */
const PRISM = makeRecipe([undefined, undefined, undefined]);

describe("twinRoofPlanes — one roof, not two", () => {
  it("sums to exactly the roof area the frame prices", () => {
    for (const recipe of [SETBACK, PRISM]) {
      const planes = twinRoofPlanes(recipe);
      expect(totalProjectedSqm(planes)).toBeCloseTo(
        envelopeQuantities(recipe).roofAreaSqm,
        9,
      );
    }
  });

  it("emits the top plate plus one plane per exposed terrace", () => {
    const planes = twinRoofPlanes(SETBACK);
    expect(planes).toHaveLength(3);
    expect(planes[0].id).toBe("twin-roof-top");
    expect(planes[0].projectedSqm).toBeCloseTo(100, 9); // 10×10
    // 20×20 under 16×16 exposes 400 − 256; 16×16 under 10×10 exposes 256 − 100.
    expect(planes[1].projectedSqm).toBeCloseTo(144, 9);
    expect(planes[2].projectedSqm).toBeCloseTo(156, 9);
  });

  it("gives a plain prism exactly one plane", () => {
    // Every storey the same plate, so no terrace is exposed anywhere.
    const planes = twinRoofPlanes(PRISM);
    expect(planes).toHaveLength(1);
    expect(planes[0].id).toBe("twin-roof-top");
    expect(planes[0].projectedSqm).toBeCloseTo(400, 9);
  });

  it("emits NO plane where a storey overhangs the one below", () => {
    // The area walk clamps a widening storey at zero; a zero-area plane must
    // not reach the layout, or the legend counts a roof that is not there.
    const overhang = makeRecipe([[square(10)], [square(20)], [square(20)]]);
    const planes = twinRoofPlanes(overhang);
    expect(planes).toHaveLength(1);
    expect(planes[0].id).toBe("twin-roof-top");
    expect(totalProjectedSqm(planes)).toBeCloseTo(
      envelopeQuantities(overhang).roofAreaSqm,
      9,
    );
  });

  it("stands the top plane on the finished roof datum the twin already uses", () => {
    // Same height solar-panels.tsx puts its modules on today, so replacing
    // the rectangle grid does not move them vertically.
    const [top] = twinRoofPlanes(SETBACK);
    expect(top.minElevationM).toBeCloseTo(finishedRoofTopY(SETBACK), 9);
    expect(top.maxElevationM).toBe(top.minElevationM);
  });

  it("puts each terrace at the top of the storey that exposes it", () => {
    const planes = twinRoofPlanes(SETBACK);
    const terrace = planes.find((p) => p.id === "twin-roof-terrace-1")!;
    expect(terrace.minElevationM).toBeCloseTo(3, 9); // 1F: y 0 + height 3
  });

  it("punches the storey above out of a terrace as a hole", () => {
    const terrace = twinRoofPlanes(SETBACK).find(
      (p) => p.id === "twin-roof-terrace-1",
    )!;
    expect(terrace.outline).toHaveLength(2); // outer + one hole
    expect(terrace.partialOverlap).toBeUndefined();
  });

  it("marks a terrace whose shape it cannot establish from areas alone", () => {
    // Two plates of equal area, offset so neither contains the other: the walk
    // reports zero exposed and this reports no plane — but shift the areas and
    // the ring-and-hole outline stops describing `lower − upper`. The flag is
    // what stops the layout placing modules over a neighbour's roof.
    const offset: [number, number][] = [
      [40, 40],
      [50, 40],
      [50, 50],
      [40, 50],
    ];
    const partial = makeRecipe([[square(20)], [offset], [square(4)]]);
    const terrace = twinRoofPlanes(partial).find((p) =>
      p.id.startsWith("twin-roof-terrace"),
    );
    expect(terrace?.partialOverlap).toBe(true);
    // The AREA is still the walk's, whatever the shape.
    expect(totalProjectedSqm(twinRoofPlanes(partial))).toBeCloseTo(
      envelopeQuantities(partial).roofAreaSqm,
      9,
    );
  });

  it("reports every plane as flat, with no azimuth to misread", () => {
    for (const plane of twinRoofPlanes(SETBACK)) {
      expect(plane.tiltDeg).toBe(0);
      expect(plane.normal).toEqual([0, 1, 0]);
      // Not 0 — a flat plane has no downslope bearing, and 0 would read as
      // due north to anything that trusts the field.
      expect(plane.azimuthDeg).toBeNull();
      expect(plane.surfaceSqm).toBeCloseTo(plane.projectedSqm, 9);
    }
  });

  it("returns nothing for a stack with no above-grade storeys", () => {
    const basementOnly = makeRecipe([undefined]);
    basementOnly.floors[0].type = "below";
    expect(twinRoofPlanes(basementOnly)).toEqual([]);
  });
});
