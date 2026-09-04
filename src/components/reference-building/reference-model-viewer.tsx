"use client";

import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";

/**
 * The building itself, as tessellated from its IFC at build time.
 *
 * `useGLTF` suspends, so this must sit inside a Suspense boundary; `Bounds`
 * frames whatever arrives rather than assuming a size, which matters because
 * the model's own origin is wherever the project was drawn — for this clinic
 * the geometry sits tens of metres off (0,0,0), so a fixed camera looks at
 * empty space.
 */
function Fabric({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // `get()` rather than selecting camera and controls directly: R3F expects
  // these to be mutated imperatively, and reading them through the store's
  // accessor keeps that out of React's rules about hook-returned values.
  const get = useThree((state) => state.get);

  // Recentre on the model's own bounding box rather than trusting the file's
  // origin. A coordination model is drawn wherever the project grid put it —
  // this one sits tens of metres off (0,0,0) — so a camera aimed at the origin
  // looks at empty ground, and an auto-framer that measures before the GLTF
  // resolves parks the camera inside a wall. Both happened here.
  const centred = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    scene.position.sub(centre);
    return { size, radius: Math.max(size.x, size.y, size.z) / 2 };
  }, [scene]);

  useEffect(() => {
    const { camera, controls } = get() as unknown as {
      camera: THREE.PerspectiveCamera;
      controls: { target: THREE.Vector3; update: () => void } | null;
    };
    // Far enough that the whole diagonal fits the vertical field of view, with
    // headroom so the building is not cropped at the frame edge.
    const fov = camera.fov ?? 40;
    const distance =
      (centred.radius / Math.sin((fov * Math.PI) / 360)) * 1.15;
    camera.position.set(distance * 0.72, distance * 0.42, distance * 0.72);
    camera.near = Math.max(0.1, distance / 800);
    camera.far = distance * 12;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [get, centred]);

  return <primitive object={scene} />;
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -8.5, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color="#e8e6e1" roughness={1} />
    </mesh>
  );
}

export function ReferenceModelViewer({
  manifest,
  modelUrl,
  locale,
}: {
  manifest: ReferenceBuildingManifest;
  modelUrl: string;
  locale: "ko" | "en";
}) {
  const isKo = locale === "ko";

  return (
    <div className="relative h-full w-full" data-testid="reference-model-viewer">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [60, 40, 60], fov: 40, near: 0.5, far: 2000 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#f4f3f0"]} />
        <hemisphereLight args={["#dfeaf5", "#b9ac97", 1.1]} />
        <directionalLight
          position={[40, 70, 30]}
          intensity={2.1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <Suspense fallback={null}>
          <Fabric url={modelUrl} />
          <Ground />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>

      {/* Attribution is a condition of CC BY, not a caption. It is rendered
          over the model rather than beside it so that a layout change cannot
          separate the building from its credit. */}
      <p
        className="pointer-events-none absolute bottom-3 left-4 right-4 font-mono text-[10px] leading-relaxed text-muted-foreground"
        data-testid="reference-model-attribution"
      >
        {manifest.attribution}
      </p>

      <p className="pointer-events-none absolute right-4 top-3 font-mono text-[10px] text-muted-foreground">
        {isKo
          ? `${manifest.model.triangleCount.toLocaleString()} 삼각형 · 골조만`
          : `${manifest.model.triangleCount.toLocaleString()} triangles · fabric only`}
      </p>
    </div>
  );
}
