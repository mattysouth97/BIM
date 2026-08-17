// src/lib/plan-symbols/__tests__/library-mechanical.test.ts

import { describe, expect, it } from "vitest";

import { evaluateSymbol } from "../evaluate";
import { mechanicalSymbols } from "../library/mechanical";
import { validateSection } from "./library-harness";

describe("mechanical section plan symbols", () => {
  it("passes validateSection with no errors", () => {
    const result = validateSection("mechanical", mechanicalSymbols);
    expect(result.errors).toEqual([]);
  });

  it("covers exactly 5 mechanical equipment families", () => {
    const result = validateSection("mechanical", mechanicalSymbols);
    expect(result.familyCount).toBe(5);
  });

  describe("mep-vav: VAV equipment box with fan glyph", () => {
    it("evaluates with the catalog dimensions", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-vav"]);
      expect(geo.strokes.length).toBeGreaterThan(0);
      expect(geo.boundsMm).not.toBeNull();
    });

    it("includes a circle for the fan motor", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-vav"]);
      const circles = geo.strokes.filter((s) => s.kind === "circle");
      expect(circles.length).toBeGreaterThan(0);
    });

    it("has a diagonal line for the fan blade", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-vav"]);
      const lines = geo.strokes.filter((s) => s.kind === "path" && s.points.length === 2);
      const hasSymbolWeight = lines.some((l) => l.weight === "symbol");
      expect(hasSymbolWeight).toBe(true);
    });
  });

  describe("mep-pump: circulation pump with motor circle + impeller triangle", () => {
    it("evaluates to valid geometry", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-pump"]);
      expect(geo.strokes.length).toBeGreaterThan(0);
      expect(geo.boundsMm).not.toBeNull();
    });

    it("contains a circle for the motor", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-pump"]);
      const circles = geo.strokes.filter((s) => s.kind === "circle");
      expect(circles.length).toBeGreaterThanOrEqual(1);
    });

    it("has triangular impeller glyph", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-pump"]);
      const triangles = geo.strokes.filter(
        (s) => s.kind === "path" && s.closed === true && s.points.length === 3,
      );
      expect(triangles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("mep-expansion-tank: cylindrical tank with center dividing line", () => {
    it("evaluates to valid geometry", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-expansion-tank"]);
      expect(geo.strokes.length).toBeGreaterThan(0);
      expect(geo.boundsMm).not.toBeNull();
    });

    it("has a circular outline", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-expansion-tank"]);
      const circles = geo.strokes.filter((s) => s.kind === "circle");
      expect(circles.length).toBeGreaterThanOrEqual(1);
    });

    it("includes a horizontal center line (thin weight)", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-expansion-tank"]);
      const thinLines = geo.strokes.filter((s) => s.kind === "path" && s.weight === "thin");
      expect(thinLines.length).toBeGreaterThan(0);
    });
  });

  describe("mep-diffuser: square ceiling grid with cross pattern", () => {
    it("evaluates to valid geometry with the 600mm param", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-diffuser"]);
      expect(geo.strokes.length).toBeGreaterThan(0);
      expect(geo.boundsMm).not.toBeNull();
    });

    it("is roughly square (600 x 600)", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-diffuser"]);
      const span = geo.boundsMm;
      expect(span).not.toBeNull();
      if (span) {
        const xSpan = span.maxX - span.minX;
        const zSpan = span.maxZ - span.minZ;
        // Both should be close to 600mm
        expect(xSpan).toBeGreaterThan(500);
        expect(xSpan).toBeLessThan(700);
        expect(zSpan).toBeGreaterThan(500);
        expect(zSpan).toBeLessThan(700);
      }
    });

    it("includes a frame rectangle and grid lines", () => {
      const geo = evaluateSymbol(mechanicalSymbols["mep-diffuser"]);
      const paths = geo.strokes.filter((s) => s.kind === "path");
      // Should have at least the frame rect + grid lines
      expect(paths.length).toBeGreaterThan(2);
    });
  });

  describe("generic-equipment: generic box with leader tick", () => {
    it("evaluates to valid geometry with catalog footprint", () => {
      const geo = evaluateSymbol(mechanicalSymbols["generic-equipment"]);
      expect(geo.strokes.length).toBeGreaterThan(0);
      expect(geo.boundsMm).not.toBeNull();
    });

    it("has an equipment outline rectangle", () => {
      const geo = evaluateSymbol(mechanicalSymbols["generic-equipment"]);
      const rects = geo.strokes.filter((s) => s.kind === "path" && s.closed === true);
      expect(rects.length).toBeGreaterThan(0);
    });

    it("includes a leader tick for labeling", () => {
      const geo = evaluateSymbol(mechanicalSymbols["generic-equipment"]);
      const ticks = geo.strokes.filter((s) => s.kind === "path" && s.weight === "thin");
      expect(ticks.length).toBeGreaterThan(0);
    });
  });

  it("all symbols are deterministic across repeated evaluation", () => {
    for (const [id, graph] of Object.entries(mechanicalSymbols)) {
      const first = evaluateSymbol(graph);
      const second = evaluateSymbol(graph);
      expect(JSON.stringify(first), `${id} should be deterministic`).toBe(JSON.stringify(second));
    }
  });
});
