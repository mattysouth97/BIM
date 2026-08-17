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
import { M_TO_MM, readLevelPlan } from "./plan-model";

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

describe("readLevelPlan: symbols", () => {
  it("emits a symbol instance for every generated door and window, sitting on its host wall", () => {
    const payload = build();
    const level = payload.snapshot.levels.find((l) => l.floorNo === 1)!;
    const plan = readLevelPlan(payload.snapshot, level.id);

    const openings = payload.snapshot.elements.filter(
      (e) => e.levelId === level.id && (e.kind === "door" || e.kind === "window"),
    );
    expect(openings.length).toBeGreaterThan(0);
    expect(plan.symbols.length).toBe(openings.length);

    const wallsById = new Map(
      payload.snapshot.elements.filter((e) => e.kind === "wall").map((e) => [e.id, e]),
    );

    for (const symbol of plan.symbols) {
      expect(symbol.kind === "door" || symbol.kind === "window").toBe(true);
      // Generated elements carry no AuthoringFamily id — the renderer falls
      // back to the kind's tool default via KIND_TO_TOOL.
      expect(symbol.familyId).toBeNull();
      expect(Number.isFinite(symbol.xMm)).toBe(true);
      expect(Number.isFinite(symbol.zMm)).toBe(true);

      const opening = openings.find((o) => o.id === symbol.id)!;
      expect(opening).toBeTruthy();
      expect(symbol.xMm).toBeCloseTo(opening.placement.x * M_TO_MM, 3);
      expect(symbol.zMm).toBeCloseTo(opening.placement.z * M_TO_MM, 3);

      const host = wallsById.get(opening.hostId!)!;
      expect(host).toBeTruthy();
      // The host wall's own rotationY, not the opening's own (always-0) placement.rotationY.
      expect(symbol.rotationRad).toBeCloseTo(host.placement.rotationY, 6);
      expect(symbol.hostWallThicknessMm).toBe(host.instanceParameters.thicknessMm);

      // On the host wall's centreline: the opening's world position, walked back by
      // its distance from the wall's own start, lands on the wall's start point.
      const startX = host.instanceParameters.startX as number;
      const startZ = host.instanceParameters.startZ as number;
      const endX = host.instanceParameters.endX as number;
      const endZ = host.instanceParameters.endZ as number;
      const wallDx = endX - startX;
      const wallDz = endZ - startZ;
      const wallLen = Math.hypot(wallDx, wallDz);
      const openX = symbol.xMm / M_TO_MM;
      const openZ = symbol.zMm / M_TO_MM;
      const alongWall = ((openX - startX) * wallDx + (openZ - startZ) * wallDz) / wallLen;
      const perpDist = Math.abs((openX - startX) * (wallDz / wallLen) - (openZ - startZ) * (wallDx / wallLen));
      expect(alongWall).toBeGreaterThanOrEqual(-0.01);
      expect(alongWall).toBeLessThanOrEqual(wallLen + 0.01);
      expect(perpDist).toBeLessThan(0.01);
    }
  });

  it("carries widthMm/heightMm from the door/window type", () => {
    const payload = build();
    const level = payload.snapshot.levels[0];
    const plan = readLevelPlan(payload.snapshot, level.id);
    const doors = plan.symbols.filter((s) => s.kind === "door");
    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      expect(door.params.widthMm).toBeGreaterThan(0);
      expect(door.params.heightMm).toBeGreaterThan(0);
    }
  });

  it("leaves non-hosted kinds (furniture, lighting, stairs, railings, MEP) out when none are placed", () => {
    // The generation pipeline this build() drives never places furniture/lighting/
    // MEP as their own elements outside the core — only doors and windows reach
    // readLevelPlan's symbol branch here.
    const payload = build();
    const level = payload.snapshot.levels[0];
    const plan = readLevelPlan(payload.snapshot, level.id);
    for (const symbol of plan.symbols) {
      expect(["door", "window"]).toContain(symbol.kind);
    }
  });
});
