import { describe, expect, it } from "vitest";

import { polygonArea as massingPolygonArea, rectRing } from "../generate/massing";
import {
  clipRectToPolygon,
  dedupeRing,
  ensurePolygonWinding,
  ensureWinding,
  isRingCCW,
  largestInscribedAxisAlignedRect,
  largestPolygon,
  multiPolygonArea,
  offsetPolygon,
  offsetRing,
  pointInPolygon,
  pointInRing,
  pointOnRing,
  polygonArea,
  polygonBounds,
  polygonBoundsRotated,
  polygonDifference,
  polygonIntersection,
  polygonUnion,
  rectPolygonOverlap,
  rectToPolygon,
  rectToRing,
  ringArea,
  ringSelfIntersects,
  segmentIntersection,
  segmentsOverlapCollinear,
  signedRingArea,
  unionAll,
  type Polygon,
  type Rect,
  type Ring,
  type Vec2,
} from "../geom";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** 20 × 20 with the north-east quadrant removed. Net area 256 m². */
const L_SHAPE: Polygon = [
  [
    [0, 0],
    [20, 0],
    [20, 8],
    [8, 8],
    [8, 20],
    [0, 20],
  ],
];

/** 20 × 20 centred on the origin with an 8 × 8 courtyard. Net area 336 m². */
const DONUT: Polygon = [
  [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ],
  [
    [-4, -4],
    [-4, 4],
    [4, 4],
    [4, -4],
  ],
];

const square = (size: number, offsetX = 0, offsetZ = 0): Polygon => [
  [
    [offsetX, offsetZ],
    [offsetX + size, offsetZ],
    [offsetX + size, offsetZ + size],
    [offsetX, offsetZ + size],
  ],
];

const rect = (minX: number, minZ: number, maxX: number, maxZ: number): Rect => ({
  minX,
  minZ,
  maxX,
  maxZ,
});

/* ------------------------------------------------------------------ */
/* Winding and area                                                    */
/* ------------------------------------------------------------------ */

describe("winding", () => {
  it("reads positive shoelace area as counter-clockwise", () => {
    expect(signedRingArea(L_SHAPE[0])).toBeCloseTo(256, 9);
    expect(isRingCCW(L_SHAPE[0])).toBe(true);
    expect(signedRingArea(DONUT[1])).toBeCloseTo(-64, 9);
    expect(isRingCCW(DONUT[1])).toBe(false);
  });

  it("agrees with the winding massing.ts already emits", () => {
    // rectRing is the engine's canonical outer ring; if geom disagreed with it
    // every existing footprint would come back inside-out.
    expect(isRingCCW(rectRing(30, 12))).toBe(true);
    expect(ringArea(rectRing(30, 12))).toBeCloseTo(360, 9);
    expect(polygonArea(DONUT)).toBeCloseTo(massingPolygonArea(DONUT), 9);
  });

  it("returns the input ring untouched when the winding already matches", () => {
    const ring = L_SHAPE[0];
    expect(ensureWinding(ring, true)).toBe(ring);
    const flipped = ensureWinding(ring, false);
    expect(flipped).not.toBe(ring);
    expect(isRingCCW(flipped)).toBe(false);
    // The source must not have been mutated in place.
    expect(isRingCCW(ring)).toBe(true);
  });

  it("normalises a polygon to outer-CCW / holes-CW", () => {
    const wrong: Polygon = [DONUT[0].slice().reverse(), DONUT[1].slice().reverse()];
    const fixed = ensurePolygonWinding(wrong);
    expect(isRingCCW(fixed[0])).toBe(true);
    expect(isRingCCW(fixed[1])).toBe(false);
    expect(polygonArea(fixed)).toBeCloseTo(336, 9);
  });

  it("subtracts holes from the net area", () => {
    expect(polygonArea(DONUT)).toBeCloseTo(336, 9);
    expect(polygonArea([])).toBe(0);
  });

  it("drops an explicit closing vertex, because rings are open here", () => {
    const closed: Ring = [...L_SHAPE[0], [0, 0]];
    expect(dedupeRing(closed)).toHaveLength(6);
    expect(dedupeRing([[1, 1]])).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Bounds                                                              */
/* ------------------------------------------------------------------ */

describe("bounds", () => {
  it("measures the outer ring only", () => {
    expect(polygonBounds(DONUT)).toEqual({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    expect(polygonBounds([])).toBeNull();
  });

  it("measures a rotated plate in its own frame, not the world's", () => {
    const rotated: Polygon = [
      L_SHAPE[0].map(([x, z]): Vec2 => {
        const angle = Math.PI / 6;
        return [x * Math.cos(angle) - z * Math.sin(angle), x * Math.sin(angle) + z * Math.cos(angle)];
      }),
    ];
    const world = polygonBounds(rotated);
    const local = polygonBoundsRotated(rotated, Math.PI / 6);
    expect(local).not.toBeNull();
    expect(local!.maxX - local!.minX).toBeCloseTo(20, 9);
    expect(local!.maxZ - local!.minZ).toBeCloseTo(20, 9);
    // The world AABB of a rotated plate is strictly larger — that is the point.
    expect(world!.maxX - world!.minX).toBeGreaterThan(20);
  });
});

/* ------------------------------------------------------------------ */
/* Point predicates                                                    */
/* ------------------------------------------------------------------ */

describe("point containment", () => {
  it("respects the notch of a concave plate", () => {
    expect(pointInPolygon([4, 4], L_SHAPE)).toBe(true);
    expect(pointInPolygon([16, 4], L_SHAPE)).toBe(true);
    expect(pointInPolygon([4, 16], L_SHAPE)).toBe(true);
    // Inside the bounding box, outside the shape.
    expect(pointInPolygon([16, 16], L_SHAPE)).toBe(false);
  });

  it("puts a hole's interior outside and its edge inside", () => {
    expect(pointInPolygon([0, 0], DONUT)).toBe(false);
    expect(pointInPolygon([7, 0], DONUT)).toBe(true);
    // Exactly on the courtyard wall: that edge is material the polygon owns.
    expect(pointInPolygon([4, 0], DONUT)).toBe(true);
    expect(pointInPolygon([-4, -4], DONUT)).toBe(true);
  });

  it("treats the boundary band as inside, to the stated tolerance", () => {
    const justOutside: Vec2 = [-10 - 1e-10, 0];
    expect(pointInPolygon(justOutside, DONUT, 1e-9)).toBe(true);
    expect(pointInPolygon(justOutside, DONUT, 0)).toBe(false);

    const clearlyOutside: Vec2 = [-10.5, 0];
    expect(pointInPolygon(clearlyOutside, DONUT, 1e-9)).toBe(false);
    // A tolerance wide enough to swallow the gap does swallow it — the caller
    // owns that decision, which is why it is an argument.
    expect(pointInPolygon(clearlyOutside, DONUT, 0.6)).toBe(true);
  });

  it("separates on-the-edge from inside", () => {
    expect(pointOnRing([10, 3], DONUT[0], 1e-9)).toBe(true);
    expect(pointOnRing([9, 3], DONUT[0], 1e-9)).toBe(false);
    expect(pointInRing([9, 3], DONUT[0])).toBe(true);
    expect(pointInRing([11, 3], DONUT[0])).toBe(false);
    // The implied closing edge is a real edge.
    expect(pointOnRing([-10, 3], DONUT[0], 1e-9)).toBe(true);
  });

  it("ignores winding — containment is about area, not draw order", () => {
    const cw = DONUT[0].slice().reverse();
    expect(pointInRing([0, 0], cw)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

describe("segment intersection", () => {
  it("finds a proper crossing", () => {
    const hit = segmentIntersection([-1, 0], [1, 0], [0, -1], [0, 1]);
    expect(hit).not.toBeNull();
    expect(hit![0]).toBeCloseTo(0, 12);
    expect(hit![1]).toBeCloseTo(0, 12);
  });

  it("finds an endpoint touch (a T-junction)", () => {
    const hit = segmentIntersection([0, 0], [10, 0], [5, 0], [5, 5]);
    expect(hit).not.toBeNull();
    expect(hit![0]).toBeCloseTo(5, 12);
  });

  it("returns null rather than inventing a point for parallel or collinear pairs", () => {
    expect(segmentIntersection([0, 0], [10, 0], [0, 1], [10, 1])).toBeNull();
    expect(segmentIntersection([0, 0], [10, 0], [4, 0], [14, 0])).toBeNull();
    expect(segmentsOverlapCollinear([0, 0], [10, 0], [4, 0], [14, 0])).toBe(true);
    expect(segmentsOverlapCollinear([0, 0], [10, 0], [10, 0], [20, 0])).toBe(false);
  });

  it("misses when the segments' lines cross outside their extents", () => {
    expect(segmentIntersection([0, 0], [1, 0], [5, -1], [5, 1])).toBeNull();
  });

  it("detects a bow-tie and clears well-formed rings", () => {
    const bowtie: Ring = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ];
    expect(ringSelfIntersects(bowtie)).toBe(true);
    expect(ringSelfIntersects(L_SHAPE[0])).toBe(false);
    expect(ringSelfIntersects(DONUT[0])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Booleans                                                            */
/* ------------------------------------------------------------------ */

describe("boolean operations", () => {
  it("cuts a core out of an L-shaped plate", () => {
    const core = rectToPolygon(rect(6, 2, 12, 6));
    const result = polygonDifference(L_SHAPE, core);
    expect(result).toHaveLength(1);
    expect(multiPolygonArea(result)).toBeCloseTo(256 - 24, 9);
    // Wholly interior, so it becomes a hole rather than a bite.
    expect(result[0]).toHaveLength(2);
    expect(isRingCCW(result[0][0])).toBe(true);
    expect(isRingCCW(result[0][1])).toBe(false);
  });

  it("differences a courtyard donut without losing its hole", () => {
    const bite = rectToPolygon(rect(-12, -12, 0, 12));
    const result = polygonDifference(DONUT, bite);
    expect(result).toHaveLength(1);
    // West half of the plate gone, and the west half of the courtyard with it.
    expect(multiPolygonArea(result)).toBeCloseTo(200 - 32, 9);
  });

  it("splits into disjoint parts when a cut severs the plate", () => {
    const knife = rectToPolygon(rect(9, -1, 11, 21));
    const result = polygonDifference(square(20), knife);
    expect(result).toHaveLength(2);
    expect(multiPolygonArea(result)).toBeCloseTo(400 - 2 * 20, 9);
  });

  it("unions overlapping squares to their combined area", () => {
    const result = polygonUnion(square(10), square(10, 5, 5));
    expect(result).toHaveLength(1);
    expect(multiPolygonArea(result)).toBeCloseTo(100 + 100 - 25, 9);
  });

  it("intersects to the shared region and to nothing when disjoint", () => {
    expect(multiPolygonArea(polygonIntersection(square(10), square(10, 5, 5)))).toBeCloseTo(
      25,
      9,
    );
    expect(polygonIntersection(square(10), square(10, 50, 50))).toEqual([]);
  });

  it("unions a list, keeping disjoint members apart", () => {
    const result = unionAll([square(10), square(10, 40, 0), square(10, 5, 0)]);
    expect(result).toHaveLength(2);
    expect(multiPolygonArea(result)).toBeCloseTo(150 + 100, 9);
    expect(polygonArea(largestPolygon(result) as Polygon)).toBeCloseTo(150, 9);
  });

  it("returns an empty result rather than throwing on degenerate input", () => {
    expect(polygonUnion([], square(10))).toEqual([]);
    expect(polygonDifference([[[0, 0], [1, 0]]], square(10))).toEqual([]);
    expect(unionAll([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Offset                                                              */
/* ------------------------------------------------------------------ */

describe("offset", () => {
  it("grows and shrinks a rectangle by the stated distance", () => {
    const out = offsetRing(square(10)[0], 1);
    expect(out).not.toBeNull();
    expect(ringArea(out as Ring)).toBeCloseTo(144, 9);

    const inward = offsetRing(square(10)[0], -1);
    expect(ringArea(inward as Ring)).toBeCloseTo(64, 9);
  });

  it("returns null instead of an inside-out ring when the shape collapses", () => {
    expect(offsetRing(square(10)[0], -5)).toBeNull();
    expect(offsetRing(square(10)[0], -6)).toBeNull();
    expect(offsetRing([[0, 0], [1, 1]], -1)).toBeNull();
  });

  it("keeps the ring's original winding", () => {
    const cw = ensureWinding(square(10)[0], false);
    const result = offsetRing(cw, 1);
    expect(result).not.toBeNull();
    expect(isRingCCW(result as Ring)).toBe(false);
    expect(ringArea(result as Ring)).toBeCloseTo(144, 9);
  });

  it("mitres a concave corner without eating the arm", () => {
    const inward = offsetRing(L_SHAPE[0], -2);
    expect(inward).not.toBeNull();
    // 20×20 minus a 12×12 notch, all edges pulled in 2 m: 16×16 − 12×12.
    expect(ringArea(inward as Ring)).toBeCloseTo(16 * 16 - 12 * 12, 6);
    for (const point of inward as Ring) {
      expect(pointInPolygon(point, L_SHAPE, 1e-6)).toBe(true);
    }
  });

  it("shrinks the courtyard when the material grows, and drops it when it closes", () => {
    const grown = offsetPolygon(DONUT, 1);
    expect(grown).not.toBeNull();
    expect((grown as Polygon)).toHaveLength(2);
    expect(polygonArea(grown as Polygon)).toBeCloseTo(22 * 22 - 6 * 6, 6);
    expect(isRingCCW((grown as Polygon)[1])).toBe(false);

    const closed = offsetPolygon(DONUT, 5);
    expect(closed).not.toBeNull();
    expect(closed as Polygon).toHaveLength(1);
    expect(polygonArea(closed as Polygon)).toBeCloseTo(900, 6);
  });

  it("grows the courtyard when the material shrinks", () => {
    const shrunk = offsetPolygon(DONUT, -2);
    expect(shrunk).not.toBeNull();
    expect(polygonArea(shrunk as Polygon)).toBeCloseTo(16 * 16 - 12 * 12, 6);
  });

  it("is the identity at zero distance", () => {
    const same = offsetRing(L_SHAPE[0], 0);
    expect(ringArea(same as Ring)).toBeCloseTo(256, 9);
  });

  it("bevels a corner sharper than the mitre limit rather than spiking to infinity", () => {
    const sliver: Ring = [
      [0, 0],
      [40, 0],
      [40, 1],
    ];
    const grown = offsetRing(sliver, 1, { miterLimit: 2 });
    expect(grown).not.toBeNull();
    const bounds = polygonBounds([grown as Ring]);
    // Without the bevel the acute tip at (0, 0) would run out past x = −40.
    expect(bounds!.minX).toBeGreaterThan(-6);
  });
});

/* ------------------------------------------------------------------ */
/* Rect predicates — what the space solver calls                       */
/* ------------------------------------------------------------------ */

describe("rect fit predicates", () => {
  it("accepts a rect inside an arm and rejects one spanning the notch", () => {
    expect(clipRectToPolygon(rect(1, 1, 7, 7), L_SHAPE)).toBe(true);
    expect(clipRectToPolygon(rect(10, 1, 18, 7), L_SHAPE)).toBe(true);
    expect(clipRectToPolygon(rect(1, 1, 18, 18), L_SHAPE)).toBe(false);
    expect(clipRectToPolygon(rect(12, 12, 18, 18), L_SHAPE)).toBe(false);
  });

  it("accepts a rect flush with the perimeter", () => {
    expect(clipRectToPolygon(rect(0, 0, 8, 8), L_SHAPE)).toBe(true);
    expect(clipRectToPolygon(rect(0, 0, 20, 8), L_SHAPE)).toBe(true);
    // One millimetre past the edge is past the edge.
    expect(clipRectToPolygon(rect(0, 0, 20.001, 8), L_SHAPE)).toBe(false);
  });

  it("respects a courtyard", () => {
    expect(clipRectToPolygon(rect(5, -9, 9, 9), DONUT)).toBe(true);
    expect(clipRectToPolygon(rect(-2, -2, 2, 2), DONUT)).toBe(false);
    expect(clipRectToPolygon(rect(-9, -9, 9, 9), DONUT)).toBe(false);
  });

  it("reports overlap separately from containment", () => {
    // Straddles the perimeter: not contained, but shares area.
    expect(rectPolygonOverlap(rect(18, 2, 26, 6), L_SHAPE)).toBe(true);
    expect(clipRectToPolygon(rect(18, 2, 26, 6), L_SHAPE)).toBe(false);
    // Wholly in the notch, and wholly in the courtyard: no shared area at all.
    expect(rectPolygonOverlap(rect(12, 12, 18, 18), L_SHAPE)).toBe(false);
    expect(rectPolygonOverlap(rect(-3, -3, 3, 3), DONUT)).toBe(false);
    // Rect swallowing the whole courtyard still overlaps the material round it.
    expect(rectPolygonOverlap(rect(-6, -6, 6, 6), DONUT)).toBe(true);
    expect(rectPolygonOverlap(rect(100, 100, 110, 110), L_SHAPE)).toBe(false);
  });

  it("has an empty polygon contain nothing", () => {
    expect(clipRectToPolygon(rect(0, 0, 1, 1), [])).toBe(false);
    expect(rectPolygonOverlap(rect(0, 0, 1, 1), [])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Largest inscribed rect                                              */
/* ------------------------------------------------------------------ */

describe("largest inscribed axis-aligned rect", () => {
  it("recovers a rectangular plate almost exactly", () => {
    const plate = rectToPolygon(rect(-15, -6, 15, 6));
    const found = largestInscribedAxisAlignedRect(plate, 1);
    expect(found).not.toBeNull();
    expect(clipRectToPolygon(found as Rect, plate)).toBe(true);
    expect(
      (found as Rect).maxX - (found as Rect).minX,
    ).toBeCloseTo(30, 6);
    expect(
      (found as Rect).maxZ - (found as Rect).minZ,
    ).toBeCloseTo(12, 6);
  });

  it("finds one arm of an L-shape and never leaves the plate", () => {
    const found = largestInscribedAxisAlignedRect(L_SHAPE, 0.5);
    expect(found).not.toBeNull();
    expect(clipRectToPolygon(found as Rect, L_SHAPE, 1e-6)).toBe(true);
    // The best arm is 20 × 8 = 160; the grid answer must not beat the truth,
    // and refinement should get it essentially there.
    const area = ((found as Rect).maxX - (found as Rect).minX) * ((found as Rect).maxZ - (found as Rect).minZ);
    expect(area).toBeGreaterThan(155);
    expect(area).toBeLessThanOrEqual(160 + 1e-6);
  });

  it("keeps out of a courtyard", () => {
    const found = largestInscribedAxisAlignedRect(DONUT, 0.5);
    expect(found).not.toBeNull();
    expect(clipRectToPolygon(found as Rect, DONUT, 1e-6)).toBe(true);
    expect(rectPolygonOverlap(found as Rect, [DONUT[1]], 1e-6)).toBe(false);
  });

  it("is deterministic and unrefined-safe", () => {
    const a = largestInscribedAxisAlignedRect(L_SHAPE, 0.5);
    const b = largestInscribedAxisAlignedRect(L_SHAPE, 0.5);
    expect(a).toEqual(b);
    const coarse = largestInscribedAxisAlignedRect(L_SHAPE, 0.5, { refine: false });
    expect(clipRectToPolygon(coarse as Rect, L_SHAPE, 1e-6)).toBe(true);
  });

  it("returns null when there is nothing to inscribe", () => {
    expect(largestInscribedAxisAlignedRect([], 1)).toBeNull();
    expect(largestInscribedAxisAlignedRect(square(10), 0)).toBeNull();
    expect(largestInscribedAxisAlignedRect([[[0, 0], [1, 0], [2, 0]]], 0.5)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Rect helpers                                                        */
/* ------------------------------------------------------------------ */

describe("rect helpers", () => {
  it("emits a counter-clockwise corner ring", () => {
    expect(isRingCCW(rectToRing(rect(0, 0, 4, 3)))).toBe(true);
    expect(ringArea(rectToRing(rect(0, 0, 4, 3)))).toBeCloseTo(12, 12);
  });
});
