"use client";

import { useEffect, useMemo, useState } from "react";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { createArchitecturalMaterial } from "@/lib/rendering/architectural-material";
import { materialContextFromRecipe } from "@/lib/rendering/material-context";
import { currentBudget } from "@/lib/rendering/runtime";
import { useRenderStore } from "@/store/render-store";
import { subscribeArchitecturalAtlas } from "@/lib/rendering/texture-atlas";

interface ArchitecturalGroundProps {
  recipe: BuildingRecipe;
}

/**
 * Site that the building sits in: grass field, parcel pavement, sidewalk
 * ring, and a foundation plinth. Visual context only — does not alter
 * ledger dimensions.
 */
export function ArchitecturalGround({ recipe }: ArchitecturalGroundProps) {
  const renderMode = useRenderStore((s) => s.mode);
  const renderQuality = useRenderStore((s) => s.quality);
  const [atlasRev, setAtlasRev] = useState(0);
  useEffect(() => subscribeArchitecturalAtlas(() => setAtlasRev((n) => n + 1)), []);
  const ctx = useMemo(() => materialContextFromRecipe(recipe), [recipe]);
  const budget = currentBudget();
  const materialKey = `${renderMode}:${renderQuality}:${atlasRev}`;
  const siteW = recipe.siteWidth || recipe.footprintWidth + 10;
  const siteD = recipe.siteDepth || recipe.footprintDepth + 10;
  const field = Math.max(siteW, siteD, 40) * 6;
  const walk = 1.8;

  const grass = useMemo(
    () => {
      void materialKey;
      return createArchitecturalMaterial({
        config: { color: "#4a6a38", roughness: 0.9, metalness: 0, visualId: "ground-grass" },
        role: "ground",
        context: ctx,
      });
    },
    [ctx, materialKey],
  );
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
        <primitive object={grass} attach="material" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[siteW + 8, siteD + 8]} />
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
      {budget.vegetation && (
        <SiteTrees width={siteW} depth={siteD} seed={ctx.seed} />
      )}
    </group>
  );
}

function SiteTrees({ width, depth, seed }: { width: number; depth: number; seed: number }) {
  const trees = useMemo(() => {
    const out: { x: number; z: number; s: number; h: number }[] = [];
    const rng = (i: number) => {
      const x = Math.sin(seed * 999 + i * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    const count = 7;
    for (let i = 0; i < count; i++) {
      const side = i % 4;
      const t = rng(i);
      const along = (rng(i + 20) - 0.5) * 0.8;
      const margin = 3.5 + rng(i + 40) * 4;
      let x = 0;
      let z = 0;
      if (side === 0) {
        x = along * width;
        z = depth / 2 + margin;
      } else if (side === 1) {
        x = along * width;
        z = -depth / 2 - margin;
      } else if (side === 2) {
        x = width / 2 + margin;
        z = along * depth;
      } else {
        x = -width / 2 - margin;
        z = along * depth;
      }
      out.push({
        x,
        z,
        s: 0.7 + t * 0.55,
        h: 5.5 + rng(i + 60) * 3.5,
      });
    }
    return out;
  }, [width, depth, seed]);

  return (
    <group name="site-trees">
      {trees.map((tree, i) => (
        <group key={i} position={[tree.x, 0, tree.z]} scale={[tree.s, tree.s, tree.s]}>
          <mesh position={[0, tree.h * 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.28, tree.h * 0.45, 6]} />
            <meshStandardMaterial color="#4a3424" roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, tree.h * 0.62, 0]} castShadow>
            <sphereGeometry args={[tree.h * 0.28, 8, 6]} />
            <meshStandardMaterial color="#3f6a32" roughness={0.85} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
