import { describe, expect, it } from "vitest";
import { insetRing, pointInRing } from "../ring-utils";

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
});
