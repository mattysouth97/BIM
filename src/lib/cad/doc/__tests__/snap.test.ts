// src/lib/cad/doc/__tests__/snap.test.ts
import { describe, it, expect } from "vitest";
import { buildSnapIndex, findSnap } from "../snap";
import type { LayerGeometry } from "../build-geometry";

const seg = (layer: string, x1: number, y1: number, x2: number, y2: number): LayerGeometry => ({
  layer, positions: new Float32Array([x1, y1, 0, x2, y2, 0]), segmentCount: 1,
});

describe("snap", () => {
  it("snaps to the nearest endpoint within radius", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set(["A"]));
    const hit = findSnap(idx, { x: 0.3, y: 0.2 }, 0.5);
    expect(hit).toEqual({ point: { x: 0, y: 0 }, kind: "endpoint" });
  });
  it("prefers endpoint over midpoint at equal distance", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 2, 0)], new Set(["A"]));
    const hit = findSnap(idx, { x: 0.5, y: 0 }, 0.6);
    expect(hit?.kind).toBe("endpoint"); // (0,0) at 0.5 beats midpoint (1,0) at 0.5
  });
  it("finds midpoints", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set(["A"]));
    const hit = findSnap(idx, { x: 5.1, y: 0.1 }, 0.5);
    expect(hit).toEqual({ point: { x: 5, y: 0 }, kind: "midpoint" });
  });
  it("ignores hidden layers and returns null when out of range", () => {
    const idx = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set());
    expect(findSnap(idx, { x: 0, y: 0 }, 1)).toBeNull();
    const idx2 = buildSnapIndex([seg("A", 0, 0, 10, 0)], new Set(["A"]));
    expect(findSnap(idx2, { x: 50, y: 50 }, 1)).toBeNull();
  });
});
