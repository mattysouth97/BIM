// src/lib/layers/core-layout.ts
// Shared parametric service-core layout for the MEP layer generators.
//
// Before this module, every generator independently hardcoded its "core"
// position at the footprint centre (elevator shafts, chilled-water risers,
// the rooftop chiller, and the electrical backbone all landed on 0,0), so
// utilities interpenetrated regardless of the building's actual footprint.
//
// computeCoreLayout() is a pure, deterministic function of the recipe: every
// generator that calls it independently derives the SAME coordinated layout,
// with no shared mutable state. All positions are derived from
// footprintWidth/footprintDepth and clamped so they stay inside the slab on
// small footprints.
//
// Layout convention (plan view, +Z = building front / south):
//
//   rear wall (-Z) ──────────────────────────────
//     [elec riser] [elevator bank]  [wet riser + rooftop chiller]
//     ← ASHP row                     cooling tower →
//   ────────────────────────────────  (roof plant band, PV-free)
//                interior / PV field  (+Z)
//
import type { BuildingRecipe } from "@/lib/procedural/types";

export interface CoreSlot {
  x: number;
  z: number;
}

export interface ElevatorBank {
  /** Per-shaft centre positions, ordered left (-X) to right (+X). */
  shafts: CoreSlot[];
  shaftWidth: number;
  shaftDepth: number;
  /** Clear gap between adjacent shafts. */
  gap: number;
  /** Z of the shaft centres (rear service band). */
  bankZ: number;
  /** Left/right outer extents of the bank on X. */
  minX: number;
  maxX: number;
}

export interface CoreLayout {
  elevator: ElevatorBank;
  /** Wet riser (chilled-water supply/return verticals) — beside the bank, interior side. */
  serviceRiser: CoreSlot;
  /** Electrical backbone riser (microgrid) — opposite side of the bank. */
  electricalRiser: CoreSlot;
  /** Rooftop chiller plant slot — the wet riser lands here. */
  roofChiller: CoreSlot;
  /** Rooftop ASHP/EHP outdoor-unit slots, packed left of the elevator bank. */
  roofAshp: CoreSlot[];
  /** Basement DHW cluster origin (tanks/pumps are offset from this point). */
  basementDhw: CoreSlot;
  /**
   * Rear roof strip reserved for plant + hoist machines. Roof-covering
   * generators (PV array) must skip cells with z < this value so panels are
   * not generated underneath rooftop equipment.
   */
  roofPlantBandMaxZ: number;
}

const SHAFT_WIDTH = 1.6;
const SHAFT_DEPTH = 2.0;
const SHAFT_GAP = 0.6;
/** Clearance kept between the shaft back face and the interior of the rear wall. */
const WALL_CLEARANCE = 0.5;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Packs `count` slots in a row along X starting at `startX`, stepping by
 * `spacing` in `dir` (+1 right / -1 left). Slots that would leave
 * [minX, maxX] wrap forward to a second row (z + rowStep) restarting at
 * `startX`, so equipment never stacks on the same spot on narrow footprints.
 */
function packSlots(
  count: number,
  startX: number,
  dir: 1 | -1,
  spacing: number,
  minX: number,
  maxX: number,
  z: number,
  rowStep: number
): CoreSlot[] {
  const slots: CoreSlot[] = [];
  let x = clamp(startX, minX, maxX);
  let rowZ = z;
  for (let i = 0; i < count; i++) {
    if (x < minX || x > maxX) {
      rowZ += rowStep;
      x = clamp(startX, minX, maxX);
    }
    slots.push({ x, z: rowZ });
    x += dir * spacing;
  }
  return slots;
}

/**
 * Derives the coordinated service-core layout from the recipe footprint.
 * Pure + deterministic — every generator computing this independently gets
 * identical, collision-free positions.
 */
export function computeCoreLayout(recipe: BuildingRecipe): CoreLayout {
  const { footprintWidth, footprintDepth, floors } = recipe;
  const hw = footprintWidth / 2;
  const hd = footprintDepth / 2;
  const aboveFloorCount = floors.filter((f) => f.type === "above").length;

  // --- Elevator bank -------------------------------------------------------
  // Shaft count scales with building height, then clamps so the bank never
  // exceeds ~55% of the footprint width (small buildings get fewer shafts
  // rather than shafts punching through the facade).
  const countByHeight = aboveFloorCount < 6 ? 1 : aboveFloorCount < 15 ? 2 : 3;
  const maxByWidth = Math.max(
    1,
    Math.floor((footprintWidth * 0.55 + SHAFT_GAP) / (SHAFT_WIDTH + SHAFT_GAP))
  );
  const shaftCount = Math.min(countByHeight, maxByWidth);

  // Bank sits against the rear (-Z) wall — the typical Korean office core
  // position — instead of the dead centre of the floor plate. On footprints
  // too shallow for a rear band the bank degrades gracefully toward centre.
  const bankZ = -Math.max(0, hd - WALL_CLEARANCE - SHAFT_DEPTH / 2);

  const span = (shaftCount - 1) * (SHAFT_WIDTH + SHAFT_GAP);
  const shafts: CoreSlot[] = [];
  for (let i = 0; i < shaftCount; i++) {
    shafts.push({ x: -span / 2 + i * (SHAFT_WIDTH + SHAFT_GAP), z: bankZ });
  }

  const bankMinX = -span / 2 - SHAFT_WIDTH / 2;
  const bankMaxX = span / 2 + SHAFT_WIDTH / 2;

  const elevator: ElevatorBank = {
    shafts,
    shaftWidth: SHAFT_WIDTH,
    shaftDepth: SHAFT_DEPTH,
    gap: SHAFT_GAP,
    bankZ,
    minX: bankMinX,
    maxX: bankMaxX,
  };

  // --- Vertical risers ------------------------------------------------------
  // Wet riser: right of the bank, pulled slightly toward the interior so
  // per-floor branch fans clear the shaft volume.
  const serviceRiser: CoreSlot = {
    x: clamp(bankMaxX + 1.0, -hw + 1.0, hw - 1.0),
    z: clamp(bankZ + SHAFT_DEPTH / 2 + 0.8, -hd + 1.0, hd - 1.0),
  };

  // Electrical backbone: mirrored to the left of the bank, hugging the rear
  // wall on the same line as the basement battery row.
  const electricalRiser: CoreSlot = {
    x: clamp(bankMinX - 1.2, -hw + 0.8, hw - 0.8),
    z: -Math.max(0, hd - 1.5),
  };

  // --- Rooftop plant ---------------------------------------------------------
  // The chiller lands directly on the wet riser so the vertical pipe run
  // reads as one continuous system.
  const roofChiller: CoreSlot = {
    x: clamp(serviceRiser.x, -hw + 1.5, hw - 1.5),
    z: clamp(serviceRiser.z, -hd + 1.5, hd - 1.5),
  };

  // ASHP/EHP outdoor units pack leftward from the bank's left edge inside the
  // rear plant band, wrapping forward on narrow roofs.
  const roofAshp = packSlots(
    2,
    bankMinX - 1.4,
    -1,
    1.6,
    -hw + 1.0,
    hw - 1.0,
    bankZ,
    1.6
  );

  // Rear strip reserved for hoists + chiller + tower + ASHP row. PV panels
  // whose centre falls behind this line are skipped by the microgrid layer.
  const roofPlantBandMaxZ = Math.min(hd, roofChiller.z + 1.6);

  // --- Basement plant --------------------------------------------------------
  // Boiler stays at the plant-room centre (0,0); GSHP sits at +X (existing
  // convention); the DHW tank cluster gets the -X side so tanks no longer
  // interpenetrate the boiler body.
  const basementDhw: CoreSlot = {
    x: clamp(-2.6, -hw + 1.5, 0),
    z: 0.5,
  };

  return {
    elevator,
    serviceRiser,
    electricalRiser,
    roofChiller,
    roofAshp,
    basementDhw,
    roofPlantBandMaxZ,
  };
}
