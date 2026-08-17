// src/lib/interior/visible-floors.ts
//
// Which storeys of a solved interior to draw, and how to pack the wall boxes
// for InstancedMesh. Pure: the React layer only mounts what this returns.

import { parseFloorNoFromLevelId } from "@/lib/bim/model/types";

import type { FamilyPose, InteriorModel, RailingRun, WallInstance } from "./types";

/**
 * Plan views in this app name a level two ways:
 *   - BIM graph: `level:3` (emit.ts / hydrateFromSnapshot)
 *   - recipe floor: `"3"` (computeDefaultViewsForBuilding)
 */
export function floorNoFromPlanLevelId(levelId: string | null | undefined): number | null {
  if (!levelId) return null;
  const fromBim = parseFloorNoFromLevelId(levelId);
  if (fromBim !== null) return fromBim;
  const asNum = Number(levelId);
  return Number.isInteger(asNum) ? asNum : null;
}

/**
 * Storeys to draw. `explicit` wins (studio isolate: a list, or null = all).
 * When it is omitted, a plan-view level id isolates that one storey.
 */
export function visibleFloorNos(input: {
  explicit?: readonly number[] | null;
  planLevelId?: string | null;
}): number[] | null {
  if (input.explicit !== undefined) {
    return input.explicit && input.explicit.length > 0 ? [...input.explicit] : null;
  }
  const fromPlan = floorNoFromPlanLevelId(input.planLevelId);
  return fromPlan === null ? null : [fromPlan];
}

export function itemsOnFloors<T extends { floorNo: number }>(
  byFloor: Record<number, T[]>,
  floors: readonly number[] | null,
): T[] {
  if (!floors) return Object.values(byFloor).flat();
  return floors.flatMap((n) => byFloor[n] ?? []);
}

export function groupWallsForInstancing(walls: readonly WallInstance[]): {
  partition: WallInstance[];
  core: WallInstance[];
} {
  const partition: WallInstance[] = [];
  const core: WallInstance[] = [];
  for (const wall of walls) {
    if (wall.isCore) core.push(wall);
    else partition.push(wall);
  }
  return { partition, core };
}

export interface InteriorDrawList {
  partitions: WallInstance[];
  cores: WallInstance[];
  poses: FamilyPose[];
  railings: RailingRun[];
}

export function interiorDrawList(
  model: InteriorModel,
  floors: readonly number[] | null,
): InteriorDrawList {
  const grouped = groupWallsForInstancing(itemsOnFloors(model.wallsByFloor, floors));
  return {
    partitions: grouped.partition,
    cores: grouped.core,
    poses: itemsOnFloors(model.posesByFloor, floors),
    railings: itemsOnFloors(model.railingsByFloor, floors),
  };
}
