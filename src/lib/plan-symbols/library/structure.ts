// src/lib/plan-symbols/library/structure.ts
//
// Section 02 — Structure: columns, beams, foundations, stairs, railings
// (see sections.ts). Each family receives an architectural plan symbol
// using real conventions: materials distinguish via geometry, parameters
// scale with the real footprint dimensions from catalog.json.
//
// Conventions:
// - Columns: geometry varies by type (round, rectangular, steel, concrete)
// - Beams: dashed centerline (overhead) + width lines, indexed by profile
// - Foundations: dashed boundary (pad/pile), double-line footing edge
// - Stairs: boundary + riser ticks + travel arrow
// - Railings: centerline + post/baluster ticks

import type { SymbolGraph } from "../graph-types";

export const structureSymbols: Record<string, SymbolGraph> = {
  // ===== COLUMNS (8 families) =====

  // Round concrete column: filled circle, concrete marked by center cross
  "column-struct-round-450": {
    id: "column-struct-round-450",
    params: { diameterMm: 450 },
    nodes: [
      // Outer circle (filled outline)
      {
        op: "circle",
        weight: "cut",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
      // Concrete material mark: center cross
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 0,
        lengthMm: "diameterMm/2",
      },
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 90,
        lengthMm: "diameterMm/2",
      },
    ],
  },

  "column-struct-round-600": {
    id: "column-struct-round-600",
    params: { diameterMm: 600 },
    nodes: [
      {
        op: "circle",
        weight: "cut",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 0,
        lengthMm: "diameterMm/2",
      },
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 90,
        lengthMm: "diameterMm/2",
      },
    ],
  },

  // Rectangular concrete column: filled rect with diagonals
  "column-struct-rect-450x600": {
    id: "column-struct-rect-450x600",
    params: { widthMm: 450, depthMm: 600 },
    nodes: [
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Concrete diagonals
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

  "column-struct-rect-600x750": {
    id: "column-struct-rect-600x750",
    params: { widthMm: 600, depthMm: 750 },
    nodes: [
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
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

  // Architectural wrap column: hollow rect outline
  "column-arch-rect-400": {
    id: "column-arch-rect-400",
    params: { widthMm: 400, depthMm: 400 },
    nodes: [
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Inner void
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: 0,
        widthMm: "widthMm-60",
        depthMm: "depthMm-60",
      },
    ],
  },

  // Steel H-section: outlined shape showing flange and web
  "column-steel-h-300": {
    id: "column-steel-h-300",
    params: { widthMm: 300, depthMm: 300, flangeThickMm: 60, webThickMm: 40 },
    nodes: [
      // Outer envelope
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Web marker lines (vertical)
      {
        op: "line",
        weight: "thin",
        x1: "neg(webThickMm/2)",
        z1: "neg(depthMm/2)",
        x2: "neg(webThickMm/2)",
        z2: "depthMm/2",
      },
      {
        op: "line",
        weight: "thin",
        x1: "webThickMm/2",
        z1: "neg(depthMm/2)",
        x2: "webThickMm/2",
        z2: "depthMm/2",
      },
    ],
  },

  // Steel box section: outlined rect with cross marker
  "column-steel-box-300": {
    id: "column-steel-box-300",
    params: { sizeMm: 300 },
    nodes: [
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "sizeMm",
        depthMm: "sizeMm",
      },
      // Center cross to indicate hollow box
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 0,
        lengthMm: "sizeMm/3",
      },
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 90,
        lengthMm: "sizeMm/3",
      },
    ],
  },

  // Steel pipe: filled circle (like concrete) but with center dot to distinguish
  "column-steel-pipe-273": {
    id: "column-steel-pipe-273",
    params: { diameterMm: 273 },
    nodes: [
      {
        op: "circle",
        weight: "cut",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
      // Single center dot for pipe
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: 20,
      },
    ],
  },

  // ===== BEAMS (6 families) =====

  // RC rectangular beam: dashed centerline with depth lines
  "beam-rc-rect-300x500": {
    id: "beam-rc-rect-300x500",
    params: { lengthMm: 1000, widthMm: 300, depthMm: 500 },
    nodes: [
      // Dashed centerline (overhead in plan)
      {
        op: "line",
        weight: "medium",
        dashed: true,
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      // Depth indicator lines at top and bottom
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "neg(depthMm/2)",
        x2: "lengthMm",
        z2: "neg(depthMm/2)",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "depthMm/2",
        x2: "lengthMm",
        z2: "depthMm/2",
      },
    ],
  },

  // Steel I-beam: dashed centerline with flange markers
  "beam-steel-i-200x400": {
    id: "beam-steel-i-200x400",
    params: { lengthMm: 1000, flangeWidthMm: 200, heightMm: 400 },
    nodes: [
      // Dashed centerline
      {
        op: "line",
        weight: "medium",
        dashed: true,
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      // Top and bottom flange width lines
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "neg(heightMm/2)",
        x2: "lengthMm",
        z2: "neg(heightMm/2)",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "heightMm/2",
        x2: "lengthMm",
        z2: "heightMm/2",
      },
    ],
  },

  // Steel H-beam: dashed centerline with wider flange indicators
  "beam-steel-h-300x300": {
    id: "beam-steel-h-300x300",
    params: { lengthMm: 1000, widthMm: 300, depthMm: 300 },
    nodes: [
      {
        op: "line",
        weight: "medium",
        dashed: true,
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "neg(depthMm/2)",
        x2: "lengthMm",
        z2: "neg(depthMm/2)",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "depthMm/2",
        x2: "lengthMm",
        z2: "depthMm/2",
      },
    ],
  },

  // Steel box beam: dashed centerline with box profile marks
  "beam-steel-box-200": {
    id: "beam-steel-box-200",
    params: { lengthMm: 1000, sizeMm: 200 },
    nodes: [
      {
        op: "line",
        weight: "medium",
        dashed: true,
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "neg(sizeMm/2)",
        x2: "lengthMm",
        z2: "neg(sizeMm/2)",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "sizeMm/2",
        x2: "lengthMm",
        z2: "sizeMm/2",
      },
    ],
  },

  // Steel channel beam: dashed centerline with asymmetric depth
  "beam-steel-channel-200": {
    id: "beam-steel-channel-200",
    params: { lengthMm: 1000, widthMm: 200, depthMm: 200 },
    nodes: [
      {
        op: "line",
        weight: "medium",
        dashed: true,
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      // Channel web on one side
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "neg(depthMm/2)",
        x2: "lengthMm",
        z2: "neg(depthMm/2)",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "depthMm/2",
        x2: "lengthMm",
        z2: "depthMm/2",
      },
    ],
  },

  // Timber beam: dashed centerline with wood grain hatch
  "beam-timber-100x200": {
    id: "beam-timber-100x200",
    params: { lengthMm: 1000, widthMm: 100, depthMm: 200 },
    nodes: [
      {
        op: "line",
        weight: "medium",
        dashed: true,
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "neg(depthMm/2)",
        x2: "lengthMm",
        z2: "neg(depthMm/2)",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "depthMm/2",
        x2: "lengthMm",
        z2: "depthMm/2",
      },
    ],
  },

  // ===== FOUNDATIONS (4 families) =====

  // Isolated footing pad: double-line rectangle (outer cut, inner reveal)
  "footing-isolated-1500": {
    id: "footing-isolated-1500",
    params: { widthMm: 1500, depthMm: 1500 },
    nodes: [
      // Outer footing edge (cut line)
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Inner edge (reveal/thickness)
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: 0,
        widthMm: "widthMm-200",
        depthMm: "depthMm-200",
      },
    ],
  },

  // Strip footing: dashed boundary line (foundation runs along wall)
  "footing-strip-600": {
    id: "footing-strip-600",
    params: { lengthMm: 1000, widthMm: 600, depthMm: 400 },
    nodes: [
      // Dashed centerline
      {
        op: "line",
        weight: "thin",
        dashed: true,
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      // Depth edges
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "neg(depthMm/2)",
        x2: "lengthMm",
        z2: "neg(depthMm/2)",
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "depthMm/2",
        x2: "lengthMm",
        z2: "depthMm/2",
      },
    ],
  },

  // Pile: circle with dashed center mark
  "pile-400": {
    id: "pile-400",
    params: { diameterMm: 400 },
    nodes: [
      // Pile outline
      {
        op: "circle",
        weight: "cut",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
      // Dashed centerline to indicate depth into ground
      {
        op: "line",
        weight: "thin",
        dashed: true,
        x1: 0,
        z1: "neg(diameterMm/2)",
        x2: 0,
        z2: "diameterMm/2",
      },
    ],
  },

  // Pile cap: double-line pad with corner ticks
  "pile-cap-1800": {
    id: "pile-cap-1800",
    params: { widthMm: 1800, depthMm: 1800 },
    nodes: [
      // Outer edge
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Inner edge
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: 0,
        widthMm: "widthMm-200",
        depthMm: "depthMm-200",
      },
    ],
  },

  // ===== STAIRS/RAMPS (3 families) =====

  // Stair run: boundary rectangle with riser ticks and travel direction arrow
  "stair-run-8riser": {
    id: "stair-run-8riser",
    params: { widthMm: 1000, lengthMm: 2800, riserCount: 8 },
    nodes: [
      // Stair boundary (run footprint)
      {
        op: "rect",
        weight: "thin",
        cx: "lengthMm/2",
        cz: 0,
        widthMm: "lengthMm",
        depthMm: "widthMm",
      },
      // Travel direction line (diagonal arrow)
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "neg(widthMm/2)",
        x2: "lengthMm",
        z2: "widthMm/2",
      },
      // Riser ticks perpendicular to travel
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

  // Stair landing: simple rectangle
  "stair-landing-1200": {
    id: "stair-landing-1200",
    params: { sizeMm: 1200 },
    nodes: [
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "sizeMm",
        depthMm: "sizeMm",
      },
    ],
  },

  // Ramp: dashed boundary with slope indicator ticks
  "ramp-module": {
    id: "ramp-module",
    params: { lengthMm: 1000, widthMm: 1200 },
    nodes: [
      // Ramp boundary (dashed for slope)
      {
        op: "rect",
        weight: "thin",
        dashed: true,
        cx: "lengthMm/2",
        cz: 0,
        widthMm: "lengthMm",
        depthMm: "widthMm",
      },
      // Slope indicator arrows along length
      {
        op: "arrayLinear",
        count: 3,
        stepMm: "lengthMm/2",
        axis: "x",
        children: [
          {
            op: "tick",
            weight: "thin",
            x: 0,
            z: "neg(widthMm/4)",
            angleDeg: 45,
            lengthMm: 150,
          },
        ],
      },
    ],
  },

  // ===== RAILINGS (2 families) =====

  // Guardrail: centerline with baluster ticks
  "railing-guard-1m": {
    id: "railing-guard-1m",
    params: { lengthMm: 1100, postCount: 7 },
    nodes: [
      // Rail centerline
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      // Baluster/post marks perpendicular to rail
      {
        op: "arrayLinear",
        count: "postCount",
        stepMm: "lengthMm/(postCount-1)",
        axis: "x",
        children: [
          {
            op: "tick",
            weight: "thin",
            x: 0,
            z: 0,
            angleDeg: 90,
            lengthMm: 100,
          },
        ],
      },
    ],
  },

  // Handrail: thin centerline with bracket marks
  "railing-handrail-1m": {
    id: "railing-handrail-1m",
    params: { lengthMm: 1000, postCount: 5 },
    nodes: [
      // Handrail centerline
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: 0,
        x2: "lengthMm",
        z2: 0,
      },
      // Mount bracket ticks
      {
        op: "arrayLinear",
        count: "postCount",
        stepMm: "lengthMm/(postCount-1)",
        axis: "x",
        children: [
          {
            op: "tick",
            weight: "thin",
            x: 0,
            z: 0,
            angleDeg: 90,
            lengthMm: 80,
          },
        ],
      },
    ],
  },
};
