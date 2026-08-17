// src/lib/plan-symbols/library/mechanical.ts
//
// Section 03 — Mechanical: equipment families (see sections.ts).
// Authoring phase for mechanical equipment symbols.
//
// Conventions:
// - VAV: box with fan glyph (circle + diagonal)
// - Pump: circle (motor) + triangle (impeller)
// - Expansion tank: circle (tank footprint)
// - Diffuser: square grid pattern
// - Generic equipment: box with label tick

import type { SymbolGraph } from "../graph-types";

export const mechanicalSymbols: Record<string, SymbolGraph> = {
  "mep-vav": {
    id: "mep-vav",
    params: {
      widthMm: 740,
      depthMm: 370,
    },
    nodes: [
      // Equipment outline rect
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Fan glyph: circle at center
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "min(widthMm, depthMm) / 4",
      },
      // Fan blade diagonal
      {
        op: "line",
        weight: "symbol",
        x1: "neg(min(widthMm, depthMm) / 4)",
        z1: "neg(min(widthMm, depthMm) / 4)",
        x2: "min(widthMm, depthMm) / 4",
        z2: "min(widthMm, depthMm) / 4",
      },
    ],
  },

  "mep-pump": {
    id: "mep-pump",
    params: {
      diameterMm: 210,
    },
    nodes: [
      // Motor circle
      {
        op: "circle",
        weight: "medium",
        cx: 0,
        cz: 0,
        radius: "diameterMm / 2",
      },
      // Impeller triangle pointing +X
      {
        op: "polyline",
        weight: "symbol",
        points: [
          { x: "diameterMm / 2.5", z: 0 },
          { x: "neg(diameterMm / 3)", z: "diameterMm / 4" },
          { x: "neg(diameterMm / 3)", z: "neg(diameterMm / 4)" },
        ],
        closed: true,
      },
    ],
  },

  "mep-expansion-tank": {
    id: "mep-expansion-tank",
    params: {
      diameterMm: 176,
    },
    nodes: [
      // Tank circle outline
      {
        op: "circle",
        weight: "medium",
        cx: 0,
        cz: 0,
        radius: "diameterMm / 2",
      },
      // Expansion line (center horizontal)
      {
        op: "line",
        weight: "thin",
        x1: "neg(diameterMm / 2)",
        z1: 0,
        x2: "diameterMm / 2",
        z2: 0,
      },
    ],
  },

  "mep-diffuser": {
    id: "mep-diffuser",
    params: {
      sizeMm: 600,
    },
    nodes: [
      // Outer frame
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "sizeMm",
        depthMm: "sizeMm",
      },
      // Grid pattern: two lines dividing the square into 4 quadrants
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "neg(sizeMm / 2)",
        x2: 0,
        z2: "sizeMm / 2",
      },
      {
        op: "line",
        weight: "thin",
        x1: "neg(sizeMm / 2)",
        z1: 0,
        x2: "sizeMm / 2",
        z2: 0,
      },
      // Add four small cross marks in each quadrant for diffuser detail
      {
        op: "line",
        weight: "symbol",
        x1: "neg(sizeMm / 4)",
        z1: "neg(sizeMm / 4 - 50)",
        x2: "neg(sizeMm / 4)",
        z2: "neg(sizeMm / 4 + 50)",
      },
      {
        op: "line",
        weight: "symbol",
        x1: "neg(sizeMm / 4 - 50)",
        z1: "neg(sizeMm / 4)",
        x2: "neg(sizeMm / 4 + 50)",
        z2: "neg(sizeMm / 4)",
      },
      {
        op: "line",
        weight: "symbol",
        x1: "sizeMm / 4",
        z1: "neg(sizeMm / 4 - 50)",
        x2: "sizeMm / 4",
        z2: "neg(sizeMm / 4 + 50)",
      },
      {
        op: "line",
        weight: "symbol",
        x1: "sizeMm / 4 - 50",
        z1: "neg(sizeMm / 4)",
        x2: "sizeMm / 4 + 50",
        z2: "neg(sizeMm / 4)",
      },
      {
        op: "line",
        weight: "symbol",
        x1: "neg(sizeMm / 4)",
        z1: "sizeMm / 4 - 50",
        x2: "neg(sizeMm / 4)",
        z2: "sizeMm / 4 + 50",
      },
      {
        op: "line",
        weight: "symbol",
        x1: "neg(sizeMm / 4 - 50)",
        z1: "sizeMm / 4",
        x2: "neg(sizeMm / 4 + 50)",
        z2: "sizeMm / 4",
      },
      {
        op: "line",
        weight: "symbol",
        x1: "sizeMm / 4",
        z1: "sizeMm / 4 - 50",
        x2: "sizeMm / 4",
        z2: "sizeMm / 4 + 50",
      },
      {
        op: "line",
        weight: "symbol",
        x1: "sizeMm / 4 - 50",
        z1: "sizeMm / 4",
        x2: "sizeMm / 4 + 50",
        z2: "sizeMm / 4",
      },
    ],
  },

  "generic-equipment": {
    id: "generic-equipment",
    params: {
      widthMm: 1040,
      depthMm: 840,
    },
    nodes: [
      // Equipment outline
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Label leader tick at corner
      {
        op: "tick",
        weight: "thin",
        x: "widthMm / 2",
        z: "depthMm / 2",
        angleDeg: 45,
        lengthMm: "min(widthMm, depthMm) / 3",
      },
    ],
  },
};
