import { describe, expect, it } from "vitest";

import { generateMassing, polygonBounds } from "../generate/massing";
import { solveFloorPlan } from "../generate/space-plan";
import {
  rectDepth,
  rectWidth,
  rectsOverlap,
  sharedEdgeLength,
  type CoreLayout,
  type PlacedSpace,
  type Rect,
} from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { createRng, seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

/** Bounding box of the level plate, in the same metre frame as the solver. */
function plateFor(spec: BuildingSpec, floorNo: number): Rect {
  const massing = generateMassing(spec);
  const plate =
    massing.plates.find((p) => p.floorNo === floorNo) ?? massing.plates[0];
  const b = polygonBounds(plate.polygon);
  return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
}

/** Minimal CoreLayout straight off the spec — the real one is a sibling module. */
function coreFor(spec: BuildingSpec): CoreLayout {
  const halfW = spec.core.widthMm.value / 2000;
  const halfD = spec.core.depthMm.value / 2000;
  const cx = spec.core.offsetXMm / 1000;
  const cz = spec.core.offsetZMm / 1000;
  return {
    rect: { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfD, maxZ: cz + halfD },
    components: [],
  };
}

function solve(
  spec: BuildingSpec,
  floorNo: number,
  overrides: { plate?: Rect; core?: CoreLayout } = {},
): PlacedSpace[] {
  return solveFloorPlan({
    spec,
    floorNo,
    plate: overrides.plate ?? plateFor(spec, floorNo),
    core: overrides.core ?? coreFor(spec),
    rng: createRng(spec.generationSeed).fork("space-plan"),
  });
}

const TOL = 1e-9;

/**
 * The hard invariants. Every case in this file runs them, because a plan that
 * violates one of these is not a worse plan — it is not a plan.
 */
function expectPlanInvariants(
  spaces: PlacedSpace[],
  context: { spec: BuildingSpec; plate: Rect; core: CoreLayout; floorNo: number },
): void {
  const { spec, plate, core, floorNo } = context;
  const byProgram = new Map(spec.program.map((p) => [p.id, p]));

  for (let i = 0; i < spaces.length; i += 1) {
    const space = spaces[i];

    // Inside the plate.
    expect(space.rect.minX).toBeGreaterThanOrEqual(plate.minX - TOL);
    expect(space.rect.maxX).toBeLessThanOrEqual(plate.maxX + TOL);
    expect(space.rect.minZ).toBeGreaterThanOrEqual(plate.minZ - TOL);
    expect(space.rect.maxZ).toBeLessThanOrEqual(plate.maxZ + TOL);

    // Never a sliver, never zero area.
    expect(rectWidth(space.rect)).toBeGreaterThan(0);
    expect(rectDepth(space.rect)).toBeGreaterThan(0);
    expect(space.areaSqm).toBeGreaterThan(0);
    expect(space.areaSqm).toBeCloseTo(
      rectWidth(space.rect) * rectDepth(space.rect),
      9,
    );

    // Clear of the core.
    expect(rectsOverlap(space.rect, core.rect)).toBe(false);

    // Declared minimum area is met, or the room was dropped instead.
    //
    // Circulation is exempt PER SPACE: one circulation program item is realised
    // as a connected run of corridor segments, so an individual segment can be
    // smaller than the item minimum while the run as a whole is not. Splitting
    // a ring into legal-sized chunks would be arbitrary; the meaningful
    // invariant is on the total, asserted below.
    const item = byProgram.get(space.programId);
    if (item && !space.isCirculation) {
      expect(space.areaSqm).toBeGreaterThanOrEqual(item.minAreaSqm - 1e-6);
    }

    // Bookkeeping the contract requires.
    expect(space.floorNo).toBe(floorNo);
    expect(space.reachable).toBe(false);
    expect(space.hasExteriorWall).toBe(
      Math.abs(space.rect.minX - plate.minX) < 1e-3 ||
        Math.abs(space.rect.maxX - plate.maxX) < 1e-3 ||
        Math.abs(space.rect.minZ - plate.minZ) < 1e-3 ||
        Math.abs(space.rect.maxZ - plate.maxZ) < 1e-3,
    );

    // No two spaces overlap.
    for (let j = i + 1; j < spaces.length; j += 1) {
      expect(rectsOverlap(space.rect, spaces[j].rect)).toBe(false);
    }
  }

  // Circulation exists wherever there is more than one room to reach.
  if (spaces.length > 1) {
    expect(spaces.some((s) => s.isCirculation)).toBe(true);
  }

  // The per-space exemption above is only safe if the TOTAL still holds, so
  // assert circulation in aggregate against its declared minimum.
  const circulation = spaces.filter((s) => s.isCirculation);
  if (circulation.length > 0) {
    const item = byProgram.get(circulation[0].programId);
    if (item) {
      const total = circulation.reduce((sum, s) => sum + s.areaSqm, 0);
      expect(total).toBeGreaterThanOrEqual(item.minAreaSqm - 1e-6);
    }
  }
}

describe("solveFloorPlan", () => {
  it("keeps every hard invariant on a typical office level", async () => {
    const spec = await specFor("Create a five-storey office building.");
    const floorNo = 3;
    const plate = plateFor(spec, floorNo);
    const core = coreFor(spec);
    const spaces = solve(spec, floorNo);

    expect(spaces.length).toBeGreaterThan(1);
    expectPlanInvariants(spaces, { spec, plate, core, floorNo });
  });

  it("keeps the invariants across uses, massings and levels", async () => {
    const prompts = [
      "A 6 storey residential building with two levels of basement parking.",
      "A four storey school with classrooms.",
      "An eight storey office building arranged around a central courtyard.",
      "A ten storey stepped hotel.",
      "A three storey research laboratory with an offset core.",
      "A two storey retail building.",
      "An L-shaped five storey civic building.",
    ];

    for (const prompt of prompts) {
      const spec = await specFor(prompt);
      const core = coreFor(spec);
      for (const level of spec.levels) {
        const plate = plateFor(spec, level.floorNo);
        const spaces = solve(spec, level.floorNo);
        expectPlanInvariants(spaces, {
          spec,
          plate,
          core,
          floorNo: level.floorNo,
        });
      }
    }
  });

  it("gives every room a corridor to open onto", async () => {
    const spec = await specFor("Create a five-storey office building.");
    const spaces = solve(spec, 3);
    const byId = new Map(spaces.map((s) => [s.id, s]));

    const rooms = spaces.filter((s) => !s.isCirculation);
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      const opensOnto = room.adjacentSpaceIds.some((id) => byId.get(id)?.isCirculation);
      expect(opensOnto).toBe(true);
    }
  });

  it("anchors every corridor on the core so circulation has a seed", async () => {
    const spec = await specFor("Create a seven-storey office building.");
    const core = coreFor(spec);
    const corridors = solve(spec, 4).filter((s) => s.isCirculation);

    expect(corridors.length).toBeGreaterThan(0);
    for (const corridor of corridors) {
      expect(sharedEdgeLength(corridor.rect, core.rect)).toBeGreaterThan(0.9);
    }
  });

  it("anchors corridors on an OFF-CENTRE core too", async () => {
    // The case above uses a spec whose core sits at the plate centre, where a
    // spine centred on the band and a spine centred on the core are the same
    // rect — so it cannot tell the two apart. Push the core into a corner and
    // the distinction becomes load-bearing: a band-centred spine would run
    // straight past the core and strand its rooms away from the lift lobby.
    const spec = await specFor("Create a seven-storey office building.");
    const plate: Rect = { minX: -25, maxX: 25, minZ: -18, maxZ: 18 };
    const core: CoreLayout = {
      rect: { minX: 8, maxX: 16, minZ: 9, maxZ: 15 },
      components: [],
    };
    const spaces = solve(spec, 4, { plate, core });

    const corridors = spaces.filter((s) => s.isCirculation);
    expect(corridors.length).toBeGreaterThan(0);
    for (const corridor of corridors) {
      expect(sharedEdgeLength(corridor.rect, core.rect)).toBeGreaterThan(0.9);
    }
    expectPlanInvariants(spaces, { spec, plate, core, floorNo: 4 });
  });

  it("emits a symmetric adjacency graph of real shared walls", async () => {
    const spec = await specFor("A six storey office building.");
    const spaces = solve(spec, 2);
    const byId = new Map(spaces.map((s) => [s.id, s]));

    for (const space of spaces) {
      expect(new Set(space.adjacentSpaceIds).size).toBe(space.adjacentSpaceIds.length);
      for (const id of space.adjacentSpaceIds) {
        const other = byId.get(id);
        expect(other).toBeDefined();
        expect(other!.adjacentSpaceIds).toContain(space.id);
        expect(sharedEdgeLength(space.rect, other!.rect)).toBeGreaterThan(0.9);
      }
    }
  });

  it("numbers spaces with stable zero-padded ids", async () => {
    const spec = await specFor("A five storey office building.");
    const spaces = solve(spec, 2);

    expect(new Set(spaces.map((s) => s.id)).size).toBe(spaces.length);
    spaces.forEach((space, index) => {
      expect(space.id).toBe(`SPACE-L2-${String(index).padStart(3, "0")}`);
    });
  });

  it("is deterministic for a fixed seed", async () => {
    const spec = await specFor("A nine storey mixed-use building.");
    const first = solve(spec, 5);
    const second = solve(spec, 5);
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });

  it("places restrooms against the core and offices on the perimeter", async () => {
    const spec = await specFor("Create a six-storey office building.");
    const core = coreFor(spec);
    const spaces = solve(spec, 3);

    const offices = spaces.filter((s) => s.type === "office-open");
    expect(offices.length).toBeGreaterThan(0);
    // REQUIRES_EXTERIOR on the open office program.
    for (const office of offices) expect(office.hasExteriorWall).toBe(true);

    // REQUIRES_CORE on the restrooms: at least one lands within reach of it.
    const restrooms = spaces.filter((s) => s.type === "restroom");
    if (restrooms.length > 0) {
      const nearCore = restrooms.some(
        (r) => sharedEdgeLength(r.rect, core.rect) > 0.9,
      );
      expect(nearCore).toBe(true);
    }
  });

  it("drops rooms rather than overlapping when the program dwarfs the plate", async () => {
    const base = await specFor("Create a five-storey office building.");
    const spec: BuildingSpec = {
      ...base,
      program: base.program.map((p) => ({
        ...p,
        countPerLevel: Math.min(200, p.countPerLevel * 25),
        targetAreaSqmPerLevel: Math.min(20_000, p.targetAreaSqmPerLevel * 10),
      })),
    };

    const floorNo = 3;
    const plate: Rect = { minX: -10, maxX: 10, minZ: -6, maxZ: 6 };
    const core: CoreLayout = {
      rect: { minX: -3, maxX: 3, minZ: -2.5, maxZ: 2.5 },
      components: [],
    };
    const spaces = solve(spec, floorNo, { plate, core });

    expectPlanInvariants(spaces, { spec, plate, core, floorNo });

    const requested = spec.program
      .filter((p) => p.levels.includes(floorNo) && p.type !== "corridor")
      .reduce((sum, p) => sum + p.countPerLevel, 0);
    const placed = spaces.filter((s) => !s.isCirculation).length;
    expect(requested).toBeGreaterThan(100);
    expect(placed).toBeLessThan(requested);

    // Whatever survived is a usable room, not a leftover shard.
    for (const space of spaces) {
      expect(Math.min(rectWidth(space.rect), rectDepth(space.rect))).toBeGreaterThanOrEqual(
        1.2 - TOL,
      );
    }
  });

  it("returns nothing when the core swallows the plate", async () => {
    const spec = await specFor("A five storey office building.");
    const plate: Rect = { minX: -8, maxX: 8, minZ: -5, maxZ: 5 };
    const core: CoreLayout = { rect: { ...plate }, components: [] };
    expect(solve(spec, 3, { plate, core })).toEqual([]);
  });

  it("returns nothing on a level with no program", async () => {
    const spec = await specFor("A five storey office building.");
    // 99 is above the level stack, so no ProgramItem lists it.
    expect(spec.program.every((p) => !p.levels.includes(99))).toBe(true);
    expect(solve(spec, 99, { plate: plateFor(spec, 3) })).toEqual([]);
  });

  it("still plans a level whose core misses the plate", async () => {
    const spec = await specFor("A five storey office building.");
    const floorNo = 3;
    const plate = plateFor(spec, floorNo);
    // A core parked well off the plate — the solver must fall back to a spine
    // rather than emit an unplanned level.
    const core: CoreLayout = {
      rect: { minX: 900, maxX: 910, minZ: 900, maxZ: 910 },
      components: [],
    };
    const spaces = solve(spec, floorNo, { core });

    expect(spaces.length).toBeGreaterThan(1);
    expect(spaces.some((s) => s.isCirculation)).toBe(true);
    expectPlanInvariants(spaces, { spec, plate, core, floorNo });
  });

  it("never spends more of the plate than the plate has", async () => {
    const spec = await specFor("A five storey office building.");
    const floorNo = 3;
    const plate = plateFor(spec, floorNo);
    const core = coreFor(spec);
    const spaces = solve(spec, floorNo);

    const used = spaces.reduce((sum, s) => sum + s.areaSqm, 0);
    const usable =
      rectWidth(plate) * rectDepth(plate) -
      rectWidth(core.rect) * rectDepth(core.rect);
    expect(used).toBeLessThanOrEqual(usable + 1e-6);
    // And it should actually use most of it, or the solver is not solving.
    expect(used).toBeGreaterThan(usable * 0.6);
  });
});
