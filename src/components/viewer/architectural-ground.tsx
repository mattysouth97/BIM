"use client";

import { useEffect, useMemo, useState } from "react";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { createArchitecturalMaterial } from "@/lib/rendering/architectural-material";
import { materialContextFromRecipe } from "@/lib/rendering/material-context";
import { useRenderStore } from "@/store/render-store";
import { subscribeArchitecturalAtlas } from "@/lib/rendering/texture-atlas";

interface ArchitecturalGroundProps {
  recipe: BuildingRecipe;
}

/**
 * Site that the building sits on: parcel pavement, sidewalk ring, and a
 * foundation plinth. Visual context only — does not alter ledger dimensions.
 */
export function ArchitecturalGround({ recipe }: ArchitecturalGroundProps) {
  const renderMode = useRenderStore((s) => s.mode);
  const renderQuality = useRenderStore((s) => s.quality);
  const [atlasRev, setAtlasRev] = useState(0);
  useEffect(() => subscribeArchitecturalAtlas(() => setAtlasRev((n) => n + 1)), []);
  const ctx = useMemo(() => materialContextFromRecipe(recipe), [recipe]);
  const materialKey = `${renderMode}:${renderQuality}:${atlasRev}`;
  const siteW = recipe.siteWidth || recipe.footprintWidth + 10;
  const siteD = recipe.siteDepth || recipe.footprintDepth + 10;
  const field = Math.max(siteW, siteD, 40) * 6;
  const walk = 1.8;

  const pavement = useMemo(
    () => {
      void materialKey;
      return createArchitecturalMaterial({
        config: { color: "#9a9892", roughness: 0.82, metalness: 0, visualId: "ground-concrete-pavement" },
        role: "sidewalk",
        context: ctx,
      });
    },
    [ctx, materialKey],
  );
  const asphalt = useMemo(
    () => {
      void materialKey;
      return createArchitecturalMaterial({
        config: { color: "#3d3d40", roughness: 0.92, metalness: 0, visualId: "ground-asphalt" },
        role: "pavement",
        context: ctx,
      });
    },
    [ctx, materialKey],
  );
  const plinth = useMemo(
    () => {
      void materialKey;
      return createArchitecturalMaterial({
        config: { color: "#8a8680", roughness: 0.78, metalness: 0, visualId: "concrete-cast" },
        role: "foundation",
        context: ctx,
      });
    },
    [ctx, materialKey],
  );

  const fw = recipe.footprintWidth;
  const fd = recipe.footprintDepth;

  return (
    <group name="architectural-ground">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[field, field]} />
        <primitive object={asphalt} attach="material" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[fw + walk * 2, fd + walk * 2]} />
        <primitive object={pavement} attach="material" />
      </mesh>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[fw + 0.25, 0.18, fd + 0.25]} />
        <primitive object={plinth} attach="material" />
      </mesh>
    </group>
  );
}
