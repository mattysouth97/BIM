// src/lib/cad/doc/__tests__/viewport.test.ts
import { describe, it, expect } from "vitest";
import { computeFitView, screenToWorld, worldToScreen } from "../viewport";

describe("viewport", () => {
  const extents = { min: { x: 0, y: 0 }, max: { x: 100, y: 50 } };

  it("fits extents with padding, centered", () => {
    const view = computeFitView(extents, 1000, 1000, 0.05);
    expect(view.center).toEqual({ x: 50, y: 25 });
    // Width-limited: 100m across ≤ 900px usable → ≥ 0.1 m/px (padding on both sides)
    expect(view.scale).toBeCloseTo(100 / 900, 3);
  });

  it("round-trips world↔screen with Y flip", () => {
    const view = { center: { x: 50, y: 25 }, scale: 0.1 };
    const s = worldToScreen({ x: 50, y: 25 }, view, 800, 600);
    expect(s).toEqual({ x: 400, y: 300 }); // center of viewport
    const up = worldToScreen({ x: 50, y: 35 }, view, 800, 600);
    expect(up.y).toBeLessThan(300); // +Y world is up-screen
    const w = screenToWorld(s, view, 800, 600);
    expect(w.x).toBeCloseTo(50, 9);
    expect(w.y).toBeCloseTo(25, 9);
  });

  it("handles degenerate zero-size extents", () => {
    const view = computeFitView({ min: { x: 5, y: 5 }, max: { x: 5, y: 5 } }, 800, 600);
    expect(view.center).toEqual({ x: 5, y: 5 });
    expect(view.scale).toBeGreaterThan(0);
  });
});
