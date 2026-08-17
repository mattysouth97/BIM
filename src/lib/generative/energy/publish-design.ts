"use client";

// src/lib/generative/energy/publish-design.ts
//
// One door from a built design into the pk-keyed stores every workspace panel
// reads. Extracted from `generative-session-store` so the studio session and
// the /building/GEN-… workspace publish a design the SAME way — two code paths
// seeding the same three stores is how the panels start disagreeing about
// which building they are describing.

import { seedBuildingFromGeneratedDesign } from "@/lib/generative/energy/seed-from-design";
import type {
  GeneratedBuildingSeed,
  GeneratedDesignInput,
} from "@/lib/generative/energy/seed-from-design";
import { isGeneratedPk } from "@/lib/generative/design-storage";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";

/**
 * Hand a design to the energy stack under its own generationId, so
 * `useEnergyMetrics` / `useRetrofitScenario` see it exactly as they see a
 * ledger building (mirrors `use-ensure-building-model.ts`).
 *
 * Unlike the ledger seeding, this OVERWRITES: a modified design is the same
 * conversation continuing, and its recalculated envelope must replace the old
 * one rather than lose to a "keep the first value" guard.
 *
 * Returns the seed so callers that need the derived climate region or the
 * solved-geometry materials do not have to recompute them.
 */
export function publishGeneratedDesign(
  design: GeneratedDesignInput,
  previousPk: string | null,
): GeneratedBuildingSeed {
  const seed = seedBuildingFromGeneratedDesign({
    spec: design.spec,
    recipe: design.recipe,
    metrics: design.metrics,
    generationId: design.generationId,
  });

  useMaterialStore.getState().setProperties(seed.pk, seed.materials);
  useMaterialStore.getState().setActivePk(seed.pk);
  useRecipeStore.getState().setBaseRecipe(seed.pk, seed.recipe);
  useActiveBuildingStore.getState().setActiveBuilding(seed.pk, seed.sigunguCd);

  if (previousPk && previousPk !== seed.pk) unpublishGeneratedDesign(previousPk);

  // The session is not persisted but the material store IS, so a design left
  // behind by a previous TAB or reload has no `previousPk` to prune it by.
  // Sweep those too: exactly one generated building may hold records at a time.
  for (const pk of Object.keys(useMaterialStore.getState().properties)) {
    if (pk !== seed.pk && isGeneratedPk(pk)) unpublishGeneratedDesign(pk);
  }

  return seed;
}

/**
 * Drop one design's energy records. Exactly ONE generated design is published
 * at a time: a session that regenerates fifty times would otherwise leave fifty
 * buildings in the material store — which is persisted, so the leak survives
 * reloads. Nothing is lost by pruning: re-publishing is a pure re-seed from the
 * spec, which `undo`/`redo`/`goTo` and `getOrBuildDesign` both do.
 *
 * Neither store exposes a remove API (`properties` and `baseRecipes` only ever
 * grow), so the prune goes through zustand's own `setState` rather than adding
 * surface area to stores this feature does not own.
 */
export function unpublishGeneratedDesign(pk: string): void {
  useMaterialStore.setState((s) => {
    if (!(pk in s.properties)) return s;
    const { [pk]: _dropped, ...rest } = s.properties;
    return { properties: rest };
  });
  useRecipeStore.setState((s) => {
    if (!(pk in s.baseRecipes)) return s;
    const { [pk]: _dropped, ...rest } = s.baseRecipes;
    return { baseRecipes: rest };
  });
  useRecipeStore.getState().resetOverrides(pk);
  if (useMaterialStore.getState().activePk === pk) {
    useMaterialStore.setState({ activePk: "" });
  }
  if (useActiveBuildingStore.getState().buildingPk === pk) {
    useActiveBuildingStore.getState().clearActiveBuilding();
  }
}
