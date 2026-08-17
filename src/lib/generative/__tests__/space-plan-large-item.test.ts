import { describe, expect, it } from "vitest";

import { generateMassing, polygonBounds } from "../generate/massing";
import { solveFloorPlan } from "../generate/space-plan";
import type { CoreLayout, Rect } from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { createRng, seedFromPrompt } from "../rng";
import type { BuildingSpec, ProgramItem } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

/**
 * A program shaped the way the reasoning layer actually shapes one: a single
 * dominant open-plan item that owns most of the floor, declared with a large
 * `minAreaSqm` because "an open office floor smaller than this is not an open
 * office floor". That declaration is architecturally correct and must not cause
 * the item to vanish.
 */
async function specWithDominantItem(minAreaSqm: number): Promise<BuildingSpec> {
  const prompt = "Create a five-storey office building.";
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });

  const levels = [2, 3, 4, 5];
  const openOffice: ProgramItem = {
    id: "open-office",
    type: "office-open",
    label: "Open Office Floor Area",
    levels,
    targetAreaSqmPerLevel: 520,
    countPerLevel: 1,
    minAreaSqm,
    preferredAspectRatio: 1.5,
    adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }],
    priority: "P1",
  };

  return {
    ...data,
    program: [
      openOffice,
      ...data.program.filter(
        (p) => p.type === "corridor" || p.type === "restroom",
      ),
    ],
  };
}

function plateFor(spec: BuildingSpec, floorNo: number): Rect {
  const massing = generateMassing(spec);
  const plate = massing.plates.find((p) => p.floorNo === floorNo) ?? massing.plates[0];
  const b = polygonBounds(plate.polygon);
  return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
}

function coreFor(spec: BuildingSpec): CoreLayout {
  const halfW = spec.core.widthMm.value / 2000;
  const halfD = spec.core.depthMm.value / 2000;
  return {
    rect: { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD },
    components: [],
  };
}

function solve(spec: BuildingSpec, floorNo: number) {
  return solveFloorPlan({
    spec,
    floorNo,
    plate: plateFor(spec, floorNo),
    core: coreFor(spec),
    rng: createRng(spec.generationSeed).fork(`level-${floorNo}`),
  });
}

describe("dominant program item", () => {
  it("places the largest item even when no single strip meets its declared minimum", async () => {
    // 300 m² is larger than any strip on this plate can hold in one run, which
    // is exactly the condition that used to drop the item entirely.
    const spec = await specWithDominantItem(300);
    const spaces = solve(spec, 3);

    const placed = spaces.filter((s) => s.programId === "open-office");
    expect(placed.length, "the dominant program item was dropped entirely").toBeGreaterThan(0);
  });

  it("still places it when the minimum is comfortably satisfiable", async () => {
    const spec = await specWithDominantItem(40);
    const spaces = solve(spec, 3);
    expect(spaces.filter((s) => s.programId === "open-office").length).toBeGreaterThan(0);
  });

  it("never trades the drop for a sliver room", async () => {
    const spec = await specWithDominantItem(300);
    const corridorWidthM = spec.dimensions.corridorWidthMm.value / 1000;

    for (const space of solve(spec, 3)) {
      const w = space.rect.maxX - space.rect.minX;
      const d = space.rect.maxZ - space.rect.minZ;
      // A ROOM degenerate in either direction is not a room, whatever its area.
      // Circulation is exempt: a corridor is legitimately narrow, and its width
      // is the one the spec asked for.
      const floorM = space.isCirculation ? corridorWidthM : 2;
      expect(Math.min(w, d)).toBeGreaterThanOrEqual(floorM - 1e-6);
      expect(space.areaSqm).toBeGreaterThan(4);
    }
  });

  it("keeps every space inside the plate and clear of the core", async () => {
    const spec = await specWithDominantItem(300);
    const plate = plateFor(spec, 3);
    const core = coreFor(spec);
    for (const space of solve(spec, 3)) {
      expect(space.rect.minX).toBeGreaterThanOrEqual(plate.minX - 1e-9);
      expect(space.rect.maxX).toBeLessThanOrEqual(plate.maxX + 1e-9);
      expect(space.rect.minZ).toBeGreaterThanOrEqual(plate.minZ - 1e-9);
      expect(space.rect.maxZ).toBeLessThanOrEqual(plate.maxZ + 1e-9);
      const overlapsCore =
        space.rect.minX < core.rect.maxX - 1e-6 &&
        core.rect.minX < space.rect.maxX - 1e-6 &&
        space.rect.minZ < core.rect.maxZ - 1e-6 &&
        core.rect.minZ < space.rect.maxZ - 1e-6;
      expect(overlapsCore).toBe(false);
    }
  });

  it("is deterministic", async () => {
    const spec = await specWithDominantItem(300);
    expect(JSON.stringify(solve(spec, 3))).toEqual(JSON.stringify(solve(spec, 3)));
  });
});
