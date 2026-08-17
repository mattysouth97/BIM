// src/lib/plan-symbols/library/architecture.ts
//
// Section 01 — Architecture: walls, doors, windows, curtain walls, floors,
// roofs, and ceilings (see sections.ts).
//
// Drafting conventions:
// - Walls: parallel cut lines representing thickness
// - Doors: leaf rectangle + scaled swing arc (shown at ~40% radius for clarity)
// - Windows: sill/head + glass representation (3 lines) within frame depth
// - Curtain walls: mullioned lines
// - Floors/Roofs/Ceilings: boundary outline + hatch ticks

import type { SymbolGraph } from "../graph-types";

export const architectureSymbols: Record<string, SymbolGraph> = {
  // ═══════════════════════════════════════════════════════════════════════════════
  // WALLS (linear, system) — drawn as parallel lines representing thickness
  // ═══════════════════════════════════════════════════════════════════════════════

  "wall-basic-generic-200": {
    id: "wall-basic-generic-200",
    params: { thicknessMm: 200 },
    nodes: [
      // Two parallel cut lines representing the wall thickness
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / -2",
        x2: "thicknessMm",
        z2: "thicknessMm / -2",
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / 2",
        x2: "thicknessMm",
        z2: "thicknessMm / 2",
      },
    ],
  },

  "wall-exterior-brick-on-cmu": {
    id: "wall-exterior-brick-on-cmu",
    params: { thicknessMm: 363 },
    nodes: [
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / -2",
        x2: "thicknessMm",
        z2: "thicknessMm / -2",
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / 2",
        x2: "thicknessMm",
        z2: "thicknessMm / 2",
      },
    ],
  },

  "wall-exterior-cmu-insulated": {
    id: "wall-exterior-cmu-insulated",
    params: { thicknessMm: 295 },
    nodes: [
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / -2",
        x2: "thicknessMm",
        z2: "thicknessMm / -2",
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / 2",
        x2: "thicknessMm",
        z2: "thicknessMm / 2",
      },
    ],
  },

  "wall-interior-partition": {
    id: "wall-interior-partition",
    params: { thicknessMm: 115 },
    nodes: [
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / -2",
        x2: "thicknessMm",
        z2: "thicknessMm / -2",
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / 2",
        x2: "thicknessMm",
        z2: "thicknessMm / 2",
      },
    ],
  },

  "wall-stacked-brick-cmu": {
    id: "wall-stacked-brick-cmu",
    params: { thicknessMm: 363 },
    nodes: [
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / -2",
        x2: "thicknessMm",
        z2: "thicknessMm / -2",
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm / 2",
        x2: "thicknessMm",
        z2: "thicknessMm / 2",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // CURTAIN WALLS (linear & hosted)
  // ═══════════════════════════════════════════════════════════════════════════════

  "curtain-wall-storefront": {
    id: "curtain-wall-storefront",
    params: { thicknessMm: 150 },
    nodes: [
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm / -2",
        x2: "thicknessMm",
        z2: "thicknessMm / -2",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm / 2",
        x2: "thicknessMm",
        z2: "thicknessMm / 2",
      },
    ],
  },

  "curtain-mullion-rect-50x150": {
    id: "curtain-mullion-rect-50x150",
    params: { widthMm: 50, depthMm: 150 },
    nodes: [
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "depthMm",
      },
      {
        op: "rect",
        weight: "symbol",
        cx: 0,
        cz: "depthMm / 2",
        widthMm: "widthMm",
        depthMm: "depthMm / 2",
      },
    ],
  },

  "curtain-panel-glazed": {
    id: "curtain-panel-glazed",
    params: { widthMm: 1200, heightMm: 2400 },
    nodes: [
      // Glazed panel outline (thin strip for plan view)
      {
        op: "rect",
        weight: "medium",
        cx: "widthMm / 2",
        cz: 12,
        widthMm: "widthMm",
        depthMm: 24,
      },
      // Centerline
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: 12,
        x2: "widthMm",
        z2: 12,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // DOORS (hosted on wall, wall-facing local XZ plane)
  // ═══════════════════════════════════════════════════════════════════════════════

  "door-single-flush-910": {
    id: "door-single-flush-910",
    params: { widthMm: 910, heightMm: 2100 },
    nodes: [
      // Door leaf rectangle (width × depth from footprint)
      {
        op: "rect",
        weight: "medium",
        cx: "widthMm / 2",
        cz: 60,
        widthMm: "widthMm",
        depthMm: 120,
      },
      // Swing indicator line (small arc replaced with simple arc to doorframe)
      {
        op: "line",
        weight: "thin",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: 120,
        dashed: true,
      },
    ],
  },

  "door-single-flush-810": {
    id: "door-single-flush-810",
    params: { widthMm: 810, heightMm: 2100 },
    nodes: [
      {
        op: "rect",
        weight: "medium",
        cx: "widthMm / 2",
        cz: 60,
        widthMm: "widthMm",
        depthMm: 120,
      },
      {
        op: "line",
        weight: "thin",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: 120,
        dashed: true,
      },
    ],
  },

  "door-double-flush-1800": {
    id: "door-double-flush-1800",
    params: { widthMm: 1800, heightMm: 2100 },
    nodes: [
      // Two leaves
      {
        op: "rect",
        weight: "medium",
        cx: "widthMm / 4",
        cz: 60,
        widthMm: "widthMm / 2",
        depthMm: 120,
      },
      {
        op: "rect",
        weight: "medium",
        cx: "widthMm / 4 * 3",
        cz: 60,
        widthMm: "widthMm / 2",
        depthMm: 120,
      },
      // Swing indicator lines for both leaves
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: 120,
        dashed: true,
      },
      {
        op: "line",
        weight: "thin",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: 120,
        dashed: true,
      },
    ],
  },

  "door-glass-storefront": {
    id: "door-glass-storefront",
    params: { widthMm: 1000, heightMm: 2200 },
    nodes: [
      // Glass door frame with triple lines for depth
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: 128,
      },
      {
        op: "line",
        weight: "medium",
        x1: "widthMm / 2",
        z1: 0,
        x2: "widthMm / 2",
        z2: 128,
      },
      {
        op: "line",
        weight: "thin",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: 128,
      },
      // Top and bottom lines
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 128,
        x2: "widthMm",
        z2: 128,
      },
    ],
  },

  "door-sliding-1800": {
    id: "door-sliding-1800",
    params: { widthMm: 1800, heightMm: 2100 },
    nodes: [
      // One sliding leaf shown
      {
        op: "rect",
        weight: "medium",
        cx: "widthMm / 2",
        cz: 60,
        widthMm: "widthMm / 2",
        depthMm: 120,
      },
      // Track centerline
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 60,
        x2: "widthMm",
        z2: 60,
        dashed: true,
      },
    ],
  },

  "door-revolving-2400": {
    id: "door-revolving-2400",
    params: { widthMm: 2400, heightMm: 2200 },
    nodes: [
      // Revolving door circle (scaled to fit within bounds)
      {
        op: "circle",
        weight: "medium",
        cx: "widthMm / 2",
        cz: "widthMm / 2",
        radius: "widthMm / 2 * 0.8",
      },
      // Four leaves (90° apart)
      {
        op: "arrayRadial",
        count: 4,
        angleStepDeg: 90,
        children: [
          {
            op: "line",
            weight: "medium",
            x1: "widthMm / 2",
            z1: "widthMm / 2",
            x2: "widthMm",
            z2: "widthMm / 2",
          },
        ],
      },
    ],
  },

  "door-rollup-3000": {
    id: "door-rollup-3000",
    params: { widthMm: 3000, heightMm: 3000 },
    nodes: [
      // Roll-up door outline (large opening, kept to scale)
      {
        op: "rect",
        weight: "cut",
        cx: "widthMm / 2",
        cz: 100,
        widthMm: "widthMm",
        depthMm: 200,
      },
      // Rollup pattern lines
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 50,
        x2: "widthMm",
        z2: 50,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 150,
        x2: "widthMm",
        z2: 150,
      },
    ],
  },

  "door-fire-single-900": {
    id: "door-fire-single-900",
    params: { widthMm: 900, heightMm: 2100 },
    nodes: [
      // Fire door (thicker/heavier representation)
      {
        op: "rect",
        weight: "cut",
        cx: "widthMm / 2",
        cz: 70,
        widthMm: "widthMm",
        depthMm: 140,
      },
      {
        op: "line",
        weight: "thin",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: 140,
        dashed: true,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // WINDOWS (hosted on wall, wall-facing local XZ plane)
  // ═══════════════════════════════════════════════════════════════════════════════

  "window-fixed-1200x1500": {
    // thicknessMm defaults to this family's own real frame depth (catalog.json
    // nativeDimsM.z = 120mm); registry.ts/paramOverrides overwrite it with the
    // real host wall's thicknessMm at render time, so the sill/head cut lines
    // span the actual wall the window sits in, not just the frame's own depth.
    id: "window-fixed-1200x1500",
    params: { widthMm: 1200, heightMm: 1500, thicknessMm: 120 },
    nodes: [
      // Sill and head (cut lines)
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Glass triple-line (thin-medium-thin) representing frame depth
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.25",
        x2: "widthMm",
        z2: "thicknessMm * 0.25",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.75",
        x2: "widthMm",
        z2: "thicknessMm * 0.75",
      },
      // Jamb lines
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
    ],
  },

  "window-casement-900x1200": {
    // thicknessMm: see window-fixed-1200x1500 — real frame depth by default,
    // overridden with the host wall's real thicknessMm at render time.
    id: "window-casement-900x1200",
    params: { widthMm: 900, heightMm: 1200, thicknessMm: 150 },
    nodes: [
      // Sill and head
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Glass lines
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.25",
        x2: "widthMm",
        z2: "thicknessMm * 0.25",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.75",
        x2: "widthMm",
        z2: "thicknessMm * 0.75",
      },
      // Jambs
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Casement leaf centerline
      {
        op: "line",
        weight: "thin",
        x1: "widthMm / 2",
        z1: 0,
        x2: "widthMm / 2",
        z2: "thicknessMm",
      },
    ],
  },

  "window-sliding-1800x1500": {
    // thicknessMm: see window-fixed-1200x1500 — real frame depth by default,
    // overridden with the host wall's real thicknessMm at render time.
    id: "window-sliding-1800x1500",
    params: { widthMm: 1800, heightMm: 1500, thicknessMm: 140 },
    nodes: [
      // Sill and head
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Glass lines
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.25",
        x2: "widthMm",
        z2: "thicknessMm * 0.25",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.75",
        x2: "widthMm",
        z2: "thicknessMm * 0.75",
      },
      // Jambs
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Sliding leaf position
      {
        op: "line",
        weight: "thin",
        x1: "widthMm / 2",
        z1: 0,
        x2: "widthMm / 2",
        z2: "thicknessMm",
      },
    ],
  },

  "window-awning-900x600": {
    // thicknessMm: see window-fixed-1200x1500 — real frame depth by default,
    // overridden with the host wall's real thicknessMm at render time.
    id: "window-awning-900x600",
    params: { widthMm: 900, heightMm: 600, thicknessMm: 110 },
    nodes: [
      // Sill and head
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Glass (single line for small window)
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
      // Jambs
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
    ],
  },

  "window-double-casement-1500x1200": {
    // thicknessMm: see window-fixed-1200x1500 — real frame depth by default,
    // overridden with the host wall's real thicknessMm at render time.
    id: "window-double-casement-1500x1200",
    params: { widthMm: 1500, heightMm: 1200, thicknessMm: 125 },
    nodes: [
      // Sill and head
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Glass lines
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.25",
        x2: "widthMm",
        z2: "thicknessMm * 0.25",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.75",
        x2: "widthMm",
        z2: "thicknessMm * 0.75",
      },
      // Jambs
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Two casement leaves centerline
      {
        op: "line",
        weight: "thin",
        x1: "widthMm / 2",
        z1: 0,
        x2: "widthMm / 2",
        z2: "thicknessMm",
      },
    ],
  },

  "window-double-hung-900x1500": {
    // thicknessMm: see window-fixed-1200x1500 — real frame depth by default,
    // overridden with the host wall's real thicknessMm at render time.
    id: "window-double-hung-900x1500",
    params: { widthMm: 900, heightMm: 1500, thicknessMm: 120 },
    nodes: [
      // Sill and head
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Glass lines
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.25",
        x2: "widthMm",
        z2: "thicknessMm * 0.25",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.75",
        x2: "widthMm",
        z2: "thicknessMm * 0.75",
      },
      // Jambs
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Horizontal meeting rail (double-hung)
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
    ],
  },

  "window-louvre-1200x1200": {
    // thicknessMm: see window-fixed-1200x1500 — real frame depth by default,
    // overridden with the host wall's real thicknessMm at render time. Slats
    // stay evenly spaced at sixths of thicknessMm so they still fill the
    // reveal when the wall (and so the frame depth) is deeper.
    id: "window-louvre-1200x1200",
    params: { widthMm: 1200, heightMm: 1200, thicknessMm: 102.4 },
    nodes: [
      // Sill and head
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Louvre slats (horizontal lines), evenly spaced across the reveal
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: "thicknessMm * 1/6",
        x2: "widthMm",
        z2: "thicknessMm * 1/6",
      },
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: "thicknessMm * 2/6",
        x2: "widthMm",
        z2: "thicknessMm * 2/6",
      },
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: "thicknessMm * 3/6",
        x2: "widthMm",
        z2: "thicknessMm * 3/6",
      },
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: "thicknessMm * 4/6",
        x2: "widthMm",
        z2: "thicknessMm * 4/6",
      },
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: "thicknessMm * 5/6",
        x2: "widthMm",
        z2: "thicknessMm * 5/6",
      },
      // Jambs
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
    ],
  },

  "window-industrial-1800x900": {
    // thicknessMm: see window-fixed-1200x1500 — real frame depth by default,
    // overridden with the host wall's real thicknessMm at render time.
    id: "window-industrial-1800x900",
    params: { widthMm: 1800, heightMm: 900, thicknessMm: 120 },
    nodes: [
      // Sill and head
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: "widthMm",
        z2: 0,
      },
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: "thicknessMm",
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Glass lines
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.25",
        x2: "widthMm",
        z2: "thicknessMm * 0.25",
      },
      {
        op: "line",
        weight: "medium",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: "thicknessMm * 0.75",
        x2: "widthMm",
        z2: "thicknessMm * 0.75",
      },
      // Jambs
      {
        op: "line",
        weight: "cut",
        x1: 0,
        z1: 0,
        x2: 0,
        z2: "thicknessMm",
      },
      {
        op: "line",
        weight: "cut",
        x1: "widthMm",
        z1: 0,
        x2: "widthMm",
        z2: "thicknessMm",
      },
      // Horizontal mullion
      {
        op: "line",
        weight: "symbol",
        x1: 0,
        z1: "thicknessMm * 0.5",
        x2: "widthMm",
        z2: "thicknessMm * 0.5",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // FLOORS (sketch-boundary families — drawn as boundary outline + hatch)
  // ═══════════════════════════════════════════════════════════════════════════════

  "floor-generic-150": {
    id: "floor-generic-150",
    params: { thicknessMm: 150 },
    nodes: [
      // Rectangular slab boundary (1000 × 1000mm nominal)
      {
        op: "rect",
        weight: "cut",
        cx: 500,
        cz: 500,
        widthMm: 1000,
        depthMm: 1000,
      },
      // Hatch ticks along boundary edges
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 200,
        angleDeg: 0,
        lengthMm: 100,
      },
      {
        op: "tick",
        weight: "thin",
        x: 500,
        z: 200,
        angleDeg: 0,
        lengthMm: 100,
      },
      {
        op: "tick",
        weight: "thin",
        x: 1000,
        z: 200,
        angleDeg: 0,
        lengthMm: 100,
      },
    ],
  },

  "floor-concrete-200": {
    id: "floor-concrete-200",
    params: { thicknessMm: 200 },
    nodes: [
      {
        op: "rect",
        weight: "cut",
        cx: 500,
        cz: 500,
        widthMm: 1000,
        depthMm: 1000,
      },
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 200,
        angleDeg: 0,
        lengthMm: 100,
      },
      {
        op: "tick",
        weight: "thin",
        x: 500,
        z: 200,
        angleDeg: 0,
        lengthMm: 100,
      },
      {
        op: "tick",
        weight: "thin",
        x: 1000,
        z: 200,
        angleDeg: 0,
        lengthMm: 100,
      },
    ],
  },

  "floor-wood-finish": {
    id: "floor-wood-finish",
    params: { thicknessMm: 186 },
    nodes: [
      {
        op: "rect",
        weight: "cut",
        cx: 500,
        cz: 500,
        widthMm: 1000,
        depthMm: 1000,
      },
      // Diagonal hatch (wood grain pattern)
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 100,
        angleDeg: 45,
        lengthMm: 100,
      },
      {
        op: "tick",
        weight: "thin",
        x: 500,
        z: 500,
        angleDeg: 45,
        lengthMm: 100,
      },
      {
        op: "tick",
        weight: "thin",
        x: 1000,
        z: 900,
        angleDeg: 45,
        lengthMm: 100,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // ROOFS (sketch-footprint families)
  // ═══════════════════════════════════════════════════════════════════════════════

  "roof-basic-flat": {
    id: "roof-basic-flat",
    params: {},
    nodes: [
      // Flat roof boundary (1000 × 1000mm nominal)
      {
        op: "rect",
        weight: "cut",
        cx: 500,
        cz: 500,
        widthMm: 1000,
        depthMm: 1000,
      },
      // Horizontal hatch lines indicating flat plane
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 200,
        x2: 1000,
        z2: 200,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 500,
        x2: 1000,
        z2: 500,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 800,
        x2: 1000,
        z2: 800,
      },
    ],
  },

  "roof-pitched-module": {
    id: "roof-pitched-module",
    params: {},
    nodes: [
      // Pitched roof boundary (triangular profile, ~1150mm diagonal)
      {
        op: "polyline",
        weight: "cut",
        points: [
          { x: 0, z: 0 },
          { x: 1000, z: 0 },
          { x: 1000, z: 700 },
          { x: 500, z: 1150 }, // Peak at 1150mm
          { x: 0, z: 700 },
        ],
        closed: true,
      },
      // Diagonal lines indicating roof pitch
      {
        op: "line",
        weight: "thin",
        x1: 200,
        z1: 100,
        x2: 200,
        z2: 400,
      },
      {
        op: "line",
        weight: "thin",
        x1: 500,
        z1: 100,
        x2: 500,
        z2: 600,
      },
      {
        op: "line",
        weight: "thin",
        x1: 800,
        z1: 100,
        x2: 800,
        z2: 400,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // CEILINGS (sketch-or-auto families)
  // ═══════════════════════════════════════════════════════════════════════════════

  "ceiling-generic-gypsum": {
    id: "ceiling-generic-gypsum",
    params: { thicknessMm: 15 },
    nodes: [
      // Ceiling boundary
      {
        op: "rect",
        weight: "medium",
        cx: 500,
        cz: 500,
        widthMm: 1000,
        depthMm: 1000,
      },
      // Dashed hatch indicating soffit plane
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 200,
        x2: 1000,
        z2: 200,
        dashed: true,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 500,
        x2: 1000,
        z2: 500,
        dashed: true,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 800,
        x2: 1000,
        z2: 800,
        dashed: true,
      },
    ],
  },

  "ceiling-acoustic-tile": {
    id: "ceiling-acoustic-tile",
    params: { thicknessMm: 15 },
    nodes: [
      // Ceiling boundary (1224mm to reflect ~2 × 600 + 24mm frame)
      {
        op: "rect",
        weight: "medium",
        cx: 612,
        cz: 612,
        widthMm: 1224,
        depthMm: 1224,
      },
      // Tile grid pattern (600mm tiles)
      {
        op: "line",
        weight: "thin",
        x1: 300,
        z1: 0,
        x2: 300,
        z2: 1224,
      },
      {
        op: "line",
        weight: "thin",
        x1: 612,
        z1: 0,
        x2: 612,
        z2: 1224,
      },
      {
        op: "line",
        weight: "thin",
        x1: 924,
        z1: 0,
        x2: 924,
        z2: 1224,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 300,
        x2: 1224,
        z2: 300,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 612,
        x2: 1224,
        z2: 612,
      },
      {
        op: "line",
        weight: "thin",
        x1: 0,
        z1: 924,
        x2: 1224,
        z2: 924,
      },
    ],
  },
};
