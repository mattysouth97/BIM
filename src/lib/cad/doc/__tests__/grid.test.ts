// src/lib/cad/doc/__tests__/grid.test.ts
import { describe, it, expect } from "vitest";
import { snapToGrid, applyOrtho } from "../grid";

describe("snapToGrid", () => {
  it("rounds to the nearest step in both directions", () => {
    expect(snapToGrid({ x: 1.26, y: -0.74 }, 0.5)).toEqual({ x: 1.5, y: -0.5 });
    expect(snapToGrid({ x: 1.24, y: -0.76 }, 0.5)).toEqual({ x: 1, y: -1 });
  });
  it("step 0 or negative passes through", () => {
    expect(snapToGrid({ x: 1.23, y: 4.56 }, 0)).toEqual({ x: 1.23, y: 4.56 });
    expect(snapToGrid({ x: 1.23, y: 4.56 }, -1)).toEqual({ x: 1.23, y: 4.56 });
  });
});

describe("applyOrtho", () => {
  const anchor = { x: 10, y: 10 };
  it("locks horizontal when |dx| dominates", () => {
    expect(applyOrtho(anchor, { x: 15, y: 11 })).toEqual({ x: 15, y: 10 });
  });
  it("locks vertical when |dy| dominates", () => {
    expect(applyOrtho(anchor, { x: 11, y: 3 })).toEqual({ x: 10, y: 3 });
  });
  it("tie goes horizontal", () => {
    expect(applyOrtho(anchor, { x: 12, y: 12 })).toEqual({ x: 12, y: 10 });
  });
});
