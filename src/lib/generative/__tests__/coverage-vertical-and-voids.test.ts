// src/lib/generative/__tests__/coverage-vertical-and-voids.test.ts
//
// Closes three audited coverage gaps that no existing test exercises:
//
//   1. The 'terrace' roof type (spec/building-spec.ts) has a real mapping in
//      compile/spec-to-recipe.ts but nothing asserted what it maps TO.
//   2. blueprint/compile.ts's void `floorNos` filter is exercised only by
//      voids that span every boundary floor; nothing proves a void confined
//      to a SUBSET of floors leaves the other floors' plates untouched.
//   3. Circulation around a courtyard is proven to reach every room on its
//      OWN side, but nothing proves the four sides' corridors actually chain
//      into one connected network rather than four disconnected pockets that
//      each happen to be locally well-formed.

import { describe, expect, it } from "vitest";

import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { generateMassing } from "../generate/massing";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { validateBuilding } from "../validate/rules";
import { seedFromPrompt } from "../rng";
import { sharedEdgeLength } from "../generate/types";
import {
  addBoundary,
  addVoid,
  compileBlueprintToSpec,
  emptyBlueprint,
  makeRectLoop,
  type PointMm,
} from "../blueprint";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

const p = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

/* ------------------------------------------------------------------ */
/* 1. Terrace roof → recipe mapping                                    */
/* ------------------------------------------------------------------ */

describe("compileSpecToRecipe — terrace roof", () => {
  it("maps a terrace roof to the engine's flat roof type", async () => {
    const base = await specFor("Create a five-story office building.");
    // Same override pattern as massing.test.ts's "abusive void" case: take a
    // valid heuristic spec and force the one field under test.
    const spec: BuildingSpec = {
      ...base,
      roof: { ...base.roof, type: { ...base.roof.type, value: "terrace" } },
    };

    const { recipe } = compileSpecToRecipe(spec);

    // compile/spec-to-recipe.ts's compileRoof() folds "terrace" into "flat"
    // alongside "flat" itself — a terrace roof is a flat roof with an
    // occupied deck, not a distinct geometric form the engine renders
    // differently. Assert the ACTUAL mapped value, not an assumption.
    expect(recipe.roof.type).toBe("flat");
    // The roof slab thickness still comes from the structural spec regardless
    // of roof type, so a terrace roof is not left with a bogus/zero deck.
    expect(recipe.roof.flatThickness).toBeCloseTo(
      spec.structure.slabThicknessMm.value / 1000,
      6,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 2. A void spanning only a subset of boundary floors                 */
/* ------------------------------------------------------------------ */

/**
 * A 20 × 14 m, 3-storey plan. All three floors share one boundary loop, but
 * the atrium void is only declared on floors 2 and 3 — floor 1 is a normal
 * solid ground floor beneath the atrium.
 */
function partialAtriumBlueprint() {
  const outline = makeRectLoop("outline", {
    xMm: 0,
    zMm: 0,
    widthMm: 24_000,
    depthMm: 16_000,
  });
  const withBoundary = addBoundary(emptyBlueprint("Partial Atrium"), {
    loop: outline,
    floorNos: [1, 2, 3],
  });
  // Off-centre, in a corner well clear of the plate's geometric centre —
  // where the vertical core lands, since core siting reads `massing.primary`
  // (the LARGEST plate, which here is floor 1's uncut rectangle) and knows
  // nothing about a void that only exists on floors 2 and 3. A centred void
  // would put the core standing in open air on those floors, which is a real
  // but SEPARATE limitation (core siting does not consult per-floor voids)
  // that this test is not about.
  return addVoid(withBoundary, {
    id: "atrium",
    kind: "atrium",
    region: {
      kind: "rect",
      originMm: p(4_000, 4_000),
      widthMm: 4_000,
      depthMm: 3_000,
      rotationRad: 0,
    },
    floorNos: [2, 3],
  });
}

const SEED = 20260817;

describe("blueprint/compile.ts — void confined to a subset of floors", () => {
  it("cuts the hole into floors 2 and 3 only, leaving floor 1 solid", () => {
    const { spec } = compileBlueprintToSpec(partialAtriumBlueprint(), { seed: SEED });
    const massing = generateMassing(spec);
    const byFloor = new Map(massing.plates.map((plate) => [plate.floorNo, plate]));

    expect(byFloor.size).toBe(3);

    // Floor 1: outer ring only — no hole, because the void's floorNos filter
    // (blueprint/compile.ts, platesFor) never applies the atrium to it.
    const ground = byFloor.get(1)!;
    expect(ground.polygon).toHaveLength(1);

    // Floors 2 and 3: outer ring PLUS the atrium hole.
    const level2 = byFloor.get(2)!;
    const level3 = byFloor.get(3)!;
    expect(level2.polygon).toHaveLength(2);
    expect(level3.polygon).toHaveLength(2);

    // The cut area is real, not a degenerate zero-area hole, and floor 1
    // keeps the FULL 24 × 16 m plate the void would otherwise have reduced.
    expect(ground.areaSqm).toBeCloseTo(24 * 16, 6);
    expect(level2.areaSqm).toBeCloseTo(24 * 16 - 4 * 3, 6);
    expect(level3.areaSqm).toBeCloseTo(24 * 16 - 4 * 3, 6);
  });

  it("still generates and validates cleanly end to end", () => {
    const { spec } = compileBlueprintToSpec(partialAtriumBlueprint(), { seed: SEED });
    const building = generateBuildingFromSpec(spec);

    // The atrium-holding floors kept their hole through the full pipeline,
    // and the ground floor stayed solid.
    const byFloor = new Map(building.levels.map((level) => [level.floorNo, level]));
    expect(byFloor.get(1)!.polygon).toHaveLength(1);
    expect(byFloor.get(2)!.polygon).toHaveLength(2);
    expect(byFloor.get(3)!.polygon).toHaveLength(2);

    const validation = validateBuilding(building, spec);
    const critical = validation.violations.filter((v) => v.severity === "critical");
    expect(
      critical.map((v) => `${v.code}: ${v.message}`),
      "critical violations in a partial-atrium building",
    ).toEqual([]);
    expect(validation.geometricallyValid).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Ring circulation around a courtyard                              */
/* ------------------------------------------------------------------ */

interface Rect2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Does `rect` run along the void bbox's WEST edge (x = void.minX)? */
function touchesWest(rect: Rect2, voidBox: Rect2, tol = 1e-2): boolean {
  return (
    Math.abs(rect.maxX - voidBox.minX) < tol &&
    Math.min(rect.maxZ, voidBox.maxZ) - Math.max(rect.minZ, voidBox.minZ) > tol
  );
}
function touchesEast(rect: Rect2, voidBox: Rect2, tol = 1e-2): boolean {
  return (
    Math.abs(rect.minX - voidBox.maxX) < tol &&
    Math.min(rect.maxZ, voidBox.maxZ) - Math.max(rect.minZ, voidBox.minZ) > tol
  );
}
function touchesSouth(rect: Rect2, voidBox: Rect2, tol = 1e-2): boolean {
  return (
    Math.abs(rect.maxZ - voidBox.minZ) < tol &&
    Math.min(rect.maxX, voidBox.maxX) - Math.max(rect.minX, voidBox.minX) > tol
  );
}
function touchesNorth(rect: Rect2, voidBox: Rect2, tol = 1e-2): boolean {
  return (
    Math.abs(rect.minZ - voidBox.maxZ) < tol &&
    Math.min(rect.maxX, voidBox.maxX) - Math.max(rect.minX, voidBox.minX) > tol
  );
}

describe("generateBuildingFromSpec — ring circulation around a courtyard", () => {
  // An 8-storey courtyard office building, the same fixture pipeline-e2e.test
  // uses for "sites the core on solid floor, not inside a courtyard void".
  // Its proportions (~48 m footprint, ~9 m void, generous 10-14 m ring
  // width on every side) are exactly the case where routing corridors AROUND
  // the courtyard is obviously the efficient plan — a plate that wide never
  // has to dead-end a whole side just to reach it, unlike a void crammed
  // against one edge of a tight plate.
  const PROMPT = "An eight storey office building arranged around a central courtyard.";

  it("keeps every corridor on a mid-level in one connected network", async () => {
    const spec = await specFor(PROMPT);
    expect(spec.massing.strategy.value).toBe("courtyard");
    const building = generateBuildingFromSpec(spec);

    const floorNo = 4;
    const spaces = building.spaces.filter((s) => s.floorNo === floorNo);
    const corridors = spaces.filter((s) => s.isCirculation);
    // A real ring needs more than one segment to be a meaningful claim.
    expect(corridors.length).toBeGreaterThan(3);

    // Independently recompute connectivity from the ACTUAL emitted elements,
    // the same two mechanisms generate/circulation.ts itself relies on:
    //
    //   - a DOOR between a room and a corridor (`adjacentSpaceIds`, the
    //     space-plan.test.ts accessor, never links two corridor segments to
    //     each other directly — proven in the next test — because the solver
    //     always seats a room between one corridor cell and the next; doors
    //     are what a person actually walks through), and
    //   - the CORE itself, whose lift lobby opens onto every corridor that
    //     stands against its face (`sharedEdgeLength`, the same test
    //     `circulationTouchesCore` uses), which is the real-world hub that
    //     lets you walk from one wing's corridor to another's.
    //
    // This is a from-scratch graph, not a read of the pipeline's own
    // `reachable` flag, so a bug shared between the two would not paper over
    // a genuinely disconnected ring.
    const CORE = "__CORE__";
    const graph = new Map<string, Set<string>>([[CORE, new Set()]]);
    for (const space of spaces) graph.set(space.id, new Set());
    const link = (a: string, b: string) => {
      graph.get(a)?.add(b);
      graph.get(b)?.add(a);
    };

    const doors = building.openings.filter(
      (o) => o.kind === "door" && o.floorNo === floorNo && o.connectsSpaceIds,
    );
    for (const door of doors) link(door.connectsSpaceIds![0], door.connectsSpaceIds![1]);
    for (const corridor of corridors) {
      if (sharedEdgeLength(corridor.rect, building.core.rect, 0.6) > 0.9) {
        link(corridor.id, CORE);
      }
    }

    const seen = new Set<string>([CORE]);
    const queue = [CORE];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const next of graph.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }

    const strandedCorridors = corridors.filter((c) => !seen.has(c.id));
    expect(
      strandedCorridors.map((c) => c.id),
      "every corridor should be reachable from the core through doors and/or the core's own faces",
    ).toEqual([]);

    // Cross-check against the pipeline's own circulation pass
    // (generate/circulation.ts), which concludes the same thing by a
    // differently-shaped BFS — agreement here means neither is only agreeing
    // with itself.
    expect(corridors.every((c) => c.reachable)).toBe(true);
  });

  it("proves the corridors themselves never share a wall (why doors, not adjacency, carry the ring)", async () => {
    const spec = await specFor(PROMPT);
    const building = generateBuildingFromSpec(spec);
    const floorNo = 4;
    const corridors = building.spaces.filter(
      (s) => s.floorNo === floorNo && s.isCirculation,
    );
    const corridorIds = new Set(corridors.map((c) => c.id));
    for (const corridor of corridors) {
      const adjacentCorridors = corridor.adjacentSpaceIds.filter((id) =>
        corridorIds.has(id),
      );
      expect(adjacentCorridors).toEqual([]);
    }
  });

  it("routes circulation around at least 3 of the void's 4 sides, not just one", async () => {
    const spec = await specFor(PROMPT);
    const building = generateBuildingFromSpec(spec);

    const floorNo = 4;
    const level = building.levels.find((l) => l.floorNo === floorNo)!;
    const [, hole] = level.polygon;
    expect(hole, "expected the courtyard level to have a hole").toBeDefined();

    const xs = hole.map(([x]) => x);
    const zs = hole.map(([, z]) => z);
    const voidBox: Rect2 = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };

    const corridors = building.spaces.filter(
      (s) => s.floorNo === floorNo && s.isCirculation,
    );

    const sides = {
      west: corridors.some((c) => touchesWest(c.rect, voidBox)),
      east: corridors.some((c) => touchesEast(c.rect, voidBox)),
      south: corridors.some((c) => touchesSouth(c.rect, voidBox)),
      north: corridors.some((c) => touchesNorth(c.rect, voidBox)),
    };
    const touchedCount = Object.values(sides).filter(Boolean).length;

    expect(
      touchedCount,
      `expected circulation to run along >= 3 of the void's 4 sides, got ${JSON.stringify(sides)}`,
    ).toBeGreaterThanOrEqual(3);
  });
});
