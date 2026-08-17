import { describe, it, expect } from "vitest";
import { evaluateSymbol } from "../evaluate";
import { furnitureSiteSymbols } from "../library/furniture-site";
import { validateSection } from "./library-harness";

describe("furniture-site plan symbols", () => {
  it("passes section validation", () => {
    const result = validateSection("furniture-site", furnitureSiteSymbols);
    expect(result.sectionId).toBe("furniture-site");
    expect(result.familyCount).toBe(15);
    expect(result.errors).toEqual([]);
  });

  it("door swing arcs have radii matching furniture widths", () => {
    // Cabinet, wardrobe, and casework should have door swing arcs
    // whose radius is half the width (standard hinge-point arc)
    const cabinetGraph = furnitureSiteSymbols["furniture-cabinet"];
    const cabinetGeo = evaluateSymbol(cabinetGraph, cabinetGraph.params!);

    const cabinetArcs = cabinetGeo.strokes.filter((s) => s.kind === "arc");
    expect(cabinetArcs.length).toBeGreaterThan(0);

    // The arc should be a 90-degree sweep (quarter circle for a hinged door)
    const arc = cabinetArcs[0];
    if (arc.kind === "arc") {
      expect(arc.sweepDeg).toBe(90);
      // Arc radius should equal half the cabinet width
      expect(Math.abs(arc.radiusMm - (cabinetGraph.params!.widthMm ?? 0) / 2)).toBeLessThan(1);
    }
  });

  it("round dining table is circular with correct diameter", () => {
    const diningGraph = furnitureSiteSymbols["furniture-dining-table"];
    const diningGeo = evaluateSymbol(diningGraph, diningGraph.params!);

    const circles = diningGeo.strokes.filter((s) => s.kind === "circle");
    expect(circles.length).toBe(1);

    const circle = circles[0];
    if (circle.kind === "circle") {
      expect(Math.abs(circle.radiusMm - (diningGraph.params!.diameterMm ?? 0) / 2)).toBeLessThan(1);
    }
  });

  it("tree canopy circle is much larger than shrub canopy", () => {
    const treeGraph = furnitureSiteSymbols["planting-tree-deciduous"];
    const shrubGraph = furnitureSiteSymbols["planting-shrub"];

    const treeGeo = evaluateSymbol(treeGraph, treeGraph.params!);
    const shrubGeo = evaluateSymbol(shrubGraph, shrubGraph.params!);

    const treeCircles = treeGeo.strokes.filter((s) => s.kind === "circle");
    const shrubCircles = shrubGeo.strokes.filter((s) => s.kind === "circle");

    expect(treeCircles.length).toBeGreaterThan(0);
    expect(shrubCircles.length).toBeGreaterThan(0);

    if (treeCircles[0].kind === "circle" && shrubCircles[0].kind === "circle") {
      const treeRadius = treeCircles[0].radiusMm;
      const shrubRadius = shrubCircles[0].radiusMm;
      // Tree canopy should be at least 2x larger
      expect(treeRadius).toBeGreaterThan(shrubRadius * 2);
    }
  });

  it("sofa outline closes with rounded corners", () => {
    const sofaGraph = furnitureSiteSymbols["furniture-sofa-2seat"];
    const sofaGeo = evaluateSymbol(sofaGraph, sofaGraph.params!);

    const polylines = sofaGeo.strokes.filter((s) => s.kind === "path");
    expect(polylines.length).toBeGreaterThan(0);

    const sofaOutline = polylines[0];
    if (sofaOutline.kind === "path") {
      // Sofa outline should be closed
      expect(sofaOutline.closed).toBe(true);
      // Should have multiple points forming rounded shape
      expect(sofaOutline.points.length).toBeGreaterThan(4);
    }
  });

  it("all symbols are deterministic and cover all families", () => {
    const families = Object.entries(furnitureSiteSymbols);
    expect(families.length).toBe(15);

    // Each family should evaluate identically on repeated runs
    for (const [, graph] of families) {
      const geo1 = evaluateSymbol(graph, graph.params!);
      const geo2 = evaluateSymbol(graph, graph.params!);
      const json1 = JSON.stringify(geo1);
      const json2 = JSON.stringify(geo2);
      expect(json1).toBe(json2);
    }
  });
});
