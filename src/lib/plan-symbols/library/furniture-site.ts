// src/lib/plan-symbols/library/furniture-site.ts
//
// Section 07 — Furniture & Site: furniture, planting, site families
// (see sections.ts). Filled by the section authoring pass.
//
// Conventions:
// - Furniture (desks, tables, chairs, beds, cabinets): footprint rect, doors/backs as thin arcs
// - Planting (trees, shrubs): circle canopy + trunk/branch cross marks
// - Site (bollards, streetlights, fence): geometric glyphs (circles, stubs)
// - All dimensions parametrized from real catalog.json footprints (nativeDimsM.x/z × 1000 = mm)

import type { SymbolGraph } from "../graph-types";

export const furnitureSiteSymbols: Record<string, SymbolGraph> = {
  // Desks & tables
  "furniture-desk": {
    id: "furniture-desk",
    params: { widthMm: 1400, depthMm: 700 },
    nodes: [
      // Main desk outline (cut line)
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
    ],
  },

  "furniture-task-chair": {
    id: "furniture-task-chair",
    params: { widthMm: 560, depthMm: 589, backRadiusMm: 280 },
    nodes: [
      // Seat pan (rect)
      {
        op: "rect",
        weight: "symbol",
        cx: 0,
        cz: "-depthMm/4",
        widthMm: "widthMm",
        depthMm: "depthMm/2",
      },
      // Backrest arc
      {
        op: "arc",
        weight: "thin",
        cx: 0,
        cz: "depthMm/2 - backRadiusMm/2",
        radius: "backRadiusMm",
        startAngleDeg: -90,
        sweepDeg: 180,
      },
    ],
  },

  "furniture-sofa-2seat": {
    id: "furniture-sofa-2seat",
    params: { widthMm: 1600, depthMm: 780, cornerRadiusMm: 100 },
    nodes: [
      // Rounded rectangle: polyline with corner arcs
      {
        op: "group",
        children: [
          // Main outline as rounded polyline
          {
            op: "polyline",
            weight: "symbol",
            closed: true,
            points: [
              { x: "-widthMm/2 + cornerRadiusMm", z: "-depthMm/2" },
              { x: "widthMm/2 - cornerRadiusMm", z: "-depthMm/2" },
              { x: "widthMm/2", z: "-depthMm/2 + cornerRadiusMm" },
              { x: "widthMm/2", z: "depthMm/2 - cornerRadiusMm" },
              { x: "widthMm/2 - cornerRadiusMm", z: "depthMm/2" },
              { x: "-widthMm/2 + cornerRadiusMm", z: "depthMm/2" },
              { x: "-widthMm/2", z: "depthMm/2 - cornerRadiusMm" },
              { x: "-widthMm/2", z: "-depthMm/2 + cornerRadiusMm" },
            ],
          },
        ],
      },
    ],
  },

  "furniture-dining-table": {
    id: "furniture-dining-table",
    params: { diameterMm: 1200 },
    nodes: [
      // Round dining table (circle)
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
    ],
  },

  "furniture-bed-queen": {
    id: "furniture-bed-queen",
    params: { widthMm: 1640, depthMm: 2100 },
    nodes: [
      // Queen bed footprint
      {
        op: "rect",
        weight: "symbol",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Headboard (thin line at foot end)
      {
        op: "line",
        weight: "thin",
        x1: "-widthMm/2",
        z1: "depthMm/2",
        x2: "widthMm/2",
        z2: "depthMm/2",
      },
    ],
  },

  "furniture-conference-table": {
    id: "furniture-conference-table",
    params: { widthMm: 3220, depthMm: 1220 },
    nodes: [
      // Conference table (large rectangle)
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

  "furniture-cabinet": {
    id: "furniture-cabinet",
    params: { widthMm: 900, depthMm: 440, doorSwingRadiusMm: 450 },
    nodes: [
      // Cabinet body
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Door swing arc (thin, suggesting hinged doors)
      {
        op: "arc",
        weight: "thin",
        cx: "-widthMm/2",
        cz: 0,
        radius: "widthMm/2",
        startAngleDeg: -90,
        sweepDeg: 90,
      },
    ],
  },

  "furniture-bookshelf": {
    id: "furniture-bookshelf",
    params: { widthMm: 1002, depthMm: 320 },
    nodes: [
      // Bookshelf (open shelving, cut line outline)
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
    ],
  },

  "furniture-wardrobe": {
    id: "furniture-wardrobe",
    params: { widthMm: 1200, depthMm: 600, doorSwingRadiusMm: 600 },
    nodes: [
      // Wardrobe body
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Right door swing arc
      {
        op: "arc",
        weight: "thin",
        cx: "widthMm/2",
        cz: 0,
        radius: "widthMm/2",
        startAngleDeg: 90,
        sweepDeg: 90,
      },
    ],
  },

  "casework-base-cabinet": {
    id: "casework-base-cabinet",
    params: { widthMm: 840, depthMm: 600, doorSwingRadiusMm: 420 },
    nodes: [
      // Base cabinet (kitchen cabinet, etc.)
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Door swing arc (left-hinged)
      {
        op: "arc",
        weight: "thin",
        cx: "-widthMm/2",
        cz: 0,
        radius: "widthMm/2",
        startAngleDeg: -90,
        sweepDeg: 90,
      },
    ],
  },

  // Planting
  "planting-tree-deciduous": {
    id: "planting-tree-deciduous",
    params: { canopyDiameterMm: 1900, trunkDiameterMm: 150 },
    nodes: [
      // Canopy circle (plan view)
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "canopyDiameterMm/2",
      },
      // Trunk marks (cross)
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 0,
        lengthMm: "trunkDiameterMm",
      },
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 90,
        lengthMm: "trunkDiameterMm",
      },
    ],
  },

  "planting-shrub": {
    id: "planting-shrub",
    params: { canopyDiameterMm: 740 },
    nodes: [
      // Shrub canopy circle (smaller than tree)
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "canopyDiameterMm/2",
      },
      // Small center mark (trunk/center point)
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 0,
        lengthMm: 80,
      },
    ],
  },

  // Site
  "site-bollard": {
    id: "site-bollard",
    params: { diameterMm: 164 },
    nodes: [
      // Bollard (small circular post)
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm/2",
      },
    ],
  },

  "site-streetlight": {
    id: "site-streetlight",
    params: { fixtureWidthMm: 1546.5, poleDiameterMm: 280 },
    nodes: [
      // Light fixture head (represents the lamp/reflector in plan)
      {
        op: "rect",
        weight: "symbol",
        cx: 0,
        cz: "-poleDiameterMm/4",
        widthMm: "fixtureWidthMm",
        depthMm: "poleDiameterMm",
      },
      // Pole base (small circle at center bottom)
      {
        op: "circle",
        weight: "thin",
        cx: 0,
        cz: "poleDiameterMm/2",
        radius: "poleDiameterMm/4",
      },
    ],
  },

  "site-fence-module": {
    id: "site-fence-module",
    params: { lengthMm: 1000, heightMm: 1240 },
    nodes: [
      // Fence shown as thin horizontal run (overhead/dashed suggests structure)
      {
        op: "line",
        weight: "thin",
        dashed: true,
        x1: "-lengthMm/2",
        z1: 0,
        x2: "lengthMm/2",
        z2: 0,
      },
      // Posts at ends (thin vertical ticks)
      {
        op: "tick",
        weight: "thin",
        x: "-lengthMm/2",
        z: 0,
        angleDeg: 90,
        lengthMm: 100,
      },
      {
        op: "tick",
        weight: "thin",
        x: "lengthMm/2",
        z: 0,
        angleDeg: 90,
        lengthMm: 100,
      },
    ],
  },
};
