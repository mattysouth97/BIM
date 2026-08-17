// src/lib/plan-symbols/library/electrical.ts
//
// Section 04 — Electrical: electrical, lighting families.
// Includes 7 lighting fixtures + 3 electrical devices (wall-mounted) + 3 equipment (floor-mounted).
// Excludes ids with bems-/energy-/ess-/ev- prefix override — those belong to library/energy-bems.ts.

import type { SymbolGraph } from "../graph-types";

export const electricalSymbols: Record<string, SymbolGraph> = {
  // ─────────────────────────────────────────────────────────────────────────
  // LIGHTING FIXTURES (7)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Troffer (recessed ceiling-mounted fluorescent/LED fixture, square, 600×600mm).
   * Plan symbol: square outline with 2x2 grid (lamp lattice cross-section).
   * Parameterized by widthMm from type or catalog.
   */
  "light-troffer-600": {
    id: "light-troffer-600",
    params: { widthMm: 595 },
    nodes: [
      // Outer square outline (cut line)
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "widthMm",
      },
      // Inner cross (grid pattern for lamp cells)
      { op: "line", weight: "thin", x1: "neg(widthMm/2)", z1: 0, x2: "widthMm/2", z2: 0 },
      { op: "line", weight: "thin", x1: 0, z1: "neg(widthMm/2)", x2: 0, z2: "widthMm/2" },
    ],
  },

  /**
   * Pendant Light (dome-shaped, hung from ceiling, 400mm diameter).
   * Plan symbol: circle representing the shade footprint.
   */
  "light-pendant": {
    id: "light-pendant",
    params: { diameterMm: 440 },
    nodes: [
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
    ],
  },

  /**
   * Downlight (recessed ceiling fixture, small, 90mm recessed).
   * Plan symbol: small circle, often called a "spot" or "downlight dot".
   */
  "light-downlight": {
    id: "light-downlight",
    params: { diameterMm: 110 },
    nodes: [
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
    ],
  },

  /**
   * Linear LED (1200mm strip fixture).
   * Plan symbol: elongated rectangle (1240mm long, 74mm wide).
   */
  "light-linear-1200": {
    id: "light-linear-1200",
    params: { widthMm: 1240, depthMm: 74 },
    nodes: [
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
    ],
  },

  /**
   * High-Bay (150W LED fixture for warehouse/industrial, 360×360mm).
   * Plan symbol: circle with four legs/hanging points (mounting bracket ticks).
   */
  "light-highbay": {
    id: "light-highbay",
    params: { diameterMm: 360 },
    nodes: [
      // Main fixture circle
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
      // Four corner mounting ticks
      {
        op: "arrayRadial",
        count: 4,
        angleStepDeg: 90,
        children: [
          {
            op: "tick",
            weight: "thin",
            x: "diameterMm/2.2",
            z: 0,
            angleDeg: 0,
            lengthMm: 100,
          },
        ],
      },
    ],
  },

  /**
   * Wall Light (surface-mounted, 180mm diameter).
   * Plan symbol: rectangle representing wall-face mounting footprint.
   */
  "light-wall": {
    id: "light-wall",
    params: { widthMm: 180, depthMm: 260 },
    nodes: [
      {
        op: "rect",
        weight: "symbol",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
    ],
  },

  /**
   * Emergency Light (twin-head exit/emergency fixture, 300×115mm).
   * Plan symbol: rectangle with indicator mark (emergency convention).
   */
  "light-emergency": {
    id: "light-emergency",
    params: { widthMm: 300, depthMm: 115 },
    nodes: [
      // Main housing
      {
        op: "rect",
        weight: "symbol",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Center indicator line
      {
        op: "line",
        weight: "thin",
        x1: "neg(widthMm/4)",
        z1: 0,
        x2: "widthMm/4",
        z2: 0,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ELECTRICAL DEVICES — WALL-MOUNTED (3)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Single Outlet / Receptacle (duplex, 230V, 86×130mm).
   * Plan symbol: duplex circle with horizontal line (NECA standard).
   * Origin at wall-face center; symbol extends inward.
   */
  "device-outlet-single": {
    id: "device-outlet-single",
    params: { widthMm: 86, depthMm: 130 },
    nodes: [
      // Outer outline (small)
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Duplex indicator: two circles stacked
      {
        op: "circle",
        weight: "thin",
        cx: 0,
        cz: "depthMm/4",
        radius: 15,
      },
      {
        op: "circle",
        weight: "thin",
        cx: 0,
        cz: "neg(depthMm/4)",
        radius: 15,
      },
      // Horizontal slit (receptacle opening)
      {
        op: "line",
        weight: "thin",
        x1: "neg(10)",
        z1: 0,
        x2: 10,
        z2: 0,
      },
    ],
  },

  /**
   * Light Switch (1-gang, 86×130mm).
   * Plan symbol: "S" glyph or simple toggle indicator.
   * Geometric approach: rectangle with indicator mark.
   */
  "device-switch": {
    id: "device-switch",
    params: { widthMm: 86, depthMm: 130 },
    nodes: [
      // Outer box
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Toggle indicator (small vertical line, offset to one side)
      {
        op: "line",
        weight: "symbol",
        x1: "neg(5)",
        z1: "neg(depthMm/3)",
        x2: "neg(5)",
        z2: "depthMm/3",
      },
    ],
  },

  /**
   * Thermostat (Digital, 104×22mm wall-mounted).
   * Plan symbol: rectangle with center indicator line (temperature sense).
   */
  "device-thermostat": {
    id: "device-thermostat",
    params: { widthMm: 104, depthMm: 22 },
    nodes: [
      // Main housing rectangle
      {
        op: "rect",
        weight: "symbol",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Center indicator line (temperature sense mark)
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "neg(depthMm/2)",
        x2: 0,
        z2: "depthMm/2",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ELECTRICAL EQUIPMENT — FLOOR-MOUNTED (3)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Transformer (Pad 500 kVA, 1550×1930mm).
   * Plan symbol: large rectangle with internal transformer symbol
   * (two coils shown as circles or ovals).
   */
  "electrical-transformer": {
    id: "electrical-transformer",
    params: { widthMm: 1550, depthMm: 1930 },
    nodes: [
      // Outer enclosure (cut line)
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Interior transformer coil representation (two circles side by side)
      {
        op: "circle",
        weight: "thin",
        cx: "neg(300)",
        cz: 0,
        radius: 150,
      },
      {
        op: "circle",
        weight: "thin",
        cx: 300,
        cz: 0,
        radius: 150,
      },
    ],
  },

  /**
   * UPS (Floor 80 kVA, 620×1800mm).
   * Plan symbol: cabinet rectangle (double-line border for equipment).
   */
  "electrical-ups": {
    id: "electrical-ups",
    params: { widthMm: 620, depthMm: 1800 },
    nodes: [
      // Outer cabinet outline (medium weight)
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Inner offset line (frame depth indication)
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: 0,
        widthMm: "widthMm - 50",
        depthMm: "depthMm - 50",
      },
    ],
  },

  /**
   * Generic Sensor (Placeholder, wall-mounted, 80×80mm).
   * Plan symbol: small circle (generic sensor point).
   */
  "generic-sensor": {
    id: "generic-sensor",
    params: { diameterMm: 80 },
    nodes: [
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
    ],
  },
};
