"use client";

// src/components/viewer/envelope-layer.tsx
// Thin R3F mount for the 외피 (envelope) analysis overlay.
//
// All physics comes from useEnergyMetrics → calculateHeatLoss; all geometry
// from src/lib/layers/analysis/envelope-overlay.ts. This component only wires
// the two together and owns Three resource lifetime.

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useLayerStore } from "@/store/layer-store";
import { useMaterialStore } from "@/store/material-store";
import { useSelectionStore } from "@/store/selection-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { disposeObject3D } from "@/lib/layers/analysis/overlay-types";
import {
  buildEnvelopeOverlay,
  computeEnvelopeShares,
  computeOrientationWwr,
  DEFAULT_ENVELOPE_RESULT_SEMANTICS,
  type EnvelopeResultSemantics,
  type EnvelopeShare,
  type OrientationWwrRow,
} from "@/lib/layers/analysis/envelope-overlay";

export interface EnvelopeAnalysis {
  shares: EnvelopeShare[];
  /** null when the recipe has no polygon — a bbox has no per-face truth. */
  orientationWwr: OrientationWwrRow[] | null;
  /** Σ h over every element, W/K. */
  totalHWPerK: number;
  avgWwr: number;
  resultSemantics: EnvelopeResultSemantics;
}

/**
 * Envelope heat-loss shares + per-orientation WWR for a building.
 * Returns null until the material and recipe stores are seeded for `buildingPk`.
 */
export function useEnvelopeAnalysis(buildingPk: string): EnvelopeAnalysis | null {
  const metrics = useEnergyMetrics(buildingPk);
  const recipe = useEffectiveRecipe(buildingPk);
  const materials = useMaterialStore((s) => s.properties[buildingPk]);

  return useMemo<EnvelopeAnalysis | null>(() => {
    if (!metrics || !recipe || !materials) return null;
    const wwr = materials.envelope.windows.windowToWallRatio;
    const shares = computeEnvelopeShares(metrics.heatLoss.elements);
    return {
      shares,
      orientationWwr: computeOrientationWwr(recipe, wwr),
      totalHWPerK: metrics.heatLoss.elements.reduce(
        (sum, e) => sum + Math.max(0, e.hCoefficient),
        0,
      ),
      // Same average the heat-loss model uses for its window area, so the band
      // on screen and the number in the legend describe one quantity.
      avgWwr: (wwr.N + wwr.S + wwr.E + wwr.W) / 4,
      resultSemantics: DEFAULT_ENVELOPE_RESULT_SEMANTICS,
    };
  }, [metrics, recipe, materials]);
}

export interface EnvelopeLayerProps {
  buildingPk: string;
  analysisOverride?: EnvelopeAnalysis | null;
}

export function EnvelopeLayer({
  buildingPk,
  analysisOverride,
}: EnvelopeLayerProps) {
  const enabled = useLayerStore((s) => s.analysisOverlays["overlay-envelope"]);
  const recipe = useEffectiveRecipe(buildingPk);
  const viewerAnalysis = useEnvelopeAnalysis(buildingPk);
  const canonicalSelection = useSelectionStore(
    (state) => state.selectedCanonical,
  );
  const analysis =
    analysisOverride === undefined ? viewerAnalysis : analysisOverride;
  const highlightedEnvelopeNames = useMemo(
    () =>
      canonicalSelection?.buildingPk === buildingPk &&
      canonicalSelection.kind === "diagnostic_finding"
        ? canonicalSelection.threeObjectIds.filter((id) =>
            id.startsWith("envelope-shell:"),
          )
        : [],
    [buildingPk, canonicalSelection],
  );

  // Lazy state initializer, not a ref: the group must be readable during render
  // to be handed to <primitive>, and this keeps one instance for the lifetime
  // of the component.
  const [root] = useState(() => {
    const group = new THREE.Group();
    group.name = "analysis-envelope-root";
    return group;
  });

  useEffect(() => {
    if (!enabled || !recipe || !analysis) return;

    const group = buildEnvelopeOverlay({
      recipe,
      shares: analysis.shares,
      avgWwr: analysis.avgWwr,
      resultSemantics: analysis.resultSemantics,
    });
    if (highlightedEnvelopeNames.length > 0) {
      const highlighted = new Set(highlightedEnvelopeNames);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const isHighlighted = highlighted.has(object.name);
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshBasicMaterial)) continue;
          material.opacity = isHighlighted ? 0.9 : 0.08;
          material.depthWrite = false;
          if (isHighlighted) material.color.set("#22d3ee");
        }
        object.renderOrder = isHighlighted ? 8 : 3;
        object.userData.diagnosticHighlighted = isHighlighted;
      });
    }
    root.add(group);

    return () => {
      root.remove(group);
      disposeObject3D(group);
    };
  }, [enabled, recipe, analysis, root, highlightedEnvelopeNames]);

  // Dispose anything still mounted when the component unmounts.
  useEffect(() => {
    return () => {
      disposeObject3D(root);
      root.clear();
    };
  }, [root]);

  return <primitive object={root} visible={enabled} />;
}
