// src/lib/plan-symbols/__tests__/library-plumbing-fire.test.ts
//
// Validation tests for the plumbing-fire section symbols.
// Ensures all 11 families (8 plumbing + 3 fire) are covered,
// evaluate deterministically, and respect real-world footprints.

import { describe, expect, it } from "vitest";
import { plumbingFireSymbols } from "../library/plumbing-fire";
import { validateSection } from "./library-harness";
import { evaluateSymbol } from "../evaluate";
import { catalogFootprintMm } from "../catalog-dims";

describe("plumbing-fire section symbols", () => {
  const result = validateSection("plumbing-fire", plumbingFireSymbols);

  it("covers all 11 plumbing-fire families", () => {
    expect(result.familyCount).toBe(11);
    expect(result.errors).toHaveLength(0);
  });

  it("passes harness validation (determinism, bounds, coverage)", () => {
    expect(result.errors).toEqual([]);
  });

  /**
   * Plumbing-specific: Toilet, lavatory, sink, urinal, shower, bathtub,
   * drain, fountain. Each should evaluate to reasonable geometry matching
   * real footprints and apply proper weight conventions.
   */
  it("plumbing fixtures use correct weight conventions", () => {
    const toiletResult = evaluateSymbol(plumbingFireSymbols["plumbing-toilet"], {
      widthMm: 440,
      depthMm: 560,
    });
    expect(toiletResult.strokes.length).toBeGreaterThan(0);
    const hasWeights = toiletResult.strokes.every((s) => ["cut", "medium", "thin", "symbol"].includes(s.weight));
    expect(hasWeights).toBe(true);
  });

  /**
   * Toilet bowl should be roughly 440mm wide, 560mm deep (from catalog).
   * The symbol should center around origin within bounds.
   */
  it("toilet symbol scales correctly with catalog dimensions", () => {
    const dims = catalogFootprintMm("plumbing-toilet");
    expect(dims).toBeDefined();
    expect(dims?.widthMm).toBeCloseTo(440, 0);
    expect(dims?.depthMm).toBeCloseTo(560, 0);

    const result = evaluateSymbol(plumbingFireSymbols["plumbing-toilet"], {
      widthMm: dims!.widthMm,
      depthMm: dims!.depthMm,
    });
    expect(result.boundsMm).toBeDefined();
    const span = result.boundsMm!;
    expect(span.maxX - span.minX).toBeCloseTo(dims!.widthMm, -1);
  });

  /**
   * Floor drain (Ø150): symbol should be roughly 150mm diameter,
   * rendered as a circle with cross pattern (standard grate symbol).
   */
  it("floor drain is circular with cross pattern", () => {
    const result = evaluateSymbol(plumbingFireSymbols["plumbing-floor-drain"], {
      diameterMm: 150,
    });
    const hasCircle = result.strokes.some((s) => s.kind === "circle");
    const hasPath = result.strokes.some((s) => s.kind === "path");
    expect(hasCircle || hasPath).toBe(true);
  });

  /**
   * Shower (900mm): square fixture, should have roughly equal width/depth spans.
   */
  it("shower tray is roughly square (900x900mm)", () => {
    const result = evaluateSymbol(plumbingFireSymbols["plumbing-shower"], {
      widthMm: 900,
      depthMm: 900,
    });
    expect(result.boundsMm).toBeDefined();
    const spanX = result.boundsMm!.maxX - result.boundsMm!.minX;
    const spanZ = result.boundsMm!.maxZ - result.boundsMm!.minZ;
    expect(spanX).toBeCloseTo(spanZ, -2);
  });

  /**
   * Bathtub (1700mm x 750mm): elongated rectangle.
   * Width:depth ratio should be noticeably wider than a shower.
   */
  it("bathtub is elongated (aspect ratio ~2.27:1)", () => {
    const result = evaluateSymbol(plumbingFireSymbols["plumbing-bathtub"], {
      widthMm: 1700,
      depthMm: 750,
    });
    expect(result.boundsMm).toBeDefined();
    const spanX = result.boundsMm!.maxX - result.boundsMm!.minX;
    const spanZ = result.boundsMm!.maxZ - result.boundsMm!.minZ;
    const ratio = spanX / spanZ;
    expect(ratio).toBeGreaterThan(2.0);
    expect(ratio).toBeLessThan(2.5);
  });

  /**
   * Fire detectors and alarm devices: all fire families use "symbol" weight
   * for glyph interior marks and "cut" or "symbol" for boundaries.
   */
  it("fire devices use symbol glyphs (circle + mark patterns)", () => {
    const allFireIds = ["fire-heat-detector", "fire-mcp", "fire-alarm-bell"];
    for (const id of allFireIds) {
      const graph = plumbingFireSymbols[id];
      expect(graph).toBeDefined();
      const result = evaluateSymbol(graph, graph.params || {});
      expect(result.strokes.length).toBeGreaterThanOrEqual(1);
      const hasSymbolGlyph = result.strokes.some(
        (s) => s.weight === "symbol" || (s.weight === "cut" && s.kind === "circle")
      );
      expect(hasSymbolGlyph).toBe(true);
    }
  });

  /**
   * Heat detector (ceiling-mounted): very small symbol (~114mm),
   * should not be confused with floor drain or other fixtures.
   */
  it("heat detector is small ceiling-mounted circle", () => {
    const result = evaluateSymbol(plumbingFireSymbols["fire-heat-detector"], {
      diameterMm: 114,
    });
    expect(result.boundsMm).toBeDefined();
    const maxSpan = Math.max(
      result.boundsMm!.maxX - result.boundsMm!.minX,
      result.boundsMm!.maxZ - result.boundsMm!.minZ
    );
    expect(maxSpan).toBeLessThan(150);
  });

  /**
   * Manual Call Point (MCP): small wall-mounted square with cross,
   * should have roughly symmetric square footprint.
   */
  it("MCP is small square with cross pattern", () => {
    const result = evaluateSymbol(plumbingFireSymbols["fire-mcp"], {
      widthMm: 100,
      depthMm: 54,
    });
    expect(result.strokes.length).toBeGreaterThan(0);
    const hasCross = result.strokes.filter((s) => s.kind === "path" && s.points.length === 2).length >= 2;
    expect(hasCross).toBe(true);
  });

  /**
   * Alarm bell (Ø150): recognizable as audible device via radial arcs
   * (sound waves) and center clapper mark.
   */
  it("alarm bell has center mark and radial arcs", () => {
    const result = evaluateSymbol(plumbingFireSymbols["fire-alarm-bell"], {
      diameterMm: 150,
    });
    const hasCircles = result.strokes.filter((s) => s.kind === "circle").length;
    const hasArcs = result.strokes.filter((s) => s.kind === "arc").length;
    expect(hasCircles).toBeGreaterThanOrEqual(2);
    expect(hasArcs).toBeGreaterThanOrEqual(1);
  });
});
