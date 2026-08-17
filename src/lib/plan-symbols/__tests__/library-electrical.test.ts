// src/lib/plan-symbols/__tests__/library-electrical.test.ts
//
// Test coverage for the electrical section library (lighting + electrical devices + equipment).
// Validates all 13 families (7 lighting + 3 devices + 3 equipment) for:
//  - Coverage: every family in the section has a SymbolGraph
//  - Bounds: evaluated geometry fits within 3x of real footprint
//  - Determinism: identical params yield identical geometry
//  - Section-specific: lighting symbols are circles or rectangles; electrical devices are small wall marks

import { describe, it, expect } from "vitest";
import { validateSection } from "../__tests__/library-harness";
import { electricalSymbols } from "../library/electrical";
import { evaluateSymbol } from "../evaluate";
import { catalogFootprintMm } from "../catalog-dims";

describe("library/electrical.ts", () => {
  it("validates all families in the electrical section", () => {
    const result = validateSection("electrical", electricalSymbols);
    expect(result.familyCount).toBe(13);
    expect(result.errors).toEqual([]);
  });

  it("lighting fixtures evaluate to visible geometry", () => {
    const lightingIds = [
      "light-troffer-600",
      "light-pendant",
      "light-downlight",
      "light-linear-1200",
      "light-highbay",
      "light-wall",
      "light-emergency",
    ];

    for (const id of lightingIds) {
      const graph = electricalSymbols[id];
      expect(graph).toBeDefined();
      const geometry = evaluateSymbol(graph);
      expect(geometry.strokes.length).toBeGreaterThan(0);
      expect(geometry.boundsMm).not.toBeNull();
    }
  });

  it("electrical devices (wall-mounted) are small marks with proportional bounds", () => {
    const deviceIds = ["device-outlet-single", "device-switch", "device-thermostat"];

    for (const id of deviceIds) {
      const graph = electricalSymbols[id];
      expect(graph).toBeDefined();
      const dims = catalogFootprintMm(id);
      const geometry = evaluateSymbol(graph, { ...graph.params, ...dims });

      // Bounds should be modest (wall-mounted, not large floor footprint)
      expect(geometry.boundsMm).not.toBeNull();
      if (geometry.boundsMm) {
        const span = geometry.boundsMm.maxX - geometry.boundsMm.minX;
        // Electrical devices are ~100mm or less in typical dimension
        expect(span).toBeLessThan(300);
      }
    }
  });

  it("electrical equipment (floor-mounted) have proper cabinet representation", () => {
    // Transformer: large rectangle with internal coil circles
    const transformer = electricalSymbols["electrical-transformer"];
    expect(transformer).toBeDefined();
    const transformerGeom = evaluateSymbol(transformer);
    // Should have outer rect + 2 interior circles = minimum 3 strokes
    expect(transformerGeom.strokes.length).toBeGreaterThanOrEqual(3);

    // UPS: cabinet with double-line border
    const ups = electricalSymbols["electrical-ups"];
    expect(ups).toBeDefined();
    const upsGeom = evaluateSymbol(ups);
    // Should have outer rect + inner rect = 2 strokes minimum
    expect(upsGeom.strokes.length).toBeGreaterThanOrEqual(2);
  });

  it("troffer fixture symbol dimensions scale with widthMm parameter", () => {
    const troffer = electricalSymbols["light-troffer-600"];
    expect(troffer.params?.widthMm).toBe(595);

    // Evaluate at default size
    const geom1 = evaluateSymbol(troffer);
    expect(geom1.boundsMm).not.toBeNull();

    // Evaluate at 2x size
    const geom2 = evaluateSymbol(troffer, { widthMm: 1190 });
    expect(geom2.boundsMm).not.toBeNull();

    if (geom1.boundsMm && geom2.boundsMm) {
      const span1 = geom1.boundsMm.maxX - geom1.boundsMm.minX;
      const span2 = geom2.boundsMm.maxX - geom2.boundsMm.minX;
      // Doubled parameter should yield ~doubled bounds (within 10% tolerance)
      expect(Math.abs(span2 - span1 * 2) / (span1 * 2)).toBeLessThan(0.1);
    }
  });

  it("pendant and downlight are circular (architectural convention)", () => {
    const pendant = electricalSymbols["light-pendant"];
    const downlight = electricalSymbols["light-downlight"];

    const pendantGeom = evaluateSymbol(pendant);
    const downlightGeom = evaluateSymbol(downlight);

    // Both should have at least one circle stroke
    const pendantCircles = pendantGeom.strokes.filter((s) => s.kind === "circle");
    const downlightCircles = downlightGeom.strokes.filter((s) => s.kind === "circle");

    expect(pendantCircles.length).toBeGreaterThan(0);
    expect(downlightCircles.length).toBeGreaterThan(0);
  });

  it("outlet and switch symbols are distinct geometries", () => {
    const outlet = electricalSymbols["device-outlet-single"];
    const switchDev = electricalSymbols["device-switch"];

    // Outlet should have duplex circles (2 circles representing plug slots)
    const outletGeom = evaluateSymbol(outlet);
    const outletCircles = outletGeom.strokes.filter((s) => s.kind === "circle");
    expect(outletCircles.length).toBeGreaterThanOrEqual(2);

    // Switch should have toggle indicator (different geometry)
    const switchGeom = evaluateSymbol(switchDev);
    // Switch has box + indicator line, distinct from outlet's dual circles
    expect(switchGeom.strokes.length).toBeGreaterThan(1);
  });

  it("all symbols use deterministic evaluation (no random variation)", () => {
    const ids = Object.keys(electricalSymbols);
    for (const id of ids) {
      const graph = electricalSymbols[id];
      const params = { ...graph.params, ...catalogFootprintMm(id) };

      const geom1 = JSON.stringify(evaluateSymbol(graph, params));
      const geom2 = JSON.stringify(evaluateSymbol(graph, params));

      expect(geom1).toBe(geom2);
    }
  });
});
