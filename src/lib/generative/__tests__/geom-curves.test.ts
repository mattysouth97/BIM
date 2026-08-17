import { describe, expect, it } from "vitest";

import {
  arc,
  arcSegmentCount,
  bezier,
  curveEnd,
  curveLength,
  curveLoopToRing,
  curvePointAtDistance,
  curveStart,
  curveTangent,
  evaluateCurve,
  isRingCCW,
  line,
  polygonArea,
  polyline,
  ringArea,
  ringSelfIntersects,
  spline,
  tessellateCurve,
  vecDistance,
  type Ring,
  type Vec2,
} from "../geom";

const HALF_PI = Math.PI / 2;

/* ------------------------------------------------------------------ */
/* Line                                                                */
/* ------------------------------------------------------------------ */

describe("line", () => {
  const l = line([0, 0], [6, 8]);

  it("is arc-length parameterised, exactly", () => {
    expect(curveLength(l)).toBeCloseTo(10, 12);
    expect(evaluateCurve(l, 0.5)).toEqual([3, 4]);
    expect(evaluateCurve(l, 0)).toEqual([0, 0]);
    expect(evaluateCurve(l, 1)).toEqual([6, 8]);
  });

  it("clamps the parameter rather than extrapolating", () => {
    expect(evaluateCurve(l, -3)).toEqual([0, 0]);
    expect(evaluateCurve(l, 4)).toEqual([6, 8]);
  });

  it("has a constant unit tangent", () => {
    const t = curveTangent(l, 0.25);
    expect(t[0]).toBeCloseTo(0.6, 12);
    expect(t[1]).toBeCloseTo(0.8, 12);
    expect(curveTangent(line([2, 2], [2, 2]), 0)).toEqual([0, 0]);
  });

  it("tessellates to its two endpoints and nothing else", () => {
    expect(tessellateCurve(l, 0.001)).toEqual([
      [0, 0],
      [6, 8],
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Arc                                                                 */
/* ------------------------------------------------------------------ */

describe("arc", () => {
  const quarter = arc([0, 0], 10, 0, HALF_PI);

  it("reports its exact swept length", () => {
    expect(curveLength(quarter)).toBeCloseTo(10 * HALF_PI, 12);
    expect(curveLength(arc([0, 0], 10, 0, -Math.PI))).toBeCloseTo(10 * Math.PI, 12);
  });

  it("hits its endpoints", () => {
    expect(curveStart(quarter)[0]).toBeCloseTo(10, 12);
    expect(curveStart(quarter)[1]).toBeCloseTo(0, 12);
    expect(curveEnd(quarter)[0]).toBeCloseTo(0, 12);
    expect(curveEnd(quarter)[1]).toBeCloseTo(10, 12);
  });

  it("tessellates to a SAGITTA tolerance, not a fixed segment count", () => {
    for (const tolerance of [0.5, 0.05, 0.005]) {
      const points = tessellateCurve(quarter, tolerance);
      let worstSagitta = 0;
      for (let i = 1; i < points.length; i += 1) {
        const mid: Vec2 = [
          (points[i - 1][0] + points[i][0]) / 2,
          (points[i - 1][1] + points[i][1]) / 2,
        ];
        worstSagitta = Math.max(worstSagitta, 10 - vecDistance([0, 0], mid));
        // Every emitted point is ON the circle; only the chords cut the corner.
        expect(vecDistance([0, 0], points[i])).toBeCloseTo(10, 9);
      }
      expect(worstSagitta).toBeLessThanOrEqual(tolerance + 1e-12);
    }
  });

  it("scales the segment count with radius, which a fixed count cannot", () => {
    const doorSwing = arcSegmentCount(0.9, HALF_PI, 0.005);
    const buildingSweep = arcSegmentCount(60, HALF_PI, 0.005);
    expect(buildingSweep).toBeGreaterThan(doorSwing * 5);
    // A tighter tolerance always costs more segments, never fewer.
    expect(arcSegmentCount(10, HALF_PI, 0.001)).toBeGreaterThan(
      arcSegmentCount(10, HALF_PI, 0.1),
    );
    expect(arcSegmentCount(10, 0, 0.01)).toBe(0);
    // A tolerance larger than the circle cannot be subdivided into meaning.
    expect(arcSegmentCount(1, HALF_PI, 50)).toBe(1);
  });

  it("converges on the true length from below as the tolerance tightens", () => {
    const chords = (tol: number) => {
      const pts = tessellateCurve(quarter, tol);
      let total = 0;
      for (let i = 1; i < pts.length; i += 1) total += vecDistance(pts[i - 1], pts[i]);
      return total;
    };
    const coarse = chords(0.5);
    const fine = chords(0.001);
    expect(coarse).toBeLessThan(fine);
    expect(fine).toBeLessThanOrEqual(10 * HALF_PI + 1e-9);
    expect(fine).toBeCloseTo(10 * HALF_PI, 2);
  });

  it("reverses its tangent with the sweep sign", () => {
    const ccw = curveTangent(arc([0, 0], 10, 0, HALF_PI), 0);
    const cw = curveTangent(arc([0, 0], 10, 0, -HALF_PI), 0);
    expect(ccw[1]).toBeCloseTo(1, 12);
    expect(cw[1]).toBeCloseTo(-1, 12);
    expect(curveTangent(arc([0, 0], 10, 1, 1), 0)).toEqual([0, 0]);
  });
});

/* ------------------------------------------------------------------ */
/* Polyline                                                            */
/* ------------------------------------------------------------------ */

describe("polyline", () => {
  const p = polyline([
    [0, 0],
    [10, 0],
    [10, 10],
  ]);

  it("is parameterised by cumulative chord length", () => {
    expect(curveLength(p)).toBeCloseTo(20, 12);
    expect(evaluateCurve(p, 0.25)[0]).toBeCloseTo(5, 12);
    expect(evaluateCurve(p, 0.75)[1]).toBeCloseTo(5, 12);
  });

  it("adds the closing edge only when asked", () => {
    expect(curveLength(polyline(p.points, true))).toBeCloseTo(20 + Math.hypot(10, 10), 12);
    expect(tessellateCurve(polyline(p.points, true), 0.01)).toHaveLength(4);
    expect(tessellateCurve(p, 0.01)).toHaveLength(3);
  });

  it("reports the tangent of the segment the parameter lands in", () => {
    expect(curveTangent(p, 0.1)).toEqual([1, 0]);
    expect(curveTangent(p, 0.9)).toEqual([0, 1]);
  });
});

/* ------------------------------------------------------------------ */
/* Bezier                                                              */
/* ------------------------------------------------------------------ */

describe("cubic bezier", () => {
  const b = bezier([0, 0], [0, 10], [10, 10], [10, 0]);

  it("interpolates its end control points", () => {
    expect(evaluateCurve(b, 0)).toEqual([0, 0]);
    expect(evaluateCurve(b, 1)).toEqual([10, 0]);
    expect(evaluateCurve(b, 0.5)[0]).toBeCloseTo(5, 12);
    expect(evaluateCurve(b, 0.5)[1]).toBeCloseTo(7.5, 12);
  });

  it("flattens adaptively: every chord midpoint stays within tolerance", () => {
    for (const tolerance of [0.2, 0.01]) {
      const points = tessellateCurve(b, tolerance);
      expect(points[0]).toEqual([0, 0]);
      expect(points[points.length - 1]).toEqual([10, 0]);
      // Sample the true curve densely and check no chord midpoint strays.
      let worst = 0;
      for (let i = 1; i < points.length; i += 1) {
        const mid: Vec2 = [
          (points[i - 1][0] + points[i][0]) / 2,
          (points[i - 1][1] + points[i][1]) / 2,
        ];
        let nearest = Infinity;
        for (let s = 0; s <= 2000; s += 1) {
          nearest = Math.min(nearest, vecDistance(mid, evaluateCurve(b, s / 2000)));
        }
        worst = Math.max(worst, nearest);
      }
      expect(worst).toBeLessThanOrEqual(tolerance);
    }
  });

  it("spends fewer points on a straight bezier than a curved one", () => {
    const straight = bezier([0, 0], [3, 0], [7, 0], [10, 0]);
    expect(tessellateCurve(straight, 0.01)).toHaveLength(2);
    expect(tessellateCurve(b, 0.01).length).toBeGreaterThan(8);
  });

  it("has a tangent along the first control leg at t = 0", () => {
    expect(curveTangent(b, 0)).toEqual([0, 1]);
    expect(curveTangent(b, 1)).toEqual([0, -1]);
  });
});

/* ------------------------------------------------------------------ */
/* Spline                                                              */
/* ------------------------------------------------------------------ */

describe("centripetal catmull-rom spline", () => {
  const control: Vec2[] = [
    [0, 0],
    [10, 6],
    [20, 0],
    [30, 6],
  ];
  const s = spline(control);

  it("interpolates every control point — it is not an approximating spline", () => {
    for (let i = 0; i < control.length; i += 1) {
      const t = i / (control.length - 1);
      const p = evaluateCurve(s, t);
      expect(p[0]).toBeCloseTo(control[i][0], 9);
      expect(p[1]).toBeCloseTo(control[i][1], 9);
    }
  });

  it("passes through its control points in the tessellation too", () => {
    const points = tessellateCurve(s, 0.01);
    for (const c of control) {
      const nearest = points.reduce(
        (best, p) => Math.min(best, vecDistance(p, c)),
        Infinity,
      );
      expect(nearest).toBeLessThan(1e-9);
    }
  });

  it("degrades to the polyline at zero tension", () => {
    const slack = spline(control, 0);
    expect(curveLength(slack, 0.001)).toBeCloseTo(
      curveLength(polyline(control), 0.001),
      6,
    );
  });

  it("survives a repeated control point instead of returning NaN", () => {
    const cusped = spline([
      [0, 0],
      [5, 5],
      [5, 5],
      [10, 0],
    ]);
    for (const [x, z] of tessellateCurve(cusped, 0.05)) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it("closes back onto its first point when closed", () => {
    const loop = spline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      1,
      true,
    );
    const points = tessellateCurve(loop, 0.02);
    expect(vecDistance(points[0], points[points.length - 1])).toBeLessThan(1e-9);
  });

  it("reports nothing for a curve with nothing in it", () => {
    expect(curveTangent(spline([]), 0)).toEqual([0, 0]);
    expect(evaluateCurve(spline([]), 0.5)).toEqual([0, 0]);
    expect(curveLength(spline([[3, 4]]))).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Arc-length accessor                                                 */
/* ------------------------------------------------------------------ */

describe("curvePointAtDistance", () => {
  it("walks the real arc length, clamping at both ends", () => {
    const p = polyline([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(curvePointAtDistance(p, 15)[1]).toBeCloseTo(5, 9);
    expect(curvePointAtDistance(p, -4)).toEqual([0, 0]);
    expect(curvePointAtDistance(p, 999)).toEqual([10, 10]);
  });

  it("is arc length where evaluateCurve deliberately is not", () => {
    const b = bezier([0, 0], [0, 10], [10, 10], [10, 0]);
    const half = curvePointAtDistance(b, curveLength(b, 0.0005) / 2, 0.0005);
    expect(half[0]).toBeCloseTo(5, 2);
  });
});

/* ------------------------------------------------------------------ */
/* Curve loop → ring                                                   */
/* ------------------------------------------------------------------ */

describe("curveLoopToRing", () => {
  const squareLoop = [
    line([0, 0], [10, 0]),
    line([10, 0], [10, 10]),
    line([10, 10], [0, 10]),
    line([0, 10], [0, 0]),
  ];

  it("welds shared endpoints and drops the closing vertex", () => {
    const ring = curveLoopToRing(squareLoop, 0.001);
    expect(ring).not.toBeNull();
    expect(ring as Ring).toHaveLength(4);
    expect(ringArea(ring as Ring)).toBeCloseTo(100, 9);
    expect(isRingCCW(ring as Ring)).toBe(true);
  });

  it("honours the requested winding", () => {
    const cw = curveLoopToRing(squareLoop, 0.001, { ccw: false });
    expect(isRingCCW(cw as Ring)).toBe(false);
  });

  it("builds a stadium from lines and arcs at the stated tolerance", () => {
    // Two straights joined by two semicircles of radius 5, straight run 20.
    const loop = [
      line([0, -5], [20, -5]),
      arc([20, 0], 5, -HALF_PI, HALF_PI),
      line([20, 5], [0, 5]),
      arc([0, 0], 5, HALF_PI, 3 * HALF_PI),
    ];
    const ring = curveLoopToRing(loop, 0.002);
    expect(ring).not.toBeNull();
    expect(isRingCCW(ring as Ring)).toBe(true);
    expect(ringSelfIntersects(ring as Ring, 1e-9)).toBe(false);
    // 20 × 10 rectangle plus a circle of radius 5.
    const expected = 20 * 10 + Math.PI * 25;
    expect(polygonArea([ring as Ring])).toBeCloseTo(expected, 1);
    // The seams must not have left duplicated vertices behind.
    const ringPoints = ring as Ring;
    for (let i = 0; i < ringPoints.length; i += 1) {
      const next = ringPoints[(i + 1) % ringPoints.length];
      expect(vecDistance(ringPoints[i], next)).toBeGreaterThan(0);
    }
  });

  it("refuses to invent a ring from a degenerate loop", () => {
    expect(curveLoopToRing([], 0.001)).toBeNull();
    expect(curveLoopToRing([line([0, 0], [10, 0])], 0.001)).toBeNull();
    expect(curveLoopToRing([line([0, 0], [0, 0])], 0.001)).toBeNull();
  });

  it("uses a separate join tolerance when the chain is only nearly head-to-tail", () => {
    const sloppy = [
      line([0, 0], [10, 0]),
      line([10.02, 0], [10, 10]),
      line([10, 10], [0, 10]),
      line([0, 10], [0, 0.03]),
    ];
    const ring = curveLoopToRing(sloppy, 0.001, { joinToleranceM: 0.05 });
    expect(ring).not.toBeNull();
    expect(ring as Ring).toHaveLength(4);
  });
});
