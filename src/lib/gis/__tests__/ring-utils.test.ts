import { describe, expect, it } from "vitest";
import { insetRing, pointInRing, RING_INSET_MITER_LIMIT } from "../ring-utils";

function ringArea(ring: readonly [number, number][]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    twice += x0 * z1 - x1 * z0;
  }
  return Math.abs(twice) / 2;
}

describe("insetRing", () => {
  it("shrinks a CCW rectangle toward its interior", () => {
    const ring: [number, number][] = [
      [-10, -8],
      [10, -8],
      [10, 8],
      [-10, 8],
    ];
    const inset = insetRing(ring, 0.1);
    expect(inset).toHaveLength(4);
    for (const [x, z] of inset) {
      expect(pointInRing(x, z, ring)).toBe(true);
    }
    const xs = inset.map((p) => p[0]);
    const zs = inset.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThan(-10);
    expect(Math.min(...xs)).toBeLessThan(-9.85);
    expect(Math.max(...xs)).toBeLessThan(10);
    expect(Math.max(...xs)).toBeGreaterThan(9.85);
    expect(Math.min(...zs)).toBeGreaterThan(-8);
    expect(Math.max(...zs)).toBeLessThan(8);
  });

  // A rectangle's corners are all 90°, where the miter-join correction has a
  // closed-form answer: offsetting each edge inward by `d` shrinks a w x h
  // rectangle to (w - 2d) x (h - 2d), exactly — no averaging error, because
  // the bisector at a right angle is at 45° to each edge and
  // distance/cos(45°) works out to exactly `d` along each axis. Before the
  // ÷cos(half-angle) fix, the un-mitered bisector-unit-vector move landed
  // short by a factor of 1/√2 ≈ 0.7071 at every corner, so a "0.1 m inset"
  // rectangle actually shrank by only ≈0.0707 m per side.
  it("insets a right-angle corner by exactly the requested distance, not 1/√2 of it", () => {
    const w = 20;
    const h = 16;
    const d = 0.5;
    const ring: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    const inset = insetRing(ring, d);
    const expectedArea = (w - 2 * d) * (h - 2 * d);
    expect(ringArea(inset)).toBeCloseTo(expectedArea, 6);

    // Also check per-vertex: the corner should sit exactly d inside each
    // adjacent edge, i.e. at (+/-(w/2 - d), +/-(h/2 - d)).
    const xs = inset.map((p) => p[0]).sort((a, b) => a - b);
    const zs = inset.map((p) => p[1]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-(w / 2 - d), 9);
    expect(xs[xs.length - 1]).toBeCloseTo(w / 2 - d, 9);
    expect(zs[0]).toBeCloseTo(-(h / 2 - d), 9);
    expect(zs[zs.length - 1]).toBeCloseTo(h / 2 - d, 9);
  });

  // The correct miter formula, 1/cos(half-angle), diverges as a corner
  // sharpens — a spike vertex would otherwise fly off to an enormous
  // distance rather than a merely-wrong-by-30% one. A real (non-clamped)
  // fix for the 90° case would make this WORSE, not better, on GIS/CAD
  // footprints that do contain near-degenerate spikes. This is the trap the
  // fix must not reintroduce.
  it("clamps a sharp spike vertex to the miter limit instead of flying off toward infinity", () => {
    // Isoceles triangle, apex at the origin, interior angle at the apex
    // ~6° (well under the ~29° threshold where RING_INSET_MITER_LIMIT=4
    // starts clamping — the unclamped factor here would be 1/sin(3deg) =~
    // 19.1x the requested distance).
    const L = 100;
    const halfAngleRad = (3 * Math.PI) / 180;
    const w = L * Math.tan(halfAngleRad);
    const ring: [number, number][] = [
      [0, 0], // apex — the sharp vertex under test
      [L, -w],
      [L, w],
    ];
    const distance = 1;
    const inset = insetRing(ring, distance);
    const [ax, az] = inset[0];
    const moved = Math.hypot(ax - 0, az - 0);

    const unclampedFactor = 1 / Math.sin(halfAngleRad); // ~19.1
    expect(unclampedFactor).toBeGreaterThan(RING_INSET_MITER_LIMIT * 2); // sanity: this vertex really is sharp enough to need clamping

    expect(moved).toBeLessThanOrEqual(distance * RING_INSET_MITER_LIMIT + 1e-6);
    expect(moved).toBeCloseTo(distance * RING_INSET_MITER_LIMIT, 6);
    expect(moved).toBeLessThan(distance * unclampedFactor / 2); // nowhere near the unclamped spike
  });
});
