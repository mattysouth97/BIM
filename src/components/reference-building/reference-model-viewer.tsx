"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";

type SceneOffset = Readonly<{ centre: THREE.Vector3; radius: number }>;

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
    // headroom so the building is not cropped at the frame edge.
    const fov = camera.fov ?? 40;
    const distance = (measured.radius / Math.sin((fov * Math.PI) / 360)) * 1.05;
    camera.position.set(distance * 0.72, distance * 0.42, distance * 0.72);
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
function ServiceLayer({ url, centre }: { url: string; centre: THREE.Vector3 }) {
  const { scene } = useGLTF(url);
  return (
    <primitive object={scene} position={[-centre.x, -centre.y, -centre.z]} />
  );
}

function Ground({ y }: { y: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color="#e8e6e1" roughness={1} />
    </mesh>
  );
}

const FABRIC_LAYER = "fabric";

const LAYER_COLOUR: Record<string, string> = {
  fabric: "#c9c5bd",
  hvac: "#9ebcdb",
  electrical: "#f0cc5c",
  plumbing: "#dc855c",
};

export function ReferenceModelViewer({
  manifest,
  modelUrl,
  baseUrl,
  locale,
}: {
  manifest: ReferenceBuildingManifest;
  modelUrl: string;
  /**
   * Directory the building's generated files sit in. A string rather than a
   * URL-building function on purpose: this is a Client Component, and React
   * refuses a function prop across the server boundary — a constraint `tsc`
   * cannot see and only loading the page reveals.
   */
  baseUrl: string;
  locale: "ko" | "en";
}) {
  const isKo = locale === "ko";
  const [active, setActive] = useState<ReadonlySet<string>>(
    () => new Set([FABRIC_LAYER]),
  );
  const [offset, setOffset] = useState<SceneOffset | null>(null);
  const onMeasured = useCallback((next: SceneOffset) => setOffset(next), []);

  const toggle = (id: string) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const services = manifest.serviceLayers ?? [];
  const fabricOn = active.has(FABRIC_LAYER);

  return (
    <div className="relative h-full w-full" data-testid="reference-model-viewer">
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
                    <ServiceLayer
                      url={`${baseUrl}/${layer.file}`}
                      centre={offset.centre}
                    />
                  </Suspense>
                ))
            : null}
          {offset ? <Ground y={-offset.radius * 0.42} /> : null}
        </Suspense>
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      {/* Each service layer downloads only when switched on — together they are
          17 MB against the fabric's 4.3. */}
      <div
        className="absolute left-4 top-3 w-[15.5rem] rounded-[8px] border border-border bg-card/95 p-2 shadow-xs backdrop-blur"
        data-testid="reference-model-layers"
      >
        <p className="px-1.5 pb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {isKo ? "디지털 트윈 레이어" : "Model layers"}
        </p>
        <LayerRow
          id={FABRIC_LAYER}
          label={isKo ? "외피·구조" : "Fabric"}
          detail={`${manifest.model.triangleCount.toLocaleString()} ${isKo ? "삼각형" : "tris"} · ${(manifest.model.byteLength / 1048576).toFixed(1)} MB`}
          colour={LAYER_COLOUR.fabric}
          on={fabricOn}
          onToggle={toggle}
        />
        {services.map((layer) => (
          <LayerRow
            key={layer.id}
            id={layer.id}
            label={isKo ? layer.ko : layer.en}
            detail={
              isKo
                ? `배관 ${layer.detailedRuns.toLocaleString()} · 부속 ${layer.proxiedComponents.toLocaleString()} · ${(layer.byteLength / 1048576).toFixed(1)} MB`
                : `${layer.detailedRuns.toLocaleString()} runs · ${layer.proxiedComponents.toLocaleString()} components · ${(layer.byteLength / 1048576).toFixed(1)} MB`
            }
            colour={LAYER_COLOUR[layer.id] ?? "#9aa0a6"}
            on={active.has(layer.id)}
            onToggle={toggle}
          />
        ))}
        {/* The simplification is stated where it is seen, not only in a file. */}
        <p className="mt-1.5 border-t border-border px-1.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {isKo
            ? "배관·덕트는 실제 형상, 밸브·기구·장비는 외곽 상자로 단순화했습니다."
            : "Runs are real geometry; valves, terminals and plant are simplified to their bounding box."}
        </p>
      </div>

      {/* Attribution is a condition of CC BY, not a caption. It is rendered
          over the model rather than beside it so that a layout change cannot
          separate the building from its credit. */}
      <p
        className="pointer-events-none absolute bottom-3 left-4 right-4 font-mono text-[10px] leading-relaxed text-muted-foreground"
        data-testid="reference-model-attribution"
      >
        {manifest.attribution}
      </p>
    </div>
  );
}

function LayerRow({
  id,
  label,
  detail,
  colour,
  on,
  onToggle,
}: {
  id: string;
  label: string;
  detail: string;
  colour: string;
  on: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-pressed={on}
      data-testid={`reference-model-layer-${id}`}
      className="flex w-full items-start gap-2 rounded-[6px] px-1.5 py-1.5 text-left transition-colors hover:bg-muted/60"
    >
      <span
        aria-hidden
        className="mt-[3px] size-2.5 shrink-0 rounded-full border"
        style={{
          backgroundColor: on ? colour : "transparent",
          borderColor: colour,
        }}
      />
      <span className="min-w-0">
        <span
          className={`block truncate text-[11px] ${on ? "text-foreground" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <span className="block truncate font-mono text-[9px] text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}
