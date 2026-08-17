"use client";

// src/components/lean/lean-viewport.tsx
//
// The 3D half of the lean viewport: the massing shell plus the solved interior,
// and nothing else. No layer toggles — the interior is always on, because in
// this product the interior IS the result.
//
// The renderer, the model component and the interior layer are all the existing
// tested ones. What lives here is only the framing: a camera that refits when
// the building genuinely changes size, and the light rig the studio uses.

import { Suspense, useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { InteriorLayer } from "@/components/viewer/interior-layer";
import { SceneEnvironment } from "@/components/viewer/scene-environment";
import { ProceduralBuildingModel } from "@/components/viewer/procedural-building-model";
import type { BimModelSnapshot } from "@/lib/bim/model/types";
import type { BuildingRecipe } from "@/lib/procedural/types";

/** Module scope: R3F treats `camera` as live state, so the object must be stable. */
const CAMERA_DEFAULTS = {
  position: [60, 40, 60] as [number, number, number],
  fov: 45,
  near: 0.5,
  far: 20_000,
};

/**
 * Refit only when the building's size actually changed. Refitting on every edit
 * would yank the view away from whatever the architect was looking at.
 */
function CameraRig({ span, height }: { span: number; height: number }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const lastSpan = useRef(0);

  useEffect(() => {
    const previous = lastSpan.current;
    if (previous > 0 && Math.abs(span - previous) / previous <= 0.15) return;

    camera.position.set(span * 1.4, height * 1.1 + span * 0.5, span * 1.4);
    if (camera instanceof THREE.PerspectiveCamera) {
      // Mutating the three.js camera is how R3F works — same convention as the
      // studio's rig and `SceneSetup` in building-scene.tsx.
      // eslint-disable-next-line react-hooks/immutability
      camera.far = Math.max(2_000, span * 20);
      camera.updateProjectionMatrix();
    }

    if (controls) {
      controls.target.set(0, height / 2, 0);
      controls.update();
      // Record the fit only once the orbit target was really set; the pass that
      // runs before drei registers controls must not count as done.
      lastSpan.current = span;
    } else {
      camera.lookAt(0, height / 2, 0);
    }
  }, [span, height, camera, controls]);

  return null;
}

export function LeanModelView({
  recipe,
  snapshot,
}: {
  recipe: BuildingRecipe;
  snapshot: BimModelSnapshot;
}) {
  const span = Math.max(recipe.footprintWidth, recipe.footprintDepth);

  return (
    <Canvas shadows dpr={[1, 2]} camera={CAMERA_DEFAULTS}>
      <color attach="background" args={["#f5f5f5"]} />
      <hemisphereLight args={["#b1e1ff", "#b97a20", 0.6]} />
      <directionalLight castShadow position={[span, span * 1.5, span * 0.75]} intensity={2} />
      <Suspense fallback={null}>
        <ProceduralBuildingModel recipeOverride={recipe} />
        <InteriorLayer snapshot={snapshot} enabled floors={null} />
      </Suspense>
      <SceneEnvironment />
      <OrbitControls makeDefault target={[0, recipe.totalHeight / 2, 0]} maxPolarAngle={Math.PI / 2.05} />
      <CameraRig span={span} height={recipe.totalHeight} />
    </Canvas>
  );
}
