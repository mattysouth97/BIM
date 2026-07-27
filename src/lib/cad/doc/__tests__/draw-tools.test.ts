// src/lib/cad/doc/__tests__/draw-tools.test.ts
import { describe, it, expect } from "vitest";
import { startDraw, reduceDraw, previewChains } from "../draw-tools";

const click = (x: number, y: number) => ({ type: "click" as const, point: { x, y } });

describe("draw-line", () => {
  it("emits a line on the second click and resets", () => {
    let s = startDraw("draw-line");
    ({ state: s } = reduceDraw(s, click(0, 0)));
    const r = reduceDraw(s, click(3, 4));
    expect(r.created).toEqual({ kind: "line", a: { x: 0, y: 0 }, b: { x: 3, y: 4 } });
    expect(r.state.points).toEqual([]);
  });
});

describe("draw-rect", () => {
  it("emits a closed 4-vertex polyline from two corners", () => {
    let s = startDraw("draw-rect");
    ({ state: s } = reduceDraw(s, click(1, 1)));
    const r = reduceDraw(s, click(4, 3));
    expect(r.created).toEqual({
      kind: "polyline", closed: true, bulges: [0, 0, 0, 0],
      vertices: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 1, y: 3 }],
    });
  });
  it("degenerate corners (zero width/height) do not emit", () => {
    let s = startDraw("draw-rect");
    ({ state: s } = reduceDraw(s, click(1, 1)));
    const r = reduceDraw(s, click(1, 5));
    expect(r.created).toBeUndefined();
    expect(r.state.points).toHaveLength(1);
  });
});

describe("draw-circle", () => {
  it("emits center + radius; zero radius does not emit", () => {
    let s = startDraw("draw-circle");
    ({ state: s } = reduceDraw(s, click(2, 2)));
    const r = reduceDraw(s, click(5, 6));
    expect(r.created).toEqual({ kind: "circle", center: { x: 2, y: 2 }, radius: 5 });
    let s2 = startDraw("draw-circle");
    ({ state: s2 } = reduceDraw(s2, click(2, 2)));
    expect(reduceDraw(s2, click(2, 2)).created).toBeUndefined();
  });
});

describe("draw-polyline", () => {
  it("finish emits an open polyline with ≥2 points", () => {
    let s = startDraw("draw-polyline");
    for (const c of [click(0, 0), click(5, 0), click(5, 5)]) ({ state: s } = reduceDraw(s, c));
    const r = reduceDraw(s, { type: "finish" });
    expect(r.created).toMatchObject({ kind: "polyline", closed: false });
    expect((r.created as { vertices: unknown[] }).vertices).toHaveLength(3);
  });
  it("close event with ≥3 points emits a closed polyline", () => {
    let s = startDraw("draw-polyline");
    for (const c of [click(0, 0), click(5, 0), click(5, 5)]) ({ state: s } = reduceDraw(s, c));
    const r = reduceDraw(s, { type: "close" });
    expect(r.created).toMatchObject({ kind: "polyline", closed: true });
  });
  it("clicking the first point again closes", () => {
    let s = startDraw("draw-polyline");
    for (const c of [click(0, 0), click(5, 0), click(5, 5)]) ({ state: s } = reduceDraw(s, c));
    const r = reduceDraw(s, click(0, 0));
    expect(r.created).toMatchObject({ kind: "polyline", closed: true });
    expect((r.created as { vertices: unknown[] }).vertices).toHaveLength(3);
  });
  it("finish with 1 point resets without emitting", () => {
    let s = startDraw("draw-polyline");
    ({ state: s } = reduceDraw(s, click(0, 0)));
    const r = reduceDraw(s, { type: "finish" });
    expect(r.created).toBeUndefined();
    expect(r.state.points).toEqual([]);
  });
});

describe("cancel + previews", () => {
  it("cancel resets any tool without emitting", () => {
    let s = startDraw("draw-rect");
    ({ state: s } = reduceDraw(s, click(1, 1)));
    const r = reduceDraw(s, { type: "cancel" });
    expect(r.created).toBeUndefined();
    expect(r.state.points).toEqual([]);
  });
  it("previews are empty with no points and non-empty mid-draw", () => {
    let s = startDraw("draw-rect");
    expect(previewChains(s, { x: 9, y: 9 })).toEqual([]);
    ({ state: s } = reduceDraw(s, click(1, 1)));
    expect(previewChains(s, { x: 4, y: 3 })[0]).toHaveLength(5); // closed rect ring
    let c = startDraw("draw-circle");
    ({ state: c } = reduceDraw(c, click(0, 0)));
    expect(previewChains(c, { x: 2, y: 0 })[0].length).toBeGreaterThan(8);
  });
});
