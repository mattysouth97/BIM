import { describe, expect, it } from "vitest";

import {
  clipRectToPolygon,
  composeFrames,
  convexHull,
  IDENTITY_FRAME,
  invertFrame,
  isRingCCW,
  makeFrame,
  minimumAreaObbOfRing,
  obbCorners,
  obbFrame,
  obbOfRing,
  orientedBoxArea,
  pointInPolygon,
  rectToLocalBounds,
  rectToLocalRing,
  rectToWorldBounds,
  rectToWorldRing,
  ringArea,
  rotatePoint,
  rotateRing,
  rotatePolygon,
  toLocalDirection,
  toLocalPoint,
  toLocalPolygon,
  toLocalRing,
  toWorldDirection,
  toWorldPoint,
  toWorldPolygon,
  toWorldRing,
  vecDistance,
  type LocalFrame,
  type OrientedBox,
  type Polygon,
  type Rect,
  type Ring,
  type Vec2,
} from "../geom";

const FRAME: LocalFrame = { originX: 12.5, originZ: -7.25, rotationRad: 0.7853981633974483 };

const SAMPLES: Vec2[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-3.75, 8.5],
  [1e-4, -1e-4],
  [1234.5, -987.25],
];

const rect = (minX: number, minZ: number, maxX: number, maxZ: number): Rect => ({
  minX,
  minZ,
  maxX,
  maxZ,
});

const L_SHAPE: Ring = [
  [0, 0],
  [20, 0],
  [20, 8],
  [8, 8],
  [8, 20],
  [0, 20],
];

/* ------------------------------------------------------------------ */
/* Round trips                                                         */
/* ------------------------------------------------------------------ */

describe("frame round trips", () => {
  it("returns points unchanged through toWorld → toLocal", () => {
    for (const point of SAMPLES) {
      const back = toLocalPoint(FRAME, toWorldPoint(FRAME, point));
      expect(back[0]).toBeCloseTo(point[0], 9);
      expect(back[1]).toBeCloseTo(point[1], 9);
    }
  });

  it("returns points unchanged through toLocal → toWorld", () => {
    for (const point of SAMPLES) {
      const back = toWorldPoint(FRAME, toLocalPoint(FRAME, point));
      expect(back[0]).toBeCloseTo(point[0], 9);
      expect(back[1]).toBeCloseTo(point[1], 9);
    }
  });

  it("is the identity for the identity frame", () => {
    expect(toWorldPoint(IDENTITY_FRAME, [3, -4])).toEqual([3, -4]);
    expect(toLocalPoint(IDENTITY_FRAME, [3, -4])).toEqual([3, -4]);
  });

  it("round-trips rings and polygons, preserving area and winding", () => {
    const polygon: Polygon = [L_SHAPE];
    const world = toWorldPolygon(FRAME, polygon);
    const back = toLocalPolygon(FRAME, world);
    expect(ringArea(world[0])).toBeCloseTo(256, 6);
    expect(isRingCCW(world[0])).toBe(true);
    for (let i = 0; i < L_SHAPE.length; i += 1) {
      expect(vecDistance(back[0][i], L_SHAPE[i])).toBeLessThan(1e-9);
    }
    expect(toWorldRing(FRAME, toLocalRing(FRAME, L_SHAPE))[2][0]).toBeCloseTo(20, 9);
  });

  it("carries directions without the translation", () => {
    const quarter = makeFrame(100, -50, Math.PI / 2);
    const dir = toWorldDirection(quarter, [1, 0]);
    expect(dir[0]).toBeCloseTo(0, 12);
    expect(dir[1]).toBeCloseTo(1, 12);
    const back = toLocalDirection(quarter, dir);
    expect(back[0]).toBeCloseTo(1, 12);
    expect(back[1]).toBeCloseTo(0, 12);
  });
});

/* ------------------------------------------------------------------ */
/* Frame algebra                                                       */
/* ------------------------------------------------------------------ */

describe("frame algebra", () => {
  it("inverts to the exact undo of a frame", () => {
    const inverse = invertFrame(FRAME);
    for (const point of SAMPLES) {
      const roundTrip = toWorldPoint(inverse, toWorldPoint(FRAME, point));
      expect(roundTrip[0]).toBeCloseTo(point[0], 9);
      expect(roundTrip[1]).toBeCloseTo(point[1], 9);
    }
  });

  it("composes a nested wing into one transform", () => {
    const outer = makeFrame(30, 10, Math.PI / 5);
    const inner = makeFrame(-4, 6, -Math.PI / 9);
    const combined = composeFrames(outer, inner);
    for (const point of SAMPLES) {
      const twoSteps = toWorldPoint(outer, toWorldPoint(inner, point));
      const oneStep = toWorldPoint(combined, point);
      expect(oneStep[0]).toBeCloseTo(twoSteps[0], 9);
      expect(oneStep[1]).toBeCloseTo(twoSteps[1], 9);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Rotation                                                            */
/* ------------------------------------------------------------------ */

describe("rotation", () => {
  it("carries +X towards +Z, the same sense a CCW ring is measured in", () => {
    const p = rotatePoint([1, 0], Math.PI / 2);
    expect(p[0]).toBeCloseTo(0, 12);
    expect(p[1]).toBeCloseTo(1, 12);
  });

  it("rotates about an arbitrary pivot", () => {
    const p = rotatePoint([5, 0], Math.PI, [3, 0]);
    expect(p[0]).toBeCloseTo(1, 12);
    expect(p[1]).toBeCloseTo(0, 12);
  });

  it("preserves area and winding, so a rotated plate needs no repair", () => {
    const rotated = rotateRing(L_SHAPE, 1.234);
    expect(ringArea(rotated)).toBeCloseTo(256, 6);
    expect(isRingCCW(rotated)).toBe(true);
    expect(ringArea(rotatePolygon([L_SHAPE], -2.5)[0])).toBeCloseTo(256, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Rects across frames                                                 */
/* ------------------------------------------------------------------ */

describe("rects across frames", () => {
  const room = rect(-3, -2, 3, 2);

  it("gives the exact rotated quad, counter-clockwise", () => {
    const ring = rectToWorldRing(FRAME, room);
    expect(ring).toHaveLength(4);
    expect(isRingCCW(ring)).toBe(true);
    expect(ringArea(ring)).toBeCloseTo(24, 9);
    expect(rectToLocalRing(IDENTITY_FRAME, room)).toEqual([
      [-3, -2],
      [3, -2],
      [3, 2],
      [-3, 2],
    ]);
  });

  it("gives a CONSERVATIVE world AABB, tight only on right angles", () => {
    const skew = rectToWorldBounds(FRAME, room);
    expect(skew.maxX - skew.minX).toBeGreaterThan(6);

    const square = makeFrame(0, 0, Math.PI / 2);
    const tight = rectToWorldBounds(square, room);
    expect(tight.maxX - tight.minX).toBeCloseTo(4, 9);
    expect(tight.maxZ - tight.minZ).toBeCloseTo(6, 9);
  });

  it("round-trips a rect's corners back into its own frame", () => {
    const worldRing = rectToWorldRing(FRAME, room);
    const back = rectToLocalBounds(FRAME, {
      minX: Math.min(...worldRing.map((p) => p[0])),
      maxX: Math.max(...worldRing.map((p) => p[0])),
      minZ: Math.min(...worldRing.map((p) => p[1])),
      maxZ: Math.max(...worldRing.map((p) => p[1])),
    });
    // The local bounds of the world AABB contain the original rect.
    expect(back.minX).toBeLessThanOrEqual(room.minX + 1e-9);
    expect(back.maxX).toBeGreaterThanOrEqual(room.maxX - 1e-9);
  });

  it("lets a rotated wing be fitted in its own frame and drawn in world", () => {
    // The consumer pattern: rotate the plate into the wing's frame, fit an
    // axis-aligned room there, then hand the corners back out to world.
    const wing = makeFrame(50, 20, Math.PI / 7);
    const platePolygon: Polygon = [L_SHAPE];
    const worldPlate = toWorldPolygon(wing, platePolygon);
    const local = toLocalPolygon(wing, worldPlate);
    const room = rect(1, 1, 7, 7);
    expect(clipRectToPolygon(room, local, 1e-9)).toBe(true);
    for (const corner of rectToWorldRing(wing, room)) {
      expect(pointInPolygon(corner, worldPlate, 1e-9)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Oriented bounding boxes                                             */
/* ------------------------------------------------------------------ */

describe("oriented bounding boxes", () => {
  it("measures a ring in the frame it was asked for", () => {
    const angle = Math.PI / 6;
    const bar = rotateRing(
      [
        [0, 0],
        [30, 0],
        [30, 12],
        [0, 12],
      ],
      angle,
    );
    const aligned = obbOfRing(bar, angle) as OrientedBox;
    expect(aligned.widthM).toBeCloseTo(30, 9);
    expect(aligned.depthM).toBeCloseTo(12, 9);
    expect(orientedBoxArea(aligned)).toBeCloseTo(360, 6);

    // Measured in the world frame the same bar needs a much bigger box.
    const world = obbOfRing(bar, 0) as OrientedBox;
    expect(orientedBoxArea(world)).toBeGreaterThan(400);
  });

  it("puts its corners back where the ring is", () => {
    const angle = -0.4;
    const bar = rotateRing(
      [
        [-5, -2],
        [5, -2],
        [5, 2],
        [-5, 2],
      ],
      angle,
    );
    const box = obbOfRing(bar, angle) as OrientedBox;
    const corners = obbCorners(box);
    expect(isRingCCW(corners)).toBe(true);
    expect(ringArea(corners)).toBeCloseTo(40, 6);
    for (const point of bar) {
      const nearest = corners.reduce((best, c) => Math.min(best, vecDistance(c, point)), Infinity);
      expect(nearest).toBeLessThan(1e-9);
    }
    expect(obbFrame(box).rotationRad).toBeCloseTo(angle, 12);
  });

  it("finds the minimum-area box without being told the angle", () => {
    const angle = 0.9;
    const bar = rotateRing(
      [
        [0, 0],
        [24, 0],
        [24, 6],
        [0, 6],
      ],
      angle,
    );
    const best = minimumAreaObbOfRing(bar) as OrientedBox;
    expect(orientedBoxArea(best)).toBeCloseTo(144, 4);
    const dims = [best.widthM, best.depthM].sort((a, b) => a - b);
    expect(dims[0]).toBeCloseTo(6, 6);
    expect(dims[1]).toBeCloseTo(24, 6);
  });

  it("returns nothing to box when there is nothing there", () => {
    expect(obbOfRing([], 0)).toBeNull();
    expect(minimumAreaObbOfRing([])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Convex hull                                                         */
/* ------------------------------------------------------------------ */

describe("convex hull", () => {
  it("drops interior and collinear points and comes back counter-clockwise", () => {
    const hull = convexHull([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
      [2, 3],
    ]);
    expect(hull).toHaveLength(4);
    expect(isRingCCW(hull)).toBe(true);
    expect(ringArea(hull)).toBeCloseTo(100, 12);
  });

  it("passes degenerate input straight through", () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([[1, 2]])).toEqual([[1, 2]]);
    expect(convexHull([[1, 2], [1, 2]])).toEqual([[1, 2]]);
  });
});
