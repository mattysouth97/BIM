"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useLayerStore } from "@/store/layer-store";
import { LayerManager } from "@/lib/layers/layer-manager";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerId } from "@/lib/layers/types";

const ALL_LAYER_IDS: LayerId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface BuildingLayersProps {
  recipe: BuildingRecipe;
}

export function BuildingLayers({ recipe }: BuildingLayersProps) {
  const managerRef = useRef<LayerManager | null>(null);
  const recipeRef = useRef<BuildingRecipe>(recipe);

  const visibility = useLayerStore((s) => s.visibility);
  const generated = useLayerStore((s) => s.generated);
  const setGenerated = useLayerStore((s) => s.setGenerated);

  // Create or recreate LayerManager when recipe changes
  if (!managerRef.current) {
    managerRef.current = new LayerManager();
  }

  // Handle recipe change: dispose old manager and create new one
  useEffect(() => {
    if (recipeRef.current !== recipe && managerRef.current) {
      managerRef.current.dispose();
      managerRef.current = new LayerManager();
      recipeRef.current = recipe;
      // Reset generated flags since we have a new manager
      useLayerStore.getState().resetAll();
    }
  }, [recipe]);

  // Sync visibility and lazy-generate layers
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;

    for (const id of ALL_LAYER_IDS) {
      const isVisible = visibility[id];

      if (isVisible && !generated[id]) {
        // Lazy generate on first visibility
        manager.getOrGenerate(id, recipe);
        setGenerated(id);
      }

      manager.setVisible(id, isVisible);
    }
  }, [visibility, generated, recipe, setGenerated]);

  // Animation loop — update ShaderMaterial uniforms each frame
  useFrame((state) => {
    managerRef.current?.updateAnimations(state.clock.elapsedTime);
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  const parentGroup = managerRef.current?.getParentGroup();
  if (!parentGroup) return null;

  return <primitive object={parentGroup} />;
}
