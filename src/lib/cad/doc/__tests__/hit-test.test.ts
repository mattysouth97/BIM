// src/lib/cad/doc/__tests__/hit-test.test.ts
import { describe, it, expect } from "vitest";
import { findClosedPolylineAt } from "../hit-test";
import type { CadDocument, CadPolyline } from "../types";

const ring = (id: string, x0: number): CadPolyline => ({
  id, kind: "polyline", layer: "L", closed: true,
  vertices: [{ x: x0, y: 0 }, { x: x0 + 10, y: 0 }, { x: x0 + 10, y: 10 }, { x: x0, y: 10 }],
  bulges: [0, 0, 0, 0],
});

const doc = (entities: CadDocument["entities"]): CadDocument => ({
  id: "t", layers: [], entities, unitScaleToMeters: 1,
  extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
  warnings: [], stats: { totalParsed: 0, mapped: 0, skipped: {} },
});

describe("findClosedPolylineAt", () => {
  it("hits the boundary within tolerance and the filled interior", () => {
    const d = doc([ring("a", 0)]);
    expect(findClosedPolylineAt(d, { x: 5, y: 0.2 }, 0.5)?.id).toBe("a");
    expect(findClosedPolylineAt(d, { x: 5, y: 5 }, 0.5)?.id).toBe("a");
  });
  it("returns the nearest of overlapping candidates", () => {
    const d = doc([ring("a", 0), ring("b", 9)]);
    expect(findClosedPolylineAt(d, { x: 9.1, y: 5 }, 1)?.id).toBe("b");
  });
  it("misses a point well outside the ring", () => {
    const d = doc([ring("a", 0)]);
    expect(findClosedPolylineAt(d, { x: 20, y: 20 }, 0.5)).toBeNull();
  });
});
