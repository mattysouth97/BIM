"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useLayerStore } from "@/store/layer-store";
import { LayerManager } from "@/lib/layers/layer-manager";
import { ALL_LAYER_IDS, MEP_SUB_IDS } from "@/lib/layers/types";

export function BuildingLayers() {
  const managerRef = useRef<LayerManager | null>(null);

  const visibility = useLayerStore((s) => s.visibility);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);

  // Create LayerManager once
  if (managerRef.current == null) {
    managerRef.current = new LayerManager();
  }

  // Sync visibility state to Three.js groups
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    for (const id of ALL_LAYER_IDS) {
      manager.setVisible(id, visibility[id]);
    }
  }, [visibility]);

  // Sync MEP sub-layer visibility to Three.js sub-groups.
  // Depends on both mepSubVisibility AND visibility so that when the main MEP toggle
  // goes off→on (Three.js re-shows all children), sub-group states are immediately
  // re-applied, preventing the "all show" bug documented in 22-RESEARCH.md Pitfall 2.
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    for (const subId of MEP_SUB_IDS) {
      manager.setMepSubVisible(subId, mepSubVisibility[subId]);
    }
  }, [mepSubVisibility, visibility]);

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

  // eslint-disable-next-line react-hooks/refs
  const parentGroup = managerRef.current?.getParentGroup();
  if (!parentGroup) return null;

  return <primitive object={parentGroup} />;
}
