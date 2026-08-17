// src/lib/generative/__tests__/blueprint-compile-curved.test.ts
//
// GENERATION-LEVEL coverage for curved (arc-bounded) schematic boundaries.
//
// `geom/curves.ts` already has thorough unit coverage of arc/bezier
// tessellation in isolation (geom-curves.test.ts), and
// blueprint-validate.test.ts proves an arc-bounded loop passes validation.
// Neither compiles an arc-bounded BLUEPRINT all the way through
// `compileBlueprintToSpec` into a BuildingSpec and on through generation —
// which is the one place a real bug could hide: an arc segment silently
// chord-collapsing to a straight line between its endpoints instead of being
// tessellated into the polygon ring `compile.ts` (~L130-186) builds for
// custom plates.
//
// The fixture is a stadium / discorectangle: two straight long sides plus two
// semicircular end caps, authored with explicit `kind: "arc"` segments — a
// boundary that is genuinely non-polygonal as drawn, not a many-sided
// approximation the author typed in by hand.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  compileBlueprintToSpec,
  emptyBlueprint,
  TESSELLATION_TOLERANCE_MM,
  type BlueprintSpec,
  type BoundaryLoop,
  type PointMm,
} from "../blueprint";
import { generateMassing, polygonArea } from "../generate/massing";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { validateBuilding } from "../validate/rules";

const SEED = 20260817;

const p = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

/* ------------------------------------------------------------------ */
/* Fixture — a stadium: straight sides + two semicircular arc caps     */
/* ------------------------------------------------------------------ */

/** End-cap radius. */
const CAP_RADIUS_MM = 10_000;
/** Distance between the two cap centres along X. */
const STRAIGHT_MM = 40_000;
const FLOORS = [1, 2, 3];

/**
 * Cap centres sit at (0,0) and (STRAIGHT_MM,0), both radius CAP_RADIUS_MM.
 * Both arcs sweep "cw": the right cap goes from its top endpoint (angle 90°)
 * down through angle 0° (the outward apex at x = STRAIGHT_MM + R) to its
 * bottom endpoint (angle -90°); the left cap goes from its bottom endpoint
 * (angle -90°, i.e. -π/2) on down through angle 180° (the outward apex at
 * x = -R) to its top endpoint (angle 90°, reached at the unwrapped -270°).
 * Both bulge OUTWARD — the shape a "cw" reading of a stadium's two caps
 * actually is — rather than folding the loop into a bow-tie.
 */
function stadiumLoop(): BoundaryLoop {
  const r = CAP_RADIUS_MM;
  const l = STRAIGHT_MM;
  return {
    id: "stadium-outline",
    segments: [
      { kind: "line", startMm: p(0, r), endMm: p(l, r) },
      {
        kind: "arc",
        startMm: p(l, r),
        endMm: p(l, -r),
        centerMm: p(l, 0),
        sweep: "cw",
      },
      { kind: "line", startMm: p(l, -r), endMm: p(0, -r) },
      {
        kind: "arc",
        startMm: p(0, -r),
        endMm: p(0, r),
        centerMm: p(0, 0),
        sweep: "cw",
      },
    ],
  };
}

function stadiumBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Stadium Plan"), {
    loop: stadiumLoop(),
    floorNos: FLOORS,
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("compileBlueprintToSpec — curved (arc-bounded) boundaries", () => {
  it("tessellates the arc caps into many vertices, not a 4-corner chord-collapsed rectangle", () => {
    const { spec } = compileBlueprintToSpec(stadiumBlueprint(), { seed: SEED });

    expect(spec.massing.strategy.value).toBe("custom");
    const plates = spec.massing.customPlates?.value ?? [];
    expect(plates).toHaveLength(1);
    expect(plates[0].floorNos).toEqual(FLOORS);

    const outer = plates[0].polygonMm[0];
    // A naive/chord-collapsed reading of this loop (arcs replaced by the
    // straight line between their own endpoints) is a plain 4-corner
    // rectangle. Two real 180° arcs, tessellated to TESSELLATION_TOLERANCE_MM
    // (50 mm) against a 10 m radius, need on the order of 30+ vertices —
    // comfortably clear of "still basically 4".
    expect(outer.length).toBeGreaterThan(20);
  });

  it("bulges each cap out to the arc's true radius instead of chording straight across", () => {
    const { spec } = compileBlueprintToSpec(stadiumBlueprint(), { seed: SEED });
    const outer = spec.massing.customPlates!.value[0].polygonMm[0];

    // The plate is recentred on its own bounding-box centre. Raw drawing
    // coordinates run x ∈ [-R, STRAIGHT+R], so in the recentred frame the
    // right cap's straight-edge endpoints sit at x = +STRAIGHT/2 (the chord
    // between them, if the arc had collapsed to a straight line, could never
    // exceed that) while the arc's true outward apex sits at
    // x = +STRAIGHT/2 + R.
    const straightHalfSpanMm = STRAIGHT_MM / 2;
    const xs = outer.map(([x]) => x);
    const maxX = Math.max(...xs);
    const minX = Math.min(...xs);

    const bulgeMm = maxX - straightHalfSpanMm;
    // A "small tolerance" here would be a handful of tessellation-error
    // millimetres; the real bulge is the full 10 m cap radius.
    expect(bulgeMm).toBeGreaterThan(CAP_RADIUS_MM - TESSELLATION_TOLERANCE_MM * 2);
    expect(bulgeMm).toBeLessThanOrEqual(CAP_RADIUS_MM + TESSELLATION_TOLERANCE_MM);

    // Same check, mirrored, on the left cap.
    const leftBulgeMm = -straightHalfSpanMm - minX;
    expect(leftBulgeMm).toBeGreaterThan(CAP_RADIUS_MM - TESSELLATION_TOLERANCE_MM * 2);
    expect(leftBulgeMm).toBeLessThanOrEqual(CAP_RADIUS_MM + TESSELLATION_TOLERANCE_MM);
  });

  it("reports the stadium's real area — straight midsection plus a full circle of cap area — not a chord-collapsed rectangle", () => {
    const { spec } = compileBlueprintToSpec(stadiumBlueprint(), { seed: SEED });
    const massing = generateMassing(spec);

    const straightM = STRAIGHT_MM / 1000;
    const radiusM = CAP_RADIUS_MM / 1000;
    // Two semicircular caps of radius R together make one full circle.
    const expectedAreaSqm = straightM * (2 * radiusM) + Math.PI * radiusM * radiusM;
    // What a chord-collapsed reading (arcs replaced by their own endpoint-to-
    // endpoint chord) would report: a plain STRAIGHT × 2R rectangle.
    const chordCollapsedAreaSqm = straightM * (2 * radiusM);

    const area = polygonArea(massing.primary);
    expect(area).toBeGreaterThan(expectedAreaSqm * 0.98);
    expect(area).toBeLessThan(expectedAreaSqm * 1.02);
    // Well clear of the buggy (uncurved) answer — not a rounding-distance away.
    expect(area).toBeGreaterThan(chordCollapsedAreaSqm * 1.1);
  });

  it("carries the tessellated stadium plate through generation with no critical violations", () => {
    const { spec } = compileBlueprintToSpec(stadiumBlueprint(), { seed: SEED });
    const building = generateBuildingFromSpec(spec);

    expect(building.levels).toHaveLength(FLOORS.length);
    for (const level of building.levels) {
      expect(level.plateAreaSqm).toBeGreaterThan(0);
      expect(level.polygon[0].length).toBeGreaterThan(20);
    }
    expect(building.spaces.length).toBeGreaterThan(0);
    expect(building.columns.length).toBeGreaterThan(0);

    const validation = validateBuilding(building, spec);
    expect(validation.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(validation.geometricallyValid).toBe(true);
  });
});
