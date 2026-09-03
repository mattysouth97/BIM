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

  if (typeof event.instanceId === "number") {
    // P2-30: a stepped stack renders one InstancedMesh per distinct plate, and
    // an instanceId is scoped to the mesh that was hit. Read that mesh's own
    // map when it carries one; a building-wide lookup would resolve the index
    // against the wrong batch and return a neighbouring storey.
    const local = object.userData?.instanceToFloor;
    if (local instanceof Map) {
      return (local.get(event.instanceId) as FloorSpec | undefined) ?? null;
    }
    // Rectangular path: instanceId → instanceToFloor map (legacy flow).
    return lookup.getFloorFromInstanceId(event.instanceId);
  }

  // Polygon path: plain mesh carries its floorNo directly.
  const floorNo = object.userData?.floorNo;
  if (typeof floorNo !== "number" || !Number.isFinite(floorNo)) return null;
  return lookup.getFloorByFloorNo(floorNo);
}
