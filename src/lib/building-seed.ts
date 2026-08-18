import { generateBuildingGeometry, toRecipe } from "@/lib/building-geometry";
import { DEMO_BUILDING_PK } from "@/lib/constants";
import { getDemoRecipe } from "@/lib/demo/demo-design";
import { inferMaterialProperties } from "@/lib/material-inference";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

export interface SeededBuilding {
  pk: string;
  materials: MaterialProperties;
  recipe: BuildingRecipe;
}

/** Ledger → store seed. Independent of the 3D canvas mounting. */
export function seedBuildingFromLedger(
  title: BrTitleInfo,
  floors: BrFloorInfo[],
): SeededBuilding | null {
  const pk = String(title.mgmBldrgstPk ?? "").trim();
  if (!pk) return null;
  return {
    pk,
    materials: inferMaterialProperties(title, floors),
    recipe:
      pk === DEMO_BUILDING_PK
        ? getDemoRecipe()
        : toRecipe(generateBuildingGeometry(title, floors)),
  };
}
