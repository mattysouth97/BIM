// src/lib/cad/doc/__tests__/build-geometry.test.ts
import { describe, it, expect } from "vitest";
import { buildLayerGeometries } from "../build-geometry";
import type { CadDocument } from "../types";

function doc(entities: CadDocument["entities"]): CadDocument {
  return {
    id: "t", layers: [], entities, unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
    warnings: [], stats: { totalParsed: 0, mapped: entities.length, skipped: {} },
  };
}

describe("buildLayerGeometries", () => {
  it("groups segments by layer with xyz triples", () => {
    const { layers } = buildLayerGeometries(doc([
      { id: "e0", kind: "line", layer: "A", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { id: "e1", kind: "line", layer: "B", a: { x: 0, y: 0 }, b: { x: 0, y: 2 } },
      { id: "e2", kind: "line", layer: "A", a: { x: 1, y: 0 }, b: { x: 1, y: 1 } },
    ]));
    const a = layers.find((l) => l.layer === "A")!;
    expect(a.segmentCount).toBe(2);
    expect(a.positions).toHaveLength(2 * 2 * 3);
    expect([...a.positions.slice(0, 6)]).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("closes closed polylines and honors bulges", () => {
    const { layers } = buildLayerGeometries(doc([
      {
        id: "e0", kind: "polyline", layer: "P", closed: true,
        vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }],
        bulges: [0, 0, 0],
      },
    ]));
    expect(layers[0].segmentCount).toBe(3); // triangle: closing edge included
    const bulged = buildLayerGeometries(doc([
      {
        id: "e1", kind: "polyline", layer: "P", closed: false,
        vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }], bulges: [1, 0],
      },
    ]));
    expect(bulged.layers[0].segmentCount).toBeGreaterThan(10); // tessellated arc
  });

  it("extracts text entities as labels, not segments", () => {
    const { layers, texts } = buildLayerGeometries(doc([
      { id: "e0", kind: "text", layer: "N", position: { x: 1, y: 2 }, height: 0.25, rotation: 0, text: "Hi" },
    ]));
    expect(layers).toHaveLength(0);
    expect(texts).toEqual([{
      entityId: "e0", text: "Hi", position: { x: 1, y: 2 },
      height: 0.25, rotation: 0, layer: "N", colorIndex: undefined,
    }]);
  });

  it("tessellates circles into closed rings", () => {
    const { layers } = buildLayerGeometries(doc([
      { id: "e0", kind: "circle", layer: "C", center: { x: 0, y: 0 }, radius: 1 },
    ]));
    const ring = layers[0];
    // Ring closes: last segment ends where first begins.
    const n = ring.positions.length;
    expect(ring.positions[n - 3]).toBeCloseTo(ring.positions[0], 5);
    expect(ring.positions[n - 2]).toBeCloseTo(ring.positions[1], 5);
  });
});
