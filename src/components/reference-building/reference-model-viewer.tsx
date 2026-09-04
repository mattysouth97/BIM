"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";

type SceneOffset = Readonly<{ centre: THREE.Vector3; radius: number }>;
type ServiceLayer = NonNullable<
  ReferenceBuildingManifest["serviceLayers"]
>[number];

/**
 * The building itself, and the thing that measures the scene.
 *
 * A coordination model sits wherever its project grid put it — this one is tens
 * of metres off (0,0,0) — so the whole scene is drawn by an offset. That offset
 * is taken from the FABRIC and reused by every other layer: each discipline
 * model has its own bounding box, so recentring each on its own centre would
 * slide the ducts metres off the building.
 */
function Fabric({
  url,
  onMeasured,
}: {
  url: string;
  onMeasured: (offset: SceneOffset) => void;
}) {
  const { scene } = useGLTF(url);
  // `get()` rather than selecting camera and controls directly: R3F expects
  // these to be mutated imperatively, and reading them through the store's
  // accessor keeps that out of React's rules about hook-returned values.
  const get = useThree((state) => state.get);

  const measured = useMemo<SceneOffset>(() => {
    const box = new THREE.Box3().setFromObject(scene);
    return {
      centre: box.getCenter(new THREE.Vector3()),
      radius: box.getSize(new THREE.Vector3()).length() / 2,
    };
  }, [scene]);

  useEffect(() => {
    onMeasured(measured);
    const { camera, controls } = get() as unknown as {
      camera: THREE.PerspectiveCamera;
      controls: { target: THREE.Vector3; update: () => void } | null;
    };
    // Far enough that the whole diagonal fits the vertical field of view, with
    // a little headroom so the building is not cropped at the frame edge.
    const fov = camera.fov ?? 40;
    const distance = (measured.radius / Math.sin((fov * Math.PI) / 360)) * 0.92;
    camera.position.set(distance * 0.7, distance * 0.42, distance * 0.7);
    camera.near = Math.max(0.1, distance / 800);
    camera.far = distance * 12;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [get, measured, onMeasured]);

  return (
    <primitive
      object={scene}
      position={[-measured.centre.x, -measured.centre.y, -measured.centre.z]}
    />
  );
}

/** One discipline model, drawn by the fabric's offset so it stays registered. */
function ServiceGeometry({
  url,
  centre,
}: {
  url: string;
  centre: THREE.Vector3;
}) {
  const { scene } = useGLTF(url);
  return (
    <primitive object={scene} position={[-centre.x, -centre.y, -centre.z]} />
  );
}

/**
 * A ground plane sized to the building, not to the world.
 *
 * An oversized plane is the largest thing in the frame and makes the building
 * read as small however tightly the camera is framed — the model looked like a
 * model of a model at 600 m across.
 */
function Ground({ y, extent }: { y: number; extent: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[extent, extent]} />
      <meshStandardMaterial color="#e8e6e1" roughness={1} />
    </mesh>
  );
}

/**
 * The canvas holds the building and nothing else.
 *
 * Legends, layer controls and credits live in the panel beside it: a 3D view
 * that also carries chrome makes the reader arbitrate between the two for the
 * same pixels, and the chrome always wins because it is closer.
 */
export function ReferenceModelViewer({
  modelUrl,
  baseUrl,
  services,
  active,
  fabricLayerId,
}: {
  modelUrl: string;
  /**
   * Directory the building's generated files sit in. A string rather than a
   * URL-building function on purpose: this is a Client Component, and React
   * refuses a function prop across the server boundary — a constraint `tsc`
   * cannot see and only loading the page reveals.
   */
  baseUrl: string;
  services: readonly ServiceLayer[];
  active: ReadonlySet<string>;
  fabricLayerId: string;
}) {
  const [offset, setOffset] = useState<SceneOffset | null>(null);
  const onMeasured = useCallback((next: SceneOffset) => setOffset(next), []);
  const fabricOn = active.has(fabricLayerId);

  return (
    <div className="h-full w-full" data-testid="reference-model-viewer">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [60, 40, 60], fov: 40, near: 0.5, far: 2000 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#f4f3f0"]} />
        <hemisphereLight args={["#dfeaf5", "#b9ac97", 1.15]} />
        <directionalLight
          position={[40, 70, 30]}
          intensity={2.0}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <Suspense fallback={null}>
          {/* The fabric stays mounted even when hidden: it is what measures the
              scene, and unmounting it would strand every service layer without
              an offset to draw by. */}
          <group visible={fabricOn}>
            <Fabric url={modelUrl} onMeasured={onMeasured} />
          </group>
          {offset
            ? services
                .filter((layer) => active.has(layer.id))
                .map((layer) => (
                  <Suspense key={layer.id} fallback={null}>
                    <ServiceGeometry
                      url={`${baseUrl}/${layer.file}`}
                      centre={offset.centre}
                    />
                  </Suspense>
                ))
            : null}
          {offset ? (
            <Ground y={-offset.radius * 0.42} extent={offset.radius * 5} />
          ) : null}
        </Suspense>
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  );
}
