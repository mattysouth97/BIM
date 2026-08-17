// The space solver on plates that are not rectangles.
//
// The failure this file exists to prevent: the solver used to be handed a level's
// BOUNDING BOX, so an L-shaped building packed rooms into the quadrant that was
// never built, and no rule anywhere caught it. Every assertion below is against
// `level.polygon` — the real outline, holes included — not against its box.

import { describe, expect, it } from "vitest";

import { generateBuildingFromSpec } from "../generate/pipeline";
import type { Polygon } from "../generate/massing";
import { solveFloorPlan } from "../generate/space-plan";
import {
  rectArea,
  rectDepth,
  rectWidth,
  rectsOverlap,
  type CoreLayout,
  type GeneratedBuilding,
  type PlacedSpace,
  type Rect,
} from "../generate/types";
import {
  clipRectToPolygon,
  polygonBounds,
  polygonDifference,
  rectPolygonOverlap,
  rectToPolygon,
  type MultiPolygon,
} from "../geom";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { createRng, seedFromPrompt } from "../rng";
import { validateBuilding } from "../validate/rules";
import type { BuildingSpec, MassingStrategy } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

/** The acceptance tolerance for "inside the plate", metres. */
const FIT_TOL_M = 1e-6;
/** space-plan.ts's MIN_ROOM_DIM_M — no room may be thinner than this. */
const MIN_ROOM_DIM_M = 2.0;

const PROMPT = "Create a five-storey office building.";

async function baseSpec(): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt: PROMPT,
    seed: seedFromPrompt(PROMPT),
  });
  return data;
}

interface ShapeCase {
  name: string;
  strategy: MassingStrategy;
  parameters: BuildingSpec["massing"]["parameters"];
}

/**
 * One case per outline family the massing library can emit. Parameters are
 * chosen generously on purpose: the point is to prove the solver respects a
 * notch or a void, not to see how thin a wing it can survive.
 */
const SHAPES: ShapeCase[] = [
  { name: "rectangle", strategy: "rectangle", parameters: {} },
  { name: "l-shape", strategy: "l-shape", parameters: { wingDepthMm: 16_000 } },
  { name: "u-shape", strategy: "u-shape", parameters: { wingDepthMm: 12_000 } },
  { name: "cross", strategy: "cross", parameters: { wingDepthMm: 18_000 } },
  {
    name: "courtyard",
    strategy: "courtyard",
    parameters: { voidWidthMm: 12_000, voidDepthMm: 9_000 },
  },
  {
    name: "atrium",
    strategy: "atrium",
    parameters: { voidWidthMm: 10_000, voidDepthMm: 8_000 },
  },
];

function withShape(spec: BuildingSpec, shape: ShapeCase): BuildingSpec {
  return {
    ...spec,
    massing: {
      ...spec.massing,
      strategy: { ...spec.massing.strategy, value: shape.strategy },
      parameters: shape.parameters,
    },
  };
}

/** Everything of the bounding box that is NOT floor: notches and voids. */
function offPlateRegions(polygon: Polygon): MultiPolygon {
  const bounds = polygonBounds(polygon);
  if (bounds === null) return [];
  return polygonDifference(rectToPolygon(bounds), polygon);
}

function planningLevels(building: GeneratedBuilding) {
  const floorsWithSpaces = new Set(building.spaces.map((s) => s.floorNo));
  return building.levels.filter((level) => floorsWithSpaces.has(level.floorNo));
}

describe("solveFloorPlan on non-rectangular plates", () => {
  it("keeps every space wholly inside the real plate outline", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const spec = withShape(base, shape);
      const building = generateBuildingFromSpec(spec);
      const levels = planningLevels(building);
      expect(levels.length, `${shape.name} planned no level at all`).toBeGreaterThan(0);

      for (const level of levels) {
        const spaces = building.spaces.filter((s) => s.floorNo === level.floorNo);
        expect(spaces.length, `${shape.name} L${level.floorNo} is empty`).toBeGreaterThan(0);

        for (const space of spaces) {
          expect(
            clipRectToPolygon(space.rect, level.polygon, FIT_TOL_M),
            `${shape.name} L${level.floorNo}: ${space.id} (${space.label}) escapes the plate`,
          ).toBe(true);
        }
      }
    }
  });

  it("puts nothing in a notch or a void", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const spec = withShape(base, shape);
      const building = generateBuildingFromSpec(spec);

      for (const level of planningLevels(building)) {
        const offPlate = offPlateRegions(level.polygon);
        if (shape.name !== "rectangle") {
          expect(offPlate.length, `${shape.name} has no notch to test`).toBeGreaterThan(0);
        }

        for (const space of building.spaces.filter((s) => s.floorNo === level.floorNo)) {
          for (const region of offPlate) {
            expect(
              rectPolygonOverlap(space.rect, region, FIT_TOL_M),
              `${shape.name} L${level.floorNo}: ${space.id} reaches into the void`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("still places the declared program on every shape", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const spec = withShape(base, shape);
      const building = generateBuildingFromSpec(spec);

      for (const level of planningLevels(building)) {
        const wanted = spec.program
          .filter((item) => item.levels.includes(level.floorNo))
          .map((item) => item.id);
        const placed = new Set(
          building.spaces
            .filter((s) => s.floorNo === level.floorNo)
            .map((s) => s.programId),
        );
        for (const id of wanted) {
          expect(
            placed.has(id),
            `${shape.name} L${level.floorNo}: program "${id}" was dropped`,
          ).toBe(true);
        }
      }
    }
  });

  it("never trades plate-correctness for a sliver", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const building = generateBuildingFromSpec(withShape(base, shape));

      for (const space of building.spaces) {
        expect(rectWidth(space.rect)).toBeGreaterThan(0);
        expect(rectDepth(space.rect)).toBeGreaterThan(0);
        expect(space.areaSqm).toBeCloseTo(rectArea(space.rect), 9);
        if (space.isCirculation) continue;
        expect(
          Math.min(rectWidth(space.rect), rectDepth(space.rect)),
          `${shape.name}: ${space.id} is a sliver`,
        ).toBeGreaterThanOrEqual(MIN_ROOM_DIM_M - FIT_TOL_M);
      }
    }
  });

  it("never overlaps two spaces on a level, whatever the outline", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const building = generateBuildingFromSpec(withShape(base, shape));
      const byFloor = new Map<number, PlacedSpace[]>();
      for (const space of building.spaces) {
        byFloor.set(space.floorNo, [...(byFloor.get(space.floorNo) ?? []), space]);
      }
      for (const [floorNo, spaces] of byFloor) {
        for (let i = 0; i < spaces.length; i += 1) {
          for (let j = i + 1; j < spaces.length; j += 1) {
            expect(
              rectsOverlap(spaces[i].rect, spaces[j].rect, 0.01),
              `${shape.name} L${floorNo}: ${spaces[i].id} overlaps ${spaces[j].id}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("raises no SPACE_OUTSIDE_PLATE or CORE_OUTSIDE_PLATE of its own making", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const spec = withShape(base, shape);
      const report = validateBuilding(generateBuildingFromSpec(spec), spec);
      const offPlate = report.violations.filter(
        (v) =>
          v.code === "SPACE_OUTSIDE_PLATE" ||
          v.code === "CORE_OUTSIDE_PLATE" ||
          v.code === "COLUMN_OUTSIDE_PLATE",
      );
      expect(
        offPlate.map((v) => `${shape.name}/${v.code}: ${v.message}`),
        `${shape.name} put geometry off the plate`,
      ).toEqual([]);
    }
  });

  it("sites the core on solid floor for every outline", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const building = generateBuildingFromSpec(withShape(base, shape));
      const level = building.levels.find((l) => l.floorNo > 0)!;

      expect(
        clipRectToPolygon(building.core.rect, level.polygon, FIT_TOL_M),
        `${shape.name}: the core does not stand on floor`,
      ).toBe(true);
      for (const component of building.core.components) {
        expect(
          clipRectToPolygon(component.rect, level.polygon, FIT_TOL_M),
          `${shape.name}: ${component.id} does not stand on floor`,
        ).toBe(true);
      }
    }
  });

  it("is bit-identical for the same seed on every outline", async () => {
    const base = await baseSpec();

    for (const shape of SHAPES) {
      const spec = withShape(base, shape);
      expect(
        JSON.stringify(generateBuildingFromSpec(spec).spaces),
        `${shape.name} is not deterministic`,
      ).toEqual(JSON.stringify(generateBuildingFromSpec(spec).spaces));
    }
  });
});

describe("solveFloorPlan — the plate polygon is what constrains it", () => {
  const coreAt = (rect: Rect): CoreLayout => ({ rect, components: [] });

  /** A 40 × 30 L: the north-east quadrant is missing above z = -3. */
  const L_PLATE: Polygon = [
    [
      [-20, -15],
      [20, -15],
      [20, -3],
      [-4, -3],
      [-4, 15],
      [-20, 15],
    ],
  ];
  const L_BOUNDS: Rect = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 };

  it("fills the bounding box when handed no polygon, and only the L when handed one", async () => {
    const spec = await baseSpec();
    const core = coreAt({ minX: -12, maxX: -6, minZ: -8, maxZ: -2 });
    const solve = (platePolygon?: Polygon) =>
      solveFloorPlan({
        spec,
        floorNo: 3,
        plate: L_BOUNDS,
        platePolygon,
        core,
        rng: createRng(spec.generationSeed).fork("level-3"),
      });

    const boxed = solve();
    const shaped = solve(L_PLATE);

    // Without the outline the solver has no way to know about the notch, and
    // demonstrably fills it — that is the bug this work removed.
    expect(boxed.some((s) => !clipRectToPolygon(s.rect, L_PLATE, FIT_TOL_M))).toBe(true);

    // With it, nothing escapes.
    expect(shaped.length).toBeGreaterThan(0);
    for (const space of shaped) {
      expect(
        clipRectToPolygon(space.rect, L_PLATE, FIT_TOL_M),
        `${space.id} escaped the L`,
      ).toBe(true);
    }
    // And the solve is still worth having: it uses most of the real floor.
    const used = shaped.reduce((sum, s) => sum + s.areaSqm, 0);
    expect(used).toBeGreaterThan((16 * 40 + 12 * 18 - 36) * 0.5);
  });

  it("treats a hole as a hole, not as floor", async () => {
    const spec = await baseSpec();
    const ring: Polygon = [
      [
        [-20, -15],
        [20, -15],
        [20, 15],
        [-20, 15],
      ],
      // Clockwise, per the winding convention: this is a void.
      [
        [-7, -5],
        [-7, 5],
        [7, 5],
        [7, -5],
      ],
    ];
    const spaces = solveFloorPlan({
      spec,
      floorNo: 3,
      plate: { minX: -20, maxX: 20, minZ: -15, maxZ: 15 },
      platePolygon: ring,
      core: coreAt({ minX: -18, maxX: -12, minZ: -6, maxZ: 0 }),
      rng: createRng(spec.generationSeed).fork("level-3"),
    });

    expect(spaces.length).toBeGreaterThan(0);
    const voidRect: Rect = { minX: -7, maxX: 7, minZ: -5, maxZ: 5 };
    for (const space of spaces) {
      expect(clipRectToPolygon(space.rect, ring, FIT_TOL_M)).toBe(true);
      expect(rectsOverlap(space.rect, voidRect, 0.01), `${space.id} is in the void`).toBe(
        false,
      );
    }
  });

  it("marks a room on a notch face as having an exterior wall", async () => {
    const spec = await baseSpec();
    // A U opening south: the notch face at z = -5 is a real elevation that lies
    // nowhere near the bounding box. Under the old bbox-only test a room there
    // read as landlocked, so the window pass skipped it and
    // MISSING_EXTERIOR_ACCESS fired on a room with a facade.
    const uPlate: Polygon = [
      [
        [-20, -15],
        [-6, -15],
        [-6, -5],
        [6, -5],
        [6, -15],
        [20, -15],
        [20, 15],
        [-20, 15],
      ],
    ];
    const bounds: Rect = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 };
    const spaces = solveFloorPlan({
      spec,
      floorNo: 3,
      plate: bounds,
      platePolygon: uPlate,
      core: coreAt({ minX: -4, maxX: 4, minZ: 5, maxZ: 11 }),
      rng: createRng(spec.generationSeed).fork("level-3"),
    });

    const offBox = (s: PlacedSpace) =>
      s.rect.minX > bounds.minX + 1e-3 &&
      s.rect.maxX < bounds.maxX - 1e-3 &&
      s.rect.minZ > bounds.minZ + 1e-3 &&
      s.rect.maxZ < bounds.maxZ - 1e-3;

    const onNotch = spaces.filter((s) => offBox(s) && Math.abs(s.rect.minZ - -5) < 1e-6);
    expect(onNotch.length, "no room landed on the notch face").toBeGreaterThan(0);
    for (const space of onNotch) {
      expect(space.hasExteriorWall, `${space.id} has a facade but denies it`).toBe(true);
    }

    // And the converse: a space with no face on the ring is not promoted.
    const landlocked = spaces.filter(
      (s) => offBox(s) && s.rect.minZ > -5 + 1e-6 && s.rect.maxZ < 15 - 1e-6,
    );
    for (const space of landlocked) {
      expect(space.hasExteriorWall, `${space.id} claims a facade it does not have`).toBe(
        false,
      );
    }
  });

  it("matches the legacy behaviour exactly when the polygon IS the rectangle", async () => {
    const spec = await baseSpec();
    const plate: Rect = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 };
    const core = coreAt({ minX: -4, maxX: 4, minZ: -3, maxZ: 3 });
    const solve = (platePolygon?: Polygon) =>
      solveFloorPlan({
        spec,
        floorNo: 3,
        plate,
        platePolygon,
        core,
        rng: createRng(spec.generationSeed).fork("level-3"),
      });

    expect(JSON.stringify(solve(rectToPolygon(plate)))).toEqual(JSON.stringify(solve()));
  });
});
