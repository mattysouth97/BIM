// src/lib/plan-symbols/library/energy-bems.ts
//
// Section 06 — Energy / BEMS / ESS: any family id prefixed bems-, energy-,
// ess-, or ev- (see sections.ts's ID_PREFIX_OVERRIDES), regardless of tool.
// Architectural plan symbols: sensors (circle + inscribed marks per type),
// smart meter (rect + dial arc), ESS/PCS cabinet (rect + internal cell ticks),
// PV arrays (rect + grid), EV chargers (rect + plug glyph), gateways (rect + antenna).

import type { SymbolGraph } from "../graph-types";

/**
 * energy-smart-meter: Wall-mounted 3-phase smart meter.
 * Plan: rectangle outline + arc segment representing meter dial readout.
 * Dims from catalog: 160 × 82 mm.
 */
const energySmartMeter: SymbolGraph = {
  id: "energy-smart-meter",
  params: { widthMm: 160, depthMm: 82 },
  nodes: [
    // Meter box outline.
    { op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" },
    // Dial arc (upper-right quadrant, representing needle sweep).
    {
      op: "arc",
      weight: "symbol",
      cx: "widthMm/4",
      cz: "depthMm/4",
      radius: "widthMm/5",
      startAngleDeg: 180,
      sweepDeg: 90,
    },
  ],
};

/**
 * ess-pcs: Floor-mounted 250 kW power conversion system cabinet.
 * Plan: rectangle outline + internal cell ticks to represent modular power blocks.
 * Dims from catalog: 840 × 640 mm. Parameterized for resizing.
 */
const essPcs: SymbolGraph = {
  id: "ess-pcs",
  params: { widthMm: 840, depthMm: 640 },
  nodes: [
    // Cabinet outline — cut line for solid built-up fixture.
    { op: "rect", weight: "cut", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" },
    // Internal power module grid: vertical dividers.
    {
      op: "arrayLinear",
      count: 4,
      stepMm: "widthMm/4",
      axis: "x",
      children: [
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
    // Horizontal midline to divide modules.
    { op: "line", weight: "thin", x1: "neg(widthMm/2)", z1: 0, x2: "widthMm/2", z2: 0 },
  ],
};

/**
 * bems-temp-sensor: Wall-mounted temperature sensor.
 * Plan: small circle (sensor head) + single vertical tick (stem/mounting).
 * Dims from catalog: 72 × 21 mm. Small device; uses "symbol" weight.
 */
const bemsTemperatureSensor: SymbolGraph = {
  id: "bems-temp-sensor",
  params: { widthMm: 72, depthMm: 21 },
  nodes: [
    // Sensor body: circle at origin (center of wall-mounted fixture).
    { op: "circle", weight: "symbol", cx: 0, cz: 0, radius: "widthMm/4" },
    // Mounting stem downward.
    {
      op: "line",
      weight: "thin",
      x1: 0,
      z1: "widthMm/4",
      x2: 0,
      z2: "depthMm/2",
    },
  ],
};

/**
 * bems-co2-sensor: Wall-mounted CO2 sensor.
 * Plan: small circle (sensor head) + cross-tick pattern (perpendicular marks).
 * Differentiates from temperature sensor by geometric glyph.
 * Dims from catalog: 94 × 25 mm.
 */
const bemmsCo2Sensor: SymbolGraph = {
  id: "bems-co2-sensor",
  params: { widthMm: 94, depthMm: 25 },
  nodes: [
    // Sensor body: circle at origin.
    { op: "circle", weight: "symbol", cx: 0, cz: 0, radius: "widthMm/4" },
    // Horizontal indicator tick (gas flow).
    {
      op: "line",
      weight: "thin",
      x1: "neg(widthMm/6)",
      z1: 0,
      x2: "widthMm/6",
      z2: 0,
    },
    // Vertical indicator tick (sensor response).
    {
      op: "line",
      weight: "thin",
      x1: 0,
      z1: "neg(widthMm/6)",
      x2: 0,
      z2: "widthMm/6",
    },
  ],
};

export const energyBemsSymbols: Record<string, SymbolGraph> = {
  "energy-smart-meter": energySmartMeter,
  "ess-pcs": essPcs,
  "bems-temp-sensor": bemsTemperatureSensor,
  "bems-co2-sensor": bemmsCo2Sensor,
};
