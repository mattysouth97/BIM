// src/lib/gis/__tests__/ring-utils.test.ts
// Ring helpers backing the footprint-alignment fix: the scene must center its
// local frame on the ring's bbox midpoint (a naive vertex average is biased by
// the duplicated closing vertex and vertex-dense edges), and generators need a
// point-in-ring test to keep bbox-derived elements inside the real outline.

import { describe, it, expect } from "vitest";
import { ringBboxCenter, pointInRing } from "@/lib/gis/ring-utils";

// Closed L-shaped ring, bbox 20 × 16 centered on the origin.
// Notch: the SE region x ∈ [2, 10], z ∈ [-8, -2] is cut away.
const L_RING: [number, number][] = [
  [-10, -8],
  [2, -8],
  [2, -2],
  [10, -2],
  [10, 8],
  [-10, 8],
  [-10, -8],
];

describe("ringBboxCenter", () => {
  it("returns the bbox midpoint, not the biased vertex average", () => {
    expect(ringBboxCenter(L_RING)).toEqual([0, 0]);
    // The naive average of these 7 vertices is NOT the center — guard the
    // difference so a regression back to vertex averaging fails loudly.
    const avg = L_RING.reduce((s, p) => s + p[0], 0) / L_RING.length;
    expect(avg).not.toBeCloseTo(0, 5);
  });

  it("works for an offset rectangle", () => {
    const rect: [number, number][] = [
      [5, 10],
      [15, 10],
      [15, 30],
      [5, 30],
      [5, 10],
    ];
    expect(ringBboxCenter(rect)).toEqual([10, 20]);
  });
});

describe("pointInRing", () => {
  it("accepts points in the L body", () => {
    expect(pointInRing(0, 0, L_RING)).toBe(true);
    expect(pointInRing(-9, -7, L_RING)).toBe(true); // SW corner area
    expect(pointInRing(9, 7, L_RING)).toBe(true); // NE corner area
    expect(pointInRing(9, 0, L_RING)).toBe(true); // east wing above notch
  });

  it("rejects points in the notch and outside the bbox", () => {
    expect(pointInRing(6, -5, L_RING)).toBe(false); // inside the notch
    expect(pointInRing(9, -7, L_RING)).toBe(false); // deep notch corner
    expect(pointInRing(12, 0, L_RING)).toBe(false); // east of bbox
    expect(pointInRing(0, -9, L_RING)).toBe(false); // south of bbox
  });

  it("handles open (unclosed) rings the same way", () => {
    const open = L_RING.slice(0, -1) as [number, number][];
    expect(pointInRing(0, 0, open)).toBe(true);
    expect(pointInRing(6, -5, open)).toBe(false);
  });
});
