// src/lib/cad/doc/__tests__/to-footprint.test.ts
import { describe, it, expect } from "vitest";
import { polylineToFootprint } from "../to-footprint";
import type { CadPolyline } from "../types";

const rect: CadPolyline = {
  id: "e0", kind: "polyline", layer: "OUTLINE", closed: true,
  vertices: [{ x: 100, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 110 }, { x: 100, y: 110 }],
  bulges: [0, 0, 0, 0],
};

describe("polylineToFootprint", () => {
  it("centers at bbox origin and computes area", () => {
    const fp = polylineToFootprint(rect)!;
    expect(fp.areaSqm).toBeCloseTo(200, 6);
    expect(fp.polygon[0]).toEqual([-10, -5]);
    expect(fp.polygon[2]).toEqual([10, 5]);
  });
  it("rejects open or degenerate polylines", () => {
    expect(polylineToFootprint({ ...rect, closed: false })).toBeNull();
    expect(
      polylineToFootprint({ ...rect, vertices: rect.vertices.slice(0, 2), bulges: [0, 0] }),
    ).toBeNull();
  });
  it("tessellates bulged edges into the polygon", () => {
    const bulged = { ...rect, bulges: [1, 0, 0, 0] };
    const fp = polylineToFootprint(bulged)!;
    expect(fp.polygon.length).toBeGreaterThan(6);
  });
});
