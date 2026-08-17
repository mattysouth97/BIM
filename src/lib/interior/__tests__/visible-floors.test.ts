import { describe, expect, it } from "vitest";

import { generateBuildingFromSpec } from "@/lib/generative/generate/pipeline";
import { emitSnapshot } from "@/lib/generative/graph/emit";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { seedFromPrompt } from "@/lib/generative/rng";

import { buildInteriorModel } from "../build";
import {
  floorNoFromPlanLevelId,
  groupWallsForInstancing,
  interiorDrawList,
  visibleFloorNos,
} from "../visible-floors";

describe("visibleFloorNos", () => {
  it("treats an omitted explicit list as 'use the plan view'", () => {
    expect(visibleFloorNos({ planLevelId: "level:3" })).toEqual([3]);
    expect(visibleFloorNos({ planLevelId: "2" })).toEqual([2]);
    expect(visibleFloorNos({ planLevelId: null })).toBeNull();
  });

  it("lets an explicit isolate win over the plan view", () => {
    expect(visibleFloorNos({ explicit: [1, 2], planLevelId: "level:5" })).toEqual([
      1, 2,
    ]);
    expect(visibleFloorNos({ explicit: null, planLevelId: "level:5" })).toBeNull();
    expect(visibleFloorNos({ explicit: [], planLevelId: "level:5" })).toBeNull();
  });
});

describe("floorNoFromPlanLevelId", () => {
  it("reads both BIM and recipe-floor ids", () => {
    expect(floorNoFromPlanLevelId("level:1")).toBe(1);
    expect(floorNoFromPlanLevelId("level:-1")).toBe(-1);
    expect(floorNoFromPlanLevelId("4")).toBe(4);
    expect(floorNoFromPlanLevelId("plan-1")).toBeNull();
  });
});

describe("interiorDrawList — a real building, isolated", () => {
  it("keeps one storey and instances walls as partition vs core", async () => {
    const provider = new HeuristicReasoningProvider();
    const prompt = "Create a five-story office building.";
    const { data: spec } = await provider.generateBuilding({
      prompt,
      seed: seedFromPrompt(prompt),
    });
    const snapshot = emitSnapshot({
      buildingPk: "test",
      generationId: "GEN-0001",
      spec,
      building: generateBuildingFromSpec(spec),
    });
    const model = buildInteriorModel(snapshot);
    const one = interiorDrawList(model, [1]);
    const all = interiorDrawList(model, null);

    expect(one.partitions.every((w) => w.floorNo === 1)).toBe(true);
    expect(one.cores.every((w) => w.floorNo === 1)).toBe(true);
    expect(one.poses.every((p) => p.floorNo === 1)).toBe(true);
    expect(one.partitions.length + one.cores.length).toBeLessThan(
      all.partitions.length + all.cores.length,
    );

    const grouped = groupWallsForInstancing([
      ...one.partitions,
      ...one.cores,
    ]);
    expect(grouped.partition.length + grouped.core.length).toBe(
      one.partitions.length + one.cores.length,
    );
    expect(grouped.core.every((w) => w.isCore)).toBe(true);
    expect(grouped.partition.every((w) => !w.isCore)).toBe(true);
  }, 60_000);
});
