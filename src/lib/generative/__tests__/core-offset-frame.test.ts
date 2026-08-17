// src/lib/generative/__tests__/core-offset-frame.test.ts
//
// REGRESSION: a core drawn on a blueprint must be BUILT where it was drawn,
// even when the plate has courtyard voids.
//
// The bug this file pins was a coordinate-frame mismatch between two files that
// never spoke to each other:
//
//   • `blueprint/compile.ts` emits `core.offsetXMm/offsetZMm` as the drawn
//     core's centre in the ENGINE's frame — the frame whose origin is the
//     largest plate's bounding-box centre (`blueprintPlateFrame` shifts every
//     piece of blueprint geometry by exactly that). `provider/heuristic-
//     provider.ts` emits `0.22 × plate.widthMm`, i.e. a displacement from the
//     same plate centre, which — because `generate/massing.ts` builds every
//     plate centred on the origin — is the SAME number in the SAME frame.
//     `spec/building-spec.ts` states the convention: "Footprint-local offset
//     from the plate centre."
//   • `generate/pipeline.ts` hands `generateCore` not the plate but the largest
//     INSCRIBED rect of the plate (holes respected), so the core stands on solid
//     floor rather than over a courtyard — and `generate/core.ts` added the
//     offset to THAT rect's centre.
//
// On a plain rectangle the inscribed rect IS the plate, so the two frames
// coincide and the bug is invisible. Punch a void and the inscribed rect slides
// off the plate centre, and the core slides with it — twice the displacement,
// in a direction nobody asked for. Measured on the fixtures below before the
// fix: 21.5 m of drift in ONE_COURTYARD, 13.20 m (12.0 X + 5.5 Z) in
// TWO_COURTYARDS. Both are "the lift shaft is in the wrong wing" errors.
//
// The fix keeps the inscribed rect as the region the core is CLAMPED into (that
// part was right — it is what keeps the core on floor) and measures the offset
// from the plate's bounding-box centre, which is the frame both producers write
// in. Nothing about the prompt-driven path changes: its plate has no hole, so
// its two frames are the same point.
//
// KNOWN RESIDUAL, deliberately not asserted here: the clamp still pulls the
// core into the ONE largest solid rectangle, which need not be the solid region
// the core was drawn in. `acceptance-massing-chain.test.ts`'s courtyard fixture
// draws its core on the north ring (z = +17 m) and gets it built on the south
// one (z = -14.5 m), because the two bands are the same size and the scan takes
// the lower. That is a region-SELECTION defect, not a frame one; fixing it means
// teaching `solidPlateForCore` to prefer the region containing the requested
// core, and it moves geometry in existing acceptance fixtures. So the fixtures
// below draw their cores inside the largest solid region, where the frame is the
// only thing that can be wrong.
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
import { generateCore } from "../generate/core";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { rectCentre, rectDepth, rectWidth, type Rect } from "../generate/types";
import { clipRectToPolygon } from "../geom";
import type { BuildingSpec } from "../spec/building-spec";

const SEED = 4_411;
const FLOORS = [1, 2, 3];

/** Plate, metres. Drawing space runs [0,W]×[0,D]; the engine frame is centred. */
const PLATE_W_M = 100;
const PLATE_D_M = 60;
const toDrawingXMm = (engineXM: number) => Math.round((engineXM + PLATE_W_M / 2) * 1000);
const toDrawingZMm = (engineZM: number) => Math.round((engineZM + PLATE_D_M / 2) * 1000);

const CORE_W_M = 12;
const CORE_D_M = 10;

interface RectM {
  /** Centre in the ENGINE frame, metres. */
  cx: number;
  cz: number;
  w: number;
  d: number;
}

/**
 * A blueprint: one rectangular boundary, N courtyard voids, one drawn core, and
 * enough programmed zones that the compiler has a real building to plan. Every
 * position is given in the ENGINE frame so the expectations read directly
 * against `building.core.rect`; the drawing-space conversion happens here.
 */
function blueprintWith(name: string, voids: RectM[], core: RectM): BlueprintSpec {
  let blueprint = emptyBlueprint(name);
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("outline", {
      xMm: 0,
      zMm: 0,
      widthMm: PLATE_W_M * 1000,
      depthMm: PLATE_D_M * 1000,
    }),
    floorNos: FLOORS,
  });
  voids.forEach((item, index) => {
    blueprint = addVoid(blueprint, {
      id: `courtyard-${index}`,
      kind: "courtyard",
      region: {
        kind: "rect",
        originMm: { xMm: toDrawingXMm(item.cx), zMm: toDrawingZMm(item.cz) },
        widthMm: item.w * 1000,
        depthMm: item.d * 1000,
        rotationRad: 0,
      },
      floorNos: FLOORS,
    });
  });
  blueprint = addCore(blueprint, {
    id: "drawn-core",
    region: {
      kind: "rect",
      originMm: { xMm: toDrawingXMm(core.cx), zMm: toDrawingZMm(core.cz) },
      widthMm: core.w * 1000,
      depthMm: core.d * 1000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
    contents: ["stair", "elevator"],
  });
  for (let i = 0; i < 6; i += 1) {
    blueprint = addZone(blueprint, {
      id: `zone-${i}`,
      program: i % 3 === 2 ? "meeting" : "office-open",
      region: {
        kind: "rect",
        originMm: { xMm: toDrawingXMm(0), zMm: toDrawingZMm(0) },
        widthMm: 12_000 + i * 1_000,
        depthMm: 10_000,
        rotationRad: 0,
      },
      floorNos: FLOORS,
    });
  }
  return blueprint;
}

function buildFrom(blueprint: BlueprintSpec) {
  const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
  return { spec, building: generateBuildingFromSpec(spec) };
}

const rectToPoints = (r: Rect) => ({
  cx: (r.minX + r.maxX) / 2,
  cz: (r.minZ + r.maxZ) / 2,
});

/**
 * How far the built core ended up from the drawn one, metres. The acceptance
 * threshold is 1 m: the compiler rounds the offsets to whole millimetres and
 * `generateCore` may nudge the core to keep its 1.5 m habitable ring, so exact
 * equality would pin arithmetic rather than intent.
 */
function drift(built: Rect, drawn: RectM): number {
  const { cx, cz } = rectToPoints(built);
  return Math.hypot(cx - drawn.cx, cz - drawn.cz);
}

/* ------------------------------------------------------------------ */
/* Fixture 1 — one courtyard, core drawn in the west block             */
/* ------------------------------------------------------------------ */

/**
 * The void sits east of centre, so the plate's largest solid rectangle is the
 * 57 × 60 m west block centred at (-21.5, 0) — 21.5 m west of the plate centre.
 * The core is drawn well inside that block, with room for its ring, so the
 * clamp has nothing to say and the ONLY thing that can move it is the frame the
 * offset is read in.
 */
const ONE_VOID: RectM = { cx: 22, cz: 0, w: 30, d: 30 };
const ONE_VOID_CORE: RectM = { cx: -20, cz: 0, w: CORE_W_M, d: CORE_D_M };

/* ------------------------------------------------------------------ */
/* Fixture 2 — two courtyards, core drawn in the south-west block      */
/* ------------------------------------------------------------------ */

/**
 * With a single rectangular void the largest inscribed rect is always a full
 * band, so its centre can only be off in ONE axis. Two staggered voids make the
 * winner a corner block — 76 × 36 m at (-12, -12) — which is off in both, so
 * this fixture is what proves the Z offset reads in the same frame as the X one.
 */
const TWO_VOIDS: RectM[] = [
  { cx: 0, cz: 16, w: 28, d: 20 },
  { cx: 36, cz: -16, w: 20, d: 20 },
];
const TWO_VOIDS_CORE: RectM = { cx: -30, cz: -18, w: CORE_W_M, d: CORE_D_M };

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("blueprint core placement — offsets are read in the plate's frame", () => {
  it("builds a core drawn beside a single courtyard where it was drawn", () => {
    const { spec, building } = buildFrom(
      blueprintWith("One Courtyard", [ONE_VOID], ONE_VOID_CORE),
    );

    // The compiler really did emit the drawn centre as an engine-frame offset.
    expect(spec.core.strategy.value).toBe("offset");
    expect(spec.core.offsetXMm).toBeCloseTo(ONE_VOID_CORE.cx * 1000, 0);
    expect(spec.core.offsetZMm).toBeCloseTo(ONE_VOID_CORE.cz * 1000, 0);

    // Before the fix the core landed at x ≈ -41.5 m: the -21.5 m inscribed-rect
    // centre plus the -20 m offset, i.e. the displacement counted twice.
    expect(drift(building.core.rect, ONE_VOID_CORE)).toBeLessThan(1);

    // ...at the drawn size, and still wholly on floor.
    expect(rectWidth(building.core.rect)).toBeCloseTo(CORE_W_M, 3);
    expect(rectDepth(building.core.rect)).toBeCloseTo(CORE_D_M, 3);
    for (const level of building.levels) {
      expect(
        clipRectToPolygon(building.core.rect, level.polygon, 0.05),
        `core is not wholly on the level ${level.floorNo} plate`,
      ).toBe(true);
    }
  });

  it("reads the Z offset in the same frame as the X one", () => {
    const { building } = buildFrom(
      blueprintWith("Two Courtyards", TWO_VOIDS, TWO_VOIDS_CORE),
    );

    // Before the fix: (-42.0, -23.5) against a drawn (-30, -18) — 13.20 m out,
    // wrong in both axes.
    const { cx, cz } = rectToPoints(building.core.rect);
    expect(cx).toBeCloseTo(TWO_VOIDS_CORE.cx, 1);
    expect(cz).toBeCloseTo(TWO_VOIDS_CORE.cz, 1);
    expect(drift(building.core.rect, TWO_VOIDS_CORE)).toBeLessThan(1);

    for (const level of building.levels) {
      expect(clipRectToPolygon(building.core.rect, level.polygon, 0.05)).toBe(true);
    }
    // The components ride the rect, so they move with it.
    expect(building.core.components.length).toBeGreaterThan(0);
    for (const component of building.core.components) {
      expect(component.rect.minX).toBeGreaterThanOrEqual(building.core.rect.minX - 1e-9);
      expect(component.rect.maxX).toBeLessThanOrEqual(building.core.rect.maxX + 1e-9);
      expect(component.rect.minZ).toBeGreaterThanOrEqual(building.core.rect.minZ - 1e-9);
      expect(component.rect.maxZ).toBeLessThanOrEqual(building.core.rect.maxZ + 1e-9);
    }
  });

  it("still builds a hole-free plate's drawn core where it was drawn", () => {
    // The case that always worked — the plate has no void, so the two frames
    // coincide. It is here so a future "fix" that swaps one frame for the other
    // cannot pass by breaking this one.
    const { building } = buildFrom(
      blueprintWith("No Courtyard", [], { cx: 18, cz: -9, w: CORE_W_M, d: CORE_D_M }),
    );
    expect(drift(building.core.rect, { cx: 18, cz: -9, w: CORE_W_M, d: CORE_D_M })).toBeLessThan(1);
  });
});

describe("generateCore — the offset origin", () => {
  const plate: Rect = { minX: -30, minZ: -20, maxX: 30, maxZ: 20 };

  function specWithOffset(base: BuildingSpec, xMm: number, zMm: number): BuildingSpec {
    return {
      ...base,
      core: {
        ...base.core,
        strategy: { ...base.core.strategy, value: "offset" as const },
        widthMm: { ...base.core.widthMm, value: CORE_W_M * 1000 },
        depthMm: { ...base.core.depthMm, value: CORE_D_M * 1000 },
        offsetXMm: xMm,
        offsetZMm: zMm,
      },
    };
  }

  const baseSpec = compileBlueprintToSpec(
    blueprintWith("Origin Unit", [], { cx: 0, cz: 0, w: CORE_W_M, d: CORE_D_M }),
    { seed: SEED },
  ).spec;

  it("measures the offset from the plate centre when no origin is given", () => {
    const spec = specWithOffset(baseSpec, 6_000, -4_000);
    const layout = generateCore({ spec, plate, floorNos: FLOORS });
    expect(rectCentre(layout.rect)).toEqual([6, -4]);
  });

  it("measures it from the given origin instead, so a shifted plate cannot move the core", () => {
    const spec = specWithOffset(baseSpec, 6_000, -4_000);
    // The plate handed in is displaced 10 m west of the frame the offsets were
    // written in — exactly what the pipeline's inscribed rect does on a plate
    // with a void. The core must not move with it.
    const shifted: Rect = { minX: -40, minZ: -20, maxX: 20, maxZ: 20 };
    const layout = generateCore({
      spec,
      plate: shifted,
      offsetOrigin: [0, 0],
      floorNos: FLOORS,
    });
    expect(rectCentre(layout.rect)).toEqual([6, -4]);
  });

  it("still clamps an origin-relative offset back onto the plate it was handed", () => {
    // 200 m east of a 60 m plate: honouring the frame must never mean escaping
    // the floor. The clamp keeps the 1.5 m ring on the plate that was passed.
    const spec = specWithOffset(baseSpec, 200_000, 0);
    const layout = generateCore({ spec, plate, offsetOrigin: [0, 0], floorNos: FLOORS });
    expect(layout.rect.maxX).toBeCloseTo(plate.maxX - 1.5, 9);
    expect(layout.rect.minX).toBeCloseTo(plate.maxX - 1.5 - CORE_W_M, 9);
  });
});
