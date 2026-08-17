// src/lib/generative/session/recipe-view.ts
//
// View-only transforms of a compiled BuildingRecipe.
//
// Selecting "Level 03" in the navigation tree isolates it in the 3D view. The
// recipe is the renderer's only input, so isolation is a filtered recipe rather
// than a new render path — the same trick `ProceduralBuilding` already uses to
// give each facade section its own sub-recipe.
//
// Nothing here changes the design. These functions produce something to LOOK
// at; the design itself is whatever the current history node says it is.

import type { BuildingRecipe } from "@/lib/procedural/types";

/**
 * Restrict the model to a set of storeys.
 *
 * Returns the input unchanged for an empty or unmatched selection: the identity
 * return keeps React memoisation stable, and rendering nothing at all would
 * read as a broken viewer rather than an empty selection.
 */
export function sliceRecipeToFloors(
  recipe: BuildingRecipe,
  floorNos: number[] | null,
): BuildingRecipe {
  if (!floorNos || floorNos.length === 0) return recipe;

  const wanted = new Set(floorNos);
  const floors = recipe.floors.filter((floor) => wanted.has(floor.floorNo));
  if (floors.length === 0 || floors.length === recipe.floors.length) return recipe;

  // The roof and parapet are drawn at totalHeight, so an isolated slice reads as
  // a cut model with a cap rather than a floating band under an absent roof.
  //
  // Seeded with -Infinity, and guarded on finiteness rather than on being
  // positive: a basement-only slice legitimately caps at or below grade (B1's
  // slab top IS zero), and rejecting that would put the roof 24 m above a
  // two-storey basement — precisely the floating cap this recompute exists to
  // prevent. `floors` is non-empty here, so the reduce always has a seed to beat.
  const totalHeight = floors.reduce(
    (max, floor) => Math.max(max, floor.y + floor.height),
    Number.NEGATIVE_INFINITY,
  );

  return {
    ...recipe,
    floors,
    totalHeight: Number.isFinite(totalHeight) ? totalHeight : recipe.totalHeight,
    // Sections index by absolute floorNo, so a slice would leave dangling
    // ranges. Dropping them falls back to the single-facade path.
    sections: undefined,
  };
}
