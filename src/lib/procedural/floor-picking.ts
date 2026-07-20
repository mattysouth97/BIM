// src/lib/procedural/floor-picking.ts
// P0-04 — pure pick-resolution for floor slab clicks, unit-testable without a
// WebGL context. Handles both slab rendering paths:
//   - rectangular InstancedMesh: event carries instanceId → instanceToFloor map
//   - polygon Group: event.object is a plain Mesh carrying userData.floorNo
// Pure logic, no React, no "use client".

import type { FloorSpec } from "./types";

/** Minimal lookup surface of ProceduralBuilding needed to resolve a pick. */
export interface FloorLookup {
  getFloorFromInstanceId(instanceId: number): FloorSpec | null;
  getFloorByFloorNo(floorNo: number): FloorSpec | null;
}

/** Minimal shape of an R3F pointer event as consumed here. */
export interface PickEventLike {
  object?: { userData?: Record<string, unknown> } | null;
  instanceId?: number;
}

/**
 * Resolve the clicked floor. Returns null (never throws) when the event does
 * not identify a slab floor: non-slab object, unknown instanceId, or a
 * missing/non-finite/unknown userData.floorNo.
 */
export function resolvePickedFloor(
  event: PickEventLike,
  lookup: FloorLookup
): FloorSpec | null {
  const object = event.object;
  if (!object) return null;
  if (object.userData?.type !== "slab") return null;

  // Rectangular path: instanceId → instanceToFloor map (unchanged legacy flow).
  if (typeof event.instanceId === "number") {
    return lookup.getFloorFromInstanceId(event.instanceId);
  }

  // Polygon path: plain mesh carries its floorNo directly.
  const floorNo = object.userData?.floorNo;
  if (typeof floorNo !== "number" || !Number.isFinite(floorNo)) return null;
  return lookup.getFloorByFloorNo(floorNo);
}
