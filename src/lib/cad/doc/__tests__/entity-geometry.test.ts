// src/lib/cad/doc/__tests__/entity-geometry.test.ts
import { describe, it, expect } from "vitest";
import { entityToChains } from "../entity-geometry";
import { computeExtents } from "../extents";
import type { CadEntity, CadPolyline } from "../types";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("entityToChains", () => {
  it("line → single 2-point chain", () => {
    const chains = entityToChains({
      id: "e0", kind: "line", layer: "L", a: { x: 0, y: 0 }, b: { x: 3, y: 4 },
    });
    expect(chains).toEqual([[{ x: 0, y: 0 }, { x: 3, y: 4 }]]);
  });

  it("closed straight polyline → ring chain returning to first point", () => {
    const tri: CadPolyline = {
      id: "e0", kind: "polyline", layer: "L", closed: true,
      vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], bulges: [0, 0, 0],
    };
    const [chain] = entityToChains(tri);
    expect(chain).toHaveLength(4);
    expect(chain[3]).toEqual(chain[0]);
  });

  it("open bulged polyline expands the arc", () => {
    const pl: CadPolyline = {
      id: "e0", kind: "polyline", layer: "L", closed: false,
      vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }], bulges: [1, 0],
    };
    const [chain] = entityToChains(pl);
    expect(chain.length).toBeGreaterThan(4);
    expect(chain[0]).toEqual({ x: 0, y: 0 });
    expect(chain[chain.length - 1]).toEqual({ x: 4, y: 0 });
  });

  it("circle → closed ring; text → no chains; point → 2 cross chains", () => {
    const [ring] = entityToChains({
      id: "e0", kind: "circle", layer: "L", center: { x: 0, y: 0 }, radius: 2,
    });
    expect(near(ring[0].x, ring[ring.length - 1].x)).toBe(true);
    expect(near(ring[0].y, ring[ring.length - 1].y)).toBe(true);

    expect(entityToChains({
      id: "e1", kind: "text", layer: "L", position: { x: 0, y: 0 },
      height: 0.2, rotation: 0, text: "hi",
    })).toEqual([]);

    expect(entityToChains({
      id: "e2", kind: "point", layer: "L", position: { x: 1, y: 1 },
    })).toHaveLength(2);
  });
});

describe("computeExtents", () => {
  it("unions curve-aware bounds and text positions", () => {
    const entities: CadEntity[] = [
      { id: "e0", kind: "circle", layer: "L", center: { x: 0, y: 0 }, radius: 3 },
      { id: "e1", kind: "text", layer: "L", position: { x: 10, y: 10 }, height: 0.2, rotation: 0, text: "x" },
    ];
    const ext = computeExtents(entities);
    expect(near(ext.min.x, -3)).toBe(true);
    expect(near(ext.max.x, 10)).toBe(true);
    expect(near(ext.max.y, 10)).toBe(true);
  });
  it("empty → zero extents", () => {
    expect(computeExtents([])).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
  });
});
