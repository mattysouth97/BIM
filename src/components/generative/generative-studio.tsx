"use client";

// src/components/generative/generative-studio.tsx
//
// The generative workspace: intent in, building out, model dominant.
//
// The 3D view is the primary interface (brief §61, §117) — the command surface
// sits beside it, never over it. Geometry comes from the existing
// ProceduralBuilding engine via the compiled recipe, so this is the real
// renderer, not a preview.

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";

import { ProceduralBuildingModel } from "@/components/viewer/procedural-building-model";
import type { GenerationResult } from "@/lib/generative/client";

import { GeneratePanel, GenerationSummary } from "./generate-panel";

export function GenerativeStudio() {
  const [result, setResult] = useState<GenerationResult | null>(null);

  if (!result) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <GeneratePanel onGenerated={setResult} />
      </div>
    );
  }

  const { recipe } = result;
  const span = Math.max(recipe.footprintWidth, recipe.footprintDepth);
  const camera = {
    position: [span * 1.4, recipe.totalHeight * 1.1 + span * 0.5, span * 1.4] as [
      number,
      number,
      number,
    ],
    fov: 45,
    near: 0.1,
    far: Math.max(2_000, span * 20),
  };

  return (
    <div className="flex h-full w-full">
      <div className="relative min-w-0 flex-1">
        <Canvas shadows camera={camera} dpr={[1, 2]}>
          <color attach="background" args={["#f5f5f5"]} />
          <hemisphereLight args={["#b1e1ff", "#b97a20", 0.6]} />
          <directionalLight
            castShadow
            position={[span, span * 1.5, span * 0.75]}
            intensity={2}
          />
          <Suspense fallback={null}>
            {/* No ledger geometry exists for a generated building — the recipe
                alone drives the renderer. */}
            <ProceduralBuildingModel recipeOverride={recipe} />
            <Environment preset="city" background={false} />
          </Suspense>
          <OrbitControls
            makeDefault
            target={[0, recipe.totalHeight / 2, 0]}
            maxPolarAngle={Math.PI / 2.05}
          />
        </Canvas>

        <button
          type="button"
          onClick={() => setResult(null)}
          className="absolute left-4 top-4 rounded-md border bg-background/90 px-3 py-1.5 text-sm backdrop-blur"
        >
          ← New building
        </button>
      </div>

      <aside className="w-[360px] shrink-0 overflow-y-auto border-l bg-background">
        <GenerationSummary result={result} />
      </aside>
    </div>
  );
}
