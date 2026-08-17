// src/lib/generative/__tests__/acceptance-massing-chain.test.ts
//
// ACCEPTANCE: a drawn outline survives the whole chain.
//
//   BlueprintSpec → compileBlueprintToSpec → BuildingSpec
//                 → generateBuildingFromSpec → GeneratedBuilding
//                 → emitSnapshot          → BimModelSnapshot
//                 → validateBuilding      → ValidationReport
//                 → compileSpecToRecipe   → BuildingRecipe
//
// Every test below asserts on ALL FIVE of those outputs, because a shape that
// reaches the recipe but not the BIM graph (or vice versa) is exactly the kind
// of half-delivery this suite exists to catch. Three shapes are covered — an
// L-shape (a notch that must not be filled), a courtyard (a hole that must stay
// a hole), and two wings at 30° to each other (edge directions that must not be
// collapsed to a bounding box).
//
// Deterministic path only: no provider, no network, fixed seeds.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addCore,
  addVoid,
  addZone,
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
import { rectsOverlap, type Rect } from "../generate/types";
import { clipRectToPolygon, makeFrame, pointInPolygon, toWorldPoint } from "../geom";
import { emitSnapshot } from "../graph/emit";
import { generationIdFor } from "../build";
import { validateBuilding } from "../validate/rules";
import type { BimElement } from "@/lib/bim/model/types";

/* ------------------------------------------------------------------ */
/* Chain runner                                                        */
/* ------------------------------------------------------------------ */

function runChain(blueprint: BlueprintSpec, seed: number) {
  const { spec, locks } = compileBlueprintToSpec(blueprint, { seed });
  const building = generateBuildingFromSpec(spec);
  const compiled = compileSpecToRecipe(spec);
  const snapshot = emitSnapshot({
    buildingPk: "BLD-ACCEPTANCE",
    generationId: generationIdFor(seed, 0),
    spec,
    building,
  });
  const validation = validateBuilding(building, spec);
  return { spec, locks, building, snapshot, validation, ...compiled };
}

const FLOORS = [1, 2, 3];

/** Segment directions of a ring, folded onto [0°, 180°) and weighted by length. */
function edgeAngleHistogram(ring: readonly (readonly [number, number])[]) {
  const byDegree = new Map<number, number>();
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length <= 1e-9) continue;
    const raw = (Math.atan2(z2 - z1, x2 - x1) * 180) / Math.PI;
    const folded = Math.round(((raw % 180) + 180) % 180) % 180;
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

/** Signed cross product at each vertex — negative is a reflex corner on a CCW ring. */
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

const wallSegment = (element: BimElement) => ({
  start: [
    element.instanceParameters.startX as number,
    element.instanceParameters.startZ as number,
  ] as [number, number],
  end: [
    element.instanceParameters.endX as number,
    element.instanceParameters.endZ as number,
  ] as [number, number],
});

/** Same undirected segment, to within `tolerance` metres. */
function sameSegment(
  a: { start: [number, number]; end: [number, number] },
  b: { start: [number, number]; end: [number, number] },
  tolerance: number,
): boolean {
  const near = (p: [number, number], q: [number, number]) =>
    Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance;
  return (
    (near(a.start, b.start) && near(a.end, b.end)) ||
    (near(a.start, b.end) && near(a.end, b.start))
  );
}

const outlineOf = (element: BimElement): Polygon =>
  JSON.parse(element.instanceParameters.outlineJson as string) as Polygon;

/* ================================================================== */
/* 1. L-shape                                                          */
/* ================================================================== */

/**
 * 60 × 40 m with the north-east quadrant removed: a 60 × 16 m south arm and a
 * 24 × 40 m west arm. Both arms are wider than one 8.4 m office bay, so the
 * program has somewhere to go and the result is a real building rather than a
 * geometry fixture that fails to place a single room.
 */
const L_POINTS: PointMm[] = [
  { xMm: 0, zMm: 0 },
  { xMm: 60_000, zMm: 0 },
  { xMm: 60_000, zMm: 16_000 },
  { xMm: 24_000, zMm: 16_000 },
  { xMm: 24_000, zMm: 40_000 },
  { xMm: 0, zMm: 40_000 },
];

/** Area of the L in m²: south arm + west arm. */
const L_AREA_SQM = 60 * 16 + 24 * 24;

function lShapeBlueprint(): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance L");
  blueprint = addBoundary(blueprint, {
    loop: makePolyLoop("l-outline", L_POINTS),
    floorNos: FLOORS,
  });
  for (const [id, width, depth] of [
    ["office-a", 20_000, 13_000],
    ["office-b", 18_000, 12_000],
    ["meeting-a", 10_000, 8_000],
  ] as const) {
    blueprint = addZone(blueprint, {
      id,
      program: id.startsWith("meeting") ? "meeting" : "office-open",
      region: {
        kind: "rect",
        originMm: { xMm: 12_000, zMm: 8_000 },
        widthMm: width,
        depthMm: depth,
        rotationRad: 0,
      },
      floorNos: FLOORS,
    });
  }
  return blueprint;
}

describe("ACCEPTANCE: an L-shaped boundary reaches the recipe and the BIM graph", () => {
  const chain = runChain(lShapeBlueprint(), 4_301);

  it("compiles to a custom massing that keeps the drawn outline", () => {
    expect(chain.spec.massing.strategy.value).toBe("custom");
    expect(chain.spec.massing.customPlates?.value).toHaveLength(1);
    expect(chain.spec.massing.customPlates!.value[0].polygonMm[0]).toHaveLength(
      L_POINTS.length,
    );
  });

  it("puts an L — not its bounding rectangle — in recipe.footprintPolygon", () => {
    const polygon = chain.recipe.footprintPolygon;
    expect(polygon).toBeDefined();
    expect(polygon).toHaveLength(1); // no holes
    // Every boundary segment is a straight line, so tessellation adds nothing.
    expect(polygon![0]).toHaveLength(L_POINTS.length);

    // An L has exactly one reflex corner. A bounding rectangle has none, and a
    // filled notch would have none either.
    expect(reflexCornerCount(polygon![0])).toBe(1);

    const bboxArea = chain.recipe.footprintWidth * chain.recipe.footprintDepth;
    expect(bboxArea).toBeCloseTo(60 * 40, 6);
    expect(polygonArea(polygon!)).toBeCloseTo(L_AREA_SQM, 6);
    expect(polygonArea(polygon!)).toBeLessThan(bboxArea * 0.7);
  });

  it("leaves the notch empty", () => {
    const polygon = chain.recipe.footprintPolygon!;
    // Centre of the removed quadrant, in the engine's centred frame.
    expect(pointInPolygon([12, 8], polygon, 1e-6)).toBe(false);
    // …while both arms are solid.
    expect(pointInPolygon([12, -12], polygon, 1e-6)).toBe(true);
    expect(pointInPolygon([-18, 8], polygon, 1e-6)).toBe(true);
  });

  it("places every space on the real plate, not in the notch", () => {
    const plateByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l.polygon]));
    expect(chain.building.spaces.length).toBeGreaterThan(0);
    for (const space of chain.building.spaces) {
      const plate = plateByFloor.get(space.floorNo)!;
      expect(
        clipRectToPolygon(space.rect, plate, 0.05),
        `${space.id} (${space.label}) escaped the level ${space.floorNo} plate`,
      ).toBe(true);
    }
  });

  it("traces the notch edges with real exterior walls", () => {
    // The two edges that only exist because the quadrant was removed, in the
    // engine's centred frame: (30,-4)→(-6,-4) and (-6,-4)→(-6,20).
    const notchEdges: Array<{ start: [number, number]; end: [number, number] }> = [
      { start: [30, -4], end: [-6, -4] },
      { start: [-6, -4], end: [-6, 20] },
    ];

    const exteriorWalls = chain.snapshot.elements.filter(
      (element) => element.kind === "wall" && element.instanceParameters.exterior === true,
    );
    expect(exteriorWalls.length).toBeGreaterThanOrEqual(
      L_POINTS.length * chain.building.levels.length,
    );

    for (const edge of notchEdges) {
      const onEdge = exteriorWalls.filter((wall) =>
        sameSegment(wallSegment(wall), edge, 1e-3),
      );
      // One per level: the notch is walled on every storey, not just the first.
      expect(
        onEdge.map((wall) => wall.levelId).sort(),
        `no exterior wall on notch edge ${JSON.stringify(edge)}`,
      ).toEqual(chain.building.levels.map((l) => `level:${l.floorNo}`).sort());
    }
  });

  it("carries the L into the emitted slab outlines", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);
    for (const slab of slabs) {
      const outline = outlineOf(slab);
      expect(outline).toHaveLength(1);
      expect(outline[0]).toHaveLength(L_POINTS.length);
      expect(reflexCornerCount(outline[0])).toBe(1);
      expect(polygonArea(outline)).toBeCloseTo(L_AREA_SQM, 3);
      expect(slab.instanceParameters.voidCount).toBe(0);
      expect(slab.instanceParameters.areaM2).toBeCloseTo(L_AREA_SQM, 2);
    }
  });

  it("validates with no critical violations", () => {
    expect(
      chain.validation.violations.filter((v) => v.severity === "critical"),
    ).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);
  });

  it("reports gross area as the L area × storeys, within 2%", () => {
    const expected = L_AREA_SQM * chain.building.levels.length;
    expect(chain.building.metrics.grossAreaSqm).toBeGreaterThan(expected * 0.98);
    expect(chain.building.metrics.grossAreaSqm).toBeLessThan(expected * 1.02);
    // The recipe's own area accounting agrees with the solver's.
    expect(chain.grossAreaSqm).toBeCloseTo(chain.building.metrics.grossAreaSqm, 2);
  });
});

/* ================================================================== */
/* 2. Courtyard                                                        */
/* ================================================================== */

const COURT_WIDTH_MM = 80_000;
const COURT_DEPTH_MM = 56_000;
const VOID_WIDTH_MM = 24_000;
const VOID_DEPTH_MM = 16_000;
const VOID_AREA_SQM = (VOID_WIDTH_MM / 1000) * (VOID_DEPTH_MM / 1000);
const COURT_AREA_SQM =
  (COURT_WIDTH_MM / 1000) * (COURT_DEPTH_MM / 1000) - VOID_AREA_SQM;

/** The void in the engine's centred frame — the plate is centred on its bbox. */
const VOID_RECT: Rect = {
  minX: -VOID_WIDTH_MM / 2000,
  maxX: VOID_WIDTH_MM / 2000,
  minZ: -VOID_DEPTH_MM / 2000,
  maxZ: VOID_DEPTH_MM / 2000,
};

function courtyardBlueprint(): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance Courtyard");
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("court-outline", {
      xMm: 0,
      zMm: 0,
      widthMm: COURT_WIDTH_MM,
      depthMm: COURT_DEPTH_MM,
    }),
    floorNos: FLOORS,
  });
  blueprint = addVoid(blueprint, {
    id: "courtyard",
    kind: "courtyard",
    region: {
      kind: "rect",
      originMm: { xMm: COURT_WIDTH_MM / 2, zMm: COURT_DEPTH_MM / 2 },
      widthMm: VOID_WIDTH_MM,
      depthMm: VOID_DEPTH_MM,
      rotationRad: 0,
    },
    floorNos: FLOORS,
  });
  // Drawn on the solid ring north of the void, so the core never stands in it.
  blueprint = addCore(blueprint, {
    id: "court-core",
    region: {
      kind: "rect",
      originMm: { xMm: COURT_WIDTH_MM / 2, zMm: 45_000 },
      widthMm: 12_000,
      depthMm: 10_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
    contents: ["stair", "elevator"],
  });
  for (let i = 0; i < 6; i += 1) {
    blueprint = addZone(blueprint, {
      id: `court-zone-${i}`,
      program: i % 3 === 2 ? "meeting" : "office-open",
      region: {
        kind: "rect",
        originMm: { xMm: COURT_WIDTH_MM / 2, zMm: COURT_DEPTH_MM / 2 },
        widthMm: 14_000 + i * 1_000,
        depthMm: 11_000,
        rotationRad: 0,
      },
      floorNos: FLOORS,
    });
  }
  return blueprint;
}

describe("ACCEPTANCE: a courtyard void stays a hole all the way down the chain", () => {
  const chain = runChain(courtyardBlueprint(), 5_507);

  it("gives every level plate a real hole", () => {
    expect(chain.building.levels).toHaveLength(FLOORS.length);
    for (const level of chain.building.levels) {
      expect(level.polygon).toHaveLength(2);
      expect(polygonArea([level.polygon[1]])).toBeCloseTo(VOID_AREA_SQM, 3);
      expect(level.plateAreaSqm).toBeCloseTo(COURT_AREA_SQM, 3);
    }
  });

  it("puts the hole in recipe.footprintPolygon", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygon).toHaveLength(2);
    expect(polygonArea(polygon)).toBeCloseTo(COURT_AREA_SQM, 3);
    // The centre of the void is not building.
    expect(pointInPolygon([0, 0], polygon, 1e-6)).toBe(false);
    // The ring around it is.
    expect(pointInPolygon([0, 20], polygon, 1e-6)).toBe(true);
    expect(pointInPolygon([-30, 0], polygon, 1e-6)).toBe(true);
  });

  it("keeps every space and every core component out of the void", () => {
    expect(chain.building.spaces.length).toBeGreaterThan(0);
    const plateByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l.polygon]));

    for (const space of chain.building.spaces) {
      expect(
        rectsOverlap(space.rect, VOID_RECT, 1e-6),
        `${space.id} (${space.label}) overlaps the courtyard`,
      ).toBe(false);
      expect(
        clipRectToPolygon(space.rect, plateByFloor.get(space.floorNo)!, 0.05),
        `${space.id} is not wholly on the level ${space.floorNo} plate`,
      ).toBe(true);
    }

    expect(chain.building.core.components.length).toBeGreaterThan(0);
    for (const component of chain.building.core.components) {
      expect(
        rectsOverlap(component.rect, VOID_RECT, 1e-6),
        `core component ${component.id} overlaps the courtyard`,
      ).toBe(false);
    }
  });

  it("emits per-level slabs that respect the level polygon, hole included", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);

    for (const level of chain.building.levels) {
      const slab = slabs.find((s) => s.levelId === `level:${level.floorNo}`);
      expect(slab, `no slab emitted for level ${level.floorNo}`).toBeDefined();

      const outline = outlineOf(slab!);
      expect(outline).toHaveLength(2);
      expect(slab!.instanceParameters.voidCount).toBe(1);
      expect(slab!.instanceParameters.voidAreaM2).toBeCloseTo(VOID_AREA_SQM, 2);
      // The emitted outline IS the level's plate, not a rectangle of equal area.
      expect(polygonArea(outline)).toBeCloseTo(level.plateAreaSqm, 2);
      expect(slab!.instanceParameters.areaM2).toBeCloseTo(level.plateAreaSqm, 2);
      expect(outline[0]).toEqual(
        level.polygon[0].map(([x, z]) => [Number(x.toFixed(3)), Number(z.toFixed(3))]),
      );
    }
  });

  it("validates with no critical violations", () => {
    expect(
      chain.validation.violations.filter((v) => v.severity === "critical"),
    ).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);
  });
});

/* ================================================================== */
/* 3. Rotated wings                                                    */
/* ================================================================== */

const WING_ROTATION_DEG = 30;
const WING_ROTATION_RAD = (WING_ROTATION_DEG * Math.PI) / 180;
const PIVOT: PointMm = { xMm: 50_000, zMm: 9_000 };
const WING_BAY_MM = 8_000;

function rotateAboutPivot(xMm: number, zMm: number): PointMm {
  const dx = xMm - PIVOT.xMm;
  const dz = zMm - PIVOT.zMm;
  return {
    xMm: Math.round(PIVOT.xMm + dx * Math.cos(WING_ROTATION_RAD) - dz * Math.sin(WING_ROTATION_RAD)),
    zMm: Math.round(PIVOT.zMm + dx * Math.sin(WING_ROTATION_RAD) + dz * Math.cos(WING_ROTATION_RAD)),
  };
}

/**
 * Wing A runs east–west; wing B is a 45 × 18 m bar rotated 30° about a point
 * inside wing A, so the two overlap and their union is a single connected
 * plate. `compileBlueprintToSpec` performs that union, which is where both sets
 * of edge directions have to survive.
 */
function rotatedWingsBlueprint(): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance Wings");
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("wing-a", { xMm: 0, zMm: 0, widthMm: 60_000, depthMm: 18_000 }),
    floorNos: FLOORS,
    role: "wing",
  });
  blueprint = addBoundary(blueprint, {
    loop: makePolyLoop("wing-b", [
      rotateAboutPivot(PIVOT.xMm, PIVOT.zMm - 9_000),
      rotateAboutPivot(PIVOT.xMm + 45_000, PIVOT.zMm - 9_000),
      rotateAboutPivot(PIVOT.xMm + 45_000, PIVOT.zMm + 9_000),
      rotateAboutPivot(PIVOT.xMm, PIVOT.zMm + 9_000),
    ]),
    floorNos: FLOORS,
    role: "wing",
  });
  // A grid family for the rotated wing only. `addBoundary`/`addZone` have no
  // grid sibling, so the entry is spread in directly — it is plain schema data.
  return {
    ...blueprint,
    gridSystems: [
      {
        id: "wing-b-grid",
        regionLoopId: "wing-b",
        originMm: { ...PIVOT },
        rotationRad: WING_ROTATION_RAD,
        xSpacingsMm: [WING_BAY_MM, WING_BAY_MM, WING_BAY_MM, WING_BAY_MM],
        zSpacingsMm: [WING_BAY_MM],
      },
    ],
  };
}

describe("ACCEPTANCE: a wing rotated 30° keeps its orientation through the chain", () => {
  const chain = runChain(rotatedWingsBlueprint(), 6_113);

  it("preserves both edge-direction families in the compiled plate", () => {
    const ring = chain.recipe.footprintPolygon![0];
    const histogram = edgeAngleHistogram(ring);

    const orthogonal =
      lengthNearAngle(histogram, 0, 2) + lengthNearAngle(histogram, 90, 2);
    const rotated =
      lengthNearAngle(histogram, WING_ROTATION_DEG, 2) +
      lengthNearAngle(histogram, WING_ROTATION_DEG + 90, 2);

    // Both families are present and neither is a rounding artefact.
    expect(orthogonal).toBeGreaterThan(30);
    expect(rotated).toBeGreaterThan(30);
    // Nothing was collapsed to a bounding box: a bbox has only 0°/90° edges.
    expect(polygonArea(chain.recipe.footprintPolygon!)).toBeLessThan(
      chain.recipe.footprintWidth * chain.recipe.footprintDepth * 0.85,
    );
  });

  it("emits exterior walls at both orientations", () => {
    const exteriorWalls = chain.snapshot.elements.filter(
      (element) => element.kind === "wall" && element.instanceParameters.exterior === true,
    );
    expect(exteriorWalls.length).toBeGreaterThan(0);

    const foldedDegrees = exteriorWalls.map((wall) => {
      const { start, end } = wallSegment(wall);
      const fromPlacement = (wall.placement.rotationY * 180) / Math.PI;
      const fromEndpoints =
        (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
      // The two must agree — `placement.rotationY` IS the segment direction.
      expect(Math.abs(fromPlacement - fromEndpoints)).toBeLessThan(0.05);
      return ((fromPlacement % 180) + 180) % 180;
    });

    const near = (degrees: number) =>
      foldedDegrees.filter((d) => Math.abs(d - degrees) < 2).length;

    expect(near(0) + near(90)).toBeGreaterThan(0);
    expect(near(WING_ROTATION_DEG) + near(WING_ROTATION_DEG + 90)).toBeGreaterThan(0);
  });

  it("frames the rotated wing on its own lattice", () => {
    const localGrids = chain.spec.structure.localGrids?.value ?? [];
    expect(localGrids).toHaveLength(1);
    const grid = localGrids[0];
    expect(grid.rotationRad).toBeCloseTo(WING_ROTATION_RAD, 9);

    const localColumns = chain.building.columns.filter((column) =>
      column.gridRef.startsWith(`${grid.id}:`),
    );
    expect(localColumns.length).toBeGreaterThan(0);

    // Independent check of one node against LocalFrame maths: grid ref "B-2" is
    // the second line along X and the second along Z, i.e. local (bay, bay).
    const frame = makeFrame(grid.originMm.x / 1000, grid.originMm.z / 1000, grid.rotationRad);
    const expected = toWorldPoint(frame, [WING_BAY_MM / 1000, WING_BAY_MM / 1000]);
    const b2 = localColumns.find((column) => column.gridRef === `${grid.id}:B-2`);
    expect(b2, "the rotated wing has no B-2 column").toBeDefined();
    expect(b2!.x).toBeCloseTo(expected[0], 9);
    expect(b2!.z).toBeCloseTo(expected[1], 9);
    // A rotated bay is not an axis-aligned one: both coordinates moved.
    expect(Math.abs(b2!.x - grid.originMm.x / 1000)).toBeGreaterThan(0.5);
    expect(Math.abs(b2!.z - grid.originMm.z / 1000)).toBeGreaterThan(0.5);
  });

  it("never puts a column off the plate", () => {
    const plateByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l.polygon]));
    expect(chain.building.columns.length).toBeGreaterThan(0);
    for (const column of chain.building.columns) {
      const plate = plateByFloor.get(column.floorNo)!;
      expect(
        pointInPolygon([column.x, column.z], plate, 1e-6),
        `column ${column.id} stands off the level ${column.floorNo} plate`,
      ).toBe(true);
    }

    // The same columns are in the snapshot, at the same places.
    const emitted = chain.snapshot.elements.filter((element) => element.kind === "column");
    expect(emitted).toHaveLength(chain.building.columns.length);
    for (const column of chain.building.columns) {
      const element = emitted.find((e) => e.id === column.id)!;
      expect(element.placement.x).toBeCloseTo(column.x, 3);
      expect(element.placement.z).toBeCloseTo(column.z, 3);
    }
  });

  it("validates with no critical violations", () => {
    expect(
      chain.validation.violations.filter((v) => v.severity === "critical"),
    ).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);
  });
});
