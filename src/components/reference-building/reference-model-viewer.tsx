"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, useGLTF } from "@react-three/drei";

import type { ReferenceBuildingManifest } from "@/lib/reference-buildings/manifest";
import type { ReferenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { FlowNetwork } from "./flow-network";
import { useScenarioStore, useProposalVisualIds, useEffectiveMeasureIds } from "@/store/scenario-store";
import { deriveVisualState } from "@/lib/retrofit/measure-visuals";
import {
  EnvelopeRetrofitTint,
  EquipmentRetrofitTint,
  RoofRetrofitVisualBoundary,
  RetrofitLegend,
  equipmentLayerReach,
  roofElevationThresholdM,
} from "./reference-retrofit-visuals";

type SceneOffset = Readonly<{
  centre: THREE.Vector3;
  radius: number;
  /**
   * The underside of the building once the scene offset is applied.
   *
   * Taken from the bounding box rather than from a fraction of the radius:
   * the first version put the ground at `-radius * 0.42`, which for this
   * building is 12.1 m below its own lowest slab. The model floated above its
   * shadow, and the number had no relationship to the building at all — it
   * only looked right because the camera distance scaled with the same radius.
   */
  baseY: number;
}>;
type ServiceLayer = NonNullable<
  ReferenceBuildingManifest["serviceLayers"]
>[number];

/** How much of its own opacity the fabric keeps while services are shown. */
const XRAY_FACTOR = 0.22;

/**
 * The canvas is dark, and that is a legibility decision rather than a taste
 * one.
 *
 * The first version drew a pale grey building on a near-white ground, and the
 * services — pale blue duct, grey fitting — landed within a few percent
 * luminance of both. Everything was technically present and almost nothing was
 * readable. Services are light-coloured objects, so they need a dark field to
 * separate from, which is why every coordination tool that shows them (
 * Navisworks, Solibri, Revit's own systems view) puts them on one. It also
 * lets the ghosted envelope read as a lit glass shell instead of as fog, and
 * gives the additively-blended flow lines something to glow against.
 */
const CANVAS_BACKGROUND = "#0d1117";
const GROUND_COLOUR = "#171c22";

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
  xray,
  onMeasured,
}: {
  url: string;
  /**
   * Ghost the envelope so the services inside it can be seen.
   *
   * Without this a service layer is technically drawn and practically
   * invisible: the walls and slabs are opaque and every duct in the building
   * is behind one. This is the Navisworks/Solibri x-ray convention, and the
   * twin already speaks it — `layer-store.ts` calls the same idea
   * `mepIsolation`.
   */
  xray: boolean;
  onMeasured: (offset: SceneOffset) => void;
}) {
  const { scene } = useGLTF(url);
  // `get()` rather than selecting camera and controls directly: R3F expects
  // these to be mutated imperatively, and reading them through the store's
  // accessor keeps that out of React's rules about hook-returned values.
  const get = useThree((state) => state.get);

  const measured = useMemo<SceneOffset>(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const centre = box.getCenter(new THREE.Vector3());
    return {
      centre,
      radius: box.getSize(new THREE.Vector3()).length() / 2,
      baseY: box.min.y - centre.y,
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

  // `useGLTF` caches the parsed scene, so these materials outlive this
  // component and every change has to be undone on the way out — otherwise
  // leaving the page with a layer on ghosts the building for the next reader.
  useEffect(() => {
    if (!xray) return;
    const originals = new Map<
      THREE.Material,
      { transparent: boolean; opacity: number; depthWrite: boolean }
    >();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (!material || originals.has(material)) continue;
        originals.set(material, {
          transparent: material.transparent,
          opacity: material.opacity,
          depthWrite: material.depthWrite,
        });
      }
    });
    for (const [material, original] of originals) {
      material.transparent = true;
      // Scaled rather than flattened, so glazing stays fainter than wall.
      material.opacity = original.opacity * XRAY_FACTOR;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
    return () => {
      for (const [material, original] of originals) {
        material.transparent = original.transparent;
        material.opacity = original.opacity;
        material.depthWrite = original.depthWrite;
        material.needsUpdate = true;
      }
    };
  }, [scene, xray]);

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
      <meshStandardMaterial color={GROUND_COLOUR} roughness={0.92} metalness={0} />
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
  flowVisible,
  manifest,
  energy,
  locale = "ko",
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
  flowVisible: boolean;
  /**
   * Only `roofs`/`storeys` are read here (telling a roof from a floor slab in
   * the merged fabric bucket) — the whole manifest is threaded through rather
   * than picking two fields so a future consumer of it here needs no second
   * prop added to `ReferenceBuildingWorkspace`'s call site.
   */
  manifest: ReferenceBuildingManifest;
  /**
   * Only `energy?.roof?.type` is read (the PV array's flat-vs-pitched
   * classification, and the seam that isolates a tiled roof's own pitch from
   * a flat deck merged into the same mesh — see `resolveRoofFace`). `null`
   * when this building's energy inputs are not wired yet; the array then
   * falls back to this module's own geometric classification.
   */
  energy: ReferenceBuildingEnergyInputs | null;
  locale?: "ko" | "en";
}) {
  const [offset, setOffset] = useState<SceneOffset | null>(null);
  const onMeasured = useCallback((next: SceneOffset) => setOffset(next), []);
  const fabricOn = active.has(fabricLayerId);
  const shown = services.filter((layer) => active.has(layer.id));

  // Green-remodelling preview: read directly from the scenario store rather
  // than through a prop, so the knapsack's selection reaches this canvas
  // without a line added to reference-building-workspace.tsx (Lane 2's file).
  //
  // The 3D visual is driven by `useProposalVisualIds()`, NOT the raw
  // `selectedMeasureIds` — that hook is gated by `previewProposal`, the same
  // switch `RetrofitDeltaStrip` exposes (mounted on this page inside
  // `EnergyInstrumentHud`). Reading the raw field here would mean the switch
  // turns the twin's proposal off while this page's building keeps showing
  // it — two controls disagreeing about what "the" selection is.
  // `selectedMeasureIds` is now the knapsack's RECOMMENDATION only (marks
  // chips 추천); `appliedMeasureIds` is the user's actual chosen set once the
  // HUD has seeded it, and can differ from the recommendation the moment the
  // user edits a chip. The legend must narrate the EFFECTIVE set (what
  // `useProposalVisualIds()` actually draws), not the recommendation alone —
  // otherwise it can report "N measures" while M are really on the building.
  const rawSelectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  const appliedMeasureIds = useScenarioStore((s) => s.appliedMeasureIds);
  const effectiveMeasureIds = useEffectiveMeasureIds();
  const isScenarioSeeded = rawSelectedMeasureIds !== null || appliedMeasureIds !== null;
  const selectedMeasureIds = isScenarioSeeded ? effectiveMeasureIds : null;
  const previewProposal = useScenarioStore((s) => s.previewProposal);
  const proposalIds = useProposalVisualIds();
  const visual = useMemo(() => deriveVisualState(proposalIds), [proposalIds]);
  const hvacReach = equipmentLayerReach(services, active, "hvac");
  const lightingReach = equipmentLayerReach(services, active, "electrical");
  const roofingLayer = services.find((l) => l.id === "roofing");
  const roofingUrl = roofingLayer ? `${baseUrl}/${roofingLayer.file}` : null;
  // Known from the manifest alone, before any GLTF has loaded — a synchronous
  // proxy for "can a roof visual exist on this building" so the legend text
  // does not have to wait on (or lift state up from) the 3D geometry split.
  const roofGeometryAvailable =
    roofingUrl !== null ||
    roofElevationThresholdM(manifest.roofs, manifest.storeys) !== null;

  return (
    <div className="h-full w-full" data-testid="reference-model-viewer">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [60, 40, 60], fov: 40, near: 0.5, far: 2000 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[CANVAS_BACKGROUND]} />
        {/* Cool sky over a near-black ground bounce: enough fill to keep the
            undersides of ducts from going solid black, not enough to lift the
            background. */}
        <hemisphereLight args={["#8fb6d8", "#0b0f14", 1.1]} />
        <directionalLight
          position={[38, 64, 26]}
          intensity={2.6}
          color="#fff6e8"
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        {/* A cool rim from behind, so the far side of a duct run separates
            from the background instead of merging into it. */}
        <directionalLight
          position={[-34, 26, -40]}
          intensity={1.15}
          color="#7fb2e8"
        />
        <Suspense fallback={null}>
          {/* Reflections only, no background — ducts and plant are metal, and
              without an environment they shade as flat grey plastic. The file
              is the twin's own studio HDR rather than a CDN preset. */}
          <Environment files="/hdr/studio.hdr" environmentIntensity={0.42} />
          {/* The fabric stays mounted even when hidden: it is what measures the
              scene, and unmounting it would strand every service layer without
              an offset to draw by. */}
          <group visible={fabricOn}>
            <Fabric
              url={modelUrl}
              xray={fabricOn && shown.length > 0}
              onMeasured={onMeasured}
            />
            {/* Wall/glazing retrofit tint — mutates the SAME cached scene
                `Fabric` renders, independently of its x-ray effect (see the
                comment on `EnvelopeRetrofitTint`). */}
            {fabricOn ? <EnvelopeRetrofitTint url={modelUrl} visual={visual} /> : null}
          </group>
          {offset
            ? shown.map((layer) => (
                <Suspense key={layer.id} fallback={null}>
                  <ServiceGeometry
                    url={`${baseUrl}/${layer.file}`}
                    centre={offset.centre}
                  />
                  {/* Renewed-equipment tint — only when this discipline's own
                      measures are selected AND its layer is on; otherwise the
                      legend explains why nothing here changed. */}
                  {((layer.id === "hvac" && visual.hvacUpgraded) ||
                    (layer.id === "electrical" && visual.lightingUpgraded)) && (
                    <EquipmentRetrofitTint url={`${baseUrl}/${layer.file}`} />
                  )}
                </Suspense>
              ))
            : null}
          {offset && flowVisible
            ? shown
                .filter((layer) => layer.flow?.file)
                .map((layer) => (
                  <FlowNetwork
                    key={`${layer.id}-flow`}
                    url={`${baseUrl}/${layer.flow?.file}`}
                    centre={offset.centre}
                    layerId={layer.id}
                    proposed={
                      (layer.id === "hvac" && visual.hvacUpgraded) ||
                      (layer.id === "electrical" && visual.lightingUpgraded)
                    }
                  />
                ))
            : null}
          {offset ? (
            <RoofRetrofitVisualBoundary
              fabricUrl={modelUrl}
              roofingUrl={roofingUrl}
              roofs={manifest.roofs}
              storeys={manifest.storeys}
              visual={visual}
              centre={offset.centre}
              statedRoofType={energy?.roof?.type}
            />
          ) : null}
          {offset ? (
            <>
              <Ground y={offset.baseY} extent={offset.radius * 5} />
              {/* Grounds the building. Without it the model floats: a shadow
                  from a single directional light lands somewhere off frame at
                  this camera angle and reads as no shadow at all. */}
              <ContactShadows
                position={[0, offset.baseY + 0.02, 0]}
                scale={offset.radius * 2.6}
                far={offset.radius * 0.9}
                opacity={0.62}
                blur={2.4}
                resolution={1024}
                color="#000000"
              />
            </>
          ) : null}
        </Suspense>
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      <RetrofitLegend
        selectedMeasureIds={selectedMeasureIds}
        previewProposal={previewProposal}
        visual={visual}
        hvacReach={hvacReach}
        lightingReach={lightingReach}
        roofGeometryAvailable={roofGeometryAvailable}
        isKo={locale === "ko"}
      />
    </div>
  );
}
