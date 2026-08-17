"use client";

// src/components/viewer/structure-layer.tsx
// Thin R3F mount for the 구조 (structure) analysis overlay.
//
// Source selection, element collection and geometry all live in
// src/lib/layers/analysis/structure-overlay.ts. This component reads the BIM
// snapshot and the effective recipe, and owns Three resource lifetime.

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useLayerStore } from "@/store/layer-store";
import { useBimModelStore } from "@/store/bim-model-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { disposeObject3D } from "@/lib/layers/analysis/overlay-types";
import {
  buildStructureOverlay,
  collectStructureModel,
  type StructureModel,
} from "@/lib/layers/analysis/structure-overlay";

/**
 * Structural system for a building — from the BIM snapshot when it carries
 * structural elements, otherwise derived from the recipe.
 */
export function useStructureAnalysis(buildingPk: string): StructureModel | null {
  const snapshot = useBimModelStore((s) => s.snapshot);
  const recipe = useEffectiveRecipe(buildingPk);

  return useMemo<StructureModel | null>(() => {
    if (!recipe) return null;
    return collectStructureModel({ snapshot, recipe, buildingPk });
  }, [snapshot, recipe, buildingPk]);
}

interface StructureLayerProps {
  buildingPk: string;
}

export function StructureLayer({ buildingPk }: StructureLayerProps) {
  const enabled = useLayerStore((s) => s.analysisOverlays["overlay-structure"]);
  const recipe = useEffectiveRecipe(buildingPk);
  const model = useStructureAnalysis(buildingPk);

  // Lazy state initializer, not a ref: the group must be readable during render
  // to be handed to <primitive>.
  const [root] = useState(() => {
    const group = new THREE.Group();
    group.name = "analysis-structure-root";
    return group;
  });

  useEffect(() => {
    if (!enabled || !model || !recipe) return;

    const group = buildStructureOverlay({
      model,
      halfExtentM:
        Math.max(recipe.footprintWidth, recipe.footprintDepth) * 0.75 + 4,
      gridY: 0.05,
    });
    root.add(group);

    return () => {
      root.remove(group);
      disposeObject3D(group);
    };
  }, [enabled, model, recipe, root]);

  useEffect(() => {
    return () => {
      disposeObject3D(root);
      root.clear();
    };
  }, [root]);

  return <primitive object={root} visible={enabled} />;
}
