// src/lib/rendering/material-context.ts

import type { BuildingRecipe } from "@/lib/procedural/types";
import { hashString01 } from "./hash";
import type { ArchitecturalMaterialContext } from "./types";

export function materialContextFromRecipe(recipe: BuildingRecipe): ArchitecturalMaterialContext {
  return {
    seed: hashString01(`${recipe.buildingName}|${recipe.address}|${recipe.strctCd}`),
    buildingHeight: Math.max(1, recipe.totalHeight),
    era: recipe.era,
    strctCd: recipe.strctCd,
    mainPurpsCd: recipe.mainPurpsCd,
  };
}
