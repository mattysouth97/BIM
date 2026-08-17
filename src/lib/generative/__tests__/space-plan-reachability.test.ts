// src/lib/generative/__tests__/space-plan-reachability.test.ts
//
// REGRESSION: the space solver must not drop the one strip of floor that joins
// the core to a wing.
//
// The defect this file pins down lived in `generate/space-plan.ts`'s emit step.
// On a plate with voids, `solveFloorPlan` decomposes each guillotine band into
// independent SOLID CELLS around the holes and lays each one out on its own. The
// cell that happens to adjoin the core is frequently a thin one — a void's inner
// edge stops a few metres short of the core face — and a thin cell loses the
// greedy area/aspect competition in `chooseStrip` to its better-proportioned
// neighbours. It therefore took no rooms, and the old `keptCorridors` filter
// dropped any corridor whose own strip had received zero placements.
//
// Nothing about that filter is wrong on a rectangle. On a plate with voids it
// deleted the ONLY door-graph route from the lift lobby to entire wings:
// `generate/circulation.ts` seeds reachability from circulation that touches the
// core and walks doors from there, so with the connector gone every corridor and
// every room beyond the void became an island and `validate/rules.ts` reported a
// critical SPACE_NOT_ACCESSIBLE per space — on geometry that is perfectly
// buildable. `acceptance-multi-courtyard.test.ts`'s header documents the fixture
// gymnastics that were needed to dodge it (a 26 m clearance between each void
// and the core) before it was fixed.
//
// The fixture below is the minimal shape that triggers it: a 100 × 60 m plate
// with two 32 × 40 m courtyards, each stopping 10 m short of the plate's centre
// line, which leaves a 4 m connector strip between the void and each core face.
// Everything is pinned — plate, core, corridor width, structural grid — so the
// geometry under test cannot drift with the heuristic provider's judgement.
//
// Deterministic path only: no provider call for anything but the base program,
// no network, fixed seed.

import { describe, expect, it } from "vitest";

import { generateBuildingFromSpec } from "../generate/pipeline";
import { rectsOverlap, type PlacedSpace, type Rect } from "../generate/types";
import { clipRectToPolygon } from "../geom";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";
import { validateBuilding } from "../validate/rules";

const PROMPT = "Create a three-storey office building.";

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

const PLATE_HALF_W_MM = 50_000;
const PLATE_HALF_D_MM = 30_000;
/** Each void's inner edge, i.e. how far the courtyards stop short of centre. */
const VOID_INNER_X_MM = 10_000;
const VOID_OUTER_X_MM = 42_000;
const VOID_HALF_D_MM = 20_000;

const CORE_HALF_W_M = 6;
const CORE_HALF_D_M = 4;

/** The connector: solid floor between a void's inner edge and the core face. */
const CONNECTOR_MIN_X_M = VOID_INNER_X_MM / -1000;
const CONNECTOR_MAX_X_M = -CORE_HALF_W_M;
const CONNECTOR_WIDTH_M = CONNECTOR_MAX_X_M - CONNECTOR_MIN_X_M;

const VOID_RECTS: Rect[] = [
  {
    minX: -VOID_OUTER_X_MM / 1000,
    maxX: -VOID_INNER_X_MM / 1000,
    minZ: -VOID_HALF_D_MM / 1000,
    maxZ: VOID_HALF_D_MM / 1000,
  },
  {
    minX: VOID_INNER_X_MM / 1000,
    maxX: VOID_OUTER_X_MM / 1000,
    minZ: -VOID_HALF_D_MM / 1000,
    maxZ: VOID_HALF_D_MM / 1000,
  },
];

/** Outer ring counter-clockwise, both holes clockwise — massing normalises anyway. */
function twoCourtyardPolygonMm(): [number, number][][] {
  return [
    [
      [-PLATE_HALF_W_MM, -PLATE_HALF_D_MM],
      [PLATE_HALF_W_MM, -PLATE_HALF_D_MM],
      [PLATE_HALF_W_MM, PLATE_HALF_D_MM],
      [-PLATE_HALF_W_MM, PLATE_HALF_D_MM],
    ],
    [
      [-VOID_OUTER_X_MM, -VOID_HALF_D_MM],
      [-VOID_OUTER_X_MM, VOID_HALF_D_MM],
      [-VOID_INNER_X_MM, VOID_HALF_D_MM],
      [-VOID_INNER_X_MM, -VOID_HALF_D_MM],
    ],
    [
      [VOID_INNER_X_MM, -VOID_HALF_D_MM],
      [VOID_INNER_X_MM, VOID_HALF_D_MM],
      [VOID_OUTER_X_MM, VOID_HALF_D_MM],
      [VOID_OUTER_X_MM, -VOID_HALF_D_MM],
    ],
  ];
}

/**
 * The base program comes from the heuristic provider — writing ten ProgramItems
 * by hand would only re-state `spec/defaults.ts` — but every dimension the
 * decomposition depends on is overwritten here, so this fixture keeps its shape
 * whatever the provider decides next.
 */
async function twoCourtyardSpec(): Promise<BuildingSpec> {
  const { data } = await new HeuristicReasoningProvider().generateBuilding({
    prompt: PROMPT,
    seed: seedFromPrompt(PROMPT),
  });

  return {
    ...data,
    massing: {
      ...data.massing,
      strategy: { ...data.massing.strategy, value: "custom" },
      widthMm: { ...data.massing.widthMm, value: 2 * PLATE_HALF_W_MM },
      depthMm: { ...data.massing.depthMm, value: 2 * PLATE_HALF_D_MM },
      parameters: {},
      customPlates: {
        value: [
          {
            floorNos: data.levels.map((level) => level.floorNo),
            polygonMm: twoCourtyardPolygonMm(),
          },
        ],
        source: "USER_PROVIDED",
        confidence: 1,
        reason: "Fixture geometry drawn by the test.",
      },
    },
    core: {
      ...data.core,
      strategy: { ...data.core.strategy, value: "central" },
      widthMm: { ...data.core.widthMm, value: 2 * CORE_HALF_W_M * 1000 },
      depthMm: { ...data.core.depthMm, value: 2 * CORE_HALF_D_M * 1000 },
      offsetXMm: 0,
      offsetZMm: 0,
    },
    dimensions: {
      ...data.dimensions,
      corridorWidthMm: { ...data.dimensions.corridorWidthMm, value: 1_800 },
    },
    structure: {
      ...data.structure,
      gridXMm: { ...data.structure.gridXMm, value: 8_400 },
      gridZMm: { ...data.structure.gridZMm, value: 8_400 },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const TOL_M = 1e-6;

/** Sides of the plate, as the mirror pair the fixture is built from. */
const SIDES = [
  { name: "west", sign: -1 },
  { name: "east", sign: 1 },
] as const;

/** Does this space cover the whole connector strip on `sign`'s side? */
function spansConnector(space: PlacedSpace, sign: -1 | 1): boolean {
  const minX = sign === -1 ? CONNECTOR_MIN_X_M : -CONNECTOR_MAX_X_M;
  const maxX = sign === -1 ? CONNECTOR_MAX_X_M : -CONNECTOR_MIN_X_M;
  return (
    space.rect.minX <= minX + 1e-3 &&
    space.rect.maxX >= maxX - 1e-3 &&
    // Any real strip of it — the connector runs the full plate depth, but a
    // partial run would still be a route.
    space.rect.maxZ - space.rect.minZ > 1
  );
}

/**
 * Spaces past the connector on `sign`'s side — the wing whose only route to the
 * core runs through it. "Past" is measured at the void's INNER edge, because
 * everything beyond that line is either the courtyard's flank or the far wing,
 * and both are shut off the moment the connector goes.
 */
function wingSpaces(spaces: PlacedSpace[], sign: -1 | 1): PlacedSpace[] {
  const innerX = (sign * VOID_INNER_X_MM) / 1000;
  return spaces.filter((space) =>
    sign === -1 ? space.rect.maxX <= innerX + 1e-3 : space.rect.minX >= innerX - 1e-3,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("solveFloorPlan keeps the circulation a wing depends on", () => {
  it("is the fixture the bug needs: two interior voids and a central core", async () => {
    const spec = await twoCourtyardSpec();
    const building = generateBuildingFromSpec(spec);

    // The core really is central — an off-centre core is a different failure
    // (pipeline.ts sites it on the largest inscribed solid rect) and would make
    // everything below prove nothing.
    expect(building.core.rect.minX).toBeCloseTo(-CORE_HALF_W_M, 6);
    expect(building.core.rect.maxX).toBeCloseTo(CORE_HALF_W_M, 6);
    expect(building.core.rect.minZ).toBeCloseTo(-CORE_HALF_D_M, 6);
    expect(building.core.rect.maxZ).toBeCloseTo(CORE_HALF_D_M, 6);

    // Both courtyards survive as real holes, and the connector is genuinely
    // thin — 4 m, less than one structural bay.
    for (const level of building.levels) expect(level.polygon).toHaveLength(3);
    expect(CONNECTOR_WIDTH_M).toBeCloseTo(4, 9);

    // And there is a wing beyond the void to strand, on more than one level.
    const withWings = building.levels.filter((level) =>
      SIDES.some(
        (side) =>
          wingSpaces(
            building.spaces.filter((s) => s.floorNo === level.floorNo),
            side.sign,
          ).length > 0,
      ),
    );
    expect(withWings.length).toBeGreaterThan(1);
  });

  it("reports no SPACE_NOT_ACCESSIBLE anywhere on the plate", async () => {
    const spec = await twoCourtyardSpec();
    const building = generateBuildingFromSpec(spec);
    const report = validateBuilding(building, spec);

    const orphaned = report.violations.filter((v) => v.code === "SPACE_NOT_ACCESSIBLE");
    expect(
      orphaned.map((v) => v.message),
      "a wing lost its route to the core",
    ).toEqual([]);

    // The same statement from the other end: every space the solver placed is
    // reachable, and none of them is reachable by accident of being alone.
    expect(building.spaces.length).toBeGreaterThan(10);
    for (const space of building.spaces) {
      expect(space.reachable, `${space.id} (${space.label}) is an island`).toBe(true);
    }
    expect(report.violations.filter((v) => v.severity === "critical")).toEqual([]);
  });

  it("reinstates the connector at full cell width, not as a corridor slice", async () => {
    const building = generateBuildingFromSpec(await twoCourtyardSpec());

    // The connector cell takes no rooms, so the whole 4 m of it is walk-through
    // floor. Emitting only the 1.8 m corridor would leave the rest as a gap the
    // door graph cannot cross, and the wing would still be stranded.
    const connectors = building.spaces.filter((space) =>
      SIDES.some((side) => spansConnector(space, side.sign)),
    );
    expect(connectors.length).toBeGreaterThan(0);
    for (const connector of connectors) {
      expect(connector.isCirculation, `${connector.id} is not circulation`).toBe(true);
      expect(connector.rect.maxX - connector.rect.minX).toBeCloseTo(CONNECTOR_WIDTH_M, 6);
    }
  });

  it("reinstates a connector only where a wing actually needs one", async () => {
    const building = generateBuildingFromSpec(await twoCourtyardSpec());

    // The repair is driven by connectivity, not by "keep everything". A level
    // that planned nothing beyond a void gets no connector on that side, so the
    // plan is not quietly padded with circulation nobody walks.
    let unusedSides = 0;
    for (const level of building.levels) {
      const spaces = building.spaces.filter((s) => s.floorNo === level.floorNo);
      if (spaces.length === 0) continue;

      for (const side of SIDES) {
        const needed = wingSpaces(spaces, side.sign).length > 0;
        const present = spaces.some((space) => spansConnector(space, side.sign));
        expect(present, `L${level.floorNo} ${side.name}: connector present=${present}, wing=${needed}`).toBe(
          needed,
        );
        if (!needed) unusedSides += 1;
      }
    }
    // If every side of every level had a wing this test would be vacuous.
    expect(unusedSides).toBeGreaterThan(0);
  });

  it("adds no overlap and puts nothing in a void", async () => {
    const building = generateBuildingFromSpec(await twoCourtyardSpec());
    const plateByFloor = new Map(building.levels.map((l) => [l.floorNo, l.polygon]));

    for (const space of building.spaces) {
      expect(
        clipRectToPolygon(space.rect, plateByFloor.get(space.floorNo)!, TOL_M),
        `${space.id} escapes the plate`,
      ).toBe(true);
      for (const rect of VOID_RECTS) {
        expect(rectsOverlap(space.rect, rect, TOL_M), `${space.id} is in a courtyard`).toBe(
          false,
        );
      }
      expect(rectsOverlap(space.rect, building.core.rect, TOL_M)).toBe(false);
    }

    for (const level of building.levels) {
      const spaces = building.spaces.filter((s) => s.floorNo === level.floorNo);
      for (let i = 0; i < spaces.length; i += 1) {
        for (let j = i + 1; j < spaces.length; j += 1) {
          expect(
            rectsOverlap(spaces[i].rect, spaces[j].rect, 1e-3),
            `L${level.floorNo}: ${spaces[i].id} overlaps ${spaces[j].id}`,
          ).toBe(false);
        }
      }
    }
  });

  it("solves the repaired plate identically every time", async () => {
    const spec = await twoCourtyardSpec();
    expect(JSON.stringify(generateBuildingFromSpec(spec).spaces)).toEqual(
      JSON.stringify(generateBuildingFromSpec(spec).spaces),
    );
  });
});
