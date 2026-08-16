"use client";

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useEquipmentStore } from "@/store/equipment-store";
import { useBimDocumentStore } from "@/store/bim-document-store";
import { mergeRecipeOverrides } from "@/lib/procedural/recipe";
import { deriveTwinElements } from "@/lib/bim/derive/twin-elements";
import { applyPhaseToMaterials } from "@/lib/bim/phases/apply-phase";
import { runSchedule } from "@/lib/bim/schedules/schedule-engine";
import { SEED_SCHEDULES } from "@/lib/bim/schedules/schedule-definitions";
import { composeDefaultSheets } from "@/lib/bim/sheets/compose-default-sheets";
import type { ScheduleResult } from "@/lib/bim/schedules/schedule-types";

export const TWIN_SCHEDULE_IDS = [
  "wall-schedule-v1",
  "window-door-schedule-v1",
  "mep-equipment-schedule-v1",
  "room-schedule-v1",
] as const;

export function useTwinDocument(buildingPk: string, locale: "ko" | "en" = "ko") {
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const equipment = useEquipmentStore((s) => s.params[buildingPk]);
  const phase = useBimDocumentStore((s) => s.phase);

  const recipe = useMemo(() => {
    if (!baseRecipe) return undefined;
    return overrides ? mergeRecipeOverrides(baseRecipe, overrides) : baseRecipe;
  }, [baseRecipe, overrides]);

  const phasedMaterials = useMemo(() => {
    if (!materials) return undefined;
    return applyPhaseToMaterials(materials, phase);
  }, [materials, phase]);

  const elements = useMemo(() => {
    if (!recipe) return null;
    return deriveTwinElements({
      recipe,
      materials: phasedMaterials,
      equipment,
    });
  }, [recipe, phasedMaterials, equipment]);

  const schedules = useMemo<Partial<Record<string, ScheduleResult>>>(() => {
    if (!elements) return {};
    return {
      "wall-schedule-v1": runSchedule(SEED_SCHEDULES["wall-schedule-v1"], elements.walls),
      "window-door-schedule-v1": runSchedule(
        SEED_SCHEDULES["window-door-schedule-v1"],
        elements.openings,
      ),
      "mep-equipment-schedule-v1": runSchedule(
        SEED_SCHEDULES["mep-equipment-schedule-v1"],
        elements.mep,
      ),
      "room-schedule-v1": runSchedule(SEED_SCHEDULES["room-schedule-v1"], elements.rooms),
    };
  }, [elements]);

  const sheets = useMemo(() => {
    if (!recipe) return [];
    const ground = recipe.floors.find((f) => f.isGroundFloor) ?? recipe.floors[0];
    return composeDefaultSheets({
      buildingName: recipe.buildingName,
      locale,
      planViewId: ground ? `plan-${ground.floorNo}` : "plan-1",
      elevationViewId: "elev-front",
    });
  }, [recipe, locale]);

  return {
    recipe,
    materials: phasedMaterials,
    phase,
    elements,
    schedules,
    sheets,
  };
}
