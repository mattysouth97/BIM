"use client";

// Seeds plan / elevation / 3D views from the live recipe.
// Does not touch Canvas geometry — the 3D-asset session owns meshes.

import { useEffect } from "react";
import * as THREE from "three";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useViewStore } from "@/lib/bim/views/view-store";
import type { FloorGeometry } from "@/lib/building-geometry";

export function useInitializeBimViews(buildingPk: string): void {
  const recipe = useEffectiveRecipe(buildingPk);

  useEffect(() => {
    if (!recipe || recipe.floors.length === 0) return;

    const floors: FloorGeometry[] = recipe.floors.map((floor) => ({
      floorNo: floor.floorNo,
      label: floor.label,
      type: floor.type,
      y: floor.y,
      height: floor.height,
      width: recipe.footprintWidth,
      depth: recipe.footprintDepth,
      area: recipe.footprintWidth * recipe.footprintDepth,
      use: "",
      useCode: recipe.mainPurpsCd,
      structure: "",
      structureCode: recipe.strctCd,
      color: "#B0C4DE",
      isGroundFloor: floor.isGroundFloor,
    }));

    const bbox = new THREE.Box3(
      new THREE.Vector3(-recipe.footprintWidth / 2, 0, -recipe.footprintDepth / 2),
      new THREE.Vector3(
        recipe.footprintWidth / 2,
        Math.max(recipe.totalHeight, 1),
        recipe.footprintDepth / 2
      )
    );

    useViewStore.getState().initializeDefaultViews(floors, bbox);
  }, [buildingPk, recipe]);
}
