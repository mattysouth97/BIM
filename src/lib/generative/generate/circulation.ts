// src/lib/generative/generate/circulation.ts
//
// Marks which spaces are actually reachable, by walking the real connectivity
// the generator produced — doors between spaces, and the vertical core between
// levels. Nothing here is heuristic: a room is reachable only if a path of
// actual door elements leads to it from an entrance.
//
// This is what turns "room accessibility" from an opinion into a deterministic
// validation rule (brief §21).

import { sharedEdgeLength, type CoreLayout, type GeneratedOpening, type PlacedSpace } from "./types";

export interface CirculationResult {
  spaces: PlacedSpace[];
  /** Space ids with no path to an entrance. */
  unreachableSpaceIds: string[];
  /** Levels whose circulation never touches the core, so they are cut off. */
  disconnectedFloorNos: number[];
  /** The level(s) treated as having a building entrance. */
  entranceFloorNos: number[];
}

/**
 * A level is served vertically when one of its circulation spaces sits against
 * the core — that is where stairs and lifts land. Without this the whole level
 * is an island regardless of how well its own doors connect.
 */
function circulationTouchesCore(
  spaces: PlacedSpace[],
  core: CoreLayout,
  toleranceM = 0.6,
): boolean {
  return spaces.some(
    (space) =>
      space.isCirculation && sharedEdgeLength(space.rect, core.rect, toleranceM) > 0.9,
  );
}

export function resolveCirculation(input: {
  spaces: PlacedSpace[];
  openings: GeneratedOpening[];
  core: CoreLayout;
  /** Ascending. The lowest above-grade level is treated as the entrance level. */
  floorNos: number[];
}): CirculationResult {
  const { spaces, openings, core } = input;

  const byFloor = new Map<number, PlacedSpace[]>();
  for (const space of spaces) {
    const list = byFloor.get(space.floorNo) ?? [];
    list.push(space);
    byFloor.set(space.floorNo, list);
  }

  // Doors are the only horizontal connection that counts. Two rooms sharing a
  // wall with no door between them are not connected, and pretending otherwise
  // is exactly the failure this engine has to avoid.
  const doorGraph = new Map<string, Set<string>>();
  for (const opening of openings) {
    if (opening.kind !== "door" || !opening.connectsSpaceIds) continue;
    const [a, b] = opening.connectsSpaceIds;
    if (!doorGraph.has(a)) doorGraph.set(a, new Set());
    if (!doorGraph.has(b)) doorGraph.set(b, new Set());
    doorGraph.get(a)!.add(b);
    doorGraph.get(b)!.add(a);
  }

  const aboveGrade = input.floorNos.filter((n) => n > 0).sort((a, b) => a - b);
  const entranceFloorNos = aboveGrade.length ? [aboveGrade[0]] : [];

  // A level is vertically served if its own circulation reaches the core.
  const servedFloors = new Set<number>();
  const disconnectedFloorNos: number[] = [];
  for (const floorNo of input.floorNos) {
    const levelSpaces = byFloor.get(floorNo) ?? [];
    if (levelSpaces.length === 0) continue;
    if (entranceFloorNos.includes(floorNo) || circulationTouchesCore(levelSpaces, core)) {
      servedFloors.add(floorNo);
    } else {
      disconnectedFloorNos.push(floorNo);
    }
  }

  const reachable = new Set<string>();

  for (const [floorNo, levelSpaces] of byFloor) {
    if (!servedFloors.has(floorNo)) continue;

    // Seed with circulation that arrives from the core (or the entrance).
    const seeds = levelSpaces.filter(
      (space) =>
        space.isCirculation &&
        (entranceFloorNos.includes(floorNo) ||
          sharedEdgeLength(space.rect, core.rect, 0.6) > 0.9),
    );

    // Degenerate but legitimate: a single-room level needs no corridor.
    const queue: PlacedSpace[] =
      seeds.length > 0 ? [...seeds] : levelSpaces.length === 1 ? [levelSpaces[0]] : [];

    const localById = new Map(levelSpaces.map((s) => [s.id, s]));
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (reachable.has(current.id)) continue;
      reachable.add(current.id);

      for (const neighbourId of doorGraph.get(current.id) ?? []) {
        const neighbour = localById.get(neighbourId);
        if (neighbour && !reachable.has(neighbourId)) queue.push(neighbour);
      }
    }
  }

  const resolved = spaces.map((space) => ({
    ...space,
    reachable: reachable.has(space.id),
  }));

  return {
    spaces: resolved,
    unreachableSpaceIds: resolved.filter((s) => !s.reachable).map((s) => s.id),
    disconnectedFloorNos,
    entranceFloorNos,
  };
}
