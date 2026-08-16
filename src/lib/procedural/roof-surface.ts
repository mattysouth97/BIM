// Shared roof-deck elevation. Roof-mounted equipment and PV must sit on
// the finished top surface, not at `totalHeight` (the underside / last floor).

import type { RoofConfig } from "./types";

export interface RoofSurfaceInput {
  totalHeight: number;
  floors?: Array<{ type: string; y: number; height: number }>;
  roof?: Pick<RoofConfig, "type" | "flatThickness" | "gableHeight" | "sawtoothHeight">;
}

/** Highest above-grade floor top, or `totalHeight` when no floors are listed. */
export function lastAboveFloorTop(input: RoofSurfaceInput): number {
  const above = (input.floors ?? []).filter((f) => f.type === "above");
  if (above.length === 0) return input.totalHeight;
  return Math.max(...above.map((f) => f.y + f.height));
}

/**
 * World Y of the finished roof top.
 * Flat: last floor + slab thickness (the box sits on the last slab).
 * Pitched: last floor + ridge height so a flat rooftop array clears the slope.
 */
export function finishedRoofTopY(input: RoofSurfaceInput): number {
  const deck = Math.max(input.totalHeight, lastAboveFloorTop(input));
  const roof = input.roof;
  const type = roof?.type ?? "flat";
  if (type === "flat") {
    return deck + (roof?.flatThickness ?? 0.3);
  }
  if (type === "sawtooth") {
    return deck + (roof?.sawtoothHeight ?? roof?.gableHeight ?? 2);
  }
  return deck + (roof?.gableHeight ?? 0);
}

/**
 * Distance from a centre-origin box origin to its lowest point after a
 * pitch about +X (south-facing tilt).
 */
export function tiltedBoxClearance(
  halfDepth: number,
  halfHeight: number,
  tiltRad: number,
): number {
  return (
    Math.abs(halfDepth * Math.sin(tiltRad)) +
    Math.abs(halfHeight * Math.cos(tiltRad))
  );
}

/** Microgrid PV tilt (~15° south). Matches layer-14. */
export const MICROGRID_PV_TILT = 0.26;

/** Native solar-panel / solar-rack extents (metres, centre origin). */
export const MICROGRID_PV_PANEL = { w: 1.6, h: 0.05, d: 1.0 } as const;
export const MICROGRID_PV_RACK = { w: 1.64, h: 0.16, d: 1.04 } as const;

export interface RooftopPvSeat {
  roofTopY: number;
  rackY: number;
  panelY: number;
}

/** Seat a tilted centre-origin PV module + rack so neither cuts the roof. */
export function rooftopPvSeatY(input: RoofSurfaceInput): RooftopPvSeat {
  const roofTopY = finishedRoofTopY(input);
  const rackClearance = tiltedBoxClearance(
    MICROGRID_PV_RACK.d / 2,
    MICROGRID_PV_RACK.h / 2,
    MICROGRID_PV_TILT,
  );
  const panelClearance = tiltedBoxClearance(
    MICROGRID_PV_PANEL.d / 2,
    MICROGRID_PV_PANEL.h / 2,
    MICROGRID_PV_TILT,
  );
  const rackY = roofTopY + rackClearance;
  const panelY = roofTopY + Math.max(rackClearance, panelClearance) + 0.02;
  return { roofTopY, rackY, panelY };
}
