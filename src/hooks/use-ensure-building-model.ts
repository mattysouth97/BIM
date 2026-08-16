"use client";

import { useEffect } from "react";
import { seedBuildingFromLedger } from "@/lib/building-seed";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

/**
 * Register materials + base recipe as soon as the 대장 title is known.
 * The 3D scene may later replace the recipe with a footprint-accurate one.
 */
export function useEnsureBuildingModel(
  title: BrTitleInfo | null,
  floors: BrFloorInfo[],
) {
  const setProperties = useMaterialStore((s) => s.setProperties);
  const setActivePk = useMaterialStore((s) => s.setActivePk);
  const setBaseRecipe = useRecipeStore((s) => s.setBaseRecipe);

  useEffect(() => {
    if (!title) return;
    const seeded = seedBuildingFromLedger(title, floors);
    if (!seeded) return;

    setActivePk(seeded.pk);
    if (!useMaterialStore.getState().properties[seeded.pk]) {
      setProperties(seeded.pk, seeded.materials);
    }
    if (!useRecipeStore.getState().baseRecipes[seeded.pk]) {
      setBaseRecipe(seeded.pk, seeded.recipe);
    }
  }, [title, floors, setProperties, setBaseRecipe, setActivePk]);
}
