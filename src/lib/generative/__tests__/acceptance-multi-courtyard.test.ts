// src/lib/generative/__tests__/acceptance-multi-courtyard.test.ts
//
// ACCEPTANCE: a floor plate with TWO separate courtyard voids keeps BOTH
// holes all the way down the chain.
//
//   BlueprintSpec (2 voids) → compileBlueprintToSpec → BuildingSpec
//                           → generateBuildingFromSpec → GeneratedBuilding
//                           → emitSnapshot          → BimModelSnapshot
//                           → validateBuilding      → ValidationReport
//
// `CustomPlateSchema.polygonMm` (blueprint/../spec/building-spec.ts) accepts
// up to 16 rings — 1 outer + up to 15 holes — and the polygon boolean kernel
// (`geom/polygon.ts`) is a general multi-hole clipper. But every courtyard /
// atrium fixture that existed anywhere in `src/lib/generative` before this
// file drew exactly ONE hole (`blueprint-compile.test.ts`'s courtyard case,
// `acceptance-massing-chain.test.ts`'s courtyard describe block,
// `space-plan-polygon.test.ts`'s "donut"). Nothing exercised two. This file
// is that test, modelled directly on the single-void acceptance case.
//
// Deterministic path only: no provider, no network, fixed seed.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addCore,
  addVoid,
  addZone,
  compileBlueprintToSpec,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
} from "../blueprint";
import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { polygonArea, ringArea, type Polygon } from "../generate/massing";
import { rectsOverlap, type Rect } from "../generate/types";
import { clipRectToPolygon, pointInPolygon } from "../geom";
import { emitSnapshot } from "../graph/emit";
import { generationIdFor } from "../build";
import { validateBuilding } from "../validate/rules";
import type { BimElement } from "@/lib/bim/model/types";

const SEED = 8_812;
const FLOORS = [1, 2, 3];

/* ------------------------------------------------------------------ */
/* Fixture: one plate, two disjoint courtyards                         */
/* ------------------------------------------------------------------ */

const OUTER_WIDTH_MM = 100_000;
const OUTER_DEPTH_MM = 60_000;

const VOID_WIDTH_MM = 16_000;
/**
 * 1.5 m short of the plate's full 60 m depth on purpose — see the block
 * comment below. `MARGIN_MM` is that leftover, split evenly top and bottom.
 */
const MARGIN_MM = 1_500;
const VOID_DEPTH_MM = OUTER_DEPTH_MM - 2 * MARGIN_MM;
const VOID_AREA_SQM = (VOID_WIDTH_MM / 1000) * (VOID_DEPTH_MM / 1000);

/** Centres in blueprint drawing space (mm), before the engine's centring shift. */
const VOID_A_CENTER_MM = { xMm: MARGIN_MM + VOID_WIDTH_MM / 2, zMm: OUTER_DEPTH_MM / 2 };
const VOID_B_CENTER_MM = {
  xMm: OUTER_WIDTH_MM - MARGIN_MM - VOID_WIDTH_MM / 2,
  zMm: OUTER_DEPTH_MM / 2,
};

/**
 * Both voids' rects in the ENGINE'S centred frame (metres) — the boundary's
 * bbox centre (50, 30 m in drawing space) becomes the origin, exactly the way
 * `acceptance-massing-chain.test.ts`'s single `VOID_RECT` is derived.
 *
 * Two deliberate choices keep this fixture inside the space solver's real
 * envelope instead of merely inside the polygon kernel's:
 *
 * 1. Each void runs almost the full 60 m depth of the plate, 1.5 m short on
 *    each end (`MARGIN_MM`, < `MIN_BAND_M` = 2 m in space-plan.ts). The sliver
 *    of solid floor above and below each void is too thin for `layoutBand` to
 *    ever turn into a corridor or a room, so `solidCells` never manufactures a
 *    "go around the top of the void" island that a real plan would not build
 *    either — the void reads as a full-height slot, not a doughnut.
 * 2. Each void's near edge sits ~26 m clear of the core, so the solid band
 *    connecting the core to each wing is a wide, well-proportioned bay, not a
 *    sliver corridor `solveFloorPlan` would rather hand to a better-shaped
 *    neighbour and then drop as unserved. A first draft of this fixture used a
 *    5 m gap and a core drawn at the plate's raw bounding-box centre; both
 *    choices turned out to matter — the 5 m gap lost the strip-scoring
 *    competition and got dropped as an unserved corridor, and the off-centre
 *    core (see `solidPlateForCore` below) meant NO band's corridor reached the
 *    real core at all. Together they silently orphaned every space on floors
 *    2–3 behind `SPACE_NOT_ACCESSIBLE`, with nothing wrong in the void
 *    geometry itself — a temporary debug assertion dumping `building.spaces`
 *    and `building.core.rect` (via `JSON.stringify(...).toBe("")`) is what
 *    found it.
 *
 * The two voids are still each 16 × 57 m and fully interior — this is a
 * courtyard-scale hole in a real solvable plan, not a token sliver.
 */
const SHIFT_X_M = -OUTER_WIDTH_MM / 2000;
const SHIFT_Z_M = -OUTER_DEPTH_MM / 2000;
const voidRect = (centerMm: { xMm: number; zMm: number }): Rect => ({
  minX: centerMm.xMm / 1000 + SHIFT_X_M - VOID_WIDTH_MM / 2000,
  maxX: centerMm.xMm / 1000 + SHIFT_X_M + VOID_WIDTH_MM / 2000,
  minZ: centerMm.zMm / 1000 + SHIFT_Z_M - VOID_DEPTH_MM / 2000,
  maxZ: centerMm.zMm / 1000 + SHIFT_Z_M + VOID_DEPTH_MM / 2000,
});
const VOID_A_RECT = voidRect(VOID_A_CENTER_MM);
const VOID_B_RECT = voidRect(VOID_B_CENTER_MM);
const VOID_RECTS = [VOID_A_RECT, VOID_B_RECT];

const OUTER_AREA_SQM = (OUTER_WIDTH_MM / 1000) * (OUTER_DEPTH_MM / 1000);
const PLATE_AREA_SQM = OUTER_AREA_SQM - 2 * VOID_AREA_SQM;

function twoCourtyardsBlueprint(): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance Two Courtyards");
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("outline", {
      xMm: 0,
      zMm: 0,
      widthMm: OUTER_WIDTH_MM,
      depthMm: OUTER_DEPTH_MM,
    }),
    floorNos: FLOORS,
  });
  blueprint = addVoid(blueprint, {
    id: "courtyard-west",
    kind: "courtyard",
    region: {
      kind: "rect",
      originMm: VOID_A_CENTER_MM,
      widthMm: VOID_WIDTH_MM,
      depthMm: VOID_DEPTH_MM,
      rotationRad: 0,
    },
    floorNos: FLOORS,
  });
  blueprint = addVoid(blueprint, {
    id: "courtyard-east",
    kind: "courtyard",
    region: {
      kind: "rect",
      originMm: VOID_B_CENTER_MM,
      widthMm: VOID_WIDTH_MM,
      depthMm: VOID_DEPTH_MM,
      rotationRad: 0,
    },
    floorNos: FLOORS,
  });
  // Sits in the middle of the gap between the two voids, on the same spot
  // `solidPlateForCore` would centre the core on its own — see the comment on
  // `VOID_A_CENTER_MM` above.
  blueprint = addCore(blueprint, {
    id: "between-core",
    region: {
      kind: "rect",
      originMm: { xMm: OUTER_WIDTH_MM / 2, zMm: OUTER_DEPTH_MM / 2 },
      widthMm: 12_000,
      depthMm: 10_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
    contents: ["stair", "elevator"],
  });
  for (let i = 0; i < 10; i += 1) {
    blueprint = addZone(blueprint, {
      id: `zone-${i}`,
      program: i % 3 === 2 ? "meeting" : "office-open",
      region: {
        kind: "rect",
        originMm: { xMm: OUTER_WIDTH_MM / 2, zMm: OUTER_DEPTH_MM / 2 },
        widthMm: 12_000 + i * 1_000,
        depthMm: 10_000,
        rotationRad: 0,
      },
      floorNos: FLOORS,
    });
  }
  return blueprint;
}

/* ------------------------------------------------------------------ */
/* Chain runner — same shape as acceptance-massing-chain.test.ts        */
/* ------------------------------------------------------------------ */

function runChain(blueprint: BlueprintSpec, seed: number) {
  const { spec, locks } = compileBlueprintToSpec(blueprint, { seed });
  const building = generateBuildingFromSpec(spec);
  const compiled = compileSpecToRecipe(spec);
  const snapshot = emitSnapshot({
    buildingPk: "BLD-ACCEPTANCE-MULTI-VOID",
    generationId: generationIdFor(seed, 0),
    spec,
    building,
  });
  const validation = validateBuilding(building, spec);
  return { spec, locks, building, snapshot, validation, ...compiled };
}

const outlineOf = (element: BimElement): Polygon =>
  JSON.parse(element.instanceParameters.outlineJson as string) as Polygon;

/** Two hole areas, smallest first — order-independent way to check "both voids present". */
const holeAreasOf = (polygon: Polygon): number[] =>
  polygon
    .slice(1)
    .map((ring) => ringArea(ring))
    .sort((a, b) => a - b);

describe("ACCEPTANCE: a plate with two separate courtyard voids keeps both holes", () => {
  const chain = runChain(twoCourtyardsBlueprint(), SEED);

  it("compiles a custom plate with three rings: outer + two holes", () => {
    const plates = chain.spec.massing.customPlates?.value ?? [];
    expect(plates.length).toBeGreaterThan(0);
    for (const plate of plates) {
      expect(plate.polygonMm).toHaveLength(3);
    }
  });

  it("gives every level plate two real, separate holes — not one merged void", () => {
    expect(chain.building.levels).toHaveLength(FLOORS.length);
    for (const level of chain.building.levels) {
      // 3 rings: the notch/void collapsing to one hole (a bug this test would
      // catch) shows up here as length 2; a dropped void shows up as length 1.
      expect(level.polygon).toHaveLength(3);

      const holeAreas = holeAreasOf(level.polygon);
      expect(holeAreas).toHaveLength(2);
      // Both holes are their own 16 × 57 m rectangle, not one giant merge.
      expect(holeAreas[0]).toBeCloseTo(VOID_AREA_SQM, 2);
      expect(holeAreas[1]).toBeCloseTo(VOID_AREA_SQM, 2);
      expect(level.plateAreaSqm).toBeCloseTo(PLATE_AREA_SQM, 2);
    }
  });

  it("puts both holes in recipe.footprintPolygon", () => {
    const polygon = chain.recipe.footprintPolygon!;
    expect(polygon).toHaveLength(3);
    expect(polygonArea(polygon)).toBeCloseTo(PLATE_AREA_SQM, 2);
    expect(holeAreasOf(polygon)[0]).toBeCloseTo(VOID_AREA_SQM, 2);
    expect(holeAreasOf(polygon)[1]).toBeCloseTo(VOID_AREA_SQM, 2);

    // Neither void's centre is building...
    for (const rect of VOID_RECTS) {
      const centreX = (rect.minX + rect.maxX) / 2;
      const centreZ = (rect.minZ + rect.maxZ) / 2;
      expect(pointInPolygon([centreX, centreZ], polygon, 1e-6)).toBe(false);
    }
    // ...while the solid strip between them, and the outer ring near each
    // void, are.
    expect(pointInPolygon([0, 0], polygon, 1e-6)).toBe(true);
    expect(pointInPolygon([-19, 15], polygon, 1e-6)).toBe(true);
    expect(pointInPolygon([19, 15], polygon, 1e-6)).toBe(true);

    // A bbox-sized rectangle would not lose 2 × VOID_AREA_SQM to two holes.
    const bboxArea = chain.recipe.footprintWidth * chain.recipe.footprintDepth;
    expect(bboxArea).toBeCloseTo(OUTER_AREA_SQM, 2);
    expect(polygonArea(polygon)).toBeLessThan(bboxArea - 2 * VOID_AREA_SQM + 1);
  });

  it("keeps every space, every core component, and every column out of both voids", () => {
    expect(chain.building.spaces.length).toBeGreaterThan(0);
    const plateByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l.polygon]));

    for (const space of chain.building.spaces) {
      for (const rect of VOID_RECTS) {
        expect(
          rectsOverlap(space.rect, rect, 1e-6),
          `${space.id} (${space.label}) overlaps a courtyard`,
        ).toBe(false);
      }
      expect(
        clipRectToPolygon(space.rect, plateByFloor.get(space.floorNo)!, 0.05),
        `${space.id} is not wholly on the level ${space.floorNo} plate`,
      ).toBe(true);
    }

    expect(chain.building.core.components.length).toBeGreaterThan(0);
    for (const component of chain.building.core.components) {
      for (const rect of VOID_RECTS) {
        expect(
          rectsOverlap(component.rect, rect, 1e-6),
          `core component ${component.id} overlaps a courtyard`,
        ).toBe(false);
      }
    }

    expect(chain.building.columns.length).toBeGreaterThan(0);
    for (const column of chain.building.columns) {
      const plate = plateByFloor.get(column.floorNo)!;
      // Point-in-polygon, holes respected: the check that would fail if only
      // the first void were ever subtracted from the structural grid.
      expect(
        pointInPolygon([column.x, column.z], plate, 1e-6),
        `column ${column.id} stands inside a courtyard on level ${column.floorNo}`,
      ).toBe(true);
      for (const rect of VOID_RECTS) {
        const insideVoid =
          column.x > rect.minX + 1e-6 &&
          column.x < rect.maxX - 1e-6 &&
          column.z > rect.minZ + 1e-6 &&
          column.z < rect.maxZ - 1e-6;
        expect(insideVoid, `column ${column.id} stands inside a courtyard`).toBe(false);
      }
    }
  });

  it("emits per-level slabs with both holes present, not merged, not dropped", () => {
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);

    for (const level of chain.building.levels) {
      const slab = slabs.find((s) => s.levelId === `level:${level.floorNo}`);
      expect(slab, `no slab emitted for level ${level.floorNo}`).toBeDefined();

      const outline = outlineOf(slab!);
      expect(outline).toHaveLength(3);
      expect(slab!.instanceParameters.voidCount).toBe(2);
      expect(slab!.instanceParameters.voidAreaM2).toBeCloseTo(2 * VOID_AREA_SQM, 1);
      // The emitted outline IS the level's plate, not a rectangle of equal area.
      expect(polygonArea(outline)).toBeCloseTo(level.plateAreaSqm, 2);
      expect(slab!.instanceParameters.areaM2).toBeCloseTo(level.plateAreaSqm, 2);

      const holeAreas = holeAreasOf(outline);
      expect(holeAreas[0]).toBeCloseTo(VOID_AREA_SQM, 2);
      expect(holeAreas[1]).toBeCloseTo(VOID_AREA_SQM, 2);
    }
  });

  it("validates with no critical violations, specifically no plate/void violation", () => {
    const critical = chain.validation.violations.filter((v) => v.severity === "critical");
    expect(critical).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);

    // `validate/rules.ts` has no dedicated "slab covers void" code — a room,
    // core component or column standing on a void surfaces through one of
    // these three plate-containment checks instead (checkGeometry / checkCore
    // / checkStructure), since every one of them tests against `level.polygon`
    // which already carries both holes.
    const plateViolations = chain.validation.violations.filter(
      (v) =>
        v.code === "SPACE_OUTSIDE_PLATE" ||
        v.code === "CORE_OUTSIDE_PLATE" ||
        v.code === "COLUMN_OUTSIDE_PLATE",
    );
    expect(plateViolations).toEqual([]);
  });
});
