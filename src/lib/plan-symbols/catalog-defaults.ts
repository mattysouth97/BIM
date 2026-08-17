// src/lib/plan-symbols/catalog-defaults.ts
//
// A modest, generic plan symbol per tool bucket — the fallback registry.ts
// reaches for when a family has no hand-authored graph yet. Every family in
// AUTHORING_FAMILIES has a `tool`, and every tool here has a template, so
// nothing goes unsymbolised while the eight library files are still empty.
//
// Each template evaluates standalone (evaluateSymbol(template, template.params))
// with sensible generic dimensions; registry.ts additionally substitutes real
// per-family widthMm/depthMm from catalog.json where the template declares
// those params, so an unauthored-but-cataloged family still reads at roughly
// its true footprint.

import type { AuthoringToolId } from "@/lib/bim/family-catalog";
import type { SymbolGraph } from "./graph-types";

export const TOOL_DEFAULTS: Record<AuthoringToolId, SymbolGraph> = {
  // Generic wall segment: a filled run from x=0 to lengthMm, thicknessMm deep.
  wall: {
    id: "tool-default/wall",
    params: { lengthMm: 1000, thicknessMm: 200 },
    nodes: [
      {
        op: "rect",
        weight: "cut",
        cx: "lengthMm/2",
        cz: 0,
        widthMm: "lengthMm",
        depthMm: "thicknessMm",
      },
    ],
  },

  // Leaf line + 90° swing arc, hinge at the origin.
  door: {
    id: "tool-default/door",
    params: { widthMm: 900 },
    nodes: [
      { op: "line", weight: "cut", x1: 0, z1: 0, x2: "widthMm", z2: 0 },
      { op: "line", weight: "medium", x1: 0, z1: 0, x2: 0, z2: "widthMm" },
      { op: "arc", weight: "thin", cx: 0, cz: 0, radius: "widthMm", startAngleDeg: 0, sweepDeg: 90 },
    ],
  },

  // Triple sill lines across the wall thickness.
  window: {
    id: "tool-default/window",
    params: { widthMm: 1200, thicknessMm: 200 },
    nodes: [
      { op: "line", weight: "cut", x1: 0, z1: "neg(thicknessMm/2)", x2: "widthMm", z2: "neg(thicknessMm/2)" },
      { op: "line", weight: "thin", x1: 0, z1: 0, x2: "widthMm", z2: 0 },
      { op: "line", weight: "cut", x1: 0, z1: "thicknessMm/2", x2: "widthMm", z2: "thicknessMm/2" },
    ],
  },

  // Filled rect with corner-to-corner diagonals.
  column: {
    id: "tool-default/column",
    params: { widthMm: 450, depthMm: 450 },
    nodes: [
      { op: "rect", weight: "cut", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" },
      {
        op: "line",
        weight: "thin",
        x1: "neg(widthMm/2)",
        z1: "neg(depthMm/2)",
        x2: "widthMm/2",
        z2: "depthMm/2",
      },
      {
        op: "line",
        weight: "thin",
        x1: "neg(widthMm/2)",
        z1: "depthMm/2",
        x2: "widthMm/2",
        z2: "neg(depthMm/2)",
      },
    ],
  },

  // Dashed run (overhead in plan) from x=0 to lengthMm, widthMm deep.
  beam: {
    id: "tool-default/beam",
    params: { lengthMm: 1000, widthMm: 300 },
    nodes: [
      {
        op: "rect",
        weight: "medium",
        dashed: true,
        cx: "lengthMm/2",
        cz: 0,
        widthMm: "lengthMm",
        depthMm: "widthMm",
      },
    ],
  },

  // Double-line footing footprint (outer cut, inner reveal).
  foundation: {
    id: "tool-default/foundation",
    params: { widthMm: 1500, depthMm: 1500 },
    nodes: [
      { op: "rect", weight: "cut", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" },
      { op: "rect", weight: "thin", cx: 0, cz: 0, widthMm: "widthMm-200", depthMm: "depthMm-200" },
    ],
  },

  // Dashed boundary — real geometry comes from the level sketch, not this instance symbol.
  floor: {
    id: "tool-default/floor",
    params: { widthMm: 4000, depthMm: 4000 },
    nodes: [{ op: "rect", weight: "thin", dashed: true, cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" }],
  },

  // Dashed boundary + a ridge line.
  roof: {
    id: "tool-default/roof",
    params: { widthMm: 6000, depthMm: 6000 },
    nodes: [
      { op: "rect", weight: "thin", dashed: true, cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" },
      { op: "line", weight: "thin", x1: "neg(widthMm/2)", z1: 0, x2: "widthMm/2", z2: 0 },
    ],
  },

  // Dashed boundary — reflected-plan detail is a ceiling plan's job, not this instance symbol.
  ceiling: {
    id: "tool-default/ceiling",
    params: { widthMm: 4000, depthMm: 4000 },
    nodes: [{ op: "rect", weight: "thin", dashed: true, cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" }],
  },

  // Boundary run + riser ticks + a travel-direction line.
  stair: {
    id: "tool-default/stair",
    params: { widthMm: 1000, lengthMm: 2800, riserCount: 8 },
    nodes: [
      { op: "rect", weight: "thin", cx: "lengthMm/2", cz: 0, widthMm: "lengthMm", depthMm: "widthMm" },
      { op: "line", weight: "thin", x1: 0, z1: "neg(widthMm/2)", x2: "lengthMm", z2: "widthMm/2" },
      {
        op: "arrayLinear",
        count: "riserCount",
        stepMm: "lengthMm/riserCount",
        axis: "x",
        children: [
          {
            op: "tick",
            weight: "medium",
            x: 0,
            z: 0,
            angleDeg: 90,
            lengthMm: "widthMm",
          },
        ],
      },
    ],
  },

  // Top rail + evenly spaced baluster ticks.
  railing: {
    id: "tool-default/railing",
    params: { lengthMm: 1000, postCount: 7 },
    nodes: [
      { op: "line", weight: "thin", x1: 0, z1: 0, x2: "lengthMm", z2: 0 },
      {
        op: "arrayLinear",
        count: "postCount",
        stepMm: "lengthMm/(postCount-1)",
        axis: "x",
        children: [{ op: "tick", weight: "thin", x: 0, z: 0, angleDeg: 90, lengthMm: 100 }],
      },
    ],
  },

  // Circle with an inscribed X — the generic ceiling-fixture mark.
  lighting: {
    id: "tool-default/lighting",
    params: { diameterMm: 600 },
    nodes: [
      { op: "circle", weight: "symbol", cx: 0, cz: 0, radius: "diameterMm/2" },
      {
        op: "line",
        weight: "thin",
        x1: "neg(diameterMm/2)",
        z1: "neg(diameterMm/2)",
        x2: "diameterMm/2",
        z2: "diameterMm/2",
      },
      {
        op: "line",
        weight: "thin",
        x1: "neg(diameterMm/2)",
        z1: "diameterMm/2",
        x2: "diameterMm/2",
        z2: "neg(diameterMm/2)",
      },
    ],
  },

  // Generic footprint rect — most furniture reads fine as its plan silhouette.
  furniture: {
    id: "tool-default/furniture",
    params: { widthMm: 800, depthMm: 600 },
    nodes: [{ op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" }],
  },

  // Generic fixture footprint rect.
  plumbing: {
    id: "tool-default/plumbing",
    params: { widthMm: 500, depthMm: 700 },
    nodes: [{ op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" }],
  },

  // Small device square with a leader tick.
  electrical: {
    id: "tool-default/electrical",
    params: { sizeMm: 150 },
    nodes: [
      { op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: "sizeMm", depthMm: "sizeMm" },
      { op: "tick", weight: "thin", x: "sizeMm/2", z: "sizeMm/2", angleDeg: 45, lengthMm: "sizeMm" },
    ],
  },

  // Circle with an inscribed cross — the generic alarm/detector mark.
  fire: {
    id: "tool-default/fire",
    params: { diameterMm: 150 },
    nodes: [
      { op: "circle", weight: "symbol", cx: 0, cz: 0, radius: "diameterMm/2" },
      { op: "tick", weight: "thin", x: 0, z: 0, angleDeg: 0, lengthMm: "diameterMm" },
      { op: "tick", weight: "thin", x: 0, z: 0, angleDeg: 90, lengthMm: "diameterMm" },
    ],
  },

  // Rect + inscribed label tick.
  equipment: {
    id: "tool-default/equipment",
    params: { widthMm: 1000, depthMm: 1000 },
    nodes: [
      { op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" },
      { op: "tick", weight: "thin", x: 0, z: 0, angleDeg: 0, lengthMm: "min(widthMm,depthMm)/2" },
    ],
  },

  // Canopy circle with a trunk-mark cross.
  planting: {
    id: "tool-default/planting",
    params: { diameterMm: 3000 },
    nodes: [
      { op: "circle", weight: "symbol", cx: 0, cz: 0, radius: "diameterMm/2" },
      { op: "tick", weight: "thin", x: 0, z: 0, angleDeg: 0, lengthMm: 200 },
      { op: "tick", weight: "thin", x: 0, z: 0, angleDeg: 90, lengthMm: 200 },
    ],
  },

  // Small circle — bollard-scale generic site object.
  site: {
    id: "tool-default/site",
    params: { diameterMm: 300 },
    nodes: [{ op: "circle", weight: "symbol", cx: 0, cz: 0, radius: "diameterMm/2" }],
  },
};
