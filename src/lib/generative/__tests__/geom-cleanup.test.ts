import { describe, expect, it } from "vitest";

import {
  cleanupSegments,
  closeSmallGaps,
  detectClosedLoops,
  isRingCCW,
  mergeCollinear,
  mergeCollinearPolyline,
  mergeCollinearSegments,
  planarizeSegments,
  removeDuplicateSegments,
  removeZeroLength,
  ringArea,
  segmentLength,
  snapEndpoints,
  vecDistance,
  type Ring,
  type Segment,
  type Vec2,
} from "../geom";

const seg = (start: Vec2, end: Vec2): Segment => ({ start, end });

/** A square drawn by hand: corners miss by a few centimetres, one stray tail. */
const HAND_DRAWN_SQUARE: Segment[] = [
  seg([0, 0], [10.02, -0.01]),
  seg([10, 0.01], [9.98, 10.02]),
  seg([10.01, 10], [-0.02, 9.99]),
  seg([0.01, 10.01], [0, 0.02]),
];

/* ------------------------------------------------------------------ */
/* Snapping                                                            */
/* ------------------------------------------------------------------ */

describe("snapEndpoints", () => {
  it("welds near-coincident endpoints onto one shared coordinate", () => {
    const snapped = snapEndpoints(HAND_DRAWN_SQUARE, 0.05);
    const keys = new Set(snapped.flatMap((s) => [`${s.start}`, `${s.end}`]));
    expect(keys.size).toBe(4);
  });

  it("is idempotent — a second pass moves nothing", () => {
    const once = snapEndpoints(HAND_DRAWN_SQUARE, 0.05);
    const twice = snapEndpoints(once, 0.05);
    expect(twice).toEqual(once);
  });

  it("does not depend on the order the segments arrived in", () => {
    const forwards = snapEndpoints(HAND_DRAWN_SQUARE, 0.05);
    const backwards = snapEndpoints(HAND_DRAWN_SQUARE.slice().reverse(), 0.05);
    const key = (segments: Segment[]) =>
      segments
        .map((s) => `${s.start[0]},${s.start[1]}|${s.end[0]},${s.end[1]}`)
        .sort()
        .join(";");
    expect(key(backwards)).toBe(key(forwards.slice().reverse()));
  });

  it("leaves points further apart than the tolerance alone", () => {
    const snapped = snapEndpoints([seg([0, 0], [1, 0]), seg([1.5, 0], [3, 0])], 0.1);
    expect(snapped[1].start).toEqual([1.5, 0]);
  });

  it("copies rather than aliasing the input", () => {
    const input = [seg([0, 0], [1, 0])];
    const out = snapEndpoints(input, 0);
    expect(out[0].start).not.toBe(input[0].start);
    expect(out[0].start).toEqual([0, 0]);
  });
});

/* ------------------------------------------------------------------ */
/* Stubs and duplicates                                                */
/* ------------------------------------------------------------------ */

describe("removeZeroLength / removeDuplicateSegments", () => {
  it("drops sub-tolerance stubs", () => {
    const kept = removeZeroLength(
      [seg([0, 0], [10, 0]), seg([3, 3], [3.001, 3]), seg([1, 1], [1, 1])],
      0.01,
    );
    expect(kept).toHaveLength(1);
    expect(segmentLength(kept[0])).toBeCloseTo(10, 12);
  });

  it("drops a traced-over duplicate in either direction", () => {
    const kept = removeDuplicateSegments(
      [seg([0, 0], [10, 0]), seg([10, 0], [0, 0]), seg([0, 0], [10, 0.5])],
      0.01,
    );
    expect(kept).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Collinear merging                                                   */
/* ------------------------------------------------------------------ */

describe("mergeCollinear", () => {
  it("strips redundant edge midpoints from a ring", () => {
    const ring: Ring = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
      [0, 10],
    ];
    const merged = mergeCollinear(ring, 1e-9);
    expect(merged).toHaveLength(4);
    expect(ringArea(merged)).toBeCloseTo(100, 12);
  });

  it("wraps around the closing edge", () => {
    // The vertex at [0, 5] lies on the implied closing edge from [0, 10] to [0, 0].
    const ring: Ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 5],
    ];
    expect(mergeCollinear(ring, 1e-9)).toHaveLength(4);
  });

  it("keeps a vertex whose removal would move the outline further than tolerance", () => {
    const ring: Ring = [
      [0, 0],
      [5, 0.5],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(mergeCollinear(ring, 0.1)).toHaveLength(5);
    expect(mergeCollinear(ring, 0.6)).toHaveLength(4);
  });

  it("never reduces a ring below a triangle", () => {
    const degenerate: Ring = [
      [0, 0],
      [5, 0],
      [10, 0],
      [15, 0],
    ];
    expect(mergeCollinear(degenerate, 1e-9).length).toBeGreaterThanOrEqual(3);
  });

  it("keeps both endpoints of an open chain", () => {
    const points: Vec2[] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 4],
    ];
    expect(mergeCollinearPolyline(points, 1e-9)).toEqual([
      [0, 0],
      [10, 0],
      [10, 4],
    ]);
    expect(mergeCollinearPolyline([[1, 1], [2, 2]], 1)).toHaveLength(2);
  });

  it("fuses a collinear run of segments into one", () => {
    const run = mergeCollinearSegments(
      [seg([0, 0], [5, 0]), seg([5, 0], [10, 0]), seg([10, 0], [10, 5])],
      0.01,
      1e-9,
    );
    expect(run).toHaveLength(2);
    const longest = run.reduce((a, b) => (segmentLength(a) > segmentLength(b) ? a : b));
    expect(segmentLength(longest)).toBeCloseTo(10, 9);
  });

  it("will not fuse across a real corner", () => {
    const run = mergeCollinearSegments(
      [seg([0, 0], [5, 0]), seg([5, 0], [10, 2])],
      0.01,
      1e-9,
    );
    expect(run).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Gap closing                                                         */
/* ------------------------------------------------------------------ */

describe("closeSmallGaps", () => {
  it("bridges two lonely endpoints instead of moving the walls", () => {
    const open = [
      seg([0, 0], [10, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 10], [0, 0.4]),
    ];
    const closed = closeSmallGaps(open, 0.5);
    expect(closed).toHaveLength(5);
    const bridge = closed[4];
    expect(segmentLength(bridge)).toBeCloseTo(0.4, 9);
    // The original geometry is untouched — bridging adds, snapping moves.
    expect(closed.slice(0, 4)).toEqual(open);
  });

  it("leaves a gap wider than the tolerance open", () => {
    const open = [seg([0, 0], [10, 0]), seg([11, 0], [20, 0])];
    expect(closeSmallGaps(open, 0.5)).toHaveLength(2);
  });

  it("matches shortest-first, so one endpoint cannot be claimed twice", () => {
    const soup = [
      seg([0, 0], [10, 0]),
      seg([10.4, 0], [20, 0]),
      seg([10.1, 5], [20, 5]),
    ];
    const closed = closeSmallGaps(soup, 0.5);
    // [10, 0]–[10.1, 5] is not within tolerance; [10, 0]–[10.4, 0] is.
    const added = closed.slice(3);
    expect(added).toHaveLength(1);
    expect(vecDistance(added[0].start, added[0].end)).toBeCloseTo(0.4, 9);
  });

  it("does nothing without a tolerance to work with", () => {
    const open = [seg([0, 0], [10, 0]), seg([10.1, 0], [20, 0])];
    expect(closeSmallGaps(open, 0)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Planarisation                                                       */
/* ------------------------------------------------------------------ */

describe("planarizeSegments", () => {
  it("splits a drawn X into four edges meeting at a node", () => {
    const cross = [seg([-5, -5], [5, 5]), seg([-5, 5], [5, -5])];
    const planar = planarizeSegments(cross, 1e-6);
    expect(planar).toHaveLength(4);
    for (const s of planar) {
      expect(
        vecDistance(s.start, [0, 0]) < 1e-9 || vecDistance(s.end, [0, 0]) < 1e-9,
      ).toBe(true);
    }
  });

  it("splits the through-segment of a T-junction and leaves the stem alone", () => {
    const tee = [seg([0, 0], [10, 0]), seg([5, 0], [5, 6])];
    const planar = planarizeSegments(tee, 1e-6);
    expect(planar).toHaveLength(3);
  });

  it("leaves segments that touch nothing untouched", () => {
    const apart = [seg([0, 0], [10, 0]), seg([0, 5], [10, 5])];
    expect(planarizeSegments(apart, 1e-6)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Loop detection                                                      */
/* ------------------------------------------------------------------ */

describe("detectClosedLoops", () => {
  it("recovers a loop from a hand-drawn segment soup", () => {
    const loops = detectClosedLoops(HAND_DRAWN_SQUARE, 0.05);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(isRingCCW(loops[0])).toBe(true);
    expect(ringArea(loops[0])).toBeGreaterThan(99);
    expect(ringArea(loops[0])).toBeLessThan(101);
  });

  it("finds both rooms of a shared-wall pair, not just the outline", () => {
    const domino = [
      seg([0, 0], [20, 0]),
      seg([20, 0], [20, 10]),
      seg([20, 10], [0, 10]),
      seg([0, 10], [0, 0]),
      seg([10, 0], [10, 10]),
    ];
    const loops = detectClosedLoops(domino, 1e-6);
    expect(loops).toHaveLength(2);
    expect(loops.map((r) => ringArea(r))).toEqual([
      expect.closeTo(100, 6),
      expect.closeTo(100, 6),
    ]);
  });

  it("prunes dangling spurs rather than folding them into a ring", () => {
    const withTail = [
      ...HAND_DRAWN_SQUARE,
      seg([10, 5], [16, 5]),
      seg([16, 5], [16, 8]),
    ];
    const loops = detectClosedLoops(withTail, 0.05);
    expect(loops).toHaveLength(1);
    // The spur attaches mid-edge, so planarisation splits that edge in two.
    expect(loops[0].length).toBeLessThanOrEqual(5);
    expect(ringArea(loops[0])).toBeGreaterThan(99);
    expect(loops[0].length).toBe(mergeCollinear(loops[0], 1e-6).length + 1);
  });

  it("closes a drawn X into its four triangles", () => {
    const kite = [
      seg([-10, 0], [0, -10]),
      seg([0, -10], [10, 0]),
      seg([10, 0], [0, 10]),
      seg([0, 10], [-10, 0]),
      seg([-10, 0], [10, 0]),
      seg([0, -10], [0, 10]),
    ];
    const loops = detectClosedLoops(kite, 1e-6);
    expect(loops).toHaveLength(4);
    for (const ring of loops) {
      expect(ringArea(ring)).toBeCloseTo(50, 6);
      expect(isRingCCW(ring)).toBe(true);
    }
  });

  it("drops slivers below the stated minimum area", () => {
    // A chord across one corner: a 0.5 m² triangle and a 99.5 m² remainder.
    const cornerCut = [
      seg([0, 0], [10, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 10], [0, 0]),
      seg([0, 1], [1, 0]),
    ];
    expect(detectClosedLoops(cornerCut, 1e-6)).toHaveLength(2);
    const kept = detectClosedLoops(cornerCut, 1e-6, { minAreaSqm: 1 });
    expect(kept).toHaveLength(1);
    expect(ringArea(kept[0])).toBeCloseTo(99.5, 6);
  });

  it("collapses collinear vertices when asked", () => {
    const domino = [
      seg([0, 0], [10, 0]),
      seg([10, 0], [20, 0]),
      seg([20, 0], [20, 10]),
      seg([20, 10], [0, 10]),
      seg([0, 10], [0, 0]),
    ];
    expect(detectClosedLoops(domino, 1e-6)[0]).toHaveLength(5);
    expect(
      detectClosedLoops(domino, 1e-6, { collinearToleranceM: 1e-6 })[0],
    ).toHaveLength(4);
  });

  it("orders its result by geometry, not by input order", () => {
    const soup = [
      seg([0, 0], [10, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 10], [0, 0]),
      seg([30, 0], [50, 0]),
      seg([50, 0], [50, 20]),
      seg([50, 20], [30, 20]),
      seg([30, 20], [30, 0]),
    ];
    const forwards = detectClosedLoops(soup, 1e-6);
    const backwards = detectClosedLoops(soup.slice().reverse(), 1e-6);
    expect(forwards).toHaveLength(2);
    // Largest first, and identical whichever end the soup was read from.
    expect(ringArea(forwards[0])).toBeCloseTo(400, 6);
    expect(ringArea(forwards[1])).toBeCloseTo(100, 6);
    expect(backwards).toEqual(forwards);
  });

  it("reports nothing when nothing closes", () => {
    expect(detectClosedLoops([], 0.01)).toEqual([]);
    expect(detectClosedLoops([seg([0, 0], [10, 0])], 0.01)).toEqual([]);
    expect(
      detectClosedLoops([seg([0, 0], [10, 0]), seg([10, 0], [10, 10])], 0.01),
    ).toEqual([]);
  });

  it("does not connect what the drawing left unconnected", () => {
    // Gaps far wider than the tolerance stay gaps; the caller must widen the
    // tolerance or bridge them first, deliberately.
    const gappy = [
      seg([0, 0], [9, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 10], [0, 0]),
    ];
    expect(detectClosedLoops(gappy, 0.01)).toEqual([]);
    expect(detectClosedLoops(closeSmallGaps(gappy, 1.5), 0.01)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

describe("cleanupSegments", () => {
  it("welds, de-stubs, de-duplicates and bridges in one pass", () => {
    const messy: Segment[] = [
      ...HAND_DRAWN_SQUARE,
      seg([0, 0], [10.02, -0.01]),
      seg([4, 4], [4.0005, 4]),
    ];
    const cleaned = cleanupSegments(messy, {
      snapToleranceM: 0.05,
      minLengthM: 0.01,
      gapToleranceM: 0.2,
    });
    expect(cleaned).toHaveLength(4);
    expect(detectClosedLoops(cleaned, 1e-6)).toHaveLength(1);
  });

  it("fuses collinear runs when an angle tolerance is supplied", () => {
    const split = [seg([0, 0], [5, 0]), seg([5, 0], [10, 0]), seg([10, 0], [10, 5])];
    expect(cleanupSegments(split, { snapToleranceM: 1e-6 })).toHaveLength(3);
    expect(
      cleanupSegments(split, { snapToleranceM: 1e-6, collinearAngleRad: 0.01 }),
    ).toHaveLength(2);
  });
});
