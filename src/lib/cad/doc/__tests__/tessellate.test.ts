// src/lib/cad/doc/__tests__/tessellate.test.ts
import { describe, it, expect } from "vitest";
import { arcPoints, circlePoints, bulgeArcPoints, ellipsePoints } from "../tessellate";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("arcPoints", () => {
  it("includes exact endpoints for a quarter arc", () => {
    const pts = arcPoints({ x: 0, y: 0 }, 1, 0, Math.PI / 2);
    expect(near(pts[0].x, 1) && near(pts[0].y, 0)).toBe(true);
    const last = pts[pts.length - 1];
    expect(near(last.x, 0) && near(last.y, 1)).toBe(true);
    for (const p of pts) expect(near(Math.hypot(p.x, p.y), 1, 1e-6)).toBe(true);
  });
  it("handles end < start by wrapping CCW (270° arc)", () => {
    const pts = arcPoints({ x: 0, y: 0 }, 2, Math.PI / 2, 0);
    // sweep = 3π/2 at ≤7.5°/seg → ≥ 36 segments
    expect(pts.length).toBeGreaterThanOrEqual(37);
  });
});

describe("circlePoints", () => {
  it("returns a ring with no duplicate closing point", () => {
    const pts = circlePoints({ x: 5, y: 5 }, 3);
    const first = pts[0], last = pts[pts.length - 1];
    expect(near(first.x, last.x) && near(first.y, last.y)).toBe(false);
    expect(pts.length).toBeGreaterThanOrEqual(48);
  });
});

describe("bulgeArcPoints", () => {
  it("returns straight segment for bulge 0", () => {
    expect(bulgeArcPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, 0)).toEqual([
      { x: 0, y: 0 }, { x: 4, y: 0 },
    ]);
  });
  it("bulge 1 = CCW semicircle, apex below a rightward chord", () => {
    // DXF: positive bulge sweeps CCW around the arc center. For chord
    // (0,0)→(4,0) the CCW semicircle runs π→2π, apex at (2,−2).
    // (Verified against ezdxf / three-dxf bulge semantics.)
    const pts = bulgeArcPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, 1);
    const mid = pts[Math.floor(pts.length / 2)];
    expect(near(mid.x, 2, 0.05)).toBe(true);
    expect(near(mid.y, -2, 0.05)).toBe(true);
    const first = pts[0], last = pts[pts.length - 1];
    expect(near(first.x, 0) && near(last.x, 4)).toBe(true);
  });
  it("negative bulge mirrors above the chord (CW sweep)", () => {
    const pts = bulgeArcPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, -1);
    const mid = pts[Math.floor(pts.length / 2)];
    expect(near(mid.y, 2, 0.05)).toBe(true);
  });
});

describe("ellipsePoints", () => {
  it("full ellipse respects ratio", () => {
    const pts = ellipsePoints({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.5, 0, Math.PI * 2);
    const xs = pts.map((p) => Math.abs(p.x));
    const ys = pts.map((p) => Math.abs(p.y));
    expect(near(Math.max(...xs), 2, 0.01)).toBe(true);
    expect(near(Math.max(...ys), 1, 0.01)).toBe(true);
  });
  it("rotated major axis rotates the ellipse", () => {
    // major axis along +Y → widest extent on Y
    const pts = ellipsePoints({ x: 0, y: 0 }, { x: 0, y: 2 }, 0.5, 0, Math.PI * 2);
    const ys = pts.map((p) => Math.abs(p.y));
    expect(near(Math.max(...ys), 2, 0.01)).toBe(true);
  });
});
