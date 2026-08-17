// src/components/generative/schematic/plan-symbols-layer.test.ts
//
// The full symbolFor → evaluateSymbol → SVG chain, exercised against every one
// of the 102 real families plus the KIND_TO_TOOL fallback generated elements
// use. No rendering — these are the pure geometry/placement helpers the React
// component wraps, so no DOM is exercised.

import { describe, expect, it } from "vitest";

import { AUTHORING_FAMILIES } from "@/lib/bim/family-catalog";
import "@/lib/plan-symbols/library/index";
import { TOOL_DEFAULTS } from "@/lib/plan-symbols/catalog-defaults";

import { KIND_TO_TOOL, type PlanSymbolInstance } from "./plan-model";
import {
  evaluateInstance,
  graphForInstance,
  placeInWorldMm,
  renderStroke,
  toWorldMm,
} from "./plan-symbols-layer";
import { toScreen, type ViewTransform } from "./view-transform";

const VIEW: ViewTransform = { scale: 1 / 20, offsetX: 400, offsetY: 300 };

function instanceFor(familyId: string, overrides: Partial<PlanSymbolInstance> = {}): PlanSymbolInstance {
  return {
    id: familyId,
    familyId,
    typeId: familyId,
    // Irrelevant here: familyId is set, so graphForInstance resolves via the
    // registry directly and never consults KIND_TO_TOOL.
    kind: "furniture",
    xMm: 1000,
    zMm: 2000,
    rotationRad: 0.4,
    params: {},
    ...overrides,
  };
}

describe("plan-symbols-layer: full chain over every real family", () => {
  for (const family of AUTHORING_FAMILIES) {
    it(`${family.id} evaluates, places and renders without throwing`, () => {
      const instance = instanceFor(family.id);
      const geometry = evaluateInstance(instance);
      expect(geometry.strokes.length).toBeGreaterThan(0);

      const worldStrokes = placeInWorldMm(geometry, instance);
      expect(worldStrokes.length).toBe(geometry.strokes.length);

      for (let i = 0; i < worldStrokes.length; i++) {
        const el = renderStroke(worldStrokes[i], `${family.id}-${i}`, (p) => toScreen(VIEW, p), VIEW.scale);
        expect(el).toBeTruthy();
        const props = el.props as Record<string, unknown>;
        expect(props.d ?? props.cx).toBeDefined();
      }
    });
  }
});

describe("plan-symbols-layer: door hand mirror", () => {
  it("mirrors the local x of every point relative to the unmirrored geometry", () => {
    const left = evaluateInstance(instanceFor("door-single-flush-910", { params: { hand: "left" } }));
    const right = evaluateInstance(instanceFor("door-single-flush-910", { params: { hand: "right" } }));
    expect(left.strokes.length).toBe(right.strokes.length);

    const leftFirst = left.strokes[0];
    const rightFirst = right.strokes[0];
    if (leftFirst.kind === "path" && rightFirst.kind === "path") {
      expect(rightFirst.points[0].xMm).toBeCloseTo(-leftFirst.points[0].xMm, 6);
      expect(rightFirst.points[0].zMm).toBeCloseTo(leftFirst.points[0].zMm, 6);
    }
  });

  it("leaves geometry unmirrored when hand is left or absent", () => {
    const noHand = evaluateInstance(instanceFor("door-single-flush-910"));
    const left = evaluateInstance(instanceFor("door-single-flush-910", { params: { hand: "left" } }));
    expect(noHand).toEqual(left);
  });
});

describe("plan-symbols-layer: world placement", () => {
  it("translate + rotate matches a hand-checked 90° case", () => {
    const point = toWorldMm({ xMm: 100, zMm: 0 }, { xMm: 500, zMm: 500, rotationRad: Math.PI / 2 });
    expect(point.xMm).toBeCloseTo(500, 6);
    expect(point.zMm).toBeCloseTo(600, 6);
  });

  it("places the circle branch (door-revolving-2400) into world mm by a plain translate", () => {
    const instance: PlanSymbolInstance = instanceFor("door-revolving-2400", {
      xMm: 1000,
      zMm: 0,
      rotationRad: 0,
    });
    const geometry = evaluateInstance(instance);
    const localCircle = geometry.strokes.find((s) => s.kind === "circle");
    expect(localCircle?.kind).toBe("circle");
    if (localCircle?.kind !== "circle") throw new Error("unreachable");

    const placed = placeInWorldMm(geometry, instance);
    const worldCircle = placed.find((s) => s.kind === "circle");
    expect(worldCircle?.kind).toBe("circle");
    if (worldCircle?.kind !== "circle") throw new Error("unreachable");

    expect(worldCircle.centerMm.xMm).toBeCloseTo(localCircle.centerMm.xMm + 1000, 6);
    expect(worldCircle.centerMm.zMm).toBeCloseTo(localCircle.centerMm.zMm, 6);
    expect(worldCircle.radiusMm).toBeCloseTo(localCircle.radiusMm, 6);
  });
});

describe("plan-symbols-layer: KIND_TO_TOOL fallback for generated (familyId-less) elements", () => {
  it("resolves every symbol kind to a real tool default", () => {
    for (const [kind, tool] of Object.entries(KIND_TO_TOOL)) {
      const instance = instanceFor("unused", {
        familyId: null,
        typeId: "generated-fixture",
        kind: kind as PlanSymbolInstance["kind"],
      });
      const graph = graphForInstance(instance);
      expect(graph).toBe(TOOL_DEFAULTS[tool]);
    }
  });

  it("falls back to a generic rect for a kind with no tool mapping", () => {
    const instance = instanceFor("unused", { familyId: null, typeId: "generated-x", kind: "room" });
    const graph = graphForInstance(instance);
    expect(graph.id).toContain("fallback");
    const geometry = evaluateInstance(instance);
    expect(geometry.strokes).toHaveLength(1);
  });
});
