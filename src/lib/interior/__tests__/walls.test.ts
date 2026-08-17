// src/lib/interior/__tests__/walls.test.ts
//
// The split, on a fixture small enough to count by hand.
//
// The end-to-end proof runs on a real generated building
// (interior-model.test.ts); this file exists so that when that one fails, the
// failure can be localised to a box in the wrong place rather than to "a
// five-storey building looks wrong".

import { describe, expect, it } from "vitest";

import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";

import { buildWallInstances } from "../walls";

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

const WALL_HEIGHT_M = 3;
const WALL_THICKNESS_MM = 200;

function wall(input: {
  id: string;
  start: [number, number];
  end: [number, number];
  exterior?: boolean;
}): BimElement {
  return {
    id: input.id,
    origin: "generated",
    kind: "wall",
    category: "Walls",
    family: "Basic Wall",
    typeId: "generated-wall-interior",
    buildingPk: "fixture",
    levelId: "level:1",
    hostId: null,
    mark: input.id,
    phaseCreated: "new",
    visible: true,
    system: input.exterior ? "envelope" : "partitions",
    generationSource: { type: "GENERATED", generationId: "GEN-TEST", version: 1 },
    instanceParameters: {
      lengthM: Math.hypot(input.end[0] - input.start[0], input.end[1] - input.start[1]),
      unconnectedHeightM: WALL_HEIGHT_M,
      thicknessMm: WALL_THICKNESS_MM,
      exterior: input.exterior === true,
      startX: input.start[0],
      startZ: input.start[1],
      endX: input.end[0],
      endZ: input.end[1],
    },
    placement: {
      x: (input.start[0] + input.end[0]) / 2,
      y: 0,
      z: (input.start[1] + input.end[1]) / 2,
      // The plan angle emit.ts writes — deliberately the WRONG sign for a
      // three.js yaw, so any code that copies it instead of deriving from the
      // endpoints shows up here.
      rotationY: Math.atan2(input.end[1] - input.start[1], input.end[0] - input.start[0]),
    },
  };
}

function opening(input: {
  id: string;
  hostId: string;
  kind: "door" | "window";
  at: [number, number];
  widthMm: number;
  heightMm: number;
  sillHeightMm: number;
}): BimElement {
  return {
    id: input.id,
    origin: "generated",
    kind: input.kind,
    category: input.kind === "door" ? "Doors" : "Windows",
    family: input.kind === "door" ? "Single-Flush" : "Fixed",
    typeId: input.kind === "door" ? "generated-door" : "generated-window",
    buildingPk: "fixture",
    levelId: "level:1",
    hostId: input.hostId,
    mark: input.id,
    phaseCreated: "new",
    visible: true,
    system: "openings",
    generationSource: { type: "GENERATED", generationId: "GEN-TEST", version: 1 },
    instanceParameters: {
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      sillHeightMm: input.sillHeightMm,
    },
    placement: { x: input.at[0], y: input.sillHeightMm / 1000, z: input.at[1], rotationY: 0 },
  };
}

function snapshotOf(elements: BimElement[]): BimModelSnapshot {
  return {
    buildingPk: "fixture",
    levels: [
      {
        id: "level:1",
        name: "L01",
        elevation: 0,
        height: WALL_HEIGHT_M,
        floorNo: 1,
        associatedViewId: "view:plan:1",
      },
    ],
    grids: [],
    types: {},
    elements,
    documents: [],
    visibility: {},
  };
}

const DOOR = { widthMm: 900, heightMm: 2100, sillHeightMm: 0 };
const WINDOW = { widthMm: 1200, heightMm: 1500, sillHeightMm: 900 };

/* ------------------------------------------------------------------ */

describe("buildWallInstances — the split", () => {
  it("draws a blank wall as one box, centred on its own axis", () => {
    const model = snapshotOf([wall({ id: "W1", start: [0, 0], end: [6, 0] })]);
    const { walls } = buildWallInstances(model);

    expect(walls).toHaveLength(1);
    expect(walls[0]).toMatchObject({
      id: "W1#s0",
      elementId: "W1",
      floorNo: 1,
      role: "full",
      position: [3, 1.5, 0],
      rotationY: 0,
      scale: [6, 3, 0.2],
    });
  });

  it("splits a door into two piers and a header — three boxes, no CSG", () => {
    const model = snapshotOf([
      wall({ id: "W1", start: [0, 0], end: [6, 0] }),
      opening({ id: "D1", hostId: "W1", kind: "door", at: [3, 0], ...DOOR }),
    ]);
    const { walls } = buildWallInstances(model);

    expect(walls.map((w) => w.role)).toEqual(["pier", "header", "pier"]);

    const [left, header, right] = walls;
    // Jambs land at 3 ± 0.45.
    expect(left.scale[0]).toBeCloseTo(2.55, 6);
    expect(right.scale[0]).toBeCloseTo(2.55, 6);
    expect(left.position[0] + left.scale[0] / 2).toBeCloseTo(2.55, 6);
    expect(right.position[0] - right.scale[0] / 2).toBeCloseTo(3.45, 6);

    // Header: 0.9 m of wall over a 2.1 m leaf, spanning the opening exactly.
    expect(header.scale).toEqual([0.9, 0.9, 0.2]);
    expect(header.position).toEqual([3, 2.55, 0]);

    // A door has no sill band — there is nothing under a threshold.
    expect(walls.some((w) => w.role === "sill")).toBe(false);
  });

  it("splits a window into two piers, a sill band and a header — four boxes", () => {
    const model = snapshotOf([
      wall({ id: "W1", start: [0, 0], end: [6, 0] }),
      opening({ id: "N1", hostId: "W1", kind: "window", at: [3, 0], ...WINDOW }),
    ]);
    const { walls } = buildWallInstances(model);

    expect(walls.map((w) => w.role)).toEqual(["pier", "sill", "header", "pier"]);

    const sill = walls[1];
    const header = walls[2];
    expect(sill.position).toEqual([3, 0.45, 0]);
    expect(sill.scale).toEqual([1.2, 0.9, 0.2]);
    // Head at 900 + 1500 = 2400; the wall is 3000 tall.
    expect(header.position).toEqual([3, 2.7, 0]);
    expect(header.scale).toEqual([1.2, 0.6, 0.2]);
  });

  it("adds two boxes per door and three per window, whatever the mix", () => {
    const model = snapshotOf([
      wall({ id: "W1", start: [0, 0], end: [20, 0] }),
      opening({ id: "D1", hostId: "W1", kind: "door", at: [4, 0], ...DOOR }),
      opening({ id: "N1", hostId: "W1", kind: "window", at: [10, 0], ...WINDOW }),
      opening({ id: "N2", hostId: "W1", kind: "window", at: [16, 0], ...WINDOW }),
    ]);
    const { walls } = buildWallInstances(model);

    // 1 blank wall + 2 (door) + 3 + 3 (windows).
    expect(walls).toHaveLength(9);
    expect(walls.filter((w) => w.role === "pier")).toHaveLength(4);
    expect(walls.filter((w) => w.role === "sill")).toHaveLength(2);
    expect(walls.filter((w) => w.role === "header")).toHaveLength(3);
    expect(walls.every((w) => w.elementId === "W1")).toBe(true);
    expect(walls.map((w) => w.id)).toEqual(
      Array.from({ length: 9 }, (_, i) => `W1#s${i}`),
    );
  });

  it("lays a box's local +X along start→end, in three.js yaw — not the plan angle", () => {
    // A wall running +Z: the plan angle is +π/2, a three.js yaw is −π/2.
    const model = snapshotOf([wall({ id: "W1", start: [0, 0], end: [0, 4] })]);
    const { walls } = buildWallInstances(model);
    const box = walls[0];

    expect(box.rotationY).toBeCloseTo(-Math.PI / 2, 6);
    expect(model.elements[0].placement.rotationY).toBeCloseTo(Math.PI / 2, 6);

    // Local +X of the unit box, taken out of the matrix, points down +Z.
    const [m0, , m2] = box.matrix;
    expect(m0 / box.scale[0]).toBeCloseTo(0, 5);
    expect(m2 / box.scale[0]).toBeCloseTo(1, 5);
    // ...and the translation column is the box centre.
    expect([box.matrix[12], box.matrix[13], box.matrix[14]]).toEqual([0, 1.5, 2]);
  });

  it("never emits a negative-length pier when two openings overlap", () => {
    const model = snapshotOf([
      wall({ id: "W1", start: [0, 0], end: [6, 0] }),
      opening({ id: "D1", hostId: "W1", kind: "door", at: [3, 0], ...DOOR }),
      opening({ id: "D2", hostId: "W1", kind: "door", at: [3.3, 0], ...DOOR }),
    ]);
    const { walls } = buildWallInstances(model);

    for (const box of walls) {
      expect(box.scale[0]).toBeGreaterThan(0);
      expect(box.scale[1]).toBeGreaterThan(0);
    }
    // Boxes tile the wall without overlapping along its axis.
    const spans = walls
      .filter((w) => w.role === "pier" || w.role === "full")
      .map((w) => [w.position[0] - w.scale[0] / 2, w.position[0] + w.scale[0] / 2])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-9);
    }
  });

  it("skips a zero-length wall, and says so", () => {
    const model = snapshotOf([wall({ id: "W1", start: [2, 2], end: [2, 2] })]);
    const { walls, skipped } = buildWallInstances(model);

    expect(walls).toHaveLength(0);
    expect(skipped).toEqual([
      {
        elementId: "W1",
        kind: "wall",
        category: "Walls",
        reason: "zero-geometry",
        detail: "length 0.0000 m",
      },
    ]);
  });

  it("skips a wall with no endpoints rather than guessing them", () => {
    const bare = wall({ id: "W1", start: [0, 0], end: [6, 0] });
    const model = snapshotOf([{ ...bare, instanceParameters: { thicknessMm: 200 } }]);
    const { walls, skipped } = buildWallInstances(model);

    expect(walls).toHaveLength(0);
    expect(skipped[0].reason).toBe("no-axis");
  });

  it("skips a wall whose level the snapshot does not contain", () => {
    const orphan = wall({ id: "W1", start: [0, 0], end: [6, 0] });
    const model = snapshotOf([{ ...orphan, levelId: "level:9" }]);
    const { walls, skipped } = buildWallInstances(model);

    expect(walls).toHaveLength(0);
    expect(skipped[0]).toMatchObject({ reason: "no-level", detail: "levelId level:9" });
  });

  it("holds exterior walls back unless asked for them", () => {
    const model = snapshotOf([
      wall({ id: "W1", start: [0, 0], end: [6, 0] }),
      wall({ id: "W2", start: [0, 0], end: [6, 0], exterior: true }),
    ]);

    expect(buildWallInstances(model).walls.map((w) => w.elementId)).toEqual(["W1"]);
    const both = buildWallInstances(model, { includeExterior: true }).walls;
    expect(both.map((w) => w.elementId)).toEqual(["W1", "W2"]);
    expect(both[1].isExterior).toBe(true);
  });

  it("stands every box on its level, not on the ground", () => {
    const model = snapshotOf([wall({ id: "W1", start: [0, 0], end: [6, 0] })]);
    const raised: BimModelSnapshot = {
      ...model,
      levels: [{ ...model.levels[0], elevation: 12.6 }],
    };
    const { walls } = buildWallInstances(raised);
    // Base at the level, top a storey above it — placement.y is 0 and is right
    // to ignore.
    expect(walls[0].position[1]).toBe(12.6 + WALL_HEIGHT_M / 2);
  });
});
