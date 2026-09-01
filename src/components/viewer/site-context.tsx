"use client";

import { useMemo } from "react";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { useRenderStore } from "@/store/render-store";
import { isRealisticMode } from "@/lib/rendering/runtime";

interface SiteContextProps {
  recipe: BuildingRecipe;
  /** Demo-only neighbor boxes. Never fetched — demo must not call VWorld. */
  showDemoNeighbors?: boolean;
}

/**
 * Parcel plate + north tick. +Z is building front / south (core-layout
 * convention), so north is −Z. Neighbor boxes are a belief cue for the
 * demo plate only.
 */
export function SiteContext({ recipe, showDemoNeighbors = false }: SiteContextProps) {
  const renderMode = useRenderStore((s) => s.mode);
  const hidePlate = isRealisticMode(renderMode);
  const siteW = recipe.siteWidth || recipe.footprintWidth + 8;
  const siteD = recipe.siteDepth || recipe.footprintDepth + 8;

  const neighbors = useMemo(() => {
    if (!showDemoNeighbors) return [];
    const hw = siteW / 2;
    const hd = siteD / 2;
    return [
      { x: hw + 18, z: -8, w: 22, d: 16, h: 18 },
      { x: -hw - 16, z: 6, w: 18, d: 14, h: 12 },
      { x: 4, z: hd + 20, w: 26, d: 12, h: 9 },
    ];
  }, [showDemoNeighbors, siteW, siteD]);

  return (
    <group name="site-context">
      {!hidePlate && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow>
          <planeGeometry args={[siteW, siteD]} />
          <meshStandardMaterial color="#c5c2bb" roughness={0.92} metalness={0} />
        </mesh>
      )}
      {/* North tick at −Z */}
      <mesh position={[0, 0.04, -siteD / 2 - 1.2]}>
        <boxGeometry args={[0.35, 0.08, 2.4]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {neighbors.map((n, i) => (
        <mesh key={i} position={[n.x, n.h / 2, n.z]} castShadow receiveShadow>
          <boxGeometry args={[n.w, n.h, n.d]} />
          <meshStandardMaterial color="#d7d4ce" roughness={0.85} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
