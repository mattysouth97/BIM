import { describe, expect, it } from "vitest";

import { areaSqm, isSelfIntersecting } from "../geometry";
import { dominantAxisDeg, regularizeRing } from "../outline-regularize";
import type { RingMm } from "../types";

/** Rotate a ring about the origin by `deg`, counter-clockwise. */
function rotate(ring: RingMm, deg: number): RingMm {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return ring.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos] as [number, number]);
}

/**
 * Deterministic pseudo-noise, so a "surveyed" ring is reproducible. A real GIS
 * outline is never exactly square; these tests must not pass only on clean input.
 */
function jitter(ring: RingMm, amplitudeMm: number): RingMm {
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648) * 2 - 1;
  };
  return ring.map(([x, y]) => [x + next() * amplitudeMm, y + next() * amplitudeMm] as [number, number]);
}

/** Largest deviation of any edge from the nearest multiple of 90°, in degrees. */
function worstEdgeDeviationDeg(ring: RingMm, axisDeg: number): number {
  let worst = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    if (Math.hypot(x1 - x0, y1 - y0) < 1) continue;
    const deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const d = ((((deg - axisDeg) % 90) + 90) % 90);
    worst = Math.max(worst, Math.min(d, 90 - d));
  }
  return worst;
}

/** Relative area change between two rings, as a fraction. */
function areaDrift(a: RingMm, b: RingMm): number {
  return Math.abs(areaSqm(a) - areaSqm(b)) / areaSqm(b);
}

const RECT_10x6: RingMm = [
  [0, 0],
  [10000, 0],
  [10000, 6000],
  [0, 6000],
];

/** An L: 12 m × 8 m with a 5 m × 3 m bite out of the north-east corner. */
const L_SHAPE: RingMm = [
  [0, 0],
  [12000, 0],
  [12000, 5000],
  [7000, 5000],
  [7000, 8000],
  [0, 8000],
];

describe("dominantAxisDeg", () => {
  it("reads 0 for an axis-aligned rectangle", () => {
    expect(dominantAxisDeg(RECT_10x6)).toBeCloseTo(0, 4);
  });

  it("recovers the rotation of a rotated rectangle", () => {
    expect(dominantAxisDeg(rotate(RECT_10x6, 31))).toBeCloseTo(31, 3);
  });

  it("folds rotation into [0, 90) — a 90° turn is the same building", () => {
    const a = dominantAxisDeg(rotate(RECT_10x6, 12));
    const b = dominantAxisDeg(rotate(RECT_10x6, 102));
    expect(a).toBeCloseTo(b, 3);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(90);
  });

  it("is length-weighted — a short skew edge does not steal the axis", () => {
    const mostlySquare: RingMm = [
      [0, 0],
      [20000, 0],
      [20000, 9000],
      [19000, 10000],
      [0, 10000],
    ];
    expect(Math.abs(dominantAxisDeg(mostlySquare))).toBeLessThan(3);
  });
});

describe("regularizeRing — squares up a surveyed outline", () => {
  it("leaves an already-orthogonal ring where it is", () => {
    const result = regularizeRing(RECT_10x6);
    expect(result.ring).toHaveLength(4);
    expect(result.maxShiftMm).toBeLessThan(1);
    expect(result.areaDeltaPct).toBeLessThan(0.01);
  });

  it("squares a rotated, noisy rectangle back to four right angles", () => {
    const surveyed = jitter(rotate(RECT_10x6, 31), 180);
    const result = regularizeRing(surveyed);

    expect(result.applied).toBe(true);
    expect(result.ring).toHaveLength(4);
    expect(result.rotationDeg).toBeCloseTo(31, 0);
    expect(worstEdgeDeviationDeg(result.ring, result.rotationDeg)).toBeLessThan(0.5);
  });

  it("holds the area while squaring up — the building does not change size", () => {
    const surveyed = jitter(rotate(RECT_10x6, 31), 180);
    const result = regularizeRing(surveyed);
    expect(Math.abs(result.areaDeltaPct)).toBeLessThan(3);
    // Against the TRUE 60 m² rectangle the noise was drawn around, not just
    // against the noisy input — squaring up must not drift the building's size.
    expect(areaDrift(result.ring, RECT_10x6)).toBeLessThan(0.05);
  });

  it("keeps a real re-entrant corner instead of smoothing the L into a box", () => {
    const surveyed = jitter(rotate(L_SHAPE, 18), 150);
    const result = regularizeRing(surveyed);

    expect(result.applied).toBe(true);
    expect(result.ring).toHaveLength(6);
    expect(worstEdgeDeviationDeg(result.ring, result.rotationDeg)).toBeLessThan(0.5);
    expect(areaDrift(result.ring, L_SHAPE)).toBeLessThan(0.05);
  });

  it("collapses a survey jog smaller than the merge tolerance", () => {
    // A 120 mm wobble in an otherwise straight 20 m north wall is noise, not a step.
    const wobbly: RingMm = [
      [0, 0],
      [20000, 0],
      [20000, 8000],
      [10000, 8120],
      [0, 8000],
    ];
    const result = regularizeRing(wobbly);
    expect(result.ring).toHaveLength(4);
  });

  it("keeps a step that is larger than the merge tolerance", () => {
    // A 2 m setback is architecture and must survive.
    const stepped: RingMm = [
      [0, 0],
      [20000, 0],
      [20000, 8000],
      [10000, 8000],
      [10000, 10000],
      [0, 10000],
    ];
    const result = regularizeRing(stepped);
    expect(result.ring).toHaveLength(6);
    expect(areaSqm(result.ring)).toBeCloseTo(areaSqm(stepped), 1);
  });
});

describe("regularizeRing — refuses to invent orthogonality", () => {
  it("leaves a triangle alone rather than forcing it square", () => {
    const triangle: RingMm = [
      [0, 0],
      [14000, 0],
      [7000, 9000],
    ];
    const result = regularizeRing(triangle);
    expect(result.applied).toBe(false);
    expect(result.ring).toEqual(triangle);
    expect(result.reason).toMatch(/직각/);
  });

  it("leaves a splayed plan alone — a chamfered corner is not survey noise", () => {
    const splayed: RingMm = [
      [0, 0],
      [20000, 0],
      [26000, 7000],
      [20000, 14000],
      [0, 14000],
    ];
    const result = regularizeRing(splayed);
    // The two long walls are orthogonal, the two splayed ones are not; the
    // splay must survive whether or not the ring is otherwise squared.
    if (result.applied) {
      expect(areaSqm(result.ring)).toBeCloseTo(areaSqm(splayed), 0);
    } else {
      expect(result.ring).toEqual(splayed);
    }
  });

  it("never returns a self-intersecting ring", () => {
    const awkward: RingMm = [
      [0, 0],
      [9000, 200],
      [9100, 4000],
      [4500, 3900],
      [4400, 7000],
      [100, 6900],
    ];
    const result = regularizeRing(awkward);
    expect(isSelfIntersecting(result.ring)).toBe(false);
  });

  it("refuses a result that would drag a corner past the shift limit", () => {
    const surveyed = jitter(rotate(RECT_10x6, 31), 180);
    const result = regularizeRing(surveyed, { maxShiftMm: 1 });
    expect(result.applied).toBe(false);
    expect(result.ring).toEqual(surveyed);
    expect(result.reason).toMatch(/이동/);
  });

  it("is deterministic", () => {
    const surveyed = jitter(rotate(L_SHAPE, 18), 150);
    expect(regularizeRing(surveyed)).toEqual(regularizeRing(surveyed));
  });

  it("is total on degenerate input", () => {
    expect(regularizeRing([]).ring).toEqual([]);
    expect(regularizeRing([[0, 0]]).applied).toBe(false);
    expect(
      regularizeRing([
        [0, 0],
        [1000, 0],
      ]).applied,
    ).toBe(false);
  });
});
