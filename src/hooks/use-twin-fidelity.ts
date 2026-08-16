"use client";

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import { mergeRecipeOverrides } from "@/lib/procedural/recipe";
import { assessFidelity } from "@/lib/fidelity/fidelity-assessor";
import { generateUpgradeChecklist } from "@/lib/fidelity/upgrade-checklist";
import type { BuildingRecipe } from "@/lib/procedural/types";

export function useEffectiveRecipe(buildingPk: string): BuildingRecipe | undefined {
  const base = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);
  return useMemo(() => {
    if (!base) return undefined;
    if (!overrides) return base;
    return mergeRecipeOverrides(base, overrides);
  }, [base, overrides]);
}

export function useTwinFidelity(buildingPk: string, hasEnergyBills: boolean) {
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const recipe = useEffectiveRecipe(buildingPk);
  const provenance = useTwinProvenanceStore((s) => s.byPk[buildingPk]);

  const report = useMemo(() => {
    const ifcSource =
      materials?.source === "ifc-model" || materials?.source === "ifc-import";
    return assessFidelity({
      hasPublicData: !!materials,
      hasFloorData: !!recipe,
      hasFootprint: !!(recipe?.footprintPolygon || provenance?.hasCadFootprint || recipe),
      hasEnergyBills,
      hasFloorPlans: !!provenance?.hasCadPlan,
      hasEquipmentSchedule: !!provenance?.hasEquipmentSchedule,
      hasIfcModel: ifcSource || !!provenance?.hasIfcModel,
      hasSensorData: false,
    });
  }, [materials, recipe, provenance, hasEnergyBills]);

  const checklist = useMemo(() => generateUpgradeChecklist(report), [report]);

  return { report, checklist, recipe, materials, provenance };
}
