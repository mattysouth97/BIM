import { describe, expect, it } from "vitest";

import { catalogFootprintMm } from "../catalog-dims";
import { evaluateSymbol } from "../evaluate";
import { energyBemsSymbols } from "../library/energy-bems";
import { validateSection } from "./library-harness";

describe("energy-bems section library", () => {
  it("passes the harness validation: all four families present, well-bounded, deterministic", () => {
    const result = validateSection("energy-bems", energyBemsSymbols);
    expect(result.errors).toEqual([]);
    expect(result.familyCount).toBe(4);
  });

  it("smart meter includes a dial arc (meter readout glyph)", () => {
    const graph = energyBemsSymbols["energy-smart-meter"];
    const geom = evaluateSymbol(graph);
    const arcStrokes = geom.strokes.filter((s) => s.kind === "arc");
    expect(arcStrokes.length).toBeGreaterThan(0);
    // Arc center should be in upper-right quadrant (positive x, positive z).
    const arc = arcStrokes[0];
    if (arc.kind === "arc") {
      expect(arc.centerMm.xMm).toBeGreaterThan(0);
      expect(arc.centerMm.zMm).toBeGreaterThan(0);
    }
  });

  it("ess-pcs cabinet has internal grid dividers (power module layout)", () => {
    const graph = energyBemsSymbols["ess-pcs"];
    const geom = evaluateSymbol(graph);
    const verticalLines = geom.strokes.filter(
      (s) => s.kind === "path" && s.points.length === 2 && s.weight === "thin",
    );
    // Expect at least vertical dividers + horizontal midline.
    expect(verticalLines.length).toBeGreaterThanOrEqual(5);
  });

  it("both BEMS sensors use a geometric circle to differentiate from electrical equipment", () => {
    const tempGraph = energyBemsSymbols["bems-temp-sensor"];
    const co2Graph = energyBemsSymbols["bems-co2-sensor"];

    const tempGeom = evaluateSymbol(tempGraph);
    const co2Geom = evaluateSymbol(co2Graph);

    const tempCircles = tempGeom.strokes.filter((s) => s.kind === "circle");
    const co2Circles = co2Geom.strokes.filter((s) => s.kind === "circle");

    expect(tempCircles.length).toBeGreaterThan(0);
    expect(co2Circles.length).toBeGreaterThan(0);

    // Circle radii should be proportional to the sensor width (widthMm/4).
    const tempDims = catalogFootprintMm("bems-temp-sensor")!;
    const co2Dims = catalogFootprintMm("bems-co2-sensor")!;
    if (tempCircles[0].kind === "circle" && co2Circles[0].kind === "circle") {
      // Allow ±10% tolerance for the radius calculation.
      expect(tempCircles[0].radiusMm).toBeCloseTo(tempDims.widthMm / 4, 1);
      expect(co2Circles[0].radiusMm).toBeCloseTo(co2Dims.widthMm / 4, 1);
    }
  });

  it("CO2 sensor has perpendicular ticks (cross pattern) to distinguish from temp sensor", () => {
    const co2Graph = energyBemsSymbols["bems-co2-sensor"];
    const geom = evaluateSymbol(co2Graph);

    // Should have circle + 2 perpendicular indicator lines.
    const lines = geom.strokes.filter((s) => s.kind === "path" && s.points.length === 2);
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Verify cross pattern: one roughly horizontal, one roughly vertical.
    const lineVectors = lines.map((s) => {
      if (s.kind === "path" && s.points.length === 2) {
        const [p1, p2] = s.points;
        return { dx: Math.abs(p2.xMm - p1.xMm), dz: Math.abs(p2.zMm - p1.zMm) };
      }
      return { dx: 0, dz: 0 };
    });

    const hasHorizontal = lineVectors.some((v) => v.dx > v.dz);
    const hasVertical = lineVectors.some((v) => v.dz > v.dx);
    expect(hasHorizontal && hasVertical).toBe(true);
  });

  it("symbols scale parametrically when dimensions are overridden", () => {
    const graph = energyBemsSymbols["energy-smart-meter"];

    // Evaluate at default dimensions.
    const defaultGeom = evaluateSymbol(graph);

    // Evaluate at half size.
    const scaledGeom = evaluateSymbol(graph, { widthMm: 80, depthMm: 41 });

    // Bounds should roughly half (with tolerance for arc/circle scaling).
    if (defaultGeom.boundsMm && scaledGeom.boundsMm) {
      const defaultSpan =
        (defaultGeom.boundsMm.maxX - defaultGeom.boundsMm.minX) *
        (defaultGeom.boundsMm.maxZ - defaultGeom.boundsMm.minZ);
      const scaledSpan =
        (scaledGeom.boundsMm.maxX - scaledGeom.boundsMm.minX) *
        (scaledGeom.boundsMm.maxZ - scaledGeom.boundsMm.minZ);
      // Expect scaled to be roughly 0.25× the original (linear scale squared).
      expect(scaledSpan / defaultSpan).toBeCloseTo(0.25, 0);
    }
  });
});
