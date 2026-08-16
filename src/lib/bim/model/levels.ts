// src/lib/bim/model/levels.ts
// First-class BIM levels derived from the existing recipe floor stack.

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { levelIdForFloor, type BimLevel } from "./types";

export function levelsFromRecipe(recipe: BuildingRecipe): BimLevel[] {
  return recipe.floors
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((floor) => levelFromFloor(floor));
}

export function levelFromFloor(floor: FloorSpec): BimLevel {
  return {
    id: levelIdForFloor(floor.floorNo),
    name: floor.label || `${floor.floorNo}F`,
    elevation: floor.y,
    height: floor.height,
    floorNo: floor.floorNo,
    associatedViewId: `plan-${floor.floorNo}`,
  };
}

/**
 * Move a level vertically. The storey below grows/shrinks so the stack
 * stays continuous. Returns updated levels plus recipe floorEdits to apply.
 */
export function moveLevelElevation(
  levels: BimLevel[],
  levelId: string,
  nextElevation: number,
): {
  levels: BimLevel[];
  floorEdits: Record<string, { height?: number }>;
} {
  const ordered = levels.slice().sort((a, b) => a.elevation - b.elevation);
  const index = ordered.findIndex((l) => l.id === levelId);
  if (index < 0) return { levels, floorEdits: {} };

  const current = ordered[index];
  const delta = nextElevation - current.elevation;
  if (delta === 0) return { levels, floorEdits: {} };

  const next = ordered.map((level, i) => {
    if (i < index) return level;
    if (i === index) return { ...level, elevation: nextElevation };
    return { ...level, elevation: level.elevation + delta };
  });

  if (index > 0) {
    const below = next[index - 1];
    const height = Math.max(0.5, next[index].elevation - below.elevation);
    next[index - 1] = { ...below, height };
  }

  const floorEdits: Record<string, { height?: number }> = {};
  for (const level of next) {
    floorEdits[String(level.floorNo)] = { height: level.height };
  }

  return { levels: next, floorEdits };
}

export function renameLevel(levels: BimLevel[], levelId: string, name: string): BimLevel[] {
  return levels.map((level) => (level.id === levelId ? { ...level, name } : level));
}
