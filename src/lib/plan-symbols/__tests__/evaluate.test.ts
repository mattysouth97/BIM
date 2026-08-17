import { describe, expect, it } from "vitest";

import { evaluateSymbol, MAX_SYMBOL_NODES, SymbolGraphError, tessellate, type Stroke } from "../evaluate";
import type { SymbolGraph, SymbolNode } from "../graph-types";

function graph(id: string, nodes: SymbolNode[], params?: Record<string, number>): SymbolGraph {
  return { id, nodes, params };
}

describe("evaluateSymbol: primitives", () => {
  it("evaluates a line to a two-point path in the local frame", () => {
    const g = graph("t", [{ op: "line", weight: "medium", x1: 0, z1: 0, x2: 100, z2: 50 }]);
    const geo = evaluateSymbol(g);
    expect(geo.strokes).toEqual([
      { kind: "path", points: [{ xMm: 0, zMm: 0 }, { xMm: 100, zMm: 50 }], weight: "medium", dashed: undefined },
    ]);
    expect(geo.boundsMm).toEqual({ minX: 0, maxX: 100, minZ: 0, maxZ: 50 });
  });

  it("evaluates a polyline, honouring closed", () => {
    const g = graph("t", [
      {
        op: "polyline",
        weight: "thin",
        closed: true,
        points: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 10 },
        ],
      },
    ]);
    const geo = evaluateSymbol(g);
    expect(geo.strokes[0].kind).toBe("path");
    expect(geo.strokes[0]).toMatchObject({ closed: true });
  });

  it("evaluates a centred rect to four corners, closed", () => {
    const g = graph("t", [{ op: "rect", weight: "cut", cx: 0, cz: 0, widthMm: 200, depthMm: 100 }]);
    const geo = evaluateSymbol(g);
    const stroke = geo.strokes[0];
    expect(stroke.kind).toBe("path");
    if (stroke.kind !== "path") throw new Error("expected path");
    expect(stroke.closed).toBe(true);
    expect(stroke.points).toEqual([
      { xMm: -100, zMm: -50 },
      { xMm: 100, zMm: -50 },
      { xMm: 100, zMm: 50 },
      { xMm: -100, zMm: 50 },
    ]);
    expect(geo.boundsMm).toEqual({ minX: -100, maxX: 100, minZ: -50, maxZ: 50 });
  });

  it("evaluates an arc analytically, without tessellating it", () => {
    const g = graph("t", [
      { op: "arc", weight: "thin", cx: 0, cz: 0, radius: 900, startAngleDeg: 0, sweepDeg: 90 },
    ]);
    const geo = evaluateSymbol(g);
    expect(geo.strokes[0]).toEqual({
      kind: "arc",
      centerMm: { xMm: 0, zMm: 0 },
      radiusMm: 900,
      startAngleDeg: 0,
      sweepDeg: 90,
      weight: "thin",
      dashed: undefined,
    });
  });

  it("evaluates a circle and bounds it by its full extent", () => {
    const g = graph("t", [{ op: "circle", weight: "symbol", cx: 10, cz: 20, radius: 5 }]);
    const geo = evaluateSymbol(g);
    expect(geo.strokes[0]).toMatchObject({ kind: "circle", centerMm: { xMm: 10, zMm: 20 }, radiusMm: 5 });
    expect(geo.boundsMm).toEqual({ minX: 5, maxX: 15, minZ: 15, maxZ: 25 });
  });

  it("evaluates a tick as a short centred line along angleDeg", () => {
    const g = graph("t", [{ op: "tick", weight: "thin", x: 0, z: 0, angleDeg: 0, lengthMm: 100 }]);
    const geo = evaluateSymbol(g);
    const stroke = geo.strokes[0];
    if (stroke.kind !== "path") throw new Error("expected path");
    expect(stroke.points[0].xMm).toBeCloseTo(-50);
    expect(stroke.points[1].xMm).toBeCloseTo(50);
  });

  it("applies tick defaults when angleDeg/lengthMm are omitted", () => {
    const g = graph("t", [{ op: "tick", weight: "thin", x: 0, z: 0 }]);
    const geo = evaluateSymbol(g);
    const stroke = geo.strokes[0];
    if (stroke.kind !== "path") throw new Error("expected path");
    expect(stroke.points[0].zMm).toBeCloseTo(0);
    expect(stroke.points[1].xMm - stroke.points[0].xMm).toBeCloseTo(150);
  });

  it("rejects a non-positive arc radius", () => {
    const g = graph("t", [{ op: "arc", weight: "thin", cx: 0, cz: 0, radius: 0, startAngleDeg: 0, sweepDeg: 90 }]);
    expect(() => evaluateSymbol(g)).toThrow(SymbolGraphError);
  });

  it("rejects a non-positive circle radius", () => {
    const g = graph("t", [{ op: "circle", weight: "thin", cx: 0, cz: 0, radius: -1 }]);
    expect(() => evaluateSymbol(g)).toThrow(SymbolGraphError);
  });
});

describe("evaluateSymbol: expression fields and params", () => {
  it("resolves NumericField expressions against merged params", () => {
    const g = graph(
      "door",
      [{ op: "line", weight: "cut", x1: 0, z1: 0, x2: "widthMm", z2: 0 }],
      { widthMm: 900 },
    );
    const geo = evaluateSymbol(g);
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    expect(geo.strokes[0].points[1]).toEqual({ xMm: 900, zMm: 0 });
  });

  it("lets call-site params override the graph's own defaults", () => {
    const g = graph(
      "door",
      [{ op: "line", weight: "cut", x1: 0, z1: 0, x2: "widthMm", z2: 0 }],
      { widthMm: 900 },
    );
    const geo = evaluateSymbol(g, { widthMm: 1800 });
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    expect(geo.strokes[0].points[1].xMm).toBe(1800);
  });
});

describe("evaluateSymbol: transforms", () => {
  it("translate shifts children by (dx, dz)", () => {
    const g = graph("t", [
      { op: "translate", dx: 10, dz: 20, children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }] },
    ]);
    const geo = evaluateSymbol(g);
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    expect(geo.strokes[0].points[0]).toEqual({ xMm: 10, zMm: 20 });
  });

  it("rotate turns (1,0) by 90deg into (0,1) within floating tolerance", () => {
    const g = graph("t", [
      { op: "rotate", angleDeg: 90, children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }] },
    ]);
    const geo = evaluateSymbol(g);
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    expect(geo.strokes[0].points[1].xMm).toBeCloseTo(0);
    expect(geo.strokes[0].points[1].zMm).toBeCloseTo(1);
  });

  it("mirrorX negates x only", () => {
    const g = graph("t", [
      { op: "mirrorX", children: [{ op: "line", weight: "thin", x1: 3, z1: 4, x2: 0, z2: 0 }] },
    ]);
    const geo = evaluateSymbol(g);
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    expect(geo.strokes[0].points[0]).toEqual({ xMm: -3, zMm: 4 });
  });

  it("mirrorZ negates z only", () => {
    const g = graph("t", [
      { op: "mirrorZ", children: [{ op: "line", weight: "thin", x1: 3, z1: 4, x2: 0, z2: 0 }] },
    ]);
    const geo = evaluateSymbol(g);
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    expect(geo.strokes[0].points[0]).toEqual({ xMm: 3, zMm: -4 });
  });

  it("group applies no transform of its own", () => {
    const g = graph("t", [
      { op: "group", children: [{ op: "line", weight: "thin", x1: 1, z1: 2, x2: 3, z2: 4 }] },
    ]);
    const geo = evaluateSymbol(g);
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    expect(geo.strokes[0].points).toEqual([{ xMm: 1, zMm: 2 }, { xMm: 3, zMm: 4 }]);
  });

  it("arrayLinear produces count copies stepped along the given axis", () => {
    const g = graph("t", [
      {
        op: "arrayLinear",
        count: 3,
        stepMm: 100,
        axis: "x",
        children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }],
      },
    ]);
    const geo = evaluateSymbol(g);
    expect(geo.strokes).toHaveLength(3);
    const starts = geo.strokes.map((s) => (s.kind === "path" ? s.points[0].xMm : NaN));
    expect(starts).toEqual([0, 100, 200]);
  });

  it("arrayLinear along z steps z instead of x", () => {
    const g = graph("t", [
      {
        op: "arrayLinear",
        count: 2,
        stepMm: 50,
        axis: "z",
        children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }],
      },
    ]);
    const geo = evaluateSymbol(g);
    const starts = geo.strokes.map((s) => (s.kind === "path" ? s.points[0].zMm : NaN));
    expect(starts).toEqual([0, 50]);
  });

  it("arrayRadial produces count copies stepped by angle about the origin", () => {
    const g = graph("t", [
      {
        op: "arrayRadial",
        count: 4,
        angleStepDeg: 90,
        children: [{ op: "line", weight: "thin", x1: 1, z1: 0, x2: 2, z2: 0 }],
      },
    ]);
    const geo = evaluateSymbol(g);
    expect(geo.strokes).toHaveLength(4);
    const third = geo.strokes[2];
    if (third.kind !== "path") throw new Error("expected path");
    // i=2 -> rotated 180deg: (1,0) -> (-1,0)
    expect(third.points[0].xMm).toBeCloseTo(-1);
    expect(third.points[0].zMm).toBeCloseTo(0);
  });

  it("nested transforms compose (translate then rotate)", () => {
    const g = graph("t", [
      {
        op: "translate",
        dx: 10,
        dz: 0,
        children: [
          {
            op: "rotate",
            angleDeg: 90,
            children: [{ op: "line", weight: "thin", x1: 1, z1: 0, x2: 1, z2: 0 }],
          },
        ],
      },
    ]);
    const geo = evaluateSymbol(g);
    if (geo.strokes[0].kind !== "path") throw new Error("expected path");
    // rotate (1,0) by 90deg -> (0,1), then translate by (10,0) -> (10,1)
    expect(geo.strokes[0].points[0].xMm).toBeCloseTo(10);
    expect(geo.strokes[0].points[0].zMm).toBeCloseTo(1);
  });

  it("rejects a non-integer array count", () => {
    const g = graph("t", [
      { op: "arrayLinear", count: 2.5, stepMm: 10, children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }] },
    ]);
    expect(() => evaluateSymbol(g)).toThrow(SymbolGraphError);
  });

  it("rejects a negative array count", () => {
    const g = graph("t", [
      { op: "arrayRadial", count: -1, angleStepDeg: 10, children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }] },
    ]);
    expect(() => evaluateSymbol(g)).toThrow(SymbolGraphError);
  });
});

describe("evaluateSymbol: size guards", () => {
  it("throws a typed error once the node budget is exceeded", () => {
    const g = graph("busy", [
      {
        op: "arrayLinear",
        count: MAX_SYMBOL_NODES + 10,
        stepMm: 1,
        children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }],
      },
    ]);
    expect(() => evaluateSymbol(g)).toThrow(SymbolGraphError);
    expect(() => evaluateSymbol(g)).toThrow(/busy/);
  });

  it("stays within budget for a reasonably sized graph", () => {
    const g = graph("ok", [
      {
        op: "arrayLinear",
        count: MAX_SYMBOL_NODES - 1,
        stepMm: 1,
        children: [{ op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 }],
      },
    ]);
    expect(() => evaluateSymbol(g)).not.toThrow();
  });

  it("guards against runaway recursion depth", () => {
    let node: SymbolNode = { op: "line", weight: "thin", x1: 0, z1: 0, x2: 1, z2: 0 };
    for (let i = 0; i < 100; i++) {
      node = { op: "group", children: [node] };
    }
    const g = graph("deep", [node]);
    expect(() => evaluateSymbol(g)).toThrow(SymbolGraphError);
  });
});

describe("evaluateSymbol: determinism", () => {
  it("produces identical geometry for identical inputs", () => {
    const g = graph(
      "door",
      [
        { op: "line", weight: "cut", x1: 0, z1: 0, x2: "widthMm", z2: 0 },
        { op: "arc", weight: "thin", cx: 0, cz: 0, radius: "widthMm", startAngleDeg: 0, sweepDeg: 90 },
      ],
      { widthMm: 900 },
    );
    const a = evaluateSymbol(g);
    const b = evaluateSymbol(g);
    expect(a).toEqual(b);
  });
});

describe("tessellate", () => {
  it("passes path strokes through untouched", () => {
    const points = [{ xMm: 0, zMm: 0 }, { xMm: 1, zMm: 1 }];
    const strokes: Stroke[] = [{ kind: "path", points, weight: "thin" }];
    const flat = tessellate(strokes, 1);
    expect(flat).toEqual([{ points, weight: "thin", closed: undefined, dashed: undefined }]);
  });

  it("tessellates a quarter circle arc into an approximating polyline", () => {
    const strokes: Stroke[] = [
      { kind: "arc", centerMm: { xMm: 0, zMm: 0 }, radiusMm: 1000, startAngleDeg: 0, sweepDeg: 90, weight: "thin" },
    ];
    const [flat] = tessellate(strokes, 1);
    expect(flat.points.length).toBeGreaterThanOrEqual(2);
    const first = flat.points[0];
    const last = flat.points[flat.points.length - 1];
    expect(first.xMm).toBeCloseTo(1000);
    expect(first.zMm).toBeCloseTo(0);
    expect(last.xMm).toBeCloseTo(0);
    expect(last.zMm).toBeCloseTo(1000);
    // Every intermediate point should stay on the circle (within the tolerance's rounding).
    for (const p of flat.points) {
      expect(Math.hypot(p.xMm, p.zMm)).toBeCloseTo(1000, 0);
    }
  });

  it("tessellates a full circle into a closed polygon", () => {
    const strokes: Stroke[] = [{ kind: "circle", centerMm: { xMm: 0, zMm: 0 }, radiusMm: 500, weight: "symbol" }];
    const [flat] = tessellate(strokes, 5);
    expect(flat.closed).toBe(true);
    expect(flat.points.length).toBeGreaterThanOrEqual(8);
  });

  it("produces a finer approximation for a tighter tolerance", () => {
    const strokes: Stroke[] = [{ kind: "circle", centerMm: { xMm: 0, zMm: 0 }, radiusMm: 1000, weight: "symbol" }];
    const [coarse] = tessellate(strokes, 50);
    const [fine] = tessellate(strokes, 0.5);
    expect(fine.points.length).toBeGreaterThan(coarse.points.length);
  });
});
