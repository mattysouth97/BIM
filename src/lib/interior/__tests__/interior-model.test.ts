// src/lib/interior/__tests__/interior-model.test.ts
//
// The solved interior of a REAL generated building.
//
// Same route as src/lib/generative/__tests__/pipeline-e2e.test.ts — prompt →
// spec → geometry → BIM graph — so nothing here is a hand-made snapshot that
// happens to suit the layer. If the engine changes what it emits, these fail.

import { describe, expect, it } from "vitest";

import catalog from "../../../../public/models/authoring/catalog.json";
import { AUTHORING_FAMILIES } from "@/lib/bim/family-catalog";
import { headingYFromAxis } from "@/lib/bim/model/geometry";
import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";
import { generateBuildingFromSpec } from "@/lib/generative/generate/pipeline";
import { emitSnapshot } from "@/lib/generative/graph/emit";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { seedFromPrompt } from "@/lib/generative/rng";

import { buildInteriorModel } from "../build";
import {
  DOOR_FAMILY_ID,
  ELEVATOR_FAMILY_ID,
  INTERIOR_FAMILY_IDS,
  RAILING_FAMILY_ID,
  STAIR_FAMILY_ID,
  WINDOW_FAMILY_ID,
  assertFamiliesExist,
} from "../families";
import { isExteriorWall } from "../snapshot-read";
import type { FamilyPose } from "../types";

const PROMPT = "Create a five-story office building.";
const provider = new HeuristicReasoningProvider();

async function buildSnapshot(prompt = PROMPT): Promise<BimModelSnapshot> {
  const { data: spec } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return emitSnapshot({
    buildingPk: "test",
    generationId: "GEN-0001",
    spec,
    building: generateBuildingFromSpec(spec),
  });
}

const snapshotPromise = buildSnapshot();

const catalogDims = (id: string) => {
  const entry = (catalog as { families: { id: string; nativeDimsM?: { x: number; y: number; z: number } }[] })
    .families.find((f) => f.id === id);
  if (!entry?.nativeDimsM) throw new Error(`no nativeDimsM for ${id}`);
  return entry.nativeDimsM;
};

/** The level plate, straight out of the slab element's own outline. */
function plateBounds(snapshot: BimModelSnapshot, floorNo: number) {
  const slab = snapshot.elements.find(
    (el) => el.kind === "slab" && el.levelId === `level:${floorNo}`,
  );
  const outline = JSON.parse(String(slab?.instanceParameters.outlineJson ?? "[]")) as [
    number,
    number,
  ][][];
  const ring = outline[0] ?? [];
  return {
    minX: Math.min(...ring.map((p) => p[0])),
    maxX: Math.max(...ring.map((p) => p[0])),
    minZ: Math.min(...ring.map((p) => p[1])),
    maxZ: Math.max(...ring.map((p) => p[1])),
  };
}

const allOf = <T,>(byFloor: Record<number, T[]>): T[] => Object.values(byFloor).flat();

/* ------------------------------------------------------------------ */

describe("buildInteriorModel — a real generated building", () => {
  it("draws the interior of every storey", async () => {
    const model = buildInteriorModel(await snapshotPromise);

    expect(model.floors).toEqual([1, 2, 3, 4, 5]);
    for (const floorNo of model.floors) {
      expect(model.wallsByFloor[floorNo]?.length ?? 0).toBeGreaterThan(0);
      expect(model.posesByFloor[floorNo]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(model.stats.wallCount).toBe(allOf(model.wallsByFloor).length);
    expect(model.stats.poseCount).toBe(allOf(model.posesByFloor).length);
    expect(model.stats.railingCount).toBe(allOf(model.railingsByFloor).length);
    expect(model.stats.plateCount).toBe(0);
  });

  it("mounts floor, ceiling and roof plates on the schematic outline when asked", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot, { includeExterior: true });
    const plates = allOf(model.platesByFloor);
    expect(model.stats.plateCount).toBe(plates.length);
    expect(plates.some((p) => p.role === "floor")).toBe(true);
    expect(plates.some((p) => p.role === "ceiling")).toBe(true);
    expect(plates.some((p) => p.role === "roof")).toBe(true);

    for (const floorNo of model.floors) {
      const plate = plateBounds(snapshot, floorNo);
      const onFloor = model.platesByFloor[floorNo] ?? [];
      for (const item of onFloor) {
        const ring = item.polygon[0] ?? [];
        expect(Math.min(...ring.map((p) => p[0]))).toBeCloseTo(plate.minX, 5);
        expect(Math.max(...ring.map((p) => p[0]))).toBeCloseTo(plate.maxX, 5);
        expect(Math.min(...ring.map((p) => p[1]))).toBeCloseTo(plate.minZ, 5);
        expect(Math.max(...ring.map((p) => p[1]))).toBeCloseTo(plate.maxZ, 5);
      }
    }
  });

  it("stands every wall box inside its own level plate, between floor and ceiling", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot, { includeExterior: true });

    for (const floorNo of model.floors) {
      const plate = plateBounds(snapshot, floorNo);
      const level = snapshot.levels.find((l) => l.floorNo === floorNo)!;
      for (const box of model.wallsByFloor[floorNo] ?? []) {
        const [x, y, z] = box.position;
        // Centres, not corners: a wall centreline runs ON the plate edge.
        expect(x, `${box.id} x`).toBeGreaterThanOrEqual(plate.minX - 1e-6);
        expect(x, `${box.id} x`).toBeLessThanOrEqual(plate.maxX + 1e-6);
        expect(z, `${box.id} z`).toBeGreaterThanOrEqual(plate.minZ - 1e-6);
        expect(z, `${box.id} z`).toBeLessThanOrEqual(plate.maxZ + 1e-6);

        expect(y - box.scale[1] / 2, `${box.id} base`).toBeGreaterThanOrEqual(
          level.elevation - 1e-6,
        );
        expect(y + box.scale[1] / 2, `${box.id} top`).toBeLessThanOrEqual(
          level.elevation + level.height + 1e-6,
        );
        expect(Number.isFinite(box.matrix[0])).toBe(true);
      }
    }
  });

  it("expands wall count by exactly two boxes per door and three per window", async () => {
    const snapshot = await snapshotPromise;

    for (const includeExterior of [false, true]) {
      const model = buildInteriorModel(snapshot, { includeExterior });
      const walls = snapshot.elements.filter(
        (el) => el.kind === "wall" && (includeExterior || !isExteriorWall(el)),
      );
      const wallIds = new Set(walls.map((el) => el.id));
      const hosted = snapshot.elements.filter(
        (el) => el.hostId !== null && wallIds.has(el.hostId),
      );
      const doors = hosted.filter((el) => el.kind === "door").length;
      const windows = hosted.filter((el) => el.kind === "window").length;

      // A door leaves pier | header | pier where one box was (+2); a window
      // leaves pier | sill+header | pier (+3). That holds because every
      // generated opening sits strictly inside its host, every door starts at
      // the floor, and every head stops below the wall top — all three are
      // asserted below, so a failure here names the geometry that broke.
      expect(model.stats.wallCount, `includeExterior=${includeExterior}`).toBe(
        walls.length + 2 * doors + 3 * windows,
      );

      for (const opening of hosted) {
        const host = snapshot.elements.find((el) => el.id === opening.hostId)!;
        const width = Number(opening.instanceParameters.widthMm) / 1000;
        const sill = Number(opening.instanceParameters.sillHeightMm) / 1000;
        const head = sill + Number(opening.instanceParameters.heightMm) / 1000;
        const length = Number(host.instanceParameters.lengthM);
        const height = Number(host.instanceParameters.unconnectedHeightM);
        const along = Math.hypot(
          opening.placement.x - Number(host.instanceParameters.startX),
          opening.placement.z - Number(host.instanceParameters.startZ),
        );
        expect(along - width / 2, `${opening.id} near jamb`).toBeGreaterThan(0);
        expect(along + width / 2, `${opening.id} far jamb`).toBeLessThan(length);
        expect(head, `${opening.id} head`).toBeLessThan(height);
        if (opening.kind === "window") expect(sill).toBeGreaterThan(0);
      }
    }
  });

  it("puts every wall box on its element's real axis", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot, { includeExterior: true });
    const byId = new Map(snapshot.elements.map((el) => [el.id, el]));

    for (const box of allOf(model.wallsByFloor)) {
      const host = byId.get(box.elementId)!;
      const p = host.instanceParameters;
      const start = { x: Number(p.startX), z: Number(p.startZ) };
      const end = { x: Number(p.endX), z: Number(p.endZ) };
      expect(box.rotationY, box.id).toBeCloseTo(headingYFromAxis(start, end), 5);
      expect(box.scale[2], box.id).toBeCloseTo(Number(p.thicknessMm) / 1000, 6);
      expect(offCentreline(box.position[0], box.position[2], start, end), box.id).toBeLessThan(
        1e-6,
      );
    }
  });
});

/* ------------------------------------------------------------------ */

describe("buildInteriorModel — family poses", () => {
  it("places every door and window on its HOST WALL's centreline and rotation", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot, { includeExterior: true });
    const byId = new Map(snapshot.elements.map((el) => [el.id, el]));
    const openings = allOf(model.posesByFloor).filter(
      (pose) => pose.kind === "door" || pose.kind === "window",
    );

    expect(openings.length).toBeGreaterThan(100);
    let sawContraryConvention = false;

    for (const pose of openings) {
      const element = byId.get(pose.elementId)!;
      const host = byId.get(element.hostId!)!;
      const p = host.instanceParameters;
      const start = { x: Number(p.startX), z: Number(p.startZ) };
      const end = { x: Number(p.endX), z: Number(p.endZ) };

      // On the centreline...
      expect(offCentreline(pose.position[0], pose.position[2], start, end), pose.id).toBeLessThan(
        1e-3,
      );
      // ...with the host's heading, NOT the opening's own rotationY, which
      // emit.ts writes as a flat 0 for every generated opening.
      expect(element.placement.rotationY).toBe(0);
      expect(pose.rotationY, pose.id).toBeCloseTo(headingYFromAxis(start, end), 5);
      // ...and not the host's placement.rotationY either, which is the plan
      // angle: for any wall with a Z component the two differ in sign.
      // (4 dp — emit.ts rounds the angle it stores to 4.)
      if (Math.abs(host.placement.rotationY) > 1e-6) {
        sawContraryConvention = true;
        expect(pose.rotationY).toBeCloseTo(-host.placement.rotationY, 4);
      }
    }
    expect(sawContraryConvention, "no wall exercised the sign convention").toBe(true);
  });

  it("scales each opening family to the size the generator solved for", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot, { includeExterior: true });
    const byId = new Map(snapshot.elements.map((el) => [el.id, el]));

    const doorDims = catalogDims(DOOR_FAMILY_ID);
    for (const pose of posesOfKind(model.posesByFloor, "door")) {
      const element = byId.get(pose.elementId)!;
      expect(pose.familyId).toBe(DOOR_FAMILY_ID);
      expect(pose.scale[0] * doorDims.x * 1000).toBeCloseTo(
        Number(element.instanceParameters.widthMm),
        3,
      );
      expect(pose.scale[1] * doorDims.y * 1000).toBeCloseTo(
        Number(element.instanceParameters.heightMm),
        3,
      );
      // A door stands on its finished floor.
      const level = snapshot.levels.find((l) => l.floorNo === pose.floorNo)!;
      expect(pose.position[1]).toBeCloseTo(level.elevation, 6);
    }

    for (const pose of posesOfKind(model.posesByFloor, "window")) {
      const element = byId.get(pose.elementId)!;
      const level = snapshot.levels.find((l) => l.floorNo === pose.floorNo)!;
      const sill = Number(element.instanceParameters.sillHeightMm) / 1000;
      const height = Number(element.instanceParameters.heightMm) / 1000;
      expect(pose.familyId).toBe(WINDOW_FAMILY_ID);
      // `window-fixed-1200x1500` has its origin at the centre of the opening,
      // so the insert height is sill + half the (scaled) height — the same
      // `familySillLocalY` correction bim/family-insert.ts applies.
      expect(pose.position[1]).toBeCloseTo(level.elevation + sill + height / 2, 5);
    }
  });

  it("spans a whole storey with each stair, from its own floor", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot);
    const stairs = posesOfKind(model.posesByFloor, "stair");
    const dims = catalogDims(STAIR_FAMILY_ID);

    expect(stairs.length).toBe(
      snapshot.elements.filter((el) => el.kind === "stair").length,
    );

    for (const pose of stairs) {
      const level = snapshot.levels.find((l) => l.floorNo === pose.floorNo)!;
      const above = snapshot.levels.find((l) => l.floorNo === pose.floorNo + 1);
      const rise = above ? above.elevation - level.elevation : level.height;

      expect(pose.familyId).toBe(STAIR_FAMILY_ID);
      expect(pose.position[1]).toBeCloseTo(level.elevation, 6);
      // Base on this floor, top step at the next one.
      expect(pose.scale[1] * dims.y).toBeCloseTo(rise, 4);
      expect(pose.position[1] + pose.scale[1] * dims.y).toBeCloseTo(
        level.elevation + rise,
        4,
      );
      // The run stays inside the shaft it belongs to.
      const element = snapshot.elements.find((el) => el.id === pose.elementId)!;
      const longSpan = Math.max(
        Number(element.instanceParameters.widthM),
        Number(element.instanceParameters.depthM),
      );
      expect(pose.scale[2] * dims.z).toBeLessThanOrEqual(longSpan + 1e-6);
    }
  });

  it("guards each stairwell with a railing run at floor level", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot);
    const railings = allOf(model.railingsByFloor);

    expect(railings.length).toBe(snapshot.elements.filter((el) => el.kind === "stair").length);
    for (const run of railings) {
      const level = snapshot.levels.find((l) => l.floorNo === run.floorNo)!;
      expect(run.familyId).toBe(RAILING_FAMILY_ID);
      expect(run.position[1]).toBe(level.elevation);
      expect(run.lengthM).toBeGreaterThan(0);
      expect(Math.hypot(run.end[0] - run.start[0], run.end[1] - run.start[1])).toBeCloseTo(
        run.lengthM,
        5,
      );
      expect(run.scale[0] * catalogDims(RAILING_FAMILY_ID).x).toBeCloseTo(run.lengthM, 5);
    }
  });

  it("only ever names families that exist on disk", async () => {
    const model = buildInteriorModel(await snapshotPromise, { includeExterior: true });
    const ids = new Set(AUTHORING_FAMILIES.map((f) => f.id));

    expect(assertFamiliesExist()).toEqual([]);
    for (const pose of allOf(model.posesByFloor)) {
      expect(ids.has(pose.familyId), pose.familyId).toBe(true);
      expect(pose.url).toBe(`/models/authoring/${pose.familyId}.glb`);
    }
    for (const run of allOf(model.railingsByFloor)) {
      expect(ids.has(run.familyId)).toBe(true);
    }
    expect(INTERIOR_FAMILY_IDS.every((id) => ids.has(id))).toBe(true);
  });

  it("still has no elevator family to place — so the omission stays logged", () => {
    // The day someone authors one, this fails and asks for ELEVATOR_FAMILY_ID.
    const candidates = AUTHORING_FAMILIES.filter((f) =>
      /elevat|lift|hoist/i.test(`${f.id} ${f.family} ${f.type} ${f.category}`),
    );
    expect(candidates).toEqual([]);
    expect(ELEVATOR_FAMILY_ID).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("buildInteriorModel — honesty", () => {
  it("skips exactly the lifts and shafts, and nothing else", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot, { includeExterior: true });

    const reasons = new Set(model.stats.skipped.map((s) => s.reason));
    expect([...reasons]).toEqual(["no-family"]);

    const categories = model.stats.skipped.map((s) => s.category).sort();
    expect(new Set(categories)).toEqual(new Set(["Specialty Equipment", "Shafts"]));

    // Every lift and shaft instance is accounted for — none quietly vanished.
    const unrepresentable = snapshot.elements.filter(
      (el) => el.category === "Specialty Equipment" || el.category === "Shafts",
    );
    expect(model.stats.skipped).toHaveLength(unrepresentable.length);
    expect(model.stats.skipped.map((s) => s.elementId).sort()).toEqual(
      unrepresentable.map((el) => el.id).sort(),
    );
  });

  it("accounts for every element: drawn, skipped, or counted out of scope", async () => {
    const snapshot = await snapshotPromise;

    for (const includeExterior of [false, true]) {
      const model = buildInteriorModel(snapshot, { includeExterior });
      const drawn = new Set([
        ...allOf(model.wallsByFloor).map((w) => w.elementId),
        ...allOf(model.posesByFloor).map((p) => p.elementId),
        ...allOf(model.platesByFloor).map((p) => p.elementId),
      ]);
      const outOfScope = Object.values(model.stats.outOfScope).reduce((a, b) => a + b, 0);
      expect(drawn.size + model.stats.skipped.length + outOfScope).toBe(
        snapshot.elements.length,
      );
    }
  });

  it("names what it left out rather than dropping it silently", async () => {
    const model = buildInteriorModel(await snapshotPromise);
    expect(Object.keys(model.stats.outOfScope).sort()).toEqual([
      "envelope plate (includeExterior === false)",
      "exterior wall (includeExterior === false)",
      "not an interior kind: beam",
      "not an interior kind: column",
      "not an interior kind: room",
      "opening on an exterior wall (includeExterior === false)",
    ]);
  });

  it("leaves authored elements to the authoring layer", async () => {
    const snapshot = await snapshotPromise;
    const wall = snapshot.elements.find((el) => el.kind === "wall" && !isExteriorWall(el))!;
    const door = snapshot.elements.find((el) => el.kind === "door")!;
    const stair = snapshot.elements.find((el) => el.kind === "stair")!;

    const authored: BimElement[] = [wall, door, stair].map((el) => ({
      ...el,
      origin: "authored",
      generationSource: { type: "AUTHORED", generationId: "GEN-0001", version: 1 },
    }));
    const edited: BimModelSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map(
        (el) => authored.find((a) => a.id === el.id) ?? el,
      ),
    };

    const model = buildInteriorModel(edited, { includeExterior: true });
    const touched = new Set([
      ...allOf(model.wallsByFloor).map((w) => w.elementId),
      ...allOf(model.posesByFloor).map((p) => p.elementId),
      ...allOf(model.railingsByFloor).map((r) => r.elementId),
      ...model.stats.skipped.map((s) => s.elementId),
    ]);
    for (const el of authored) expect(touched.has(el.id), el.id).toBe(false);
    expect(model.stats.outOfScope["authored (drawn by the authoring layer)"]).toBe(3);
  });

  it("still draws a generated element a human has edited", async () => {
    const snapshot = await snapshotPromise;
    const wall = snapshot.elements.find((el) => el.kind === "wall" && !isExteriorWall(el))!;
    const edited: BimModelSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map((el) =>
        el.id === wall.id
          ? {
              ...el,
              generationSource: {
                type: "MODIFIED" as const,
                generationId: "GEN-0001",
                version: 2,
              },
            }
          : el,
      ),
    };
    const model = buildInteriorModel(edited);
    expect(allOf(model.wallsByFloor).some((w) => w.elementId === wall.id)).toBe(true);
  });

  it("drops nothing without a note when an opening loses its host", async () => {
    const snapshot = await snapshotPromise;
    const door = snapshot.elements.find((el) => el.kind === "door")!;
    const orphaned: BimModelSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map((el) =>
        el.id === door.id ? { ...el, hostId: "WALL-THAT-WAS-DELETED" } : el,
      ),
    };
    const model = buildInteriorModel(orphaned);
    expect(model.stats.skipped).toContainEqual({
      elementId: door.id,
      kind: "door",
      category: "Doors",
      reason: "missing-host",
      detail: "hostId WALL-THAT-WAS-DELETED",
    });
  });

  it("flags an opening that has drifted off its host wall", async () => {
    const snapshot = await snapshotPromise;
    const door = snapshot.elements.find((el) => el.kind === "door")!;
    const drifted: BimModelSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map((el) =>
        el.id === door.id
          ? { ...el, placement: { ...el.placement, z: el.placement.z + 3 } }
          : el,
      ),
    };
    const model = buildInteriorModel(drifted);
    const entry = model.stats.skipped.find((s) => s.elementId === door.id);
    expect(entry?.reason).toBe("opening-off-host");
    expect(entry?.detail).toContain("off the centreline");
  });
});

/* ------------------------------------------------------------------ */

describe("buildInteriorModel — determinism", () => {
  it("builds byte-identical models from one snapshot", async () => {
    const snapshot = await snapshotPromise;
    expect(JSON.stringify(buildInteriorModel(snapshot))).toBe(
      JSON.stringify(buildInteriorModel(snapshot)),
    );
  });

  it("builds byte-identical models from two runs of the same prompt", async () => {
    const a = buildInteriorModel(await buildSnapshot(), { includeExterior: true });
    const b = buildInteriorModel(await buildSnapshot(), { includeExterior: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not inherit element order from the snapshot", async () => {
    const snapshot = await snapshotPromise;
    const shuffled: BimModelSnapshot = {
      ...snapshot,
      elements: [...snapshot.elements].reverse(),
    };
    expect(JSON.stringify(buildInteriorModel(shuffled))).toBe(
      JSON.stringify(buildInteriorModel(snapshot)),
    );
  });

  it("gives every instance a unique, element-traceable id", async () => {
    const snapshot = await snapshotPromise;
    const model = buildInteriorModel(snapshot, { includeExterior: true });
    const ids = new Set(snapshot.elements.map((el) => el.id));
    const all = [
      ...allOf(model.wallsByFloor),
      ...allOf(model.posesByFloor),
      ...allOf(model.railingsByFloor),
      ...allOf(model.platesByFloor),
    ];

    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    for (const instance of all) {
      expect(ids.has(instance.elementId), instance.id).toBe(true);
      expect(instance.id.startsWith(instance.elementId)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */

function posesOfKind(byFloor: Record<number, FamilyPose[]>, kind: string): FamilyPose[] {
  return allOf(byFloor).filter((pose) => pose.kind === kind);
}

/** Perpendicular distance from a point to the infinite line through start→end. */
function offCentreline(
  x: number,
  z: number,
  start: { x: number; z: number },
  end: { x: number; z: number },
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return Math.hypot(x - start.x, z - start.z);
  return Math.abs((x - start.x) * (-dz / length) + (z - start.z) * (dx / length));
}
