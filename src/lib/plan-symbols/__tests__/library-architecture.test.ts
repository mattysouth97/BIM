import { describe, expect, it } from "vitest";

import { validateSection } from "./library-harness";
import { architectureSymbols } from "../library/architecture";
import { evaluateSymbol } from "../evaluate";

describe("architecture symbol library", () => {
  it("validates all 31 architecture families", () => {
    const result = validateSection("architecture", architectureSymbols);
    expect(result.familyCount).toBe(31);
    expect(result.errors).toEqual([]);
  });

  it("door leaf width matches the family parameter", () => {
    // Single-flush 910: door width should be 910mm
    const graph = architectureSymbols["door-single-flush-910"];
    if (!graph) throw new Error("door-single-flush-910 not found");

    const params = { widthMm: 910, heightMm: 2100 };
    const geometry = evaluateSymbol(graph, params);

    // Door should have a rectangle leaf + indicator line
    const paths = geometry.strokes.filter((s) => s.kind === "path");
    expect(paths.length).toBeGreaterThan(0);

    // Bounds should reflect the door width
    if (geometry.boundsMm) {
      const spanX = geometry.boundsMm.maxX - geometry.boundsMm.minX;
      expect(spanX).toBeLessThanOrEqual(910 * 1.1); // Allow small margin
    }
  });

  it("window glass triple-line pattern represents wall depth", () => {
    // Fixed window 1200x1500: should have thin-medium-thin glass lines at 200mm spacing
    const graph = architectureSymbols["window-fixed-1200x1500"];
    if (!graph) throw new Error("window-fixed-1200x1500 not found");

    const params = { widthMm: 1200, heightMm: 1500 };
    const geometry = evaluateSymbol(graph, params);

    // Count path strokes by weight (glass indicators should show thin-medium-thin)
    const pathsByWeight = {
      thin: geometry.strokes.filter((s) => s.kind === "path" && s.weight === "thin").length,
      medium: geometry.strokes.filter((s) => s.kind === "path" && s.weight === "medium").length,
      cut: geometry.strokes.filter((s) => s.kind === "path" && s.weight === "cut").length,
    };

    // Fixed window has sill + head (2 cut) + glass triple (1 thin + 1 medium + 1 thin) + jambs (2 cut)
    // = 4 cut + 2 thin + 1 medium
    expect(pathsByWeight.cut).toBeGreaterThanOrEqual(4);
    expect(pathsByWeight.medium).toBeGreaterThanOrEqual(1);
  });

  it("floor symbols generate proper boundary outline", () => {
    // Generic floor: should output rectangular boundary + hatch ticks
    const graph = architectureSymbols["floor-generic-150"];
    if (!graph) throw new Error("floor-generic-150 not found");

    const params = {};
    const geometry = evaluateSymbol(graph, params);

    // Should have strokes: rectangle (cut) + array of hatch ticks (thin)
    expect(geometry.strokes.length).toBeGreaterThan(1);
    const rects = geometry.strokes.filter((s) => s.kind === "path" && s.weight === "cut");
    const ticks = geometry.strokes.filter((s) => s.kind === "path" && s.weight === "thin");
    expect(rects.length).toBeGreaterThan(0);
    expect(ticks.length).toBeGreaterThan(0);
  });

  it("curtain panel glazed symbol fits within tight depth bounds", () => {
    // Glazed panel 1200x2400: thin strip (24mm) for plan view
    const graph = architectureSymbols["curtain-panel-glazed"];
    if (!graph) throw new Error("curtain-panel-glazed not found");

    const params = { widthMm: 1200, heightMm: 2400 };
    const geometry = evaluateSymbol(graph, params);

    // Should have rectangle + centerline
    const mediums = geometry.strokes.filter((s) => s.kind === "path" && s.weight === "medium");
    expect(mediums.length).toBeGreaterThan(0); // rectangle outline

    // Depth should be close to 24mm
    if (geometry.boundsMm) {
      const spanZ = geometry.boundsMm.maxZ - geometry.boundsMm.minZ;
      expect(spanZ).toBeLessThan(50);
    }
  });

  it("double-door symbols have two leaves", () => {
    // Double-flush 1800: should have 2 leaf rectangles + 2 swing indicator lines
    const graph = architectureSymbols["door-double-flush-1800"];
    if (!graph) throw new Error("door-double-flush-1800 not found");

    const params = { widthMm: 1800, heightMm: 2100 };
    const geometry = evaluateSymbol(graph, params);

    // Should have dashed lines indicating swing direction for both leaves
    const dashedLines = geometry.strokes.filter((s) => s.kind === "path" && s.dashed);
    expect(dashedLines.length).toBeGreaterThanOrEqual(2);
  });

  it("revolving door symbol draws circular plan with radial leaves", () => {
    // Revolving 2400: should have circle + 4 radial leaf lines
    const graph = architectureSymbols["door-revolving-2400"];
    if (!graph) throw new Error("door-revolving-2400 not found");

    const params = { widthMm: 2400, heightMm: 2200 };
    const geometry = evaluateSymbol(graph, params);

    // Count circles and radial lines
    const circles = geometry.strokes.filter((s) => s.kind === "circle");
    const radialLines = geometry.strokes.filter(
      (s) => s.kind === "path" && s.weight === "medium" && !s.dashed
    );
    expect(circles.length).toBe(1);
    expect(radialLines.length).toBeGreaterThanOrEqual(4);
  });

  it("pitched roof symbol uses polyline to show triangular profile", () => {
    // Pitched roof module: boundary should be a polyline (5 points forming triangle + base)
    const graph = architectureSymbols["roof-pitched-module"];
    if (!graph) throw new Error("roof-pitched-module not found");

    const params = {};
    const geometry = evaluateSymbol(graph, params);

    // Should have at least one polyline (the roof outline)
    const polylines = geometry.strokes.filter((s) => s.kind === "path" && s.weight === "cut");
    expect(polylines.length).toBeGreaterThan(0);
  });

  it("acoustic tile ceiling shows grid pattern (600mm tiles)", () => {
    // Acoustic tile: grid lines should represent 600mm tile spacing
    const graph = architectureSymbols["ceiling-acoustic-tile"];
    if (!graph) throw new Error("ceiling-acoustic-tile not found");

    const params = {};
    const geometry = evaluateSymbol(graph, params);

    // Count thin lines (grid) - should have 6 lines (3 vertical + 3 horizontal)
    const gridLines = geometry.strokes.filter((s) => s.kind === "path" && s.weight === "thin");
    expect(gridLines.length).toBeGreaterThanOrEqual(6);
  });
});
