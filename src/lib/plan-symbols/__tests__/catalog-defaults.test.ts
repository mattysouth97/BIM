import { AUTHORING_TOOLS } from "@/lib/bim/family-catalog";
import { describe, expect, it } from "vitest";

import { TOOL_DEFAULTS } from "../catalog-defaults";
import { evaluateSymbol } from "../evaluate";

describe("catalog-defaults: TOOL_DEFAULTS", () => {
  it("has a template for every one of the 19 authoring tools", () => {
    for (const tool of AUTHORING_TOOLS) {
      expect(TOOL_DEFAULTS[tool.id]).toBeDefined();
    }
    expect(Object.keys(TOOL_DEFAULTS)).toHaveLength(AUTHORING_TOOLS.length);
  });

  for (const tool of AUTHORING_TOOLS) {
    it(`${tool.id}: evaluates standalone (with the template's own default params) to real, finite geometry`, () => {
      const template = TOOL_DEFAULTS[tool.id];
      const geo = evaluateSymbol(template);
      expect(geo.strokes.length).toBeGreaterThanOrEqual(1);
      expect(geo.boundsMm).not.toBeNull();
      const span = geo.boundsMm!.maxX - geo.boundsMm!.minX + (geo.boundsMm!.maxZ - geo.boundsMm!.minZ);
      expect(span).toBeGreaterThan(0);
      for (const stroke of geo.strokes) {
        if (stroke.kind === "path") {
          for (const p of stroke.points) {
            expect(Number.isFinite(p.xMm)).toBe(true);
            expect(Number.isFinite(p.zMm)).toBe(true);
          }
        } else {
          expect(Number.isFinite(stroke.centerMm.xMm)).toBe(true);
          expect(Number.isFinite(stroke.centerMm.zMm)).toBe(true);
          expect(Number.isFinite(stroke.radiusMm)).toBe(true);
          expect(stroke.radiusMm).toBeGreaterThan(0);
        }
      }
    });
  }

  it("the door template pairs an opening line with a 90deg swing arc sized to widthMm", () => {
    const geo = evaluateSymbol(TOOL_DEFAULTS.door);
    const arc = geo.strokes.find((s) => s.kind === "arc");
    expect(arc).toBeDefined();
    if (arc?.kind === "arc") {
      expect(arc.radiusMm).toBe(TOOL_DEFAULTS.door.params!.widthMm);
      expect(arc.sweepDeg).toBe(90);
    }
  });

  it("the stair template's riser ticks land within the run boundary", () => {
    const geo = evaluateSymbol(TOOL_DEFAULTS.stair);
    const { lengthMm } = TOOL_DEFAULTS.stair.params!;
    for (const stroke of geo.strokes) {
      if (stroke.kind !== "path") continue;
      for (const p of stroke.points) {
        expect(p.xMm).toBeGreaterThanOrEqual(-1e-6);
        expect(p.xMm).toBeLessThanOrEqual(lengthMm + 1e-6);
      }
    }
  });

  it("is deterministic across repeated evaluation", () => {
    for (const tool of AUTHORING_TOOLS) {
      const template = TOOL_DEFAULTS[tool.id];
      expect(evaluateSymbol(template)).toEqual(evaluateSymbol(template));
    }
  });
});
