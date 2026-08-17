// The plan reader, against a snapshot that was actually generated.
//
// The claim this file has to earn: the rooms the solver decided are readable as
// geometry, per level, from the emitted BIM elements alone — which is what makes
// the plan view a view of the model rather than a second, prettier model.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addCore,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
} from "@/lib/generative/blueprint";
import { runBlueprintGeneration } from "@/lib/generative/server/generate-from-blueprint";

import { blueprintShiftMm } from "./alignment";
import { readLevelPlan } from "./plan-model";

const FLOORS = [1, 2];

function schematic(): BlueprintSpec {
  let spec = addBoundary(emptyBlueprint("Plan test"), {
    loop: makeRectLoop("plate", {
      xMm: 40_000,
      zMm: 25_000,
      widthMm: 36_000,
      depthMm: 24_000,
    }),
    floorNos: FLOORS,
  });
  spec = addCore(spec, {
    id: "core-1",
    region: {
      kind: "rect",
      originMm: { xMm: 58_000, zMm: 37_000 },
      widthMm: 9_000,
      depthMm: 7_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
    contents: ["stair", "elevator"],
  });
  return spec;
}

function build() {
  const outcome = runBlueprintGeneration({ blueprint: schematic(), seed: 2026 });
  if (!outcome.ok) throw new Error(`generation failed: ${outcome.code}`);
  return outcome.payload;
}

describe("readLevelPlan", () => {
  it("returns the solved rooms of one level as measurable rects", () => {
    const payload = build();
    const level = payload.snapshot.levels.find((l) => l.floorNo === 1);
    expect(level).toBeTruthy();

    const plan = readLevelPlan(payload.snapshot, level!.id);
    expect(plan.rooms.length).toBeGreaterThan(0);
    expect(plan.walls.length).toBeGreaterThan(0);
    expect(plan.bounds).not.toBeNull();

    for (const room of plan.rooms) {
      expect(room.maxX).toBeGreaterThan(room.minX);
      expect(room.maxZ).toBeGreaterThan(room.minZ);
      expect(room.label.length).toBeGreaterThan(0);
      expect(room.detail).toContain("m²");
    }

    // Every rect matches the area the Room element itself reports.
    const roomElements = new Map(
      payload.snapshot.elements
        .filter((e) => e.kind === "room" && e.levelId === level!.id)
        .map((e) => [e.id, e]),
    );
    for (const room of plan.rooms) {
      const element = roomElements.get(room.id);
      expect(element).toBeTruthy();
      const areaM2 = element!.instanceParameters.areaM2 as number;
      const drawnAreaM2 =
        ((room.maxX - room.minX) / 1000) * ((room.maxZ - room.minZ) / 1000);
      expect(drawnAreaM2).toBeCloseTo(areaM2, 0);
    }
  });

  it("keeps levels apart", () => {
    const payload = build();
    const ids = payload.snapshot.levels.map((level) => level.id);
    const first = readLevelPlan(payload.snapshot, ids[0]);
    const second = readLevelPlan(payload.snapshot, ids[1]);
    const overlap = first.rooms.filter((room) =>
      second.rooms.some((other) => other.id === room.id),
    );
    expect(overlap).toHaveLength(0);
  });

  it("reads the core as its own parts", () => {
    const payload = build();
    const level = payload.snapshot.levels[0];
    const plan = readLevelPlan(payload.snapshot, level.id);
    expect(plan.coreParts.length).toBeGreaterThan(0);
  });

  it("puts the schematic and the solved plan in the same frame", () => {
    const payload = build();
    const level = payload.snapshot.levels.find((l) => l.floorNo === 1)!;
    const plan = readLevelPlan(payload.snapshot, level.id);
    const shift = blueprintShiftMm(payload.blueprint, payload.spec);

    // The drawn plate, moved into the model frame, contains the solved rooms.
    const minX = 40_000 + shift.xMm;
    const maxX = 76_000 + shift.xMm;
    const minZ = 25_000 + shift.zMm;
    const maxZ = 49_000 + shift.zMm;

    expect(plan.bounds).not.toBeNull();
    const tolerance = 600; // wall thickness sits on the boundary line
    expect(plan.bounds!.minX).toBeGreaterThanOrEqual(minX - tolerance);
    expect(plan.bounds!.maxX).toBeLessThanOrEqual(maxX + tolerance);
    expect(plan.bounds!.minZ).toBeGreaterThanOrEqual(minZ - tolerance);
    expect(plan.bounds!.maxZ).toBeLessThanOrEqual(maxZ + tolerance);
  });
});
