// Instance poses for published authoring GLBs.
// Origins follow public/models/authoring/README.md (Y-up, metres).

import type { BuildingRecipe } from "@/lib/procedural/types";
import { authoringFamilyUrl, getAuthoringFamily } from "./family-catalog";

export interface FamilyInstancePose {
  id: string;
  url: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
}

/**
 * Selected-type preview only. Auto-scattering columns/windows/MEP onto the
 * live twin made the demo look broken (a second building stacked on the
 * curtain wall). Placement happens on click via AuthoringFamilyLayer.
 */
export function planAuthoringInstances(
  recipe: BuildingRecipe,
  selectedFamilyId?: string | null
): FamilyInstancePose[] {
  if (!selectedFamilyId || !getAuthoringFamily(selectedFamilyId)) return [];
  const url = authoringFamilyUrl(selectedFamilyId);
  if (!url) return [];
  return [
    {
      id: `preview:${selectedFamilyId}`,
      url,
      position: [recipe.footprintWidth / 2 + 4, 0, 0],
      scale: [1, 1, 1],
      rotation: [0, -Math.PI / 6, 0],
    },
  ];
}
