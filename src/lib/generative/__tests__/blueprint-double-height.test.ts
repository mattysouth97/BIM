// src/lib/generative/__tests__/blueprint-double-height.test.ts
//
// The `double-height` vertical rule, end to end.
//
//   BlueprintSpec (verticalRules) → compileBlueprintToSpec → BuildingSpec
//                                 → generateBuildingFromSpec → GeneratedBuilding
//                                 → validateBuilding        → ValidationReport
//
// A double-height space IS an opening in the slab above it, so the compiler
// implements the rule by synthesising a void on the level(s) above the target
// and pushing it through the SAME subtraction a drawn courtyard takes. That is
// what these tests assert — not that a flag was copied somewhere, but that the
// plate above actually loses the target's footprint, that the plate two levels
// up does not, that the resulting building still validates, and that the space
// solver keeps every room off the hole.
//
// FIXTURE GEOMETRY — AND WHY THE HALL SITS INSIDE ONE STRUCTURAL BAY
// -----------------------------------------------------------------
// The plate, the core and the seed come from `acceptance-multi-courtyard.test.ts`
// (100 × 60 m, a 12 × 10 m core at the plate centre): a plan already proven to
// solve cleanly, so a failure here is about the double-height rule and not about
// the fixture. The HALL, though, is a 6.8 × 6.8 m volume placed strictly between
// four grid lines, which needs saying out loud:
//
// `generate/structure.ts` culls any column whose grid intersection is not on the
// level's plate material (`carriesFloor` → `isInsidePolygon`). That is exactly
// right for a courtyard — nobody stands a column in open air — and it is the
// behaviour `acceptance-multi-courtyard.test.ts` pins. But a double-height
// interior volume is NOT open air: its columns run through it, exposed. The
// engine cannot tell the two apart, because both arrive as a hole in
// `LevelPlate.polygon`, so a double-height opening drawn ACROSS a column line
// deletes that column on the opened level and `validateBuilding` then reports
// UNSUPPORTED_COLUMN for the column standing on it one level up — correctly, on
// the geometry it was given. Fixing that means teaching structure generation the
// difference between an interior slab opening and an open-air void, which is a
// change in `generate/`, not in the blueprint compiler.
//
// So the hall here does what a real double-height volume in a framed building
// does: it lives inside a bay. Office bays are 8.4 m (`spec/defaults.ts`), the
// plate is centred on the origin, so the X lines fall at ±4.2 + 8.4k and the Z
// lines likewise; the hall's 6.8 m extents leave 0.8 m clear of the lines on
// every side. No column is culled, no column is orphaned, and the test measures
// the rule rather than a known gap somewhere else.
//
// Deterministic path only: no provider, no network, fixed seed.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addCore,
  addZone,
  blueprintDoubleHeightVoids,
  compileBlueprintToSpec,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
  type VerticalRule,
} from "../blueprint";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { ringArea, type Polygon } from "../generate/massing";
import { rectsOverlap, type Rect } from "../generate/types";
import { pointInPolygon } from "../geom";
import { validateBuilding } from "../validate/rules";
import type { BuildingSpec, CustomPlate } from "../spec/building-spec";

const SEED = 4_411;
const FLOORS = [1, 2, 3];

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

const OUTER_WIDTH_MM = 100_000;
const OUTER_DEPTH_MM = 60_000;

/** 6.8 m square: one 8.4 m bay less 0.8 m clear of the column line each side. */
const HALL_WIDTH_MM = 6_800;
const HALL_DEPTH_MM = 6_800;
const HALL_AREA_SQM = (HALL_WIDTH_MM / 1000) * (HALL_DEPTH_MM / 1000);

const OUTER_AREA_SQM = (OUTER_WIDTH_MM / 1000) * (OUTER_DEPTH_MM / 1000);

/**
 * Centre of the hall in the blueprint's OWN drawing coordinates. The engine
 * frame puts (50 000, 30 000) mm on the origin, so this lands the hall at
 * (−33.6, −8.4) m — the centre of the bay bounded by the X lines at −37.8 and
 * −29.4 m and the Z lines at −12.6 and −4.2 m, 0.8 m clear of each. See the
 * file head for why that matters.
 */
const HALL_CENTRE_MM = { xMm: 16_400, zMm: 21_600 };

/**
 * The same hall in the ENGINE's frame (metres): the compiler centres the
 * largest plate's bounding box on the origin, so the shift is half the plate.
 */
const SHIFT_X_M = -OUTER_WIDTH_MM / 2000;
const SHIFT_Z_M = -OUTER_DEPTH_MM / 2000;
const HALL_RECT: Rect = {
  minX: HALL_CENTRE_MM.xMm / 1000 + SHIFT_X_M - HALL_WIDTH_MM / 2000,
  maxX: HALL_CENTRE_MM.xMm / 1000 + SHIFT_X_M + HALL_WIDTH_MM / 2000,
  minZ: HALL_CENTRE_MM.zMm / 1000 + SHIFT_Z_M - HALL_DEPTH_MM / 2000,
  maxZ: HALL_CENTRE_MM.zMm / 1000 + SHIFT_Z_M + HALL_DEPTH_MM / 2000,
};
const HALL_CENTRE_M: [number, number] = [
  (HALL_RECT.minX + HALL_RECT.maxX) / 2,
  (HALL_RECT.minZ + HALL_RECT.maxZ) / 2,
];

/**
 * A three-storey office plate with one full-depth hall on the level named by
 * `hallFloorNo`, a central core and enough programmed office area to give the
 * solver real work. `verticalRules` is set by the caller, because that is the
 * single variable every test in this file changes.
 */
function hallBlueprint(input: {
  hallFloorNo: number;
  verticalRules?: VerticalRule[];
  source?: BlueprintSpec["source"];
}): BlueprintSpec {
  let blueprint = emptyBlueprint("Double Height Hall");
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("outline", {
      xMm: 0,
      zMm: 0,
      widthMm: OUTER_WIDTH_MM,
      depthMm: OUTER_DEPTH_MM,
    }),
    floorNos: FLOORS,
  });
  blueprint = addZone(blueprint, {
    id: "entrance-hall",
    program: "lobby",
    label: "Entrance hall",
    region: {
      kind: "rect",
      originMm: HALL_CENTRE_MM,
      widthMm: HALL_WIDTH_MM,
      depthMm: HALL_DEPTH_MM,
      rotationRad: 0,
    },
    floorNos: [input.hallFloorNo],
  });
  blueprint = addCore(blueprint, {
    id: "centre-core",
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
  for (let i = 0; i < 8; i += 1) {
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
  return {
    ...blueprint,
    ...(input.source ? { source: input.source } : {}),
    verticalRules: input.verticalRules ?? [],
  };
}

const doubleHeightRule = (input: {
  id?: string;
  targetId?: string;
  floorNo: number;
  heightMultiplier: number;
}): VerticalRule => ({
  kind: "double-height",
  id: input.id ?? "hall-volume",
  targetId: input.targetId ?? "entrance-hall",
  floorNo: input.floorNo,
  heightMultiplier: input.heightMultiplier,
});

/* ------------------------------------------------------------------ */
/* Readers                                                             */
/* ------------------------------------------------------------------ */

const plateFor = (spec: BuildingSpec, floorNo: number): CustomPlate => {
  const plate = (spec.massing.customPlates?.value ?? []).find((entry) =>
    entry.floorNos.includes(floorNo),
  );
  expect(plate, `no custom plate compiled for level ${floorNo}`).toBeDefined();
  return plate!;
};

/** Hole areas of an `[outer, ...holes]` polygon, in whatever units it carries. */
const holeAreasOf = (polygon: Polygon): number[] =>
  polygon.slice(1).map((ring) => ringArea(ring));

const assumptionIds = (spec: BuildingSpec): string[] =>
  spec.assumptions.map((entry) => entry.id);

/* ------------------------------------------------------------------ */
/* (a) the rule opens the slab above, and only that slab               */
/* ------------------------------------------------------------------ */

describe("a double-height lobby opens the slab above it", () => {
  const blueprint = hallBlueprint({
    hallFloorNo: 1,
    verticalRules: [doubleHeightRule({ floorNo: 1, heightMultiplier: 2 })],
  });
  const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
  const building = generateBuildingFromSpec(spec);
  const validation = validateBuilding(building, spec);

  const levelOf = (floorNo: number) =>
    building.levels.find((level) => level.floorNo === floorNo)!;

  it("derives one void, named after the rule, on the level above the hall", () => {
    const derived = blueprintDoubleHeightVoids(blueprint);
    expect(derived.unresolved).toEqual([]);
    expect(derived.short).toEqual([]);
    expect(derived.voids).toHaveLength(1);
    // Provenance: the opening can be traced back to the rule that caused it.
    expect(derived.voids[0].id).toBe("dh-hall-volume");
    expect(derived.voids[0].floorNos).toEqual([2]);
    expect(derived.voids[0].kind.source).toBe("DERIVED");
    expect(derived.applied).toEqual([
      { ruleId: "hall-volume", targetId: "entrance-hall", floorNos: [2] },
    ]);
  });

  it("compiles a level-2 plate with a hole over the hall and level 1/3 plates without", () => {
    const above = plateFor(spec, 2);
    expect(above.polygonMm).toHaveLength(2);
    expect(above.floorNos).toEqual([2]);

    // The hall's own level and the level above the opening keep a solid slab.
    const below = plateFor(spec, 1);
    expect(below.polygonMm).toHaveLength(1);
    const top = plateFor(spec, 3);
    expect(top.polygonMm).toHaveLength(1);
    // 1 and 3 share one outline, so the compiler files them as one entry.
    expect(below).toBe(top);
    expect(below.floorNos).toEqual([1, 3]);
  });

  it("carries the hole into the generated level 2 plate at the hall's true size", () => {
    expect(building.levels).toHaveLength(FLOORS.length);

    const holes = holeAreasOf(levelOf(2).polygon);
    expect(holes).toHaveLength(1);
    expect(holes[0]).toBeCloseTo(HALL_AREA_SQM, 2);
    expect(levelOf(2).plateAreaSqm).toBeCloseTo(OUTER_AREA_SQM - HALL_AREA_SQM, 2);

    for (const floorNo of [1, 3]) {
      expect(levelOf(floorNo).polygon).toHaveLength(1);
      expect(levelOf(floorNo).plateAreaSqm).toBeCloseTo(OUTER_AREA_SQM, 2);
    }

    // The same point is floor on 1 and 3, and open air on 2.
    expect(pointInPolygon(HALL_CENTRE_M, levelOf(1).polygon, 1e-6)).toBe(true);
    expect(pointInPolygon(HALL_CENTRE_M, levelOf(2).polygon, 1e-6)).toBe(false);
    expect(pointInPolygon(HALL_CENTRE_M, levelOf(3).polygon, 1e-6)).toBe(true);
  });

  it("places no space inside the level-2 opening", () => {
    expect(building.spaces.length).toBeGreaterThan(0);
    const onLevel2 = building.spaces.filter((space) => space.floorNo === 2);
    expect(onLevel2.length).toBeGreaterThan(0);

    for (const space of onLevel2) {
      expect(
        rectsOverlap(space.rect, HALL_RECT, 1e-6),
        `${space.id} (${space.label}) stands in the double-height void on level 2`,
      ).toBe(false);
    }

    // No column may stand in the opening either — the structure reads the same
    // plate polygon, so a hole the massing forgot would show up right here.
    for (const column of building.columns.filter((c) => c.floorNo === 2)) {
      expect(
        pointInPolygon([column.x, column.z], levelOf(2).polygon, 1e-6),
        `column ${column.id} stands in the double-height void`,
      ).toBe(true);
    }
  });

  it("still validates with no critical violations", () => {
    const critical = validation.violations.filter((v) => v.severity === "critical");
    expect(critical).toEqual([]);
    expect(validation.geometricallyValid).toBe(true);
  });

  it("files no failure assumption, because nothing was approximated", () => {
    expect(assumptionIds(spec)).not.toContain("double-height-extent");
    expect(assumptionIds(spec)).not.toContain("double-height-target");
    // The user drew the rule in the native editor, so the successful case is
    // USER_PROVIDED and `note()` files nothing — the same contract the core and
    // the entrance follow.
    expect(assumptionIds(spec)).not.toContain("double-height");
  });

  it("does file the assumption when the rule was READ off a drawing", () => {
    const traced = hallBlueprint({
      hallFloorNo: 1,
      verticalRules: [doubleHeightRule({ floorNo: 1, heightMultiplier: 2 })],
      source: "traced",
    });
    const compiled = compileBlueprintToSpec(traced, { seed: SEED });
    const entry = compiled.spec.assumptions.find((a) => a.id === "double-height");
    expect(entry).toBeDefined();
    expect(entry!.source).not.toBe("USER_PROVIDED");
    expect(entry!.statement).toContain("2");

    // Provenance changed; geometry did not.
    expect(plateFor(compiled.spec, 2).polygonMm).toEqual(plateFor(spec, 2).polygonMm);
  });
});

/* ------------------------------------------------------------------ */
/* Vertical extent: a triple-height space opens TWO slabs              */
/* ------------------------------------------------------------------ */

describe("the rule's height multiplier decides how many slabs open", () => {
  const blueprint = hallBlueprint({
    hallFloorNo: 1,
    verticalRules: [doubleHeightRule({ floorNo: 1, heightMultiplier: 3 })],
  });
  const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });

  it("opens both levels above a triple-height hall", () => {
    const derived = blueprintDoubleHeightVoids(blueprint);
    expect(derived.voids).toHaveLength(1);
    expect(derived.voids[0].floorNos).toEqual([2, 3]);
    expect(derived.short).toEqual([]);
  });

  it("compiles level 1 solid and levels 2 and 3 holed", () => {
    expect(plateFor(spec, 1).polygonMm).toHaveLength(1);
    for (const floorNo of [2, 3]) {
      const plate = plateFor(spec, floorNo);
      expect(plate.polygonMm).toHaveLength(2);
    }
    // 2 and 3 share one holed outline.
    expect(plateFor(spec, 2)).toBe(plateFor(spec, 3));
    expect(plateFor(spec, 2).floorNos).toEqual([2, 3]);
  });

  it("keeps a 1.5× space to one opening — a slab still cannot run through it", () => {
    const oneAndAHalf = hallBlueprint({
      hallFloorNo: 1,
      verticalRules: [doubleHeightRule({ floorNo: 1, heightMultiplier: 1.5 })],
    });
    const derived = blueprintDoubleHeightVoids(oneAndAHalf);
    expect(derived.voids).toHaveLength(1);
    expect(derived.voids[0].floorNos).toEqual([2]);
  });
});

/* ------------------------------------------------------------------ */
/* (b) top floor: nothing above to open                                */
/* ------------------------------------------------------------------ */

describe("a double-height rule on the topmost level", () => {
  const blueprint = hallBlueprint({
    hallFloorNo: 3,
    verticalRules: [doubleHeightRule({ floorNo: 3, heightMultiplier: 2 })],
  });
  const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });

  it("opens nothing, because there is no slab above the roof level", () => {
    const derived = blueprintDoubleHeightVoids(blueprint);
    expect(derived.voids).toEqual([]);
    expect(derived.applied).toEqual([]);
    expect(derived.short).toEqual([
      { ruleId: "hall-volume", targetId: "entrance-hall", opened: 0, wanted: 1 },
    ]);
  });

  it("leaves every plate solid rather than inventing a level to cut", () => {
    const plates = spec.massing.customPlates?.value ?? [];
    expect(plates).toHaveLength(1);
    expect(plates[0].floorNos).toEqual(FLOORS);
    expect(plates[0].polygonMm).toHaveLength(1);
    expect(spec.levels).toHaveLength(FLOORS.length);
  });

  it("records the approximation instead of failing", () => {
    const entry = spec.assumptions.find((a) => a.id === "double-height-extent");
    expect(entry).toBeDefined();
    expect(entry!.source).toBe("INFERRED");
    expect(entry!.statement).toContain("not modelled");
    // The statement names the rule, so the Assumptions panel can select it.
    expect(entry!.statement).toContain("hall-volume");
    // Nothing claims an opening was made.
    expect(assumptionIds(spec)).not.toContain("double-height");
  });
});

/* ------------------------------------------------------------------ */
/* An unresolvable target is reported, never dropped                   */
/* ------------------------------------------------------------------ */

describe("a double-height rule whose target has no footprint", () => {
  // An anchor is a POINT: a legal blueprint id (so `validate-blueprint` is
  // happy) that no region can be read from.
  const blueprint = ((): BlueprintSpec => {
    const base = hallBlueprint({ hallFloorNo: 1 });
    return {
      ...base,
      anchors: [
        {
          id: "hall-anchor",
          kind: {
            value: "atrium",
            source: "USER_PROVIDED",
            confidence: 1,
            reason: "Drawn by the user in the schematic editor.",
          },
          positionMm: HALL_CENTRE_MM,
          hold: { mode: "hard" },
          floorNos: [],
        },
      ],
      verticalRules: [
        doubleHeightRule({ targetId: "hall-anchor", floorNo: 1, heightMultiplier: 2 }),
      ],
    };
  })();
  const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });

  it("resolves to no void at all", () => {
    const derived = blueprintDoubleHeightVoids(blueprint);
    expect(derived.voids).toEqual([]);
    expect(derived.applied).toEqual([]);
    expect(derived.unresolved).toEqual([
      { ruleId: "hall-volume", targetId: "hall-anchor" },
    ]);
    expect(plateFor(spec, 2).polygonMm).toHaveLength(1);
  });

  it("says so in the assumptions rather than swallowing the instruction", () => {
    const entry = spec.assumptions.find((a) => a.id === "double-height-target");
    expect(entry).toBeDefined();
    expect(entry!.statement).toContain("hall-anchor");
    expect(entry!.statement).toContain("hall-volume");
    // Lowest confidence in the spec: this is a failure wearing an assumption's
    // clothes, and the panel sorts it to the top.
    expect(entry!.confidence).toBeLessThan(0.5);
  });
});

/* ------------------------------------------------------------------ */
/* (c) regression guard: the new path is inert without a rule          */
/* ------------------------------------------------------------------ */

describe("REGRESSION: a blueprint with no double-height rule compiles unchanged", () => {
  const plain = hallBlueprint({ hallFloorNo: 1 });

  // Vertical rules of the OTHER kinds, which nothing in `compile.ts` consumes.
  // If the double-height derivation ever leaked into the general vertical-rule
  // path, this pair would stop matching. Stating it this way — rather than
  // against a snapshot of a git revision — is the only form of "byte-identical
  // to before" a test can actually keep honest over time; the existing
  // `blueprint-compile*.test.ts` files pin the absolute values.
  const withOtherRules: BlueprintSpec = {
    ...plain,
    verticalRules: [
      {
        kind: "setback",
        id: "upper-setback",
        floorNo: 3,
        edge: { loopId: "outline", segmentIndex: 0 },
        distanceMm: 3_000,
      },
      {
        kind: "podium-tower",
        id: "stack",
        podiumLoopId: "outline",
        podiumFloorNos: [1],
        towerLoopId: "outline",
        towerFloorNos: [2, 3],
      },
    ],
  };

  const compiled = compileBlueprintToSpec(plain, { seed: SEED });
  const compiledWithRules = compileBlueprintToSpec(withOtherRules, { seed: SEED });

  it("derives nothing at all", () => {
    for (const blueprint of [plain, withOtherRules]) {
      const derived = blueprintDoubleHeightVoids(blueprint);
      expect(derived).toEqual({ voids: [], applied: [], short: [], unresolved: [] });
    }
  });

  it("compiles byte-identical specs with and without the other vertical rules", () => {
    expect(JSON.stringify(compiledWithRules.spec)).toBe(JSON.stringify(compiled.spec));
    expect(compiledWithRules.locks).toEqual(compiled.locks);
  });

  it("leaves every plate exactly the drawn rectangle, and files no note", () => {
    const plates = compiled.spec.massing.customPlates?.value ?? [];
    expect(plates).toHaveLength(1);
    expect(plates[0].floorNos).toEqual(FLOORS);
    // The boundary, centred: no hole, no extra vertex, no rounding drift.
    expect(plates[0].polygonMm).toEqual([
      [
        [-OUTER_WIDTH_MM / 2, -OUTER_DEPTH_MM / 2],
        [OUTER_WIDTH_MM / 2, -OUTER_DEPTH_MM / 2],
        [OUTER_WIDTH_MM / 2, OUTER_DEPTH_MM / 2],
        [-OUTER_WIDTH_MM / 2, OUTER_DEPTH_MM / 2],
      ],
    ]);

    for (const id of assumptionIds(compiled.spec)) {
      expect(id.startsWith("double-height")).toBe(false);
    }
  });
});
