// src/lib/generative/__tests__/acceptance-required-shapes.test.ts
//
// ACCEPTANCE: the required-shape matrix, for the shapes NOT already proven
// end-to-end elsewhere.
//
//   rectangle    — implicit in nearly every other test (validBlueprint,
//                  exactBlueprint, courtyardBlueprint's outer ring, ...);
//                  not re-asserted here.
//   L-shape      — acceptance-massing-chain.test.ts
//                  ("an L-shaped boundary reaches the recipe and the BIM graph")
//   courtyard    — acceptance-massing-chain.test.ts
//                  ("a courtyard void stays a hole all the way down the chain")
//                  + blueprint-generate-server.test.ts
//                  ("keeps a courtyard as a real hole in the generated plate")
//   rotated wing — acceptance-massing-chain.test.ts
//                  ("a wing rotated 30° keeps its orientation through the chain")
//                  + blueprint-compile.test.ts ("rotated wings")
//
// This file covers what those do not: U, H and T shapes (more reflex corners
// than an L, so a bounding-box collapse or a partial union failure is easier to
// hide), a trapezoid (edges that are neither axis-aligned nor the 30° the wing
// tests already check), a podium+tower (two DIFFERENT boundary loops on
// DIFFERENT, non-overlapping floor ranges), and stepped massing (three
// distinct plates on three distinct levels, drawn as three separate
// boundaries rather than hand-built BuildingSpec.customPlates the way
// blueprint-compile.test.ts's `steppedSpec()` does).
//
// Same chain as acceptance-massing-chain.test.ts, asserted the same way: the
// shape must survive compile → generate → emit → validate, not just one hop
// of it.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  compileBlueprintToSpec,
  emptyBlueprint,
  makePolyLoop,
  makeRectLoop,
  type BlueprintSpec,
  type PointMm,
} from "../blueprint";
import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { polygonArea, type Polygon } from "../generate/massing";
import { clipRectToPolygon, pointInPolygon, ringBounds } from "../geom";
import { emitSnapshot } from "../graph/emit";
import { generationIdFor } from "../build";
import { validateBuilding } from "../validate/rules";
import type { BimElement } from "@/lib/bim/model/types";

/* ------------------------------------------------------------------ */
/* Chain runner — identical contract to acceptance-massing-chain.test.ts */
/* ------------------------------------------------------------------ */

function runChain(blueprint: BlueprintSpec, seed: number) {
  const { spec, locks } = compileBlueprintToSpec(blueprint, { seed });
  const building = generateBuildingFromSpec(spec);
  const compiled = compileSpecToRecipe(spec);
  const snapshot = emitSnapshot({
    buildingPk: "BLD-REQUIRED-SHAPES",
    generationId: generationIdFor(seed, 0),
    spec,
    building,
  });
  const validation = validateBuilding(building, spec);
  return { spec, locks, building, snapshot, validation, ...compiled };
}

/**
 * Signed cross product at each vertex — negative is a reflex corner on a CCW
 * ring. For a simple orthogonal (rectilinear) polygon, convex − reflex = 4
 * always (turning-number theorem: every convex corner is +90°, every reflex
 * corner is −90°, and the total must be 360°), so `reflex = (n − 4) / 2`. That
 * identity is what calibrates the expected counts below — it is not a guess.
 */
function reflexCornerCount(ring: readonly (readonly [number, number])[]): number {
  let reflex = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross < -1e-9) reflex += 1;
  }
  return reflex;
}

/** Segment directions of a ring, folded onto [0°, 180°) and weighted by length. */
function edgeAngleHistogram(ring: readonly (readonly [number, number])[]) {
  const byDegree = new Map<number, number>();
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length <= 1e-9) continue;
    const raw = (Math.atan2(z2 - z1, x2 - x1) * 180) / Math.PI;
    const folded = (((raw % 180) + 180) % 180 + 180) % 180;
    byDegree.set(folded, (byDegree.get(folded) ?? 0) + length);
  }
  return byDegree;
}

/** Total edge length within `±tolerance` of `degrees`, modulo 180. */
function lengthNearAngle(
  histogram: Map<number, number>,
  degrees: number,
  tolerance: number,
): number {
  let total = 0;
  for (const [angle, length] of histogram) {
    const diff = Math.abs(angle - degrees) % 180;
    if (Math.min(diff, 180 - diff) <= tolerance) total += length;
  }
  return total;
}

const outlineOf = (element: BimElement): Polygon =>
  JSON.parse(element.instanceParameters.outlineJson as string) as Polygon;

const FLOORS = [1, 2, 3];

/* ================================================================== */
/* 1. U-shape                                                          */
/* ================================================================== */
//
// 60 × 40 m box with a 30 × 24 m notch cut from the top edge, leaving a
// 60 × 16 m base connecting two 15 m legs. Two reflex corners at the bottom
// of the notch — an L has one, so this exercises a second concave corner and
// a wider, deeper cut.

const U_POINTS: PointMm[] = [
  { xMm: 0, zMm: 0 },
  { xMm: 60_000, zMm: 0 },
  { xMm: 60_000, zMm: 40_000 },
  { xMm: 45_000, zMm: 40_000 },
  { xMm: 45_000, zMm: 16_000 },
  { xMm: 15_000, zMm: 16_000 },
  { xMm: 15_000, zMm: 40_000 },
  { xMm: 0, zMm: 40_000 },
];
const U_BBOX_SQM = 60 * 40;
const U_AREA_SQM = U_BBOX_SQM - 30 * 24; // 1,680

function uShapeBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Acceptance U"), {
    loop: makePolyLoop("u-outline", U_POINTS),
    floorNos: FLOORS,
  });
}

describe("ACCEPTANCE: a U-shaped boundary reaches the recipe and the BIM graph", () => {
  const chain = runChain(uShapeBlueprint(), 11_003);

  it("keeps the drawn 8-point outline, not a simplified or boxed one", () => {
    expect(chain.spec.massing.customPlates?.value).toHaveLength(1);
    expect(chain.spec.massing.customPlates!.value[0].polygonMm[0]).toHaveLength(
      U_POINTS.length,
    );
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygon).toHaveLength(1); // no holes — this is a notch, not a void
    expect(polygon[0]).toHaveLength(U_POINTS.length);
  });

  it("has exactly the two reflex corners a rectilinear U implies", () => {
    const ring = chain.recipe.footprintPolygon![0];
    expect(reflexCornerCount(ring)).toBe(2);
  });

  it("reports the real U area, well under the bounding box", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygonArea(polygon)).toBeCloseTo(U_AREA_SQM, 6);
    expect(polygonArea(polygon)).toBeLessThan(U_BBOX_SQM * 0.75); // 1,680 / 2,400 = 0.70
  });

  it("leaves the notch between the legs empty and both legs solid", () => {
    const polygon = chain.recipe.footprintPolygon!;
    // Notch centre, engine frame (bbox centred at drawn (30,20) m).
    expect(pointInPolygon([0, 8], polygon, 1e-6)).toBe(false);
    // Base of the U, connecting both legs.
    expect(pointInPolygon([0, -12], polygon, 1e-6)).toBe(true);
    // Left leg, full height.
    expect(pointInPolygon([-22.5, 10], polygon, 1e-6)).toBe(true);
    // Right leg, full height.
    expect(pointInPolygon([22.5, 10], polygon, 1e-6)).toBe(true);
  });

  it("keeps every generated space on the real plate, not in the notch", () => {
    expect(chain.building.spaces.length).toBeGreaterThan(0);
    const plateByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l.polygon]));
    for (const space of chain.building.spaces) {
      expect(
        clipRectToPolygon(space.rect, plateByFloor.get(space.floorNo)!, 0.05),
        `${space.id} escaped the U`,
      ).toBe(true);
    }
  });

  it("sites the core (auto, undrawn) on solid floor, not the notch", () => {
    for (const level of chain.building.levels) {
      expect(
        clipRectToPolygon(chain.building.core.rect, level.polygon, 1e-6),
        `core sits outside the U on level ${level.floorNo}`,
      ).toBe(true);
    }
  });

  it("carries the U into the emitted slab outlines", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);
    for (const slab of slabs) {
      const outline = outlineOf(slab);
      expect(outline).toHaveLength(1);
      expect(reflexCornerCount(outline[0])).toBe(2);
      expect(polygonArea(outline)).toBeCloseTo(U_AREA_SQM, 2);
      expect(slab.instanceParameters.voidCount).toBe(0);
    }
  });

  it("validates with no critical violations", () => {
    expect(chain.validation.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);
  });
});

/* ================================================================== */
/* 2. H-shape                                                          */
/* ================================================================== */
//
// 60 × 48 m box, two 15 m legs full-height, a 12 m-tall crossbar at
// mid-height connecting them, four rectangular notches (top-left, top-right,
// bottom-left, bottom-right). Twelve vertices ⇒ four reflex corners — this is
// the shape most likely to break a naive union or an inscribed-rect core
// search, because the solid region is disconnected top-to-bottom except
// through the (comparatively narrow) bar.

const H_POINTS: PointMm[] = [
  { xMm: 0, zMm: 0 },
  { xMm: 15_000, zMm: 0 },
  { xMm: 15_000, zMm: 18_000 },
  { xMm: 45_000, zMm: 18_000 },
  { xMm: 45_000, zMm: 0 },
  { xMm: 60_000, zMm: 0 },
  { xMm: 60_000, zMm: 48_000 },
  { xMm: 45_000, zMm: 48_000 },
  { xMm: 45_000, zMm: 30_000 },
  { xMm: 15_000, zMm: 30_000 },
  { xMm: 15_000, zMm: 48_000 },
  { xMm: 0, zMm: 48_000 },
];
const H_BBOX_SQM = 60 * 48;
const H_AREA_SQM = H_BBOX_SQM - 2 * (30 * 18); // 1,800

function hShapeBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Acceptance H"), {
    loop: makePolyLoop("h-outline", H_POINTS),
    floorNos: FLOORS,
  });
}

describe("ACCEPTANCE: an H-shaped boundary reaches the recipe and the BIM graph", () => {
  const chain = runChain(hShapeBlueprint(), 11_101);

  it("keeps the drawn 12-point outline", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygon).toHaveLength(1);
    expect(polygon[0]).toHaveLength(H_POINTS.length);
  });

  it("has exactly the four reflex corners two notches on each side implies", () => {
    const ring = chain.recipe.footprintPolygon![0];
    expect(reflexCornerCount(ring)).toBe(4);
  });

  it("reports the real H area, well under the bounding box", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygonArea(polygon)).toBeCloseTo(H_AREA_SQM, 6);
    expect(polygonArea(polygon)).toBeLessThan(H_BBOX_SQM * 0.65); // 1,800 / 2,880 = 0.625
  });

  it("leaves both notches empty and the crossbar solid", () => {
    const polygon = chain.recipe.footprintPolygon!;
    // Bbox centred at drawn (30, 24) m.
    expect(pointInPolygon([0, -15], polygon, 1e-6)).toBe(false); // bottom notch
    expect(pointInPolygon([0, 15], polygon, 1e-6)).toBe(false); // top notch
    expect(pointInPolygon([0, 0], polygon, 1e-6)).toBe(true); // crossbar
    expect(pointInPolygon([-22.5, -19], polygon, 1e-6)).toBe(true); // left leg
    expect(pointInPolygon([22.5, 19], polygon, 1e-6)).toBe(true); // right leg
  });

  it("sites the core (auto, undrawn) on solid floor — the crossbar or a leg, never a notch", () => {
    for (const level of chain.building.levels) {
      expect(
        clipRectToPolygon(chain.building.core.rect, level.polygon, 1e-6),
        `core sits outside the H on level ${level.floorNo}`,
      ).toBe(true);
    }
  });

  it("keeps every generated space on the real plate, not in a notch", () => {
    expect(chain.building.spaces.length).toBeGreaterThan(0);
    const plateByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l.polygon]));
    for (const space of chain.building.spaces) {
      expect(
        clipRectToPolygon(space.rect, plateByFloor.get(space.floorNo)!, 0.05),
        `${space.id} escaped the H`,
      ).toBe(true);
    }
  });

  it("carries the H into the emitted slab outlines", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);
    for (const slab of slabs) {
      const outline = outlineOf(slab);
      expect(reflexCornerCount(outline[0])).toBe(4);
      expect(polygonArea(outline)).toBeCloseTo(H_AREA_SQM, 2);
      expect(slab.instanceParameters.voidCount).toBe(0);
    }
  });

  it("validates with no critical violations", () => {
    expect(chain.validation.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);
  });
});

/* ================================================================== */
/* 3. T-shape                                                          */
/* ================================================================== */
//
// A 48 m-wide, 12 m-tall top bar over a 16 m-wide, 28 m-tall stem — the
// mirror-image case to the U/H above: the notches are on the SIDES of the
// lower portion, not cut from the top.

const T_POINTS: PointMm[] = [
  { xMm: 16_000, zMm: 0 },
  { xMm: 32_000, zMm: 0 },
  { xMm: 32_000, zMm: 28_000 },
  { xMm: 48_000, zMm: 28_000 },
  { xMm: 48_000, zMm: 40_000 },
  { xMm: 0, zMm: 40_000 },
  { xMm: 0, zMm: 28_000 },
  { xMm: 16_000, zMm: 28_000 },
];
const T_BBOX_SQM = 48 * 40;
const T_AREA_SQM = T_BBOX_SQM - 2 * (16 * 28); // 1,024

function tShapeBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Acceptance T"), {
    loop: makePolyLoop("t-outline", T_POINTS),
    floorNos: FLOORS,
  });
}

describe("ACCEPTANCE: a T-shaped boundary reaches the recipe and the BIM graph", () => {
  const chain = runChain(tShapeBlueprint(), 11_201);

  it("keeps the drawn 8-point outline", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygon).toHaveLength(1);
    expect(polygon[0]).toHaveLength(T_POINTS.length);
  });

  it("has exactly the two reflex corners the stem-into-bar junction implies", () => {
    const ring = chain.recipe.footprintPolygon![0];
    expect(reflexCornerCount(ring)).toBe(2);
  });

  it("reports the real T area, well under the bounding box", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygonArea(polygon)).toBeCloseTo(T_AREA_SQM, 6);
    expect(polygonArea(polygon)).toBeLessThan(T_BBOX_SQM * 0.6); // 1,024 / 1,920 ≈ 0.533
  });

  it("leaves both shoulders empty and the stem plus bar solid", () => {
    const polygon = chain.recipe.footprintPolygon!;
    // Bbox centred at drawn (24, 20) m.
    expect(pointInPolygon([-16, -6], polygon, 1e-6)).toBe(false); // left shoulder
    expect(pointInPolygon([16, -6], polygon, 1e-6)).toBe(false); // right shoulder
    expect(pointInPolygon([0, -10], polygon, 1e-6)).toBe(true); // stem
    expect(pointInPolygon([0, 14], polygon, 1e-6)).toBe(true); // top bar
  });

  it("keeps every generated space on the real plate, not in a shoulder", () => {
    expect(chain.building.spaces.length).toBeGreaterThan(0);
    const plateByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l.polygon]));
    for (const space of chain.building.spaces) {
      expect(
        clipRectToPolygon(space.rect, plateByFloor.get(space.floorNo)!, 0.05),
        `${space.id} escaped the T`,
      ).toBe(true);
    }
  });

  it("carries the T into the emitted slab outlines", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);
    for (const slab of slabs) {
      const outline = outlineOf(slab);
      expect(reflexCornerCount(outline[0])).toBe(2);
      expect(polygonArea(outline)).toBeCloseTo(T_AREA_SQM, 2);
    }
  });

  it("validates with no critical violations", () => {
    expect(chain.validation.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);
  });
});

/* ================================================================== */
/* 4. Trapezoid                                                        */
/* ================================================================== */
//
// A convex quadrilateral with two slanted legs at ±63.43° (atan(2)) —
// neither axis-aligned nor the 30° the rotated-wing acceptance test already
// covers. Nothing here is concave (0 reflex corners): the property under test
// is that a genuinely slanted edge is not silently snapped to horizontal or
// vertical, the way a bounding-box collapse or an over-aggressive cleanup
// pass could produce.

const TRAP_POINTS: PointMm[] = [
  { xMm: 0, zMm: 0 },
  { xMm: 50_000, zMm: 0 },
  { xMm: 40_000, zMm: 20_000 },
  { xMm: 10_000, zMm: 20_000 },
];
const TRAP_BBOX_SQM = 50 * 20;
const TRAP_AREA_SQM = 0.5 * (50 + 30) * 20; // 800 (trapezoid rule)
// The two legs are mirror images, not parallel, so folding modulo 180° (which
// only identifies a line with its own reverse direction) leaves them as TWO
// distinct buckets rather than merging them — observed by running this file:
// the right leg (50,000,0)→(40,000,20,000) folds to atan2(2,-1) ≈ 116.565°,
// the left leg (10,000,20,000)→(0,0) to atan2(-2,-1)+180 ≈ 63.435°.
const TRAP_RIGHT_LEG_ANGLE_DEG = (Math.atan2(2, -1) * 180) / Math.PI; // ≈ 116.565°
const TRAP_LEFT_LEG_ANGLE_DEG = 180 - TRAP_RIGHT_LEG_ANGLE_DEG; // ≈ 63.435°
const TRAP_LEG_LENGTH_M = Math.hypot(10, 20); // ≈ 22.36 m, each leg

function trapezoidBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Acceptance Trapezoid"), {
    loop: makePolyLoop("trap-outline", TRAP_POINTS),
    floorNos: FLOORS,
  });
}

describe("ACCEPTANCE: a trapezoidal boundary keeps its slanted legs through the chain", () => {
  const chain = runChain(trapezoidBlueprint(), 11_301);

  it("keeps the drawn 4-point outline — a convex shape, no reflex corners", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygon).toHaveLength(1);
    expect(polygon[0]).toHaveLength(TRAP_POINTS.length);
    expect(reflexCornerCount(polygon[0])).toBe(0);
  });

  it("reports the trapezoid area, not the bounding box", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygonArea(polygon)).toBeCloseTo(TRAP_AREA_SQM, 6);
    // 800 / 1,000 = 0.80 — a real but proportionally smaller cut than the
    // rectilinear shapes above, which is the point: even a "mild" area loss
    // must not be rounded away to the bbox.
    expect(polygonArea(polygon)).toBeLessThan(TRAP_BBOX_SQM * 0.85);
  });

  it("keeps both non-orthogonal legs at their drawn (and different) angles, not snapped to 0°/90°", () => {
    const ring = chain.recipe.footprintPolygon![0];
    const histogram = edgeAngleHistogram(ring);
    const onRightLeg = lengthNearAngle(histogram, TRAP_RIGHT_LEG_ANGLE_DEG, 0.5);
    const onLeftLeg = lengthNearAngle(histogram, TRAP_LEFT_LEG_ANGLE_DEG, 0.5);
    const onOrthogonal = lengthNearAngle(histogram, 0, 0.5) + lengthNearAngle(histogram, 90, 0.5);

    // Each leg keeps its OWN angle — a mirror-symmetric trapezoid's two legs
    // are not parallel, so a correct compile reports two distinct buckets,
    // not one doubled bucket (which would mean the shape had been sheared
    // into a parallelogram) and not zero (a bbox collapse).
    expect(onRightLeg).toBeCloseTo(TRAP_LEG_LENGTH_M, 3);
    expect(onLeftLeg).toBeCloseTo(TRAP_LEG_LENGTH_M, 3);
    // A bounding-box collapse would report only 0°/90° edges; the trapezoid
    // has exactly two such edges (top and bottom), well under its slanted
    // perimeter (top 30 m + bottom 50 m = 80 m vs. 2 × 22.36 ≈ 44.72 m).
    expect(onOrthogonal).toBeCloseTo(80, 3);
    expect(onOrthogonal).toBeGreaterThan(onRightLeg + onLeftLeg);
  });

  it("carries the trapezoid into the emitted slab outlines", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);
    for (const slab of slabs) {
      const outline = outlineOf(slab);
      expect(polygonArea(outline)).toBeCloseTo(TRAP_AREA_SQM, 2);
    }
  });

  it("validates with no critical violations", () => {
    expect(chain.validation.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);
  });
});

/* ================================================================== */
/* 5. Podium + tower                                                   */
/* ================================================================== */
//
// TWO boundary loops, each on its OWN, non-overlapping floor range: a 40 × 24 m
// podium on levels 1–2, a smaller 24 × 16 m tower on levels 3–5, both centred
// on the same point so the tower stands squarely on the podium rather than
// cantilevering off it. `platesFor` only unions boundaries that SHARE a
// floorNo (compile.ts:261-294); since these never share one, each floor gets
// exactly its own boundary's polygon untouched — this is the case that proves
// that mechanism, which the L/courtyard/wing tests never exercise because
// they all put every boundary on the same three floors.

const PODIUM_FLOORS = [1, 2];
const TOWER_FLOORS = [3, 4, 5];
const PODIUM_WIDTH_MM = 40_000;
const PODIUM_DEPTH_MM = 24_000;
const TOWER_WIDTH_MM = 24_000;
const TOWER_DEPTH_MM = 16_000;
const PODIUM_AREA_SQM = (PODIUM_WIDTH_MM / 1000) * (PODIUM_DEPTH_MM / 1000); // 960
const TOWER_AREA_SQM = (TOWER_WIDTH_MM / 1000) * (TOWER_DEPTH_MM / 1000); // 384

function podiumTowerBlueprint(): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance Podium Tower");
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("podium", {
      xMm: 0,
      zMm: 0,
      widthMm: PODIUM_WIDTH_MM,
      depthMm: PODIUM_DEPTH_MM,
    }),
    floorNos: PODIUM_FLOORS,
    role: "podium",
  });
  blueprint = addBoundary(blueprint, {
    // Centred on the podium's own centre (20,000, 12,000).
    loop: makeRectLoop("tower", {
      xMm: (PODIUM_WIDTH_MM - TOWER_WIDTH_MM) / 2,
      zMm: (PODIUM_DEPTH_MM - TOWER_DEPTH_MM) / 2,
      widthMm: TOWER_WIDTH_MM,
      depthMm: TOWER_DEPTH_MM,
    }),
    floorNos: TOWER_FLOORS,
    role: "tower",
  });
  return blueprint;
}

describe("ACCEPTANCE: podium and tower keep their own, different footprints per level", () => {
  const chain = runChain(podiumTowerBlueprint(), 12_003);

  it("compiles to two distinct plate outlines, one per role", () => {
    const plates = chain.spec.massing.customPlates?.value ?? [];
    expect(plates).toHaveLength(2);
    const byFloorNos = new Map(plates.map((p) => [p.floorNos.join(","), p]));
    expect(byFloorNos.has(PODIUM_FLOORS.join(","))).toBe(true);
    expect(byFloorNos.has(TOWER_FLOORS.join(","))).toBe(true);
  });

  it("gives podium levels the podium area and tower levels the (smaller) tower area", () => {
    expect(chain.building.levels).toHaveLength(5);
    for (const level of chain.building.levels) {
      const expectedAreaSqm = PODIUM_FLOORS.includes(level.floorNo)
        ? PODIUM_AREA_SQM
        : TOWER_AREA_SQM;
      expect(level.plateAreaSqm).toBeCloseTo(expectedAreaSqm, 6);
      expect(polygonArea(level.polygon)).toBeCloseTo(expectedAreaSqm, 6);
    }
  });

  it("gives each tier its own bounding footprint, not a shared one", () => {
    const podiumLevel = chain.building.levels.find((l) => l.floorNo === 1)!;
    const towerLevel = chain.building.levels.find((l) => l.floorNo === 3)!;
    const podiumBounds = ringBounds(podiumLevel.polygon[0])!;
    const towerBounds = ringBounds(towerLevel.polygon[0])!;

    expect(podiumBounds.maxX - podiumBounds.minX).toBeCloseTo(PODIUM_WIDTH_MM / 1000, 6);
    expect(podiumBounds.maxZ - podiumBounds.minZ).toBeCloseTo(PODIUM_DEPTH_MM / 1000, 6);
    expect(towerBounds.maxX - towerBounds.minX).toBeCloseTo(TOWER_WIDTH_MM / 1000, 6);
    expect(towerBounds.maxZ - towerBounds.minZ).toBeCloseTo(TOWER_DEPTH_MM / 1000, 6);

    // The tower sits centred WITHIN the podium's footprint, not offset from it.
    expect(towerBounds.minX).toBeGreaterThan(podiumBounds.minX);
    expect(towerBounds.maxX).toBeLessThan(podiumBounds.maxX);
    expect(towerBounds.minZ).toBeGreaterThan(podiumBounds.minZ);
    expect(towerBounds.maxZ).toBeLessThan(podiumBounds.maxZ);
  });

  it("keeps the one continuous core standing on solid floor at every level, podium and tower alike", () => {
    for (const level of chain.building.levels) {
      expect(
        clipRectToPolygon(chain.building.core.rect, level.polygon, 1e-6),
        `core escapes the plate at level ${level.floorNo}`,
      ).toBe(true);
    }
  });

  it("emits a slab per level whose area matches that level's own plate, not the other tier's", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(5);
    for (const level of chain.building.levels) {
      const slab = slabs.find((s) => s.levelId === `level:${level.floorNo}`)!;
      expect(slab, `no slab for level ${level.floorNo}`).toBeDefined();
      expect(slab.instanceParameters.areaM2).toBeCloseTo(level.plateAreaSqm, 2);
    }
  });

  it("gross area is podium levels + tower levels, not one tier repeated five times", () => {
    const expected = PODIUM_AREA_SQM * PODIUM_FLOORS.length + TOWER_AREA_SQM * TOWER_FLOORS.length;
    expect(chain.building.metrics.grossAreaSqm).toBeGreaterThan(expected * 0.98);
    expect(chain.building.metrics.grossAreaSqm).toBeLessThan(expected * 1.02);
  });
});

/* ================================================================== */
/* 6. Stepped massing — three plates, three levels                     */
/* ================================================================== */
//
// Three SEPARATE boundaries, each on its own single floor, each a different
// size, all centred on the same point — a ziggurat/wedding-cake step-back.
// Unlike blueprint-compile.test.ts's `steppedSpec()` (which hand-builds a
// BuildingSpec.massing.customPlates array directly, bypassing the blueprint
// layer), this drives the SAME shape through real blueprint boundaries and
// `compileBlueprintToSpec`'s `platesFor`, so it is the boundary-per-level path
// that is actually under test, not just `generateMassing`'s handling of an
// already-stepped spec.

const STEP_FLOORS = [1, 2, 3];
const STEP_DIMS_MM: Record<number, { widthMm: number; depthMm: number }> = {
  1: { widthMm: 50_000, depthMm: 30_000 },
  2: { widthMm: 38_000, depthMm: 24_000 },
  3: { widthMm: 26_000, depthMm: 18_000 },
};
const STEP_AREA_SQM: Record<number, number> = {
  1: 50 * 30, // 1,500
  2: 38 * 24, // 912
  3: 26 * 18, // 468
};

function steppedMassingBlueprint(): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance Stepped Massing");
  // All three plates centred on (25,000, 15,000) — level 1's own centre.
  const centreX = STEP_DIMS_MM[1].widthMm / 2;
  const centreZ = STEP_DIMS_MM[1].depthMm / 2;
  for (const floorNo of STEP_FLOORS) {
    const { widthMm, depthMm } = STEP_DIMS_MM[floorNo];
    blueprint = addBoundary(blueprint, {
      loop: makeRectLoop(`step-${floorNo}`, {
        xMm: centreX - widthMm / 2,
        zMm: centreZ - depthMm / 2,
        widthMm,
        depthMm,
      }),
      floorNos: [floorNo],
    });
  }
  return blueprint;
}

describe("ACCEPTANCE: stepped massing keeps three distinct plates on three distinct levels", () => {
  const chain = runChain(steppedMassingBlueprint(), 12_101);

  it("compiles to three distinct plate outlines, one per level", () => {
    const plates = chain.spec.massing.customPlates?.value ?? [];
    expect(plates).toHaveLength(3);
    for (const floorNo of STEP_FLOORS) {
      const plate = plates.find((p) => p.floorNos.includes(floorNo));
      expect(plate, `no plate for level ${floorNo}`).toBeDefined();
      expect(plate!.floorNos).toEqual([floorNo]);
    }
  });

  it("gives every level its own drawn area — strictly decreasing, step to step", () => {
    expect(chain.building.levels).toHaveLength(3);
    for (const floorNo of STEP_FLOORS) {
      const level = chain.building.levels.find((l) => l.floorNo === floorNo)!;
      expect(level.plateAreaSqm).toBeCloseTo(STEP_AREA_SQM[floorNo], 6);
      expect(polygonArea(level.polygon)).toBeCloseTo(STEP_AREA_SQM[floorNo], 6);
    }
    const areas = STEP_FLOORS.map((f) => chain.building.levels.find((l) => l.floorNo === f)!.plateAreaSqm);
    expect(areas[0]).toBeGreaterThan(areas[1]);
    expect(areas[1]).toBeGreaterThan(areas[2]);
  });

  it("steps each plate INWARD from the one below — every level nests inside level 1", () => {
    const boundsOf = (floorNo: number) =>
      ringBounds(chain.building.levels.find((l) => l.floorNo === floorNo)!.polygon[0])!;
    const l1 = boundsOf(1);
    const l2 = boundsOf(2);
    const l3 = boundsOf(3);

    for (const [inner, outer] of [
      [l2, l1],
      [l3, l2],
    ] as const) {
      expect(inner.minX).toBeGreaterThan(outer.minX);
      expect(inner.maxX).toBeLessThan(outer.maxX);
      expect(inner.minZ).toBeGreaterThan(outer.minZ);
      expect(inner.maxZ).toBeLessThan(outer.maxZ);
    }
  });

  it("keeps the one continuous core standing on solid floor at every step", () => {
    for (const level of chain.building.levels) {
      expect(
        clipRectToPolygon(chain.building.core.rect, level.polygon, 1e-6),
        `core escapes the plate at level ${level.floorNo}`,
      ).toBe(true);
    }
  });

  it("emits a slab per level whose area matches that level's own step, not level 1's", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(3);
    for (const floorNo of STEP_FLOORS) {
      const slab = slabs.find((s) => s.levelId === `level:${floorNo}`)!;
      expect(slab, `no slab for level ${floorNo}`).toBeDefined();
      expect(slab.instanceParameters.areaM2).toBeCloseTo(STEP_AREA_SQM[floorNo], 2);
    }
  });

  it("gross area is the sum of the three distinct steps, not one plate × three", () => {
    const expected = STEP_FLOORS.reduce((sum, f) => sum + STEP_AREA_SQM[f], 0);
    expect(chain.building.metrics.grossAreaSqm).toBeGreaterThan(expected * 0.98);
    expect(chain.building.metrics.grossAreaSqm).toBeLessThan(expected * 1.02);
  });
});
