// src/lib/plan-symbols/library/plumbing-fire.ts
//
// Section 05 — Plumbing & Fire: plumbing, fire families (see sections.ts).
// Filled by the section authoring pass.

import type { SymbolGraph } from "../graph-types";

export const plumbingFireSymbols: Record<string, SymbolGraph> = {
  /**
   * Toilet (Floor Mounted): elongated bowl shape + tank rectangle.
   * Follows standard plumbing conventions: bowl center-front, tank rear.
   */
  "plumbing-toilet": {
    id: "plumbing-toilet",
    params: { widthMm: 440, depthMm: 560 },
    nodes: [
      // Tank rectangle (rear portion, ~60% of depth)
      {
        op: "rect",
        weight: "medium",
        cx: 0,
        cz: "depthMm * 0.15",
        widthMm: "widthMm",
        depthMm: "depthMm * 0.6",
      },
      // Bowl outline (front portion, oval-ish via arc segments)
      {
        op: "circle",
        weight: "cut",
        cx: 0,
        cz: "depthMm * 0.6",
        radius: "widthMm * 0.4",
      },
    ],
  },

  /**
   * Lavatory (Pedestal): oval basin + thin pedestal support.
   */
  "plumbing-lavatory": {
    id: "plumbing-lavatory",
    params: { widthMm: 560, depthMm: 420 },
    nodes: [
      // Pedestal base (small circle)
      {
        op: "circle",
        weight: "medium",
        cx: 0,
        cz: "-depthMm * 0.3",
        radius: "widthMm * 0.12",
      },
      // Basin outline (ellipse approximated by a wide-shallow circle)
      {
        op: "circle",
        weight: "cut",
        cx: 0,
        cz: "depthMm * 0.2",
        radius: "widthMm * 0.35",
      },
      // Faucet mark (simple tick at basin center-top)
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: "depthMm * 0.35",
        angleDeg: 90,
        lengthMm: "widthMm * 0.2",
      },
    ],
  },

  /**
   * Kitchen Sink (Single Bowl 800mm): rectangular sink bowl.
   */
  "plumbing-kitchen-sink": {
    id: "plumbing-kitchen-sink",
    params: { widthMm: 800, depthMm: 500 },
    nodes: [
      // Sink bowl outline
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Bowl interior line (reveal)
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: 0,
        widthMm: "widthMm * 0.85",
        depthMm: "depthMm * 0.85",
      },
      // Faucet location (small mark center-back)
      {
        op: "tick",
        weight: "symbol",
        x: 0,
        z: "-depthMm * 0.4",
        angleDeg: 0,
        lengthMm: 40,
      },
    ],
  },

  /**
   * Urinal (Wall Hung): vertical rectangle (portrait orientation).
   * Narrower width than toilet, hung on wall.
   */
  "plumbing-urinal": {
    id: "plumbing-urinal",
    params: { widthMm: 380, depthMm: 328 },
    nodes: [
      // Urinal bowl outline
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: "depthMm * 0.2",
        widthMm: "widthMm",
        depthMm: "depthMm * 0.9",
      },
      // Rim line (slight reveal)
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: "depthMm * 0.2",
        widthMm: "widthMm * 0.9",
        depthMm: "depthMm * 0.8",
      },
      // Drainage mark at bottom
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: "depthMm * 0.75",
        radius: 20,
      },
    ],
  },

  /**
   * Shower (900 Tray): square enclosure with tray floor.
   */
  "plumbing-shower": {
    id: "plumbing-shower",
    params: { widthMm: 900, depthMm: 900 },
    nodes: [
      // Shower tray outline (outer boundary)
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: "depthMm * 0.1",
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Tray inner edge (reveal)
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: "depthMm * 0.1",
        widthMm: "widthMm * 0.92",
        depthMm: "depthMm * 0.92",
      },
      // Drain mark center-bottom
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: "depthMm * 0.55",
        radius: 30,
      },
    ],
  },

  /**
   * Bathtub (1700mm): elongated rectangle with curved ends.
   */
  "plumbing-bathtub": {
    id: "plumbing-bathtub",
    params: { widthMm: 1700, depthMm: 750 },
    nodes: [
      // Tub outer edge
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm",
        depthMm: "depthMm",
      },
      // Tub inner reveal
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: 0,
        widthMm: "widthMm * 0.9",
        depthMm: "depthMm * 0.9",
      },
      // Drain mark (back-center)
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: "depthMm * 0.35",
        radius: 25,
      },
    ],
  },

  /**
   * Floor Drain (Ø150): circle + cross pattern (standard drain symbol).
   * Ø150 inferred from type label.
   */
  "plumbing-floor-drain": {
    id: "plumbing-floor-drain",
    params: { diameterMm: 150 },
    nodes: [
      // Drain circle
      {
        op: "circle",
        weight: "cut",
        cx: 0,
        cz: 0,
        radius: "diameterMm / 2",
      },
      // Cross (drainage grates)
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 0,
        lengthMm: "diameterMm",
      },
      {
        op: "tick",
        weight: "thin",
        x: 0,
        z: 0,
        angleDeg: 90,
        lengthMm: "diameterMm",
      },
    ],
  },

  /**
   * Drinking Fountain (Wall Hung): small rectangle + faucet mark.
   */
  "plumbing-fountain": {
    id: "plumbing-fountain",
    params: { widthMm: 340, depthMm: 370 },
    nodes: [
      // Fountain fixture outline
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: "depthMm * 0.1",
        widthMm: "widthMm",
        depthMm: "depthMm * 0.8",
      },
      // Bowl highlight (thin inner rect)
      {
        op: "rect",
        weight: "thin",
        cx: 0,
        cz: "depthMm * 0.15",
        widthMm: "widthMm * 0.85",
        depthMm: "depthMm * 0.65",
      },
      // Faucet / drinking stream symbol
      {
        op: "tick",
        weight: "symbol",
        x: 0,
        z: "-depthMm * 0.2",
        angleDeg: 90,
        lengthMm: 50,
      },
    ],
  },

  /**
   * Heat Detector (Rate-of-rise): small circle (ceiling-mounted).
   * Standard fire detection symbol per NFPA conventions.
   */
  "fire-heat-detector": {
    id: "fire-heat-detector",
    params: { diameterMm: 114 },
    nodes: [
      // Detector body circle
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm / 2",
      },
      // Center dot (sensor element)
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: 8,
      },
    ],
  },

  /**
   * Manual Call Point (MCP, Type A): small square + cross glyph.
   * Fire alarm pull-station symbol.
   */
  "fire-mcp": {
    id: "fire-mcp",
    params: { widthMm: 100, depthMm: 54 },
    nodes: [
      // MCP button outline (square-ish)
      {
        op: "rect",
        weight: "cut",
        cx: 0,
        cz: 0,
        widthMm: "widthMm * 0.8",
        depthMm: "depthMm * 0.8",
      },
      // Cross pattern (activation glyph)
      {
        op: "tick",
        weight: "symbol",
        x: 0,
        z: 0,
        angleDeg: 0,
        lengthMm: "widthMm * 0.5",
      },
      {
        op: "tick",
        weight: "symbol",
        x: 0,
        z: 0,
        angleDeg: 90,
        lengthMm: "depthMm * 0.5",
      },
    ],
  },

  /**
   * Alarm Bell (Ø150): circle with radial sound-wave marks.
   * Standard fire alarm audible device symbol.
   */
  "fire-alarm-bell": {
    id: "fire-alarm-bell",
    params: { diameterMm: 150 },
    nodes: [
      // Bell body
      {
        op: "circle",
        weight: "symbol",
        cx: 0,
        cz: 0,
        radius: "diameterMm / 2",
      },
      // Center clapper mark
      {
        op: "circle",
        weight: "thin",
        cx: 0,
        cz: 0,
        radius: "diameterMm * 0.15",
      },
      // Sound radiance: two arc segments at 45° intervals
      {
        op: "arc",
        weight: "thin",
        cx: 0,
        cz: 0,
        radius: "diameterMm * 0.65",
        startAngleDeg: -45,
        sweepDeg: 90,
      },
      {
        op: "arc",
        weight: "thin",
        cx: 0,
        cz: 0,
        radius: "diameterMm * 0.8",
        startAngleDeg: -45,
        sweepDeg: 90,
      },
    ],
  },
};
