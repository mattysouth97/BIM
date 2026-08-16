"use client";

import { useState, useRef, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SAOPass } from "three/examples/jsm/postprocessing/SAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { BrTitleInfo, BrFloorInfo } from "@/lib/types";
import { generateBuildingGeometry, toRecipe, type FloorGeometry } from "@/lib/building-geometry";
import { inferMaterialProperties } from "@/lib/material-inference";
import { saveModel, loadModel } from "@/lib/model-storage";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { applyOverrides } from "@/lib/procedural/recipe";
import { Loader2 } from "lucide-react";
import { createSceneProjection } from "@/lib/gis/gis-transform";
import { ringBboxCenter } from "@/lib/gis/ring-utils";
import { useAppStore } from "@/store/app-store";
import { formatArea } from "@/lib/constants";
import type { CampusData } from "@/lib/campus/campus-types";
import { computeSiteLayout } from "@/lib/campus/site-layout";
import { getCampusBuildingConfigs } from "@/lib/campus/campus-scene";
import type { FootprintOutline } from "./ground-plane";
import { GroundPlane } from "./ground-plane";
import { SiteContext } from "./site-context";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import { DEMO_BUILDING_PK } from "@/lib/constants";
import { ProceduralBuildingModel } from "./procedural-building-model";
import { BuildingLayers } from "./building-layers";
import { SceneControls, type SceneControlsRef } from "./scene-controls";
import { useViewStore } from "@/lib/bim/views/view-store";
import { ContextualToolbar } from "@/components/workspace/contextual-toolbar";
import { LayerPanel } from "./layer-panel";
import { ModelUploader } from "./model-uploader";
import { ErrorBoundary, ViewerErrorBoundary } from "@/components/error-boundary";
import { StructuralTooltip } from "./structural-tooltip";
import { EquipmentClickHandler } from "./equipment-click-handler";
import { EquipmentHoverCard } from "./equipment-hover-card";
import { ScenePostProcessing } from "./outline-post-processing";
import { TwinStageOverlay } from "@/components/twin/twin-stage-overlay";
import type { FootprintGeometry } from "@/lib/portfolio/types";

const IFCModel = lazy(() =>
  import("./ifc-loader").then((m) => ({ default: m.IFCModel }))
);
const GLTFModel = lazy(() =>
  import("./gltf-loader").then((m) => ({ default: m.GLTFModel }))
);

type ModelSource = "parametric" | "uploaded";

/**
 * Neutral HDR environment for image-based lighting (reflections only).
 * Background is set to solid color, not HDR.
 */
function SceneSetup() {
  const { scene, gl } = useThree();

  // Solid neutral background for BIM visualization
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    scene.background = new THREE.Color(0xf5f5f5);
  }, [scene]);

  // Load HDR for environment reflections only (not background)
  const envMap = useEnvironment({ files: "/hdr/studio.hdr" });

  useEffect(() => {
    if (envMap) {
      const pmrem = new THREE.PMREMGenerator(gl);
      const processed = pmrem.fromEquirectangular(envMap);
      // eslint-disable-next-line react-hooks/immutability
      scene.environment = processed.texture;
      // Do NOT set scene.background to envMap — keep solid color
      pmrem.dispose();
    }
  }, [envMap, scene, gl]);

  return null;
}

/**
 * SAOPass-based ambient occlusion using three.js native post-processing.
 * Replaces the previous SSAO + Bloom + Vignette pipeline.
 */
function SAOPostProcessing() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const saoPass = new SAOPass(scene, camera);
    saoPass.params.saoBias = 1.0;
    saoPass.params.saoIntensity = 0.004;
    saoPass.params.saoScale = 2;
    saoPass.params.saoKernelRadius = 15;
    saoPass.params.saoMinResolution = 0;
    saoPass.params.saoBlur = true;
    saoPass.params.saoBlurRadius = 12;
    saoPass.params.saoBlurStdDev = 6;
    saoPass.params.saoBlurDepthCutoff = 0.01;
    composer.addPass(saoPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    composerRef.current = composer;

    return () => {
      composer.dispose();
    };
  }, [gl, scene, camera]);

  // Resize composer when viewport changes
  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size]);

  // Take over the render loop
  useFrame(() => {
    composerRef.current?.render();
  }, 1);

  return null;
}

// ─── Campus rendering ────────────────────────────────────────────────────────

interface CampusSceneContentProps {
  campusData: CampusData;
  onBuildingSelect?: (buildingPk: string | null) => void;
  activeBuildingPk?: string | null;
}

/**
 * Renders all campus buildings on a shared ground plane.
 * Each building is independently clickable.
 */
function CampusSceneContent({ campusData, onBuildingSelect, activeBuildingPk }: CampusSceneContentProps) {
  const siteLayout = useMemo(() => computeSiteLayout(campusData), [campusData]);
  const buildingConfigs = useMemo(() => getCampusBuildingConfigs(siteLayout), [siteLayout]);

  // Collect footprint outlines for ground-plane markings
  const footprintOutlines = useMemo<FootprintOutline[]>(() => {
    return buildingConfigs
      .filter((c) => c.footprintVertices && c.footprintVertices.length >= 3)
      .map((c) => ({
        vertices: c.footprintVertices!,
        offsetX: 0,
        offsetZ: 0,
      }));
  }, [buildingConfigs]);

  const handleBuildingClick = useCallback((pk: string) => {
    if (onBuildingSelect) {
      onBuildingSelect(activeBuildingPk === pk ? null : pk);
    }
  }, [onBuildingSelect, activeBuildingPk]);

  return (
    <>
      {/* Shared campus ground plane */}
      <GroundPlane
        siteWidth={siteLayout.extents.width}
        siteDepth={siteLayout.extents.depth}
        campusExtents={siteLayout.extents}
        footprintOutlines={footprintOutlines}
      />

      {/* One building per config, positioned at its campus coordinate */}
      {buildingConfigs.map((config) => (
        <group
          key={config.key}
          position={[config.worldPosition.x, config.worldPosition.y, config.worldPosition.z]}
          onClick={() => handleBuildingClick(config.key)}
        >
          <ProceduralBuildingModel
            geometry={config.geometry}
            recipeOverride={config.recipe}
            hideGroundPlane
          />
        </group>
      ))}
    </>
  );
}

// ─── Single-building scene ────────────────────────────────────────────────────

interface FootprintResult {
  polygon: number[][][] | null;
  error: string | null;
}

interface BuildingSceneProps {
  title: BrTitleInfo;
  floors: BrFloorInfo[];
  /** When provided, renders all campus buildings instead of a single building */
  campusData?: CampusData;
  /**
   * Pre-fetched footprint data from the page level (hoisted out of BuildingScene
   * so both ledger and footprint fetches start simultaneously at page mount).
   * When provided, BuildingScene uses this instead of fetching internally.
   */
  footprintData?: FootprintResult;
  /**
   * When true, shows a loading overlay covering the Canvas.
   * Set to true while either ledger or footprint data is still in flight.
   * Overlay disappears automatically when this becomes false.
   */
  isCompositeLoading?: boolean;
}

export function BuildingScene({ title, floors, campusData, footprintData: footprintDataProp, isCompositeLoading }: BuildingSceneProps) {
  const [selectedFloor, setSelectedFloor] = useState<FloorGeometry | null>(null);
  const [modelSource, setModelSource] = useState<ModelSource>("parametric");
  const [activeCampusBuilding, setActiveCampusBuilding] = useState<string | null>(null);

  // Panel open state — extracted to workspace-store per D-06.
  // The toolbar toggles layerPanelOpen directly on the store; this component
  // only reads it to mount the LayerPanel (single source of truth).
  const layerPanelOpen = useWorkspaceStore((s) => s.layerPanelOpen);
  const uploadDialogOpen = useWorkspaceStore((s) => s.uploadDialogOpen);
  const setLayerPanelOpen = useWorkspaceStore((s) => s.setLayerPanelOpen);
  const setUploadDialogOpen = useWorkspaceStore((s) => s.setUploadDialogOpen);
  const [uploadedModel, setUploadedModel] = useState<{
    buffer: ArrayBuffer;
    fileName: string;
    fileType: "ifc" | "gltf" | "glb";
  } | null>(null);
  const controlsRef = useRef<SceneControlsRef>(null);

  const buildingPk = String(title.mgmBldrgstPk || "unknown");

  // Footprint data is provided by the page (hoisted parallel fetch).
  // If absent (e.g. component used standalone), footprintPolygon stays undefined
  // and ProceduralBuildingModel renders a rectangular box automatically.
  const footprintPolygon = footprintDataProp?.polygon ?? undefined;

  const geometry = useMemo(() => {
    const geo = generateBuildingGeometry(title, floors);

    if (footprintPolygon && footprintPolygon.length >= 1 && footprintPolygon[0].length >= 3) {
      try {
        // footprintPolygon is number[][][] — WGS84 rings [[lng, lat], ...]
        const outerRing = footprintPolygon[0];

        // Center the scene frame on the ring's bbox midpoint — a vertex
        // average is biased by the duplicated closing vertex and vertex-dense
        // edges, which would shift the polygon shell away from the
        // origin-centered frame the roof box and column grid build in.
        const [centerLng, centerLat] = ringBboxCenter(outerRing);

        // Create site-specific TM projection centered on the bbox midpoint
        const proj = createSceneProjection(centerLng, centerLat);

        // Project all rings from WGS84 to local [x, z] meters, then re-center
        // exactly on the projected bbox so the outline is origin-centered.
        const projected: [number, number][][] = footprintPolygon.map((ring) =>
          ring.map(([lng, lat]) => proj.project(lng, lat) as [number, number])
        );
        const [cx, cz] = ringBboxCenter(projected[0]);
        const localRings: [number, number][][] = projected.map((ring) =>
          ring.map(([x, z]) => [x - cx, z - cz] as [number, number])
        );

        geo.footprintPolygon = localRings;

        // Compute bounding box from projected outer ring for footprintWidth/footprintDepth
        const outerLocal = localRings[0];
        const xs = outerLocal.map((p) => p[0]);
        const zs = outerLocal.map((p) => p[1]);
        geo.footprintWidth = Math.max(...xs) - Math.min(...xs);
        geo.footprintDepth = Math.max(...zs) - Math.min(...zs);
      } catch (err) {
        console.warn("[GIS] Footprint projection failed, falling back to rectangular:", err);
        // geo.footprintPolygon remains undefined — rectangular fallback is automatic
      }
    }

    return geo;
  }, [title, floors, footprintPolygon]);

  // ── Portfolio-feature-vector geometry shape (area / perimeter / aspect)
  // Used by the TwinStageOverlay to derive the 20-field feature vector.
  const portfolioFootprint = useMemo<FootprintGeometry | null>(() => {
    if (!footprintPolygon || footprintPolygon.length === 0 || footprintPolygon[0].length < 3) {
      return null;
    }
    const outer = footprintPolygon[0];
    // Project to local metres for accurate area/perimeter.
    const lng0 = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const lat0 = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    let proj;
    try {
      proj = createSceneProjection(lng0, lat0);
    } catch {
      return null;
    }
    const localOuter: Array<[number, number]> = outer.map(
      ([lng, lat]) => proj!.project(lng, lat) as [number, number]
    );

    // Shoelace area
    let areaAcc = 0;
    for (let i = 0; i < localOuter.length; i++) {
      const [x1, z1] = localOuter[i];
      const [x2, z2] = localOuter[(i + 1) % localOuter.length];
      areaAcc += x1 * z2 - x2 * z1;
    }
    const areaSqm = Math.abs(areaAcc) / 2;

    // Perimeter
    let perimeterM = 0;
    for (let i = 0; i < localOuter.length; i++) {
      const [x1, z1] = localOuter[i];
      const [x2, z2] = localOuter[(i + 1) % localOuter.length];
      perimeterM += Math.hypot(x2 - x1, z2 - z1);
    }

    const xs = localOuter.map((p) => p[0]);
    const zs = localOuter.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...zs) - Math.min(...zs);
    const aspectRatio = w === 0 || d === 0 ? 1 : Math.max(w, d) / Math.min(w, d);

    return {
      outerRing: outer as Array<[number, number]>,
      areaSqm,
      perimeterM,
      aspectRatio,
    };
  }, [footprintPolygon]);

  const setProperties = useMaterialStore((s) => s.setProperties);
  const existingProps = useMaterialStore((s) => s.properties[buildingPk]);

  useEffect(() => {
    if (!existingProps) {
      const inferred = inferMaterialProperties(title, floors);
      setProperties(buildingPk, inferred);
    }
  }, [buildingPk, existingProps, title, floors, setProperties]);

  useEffect(() => {
    loadModel(buildingPk).then((stored) => {
      if (stored) {
        setUploadedModel({
          buffer: stored.buffer,
          fileName: stored.fileName,
          fileType: stored.fileType,
        });
        setModelSource("uploaded");
        if (stored.fileType === "ifc") {
          useTwinProvenanceStore.getState().patch(buildingPk, { hasIfcModel: true });
        }
      }
    });
  }, [buildingPk]);

  const handleFileLoaded = useCallback(
    async (buffer: ArrayBuffer, fileName: string, fileType: "ifc" | "gltf" | "glb") => {
      setUploadedModel({ buffer, fileName, fileType });
      setModelSource("uploaded");
      await saveModel(buildingPk, buffer, fileName, fileType);
      if (fileType === "ifc") {
        useTwinProvenanceStore.getState().patch(buildingPk, { hasIfcModel: true });
      }
    },
    [buildingPk]
  );

  const handleToggleModelSource = useCallback(() => {
    if (uploadedModel) {
      setModelSource((prev) => (prev === "parametric" ? "uploaded" : "parametric"));
    } else {
      setUploadDialogOpen(true);
    }
  }, [uploadedModel]);

  // Store base recipe and apply overrides from config panel
  const setBaseRecipe = useRecipeStore((s) => s.setBaseRecipe);
  const recipeOverrides = useRecipeStore((s) => s.overrides[buildingPk]);

  const baseRecipe = useMemo(() => toRecipe(geometry), [geometry]);

  // Register base recipe so config tabs can read effective values
  useEffect(() => {
    setBaseRecipe(buildingPk, baseRecipe);
  }, [buildingPk, baseRecipe, setBaseRecipe]);

  const recipe = useMemo(
    () => recipeOverrides ? applyOverrides(baseRecipe, recipeOverrides) : baseRecipe,
    [baseRecipe, recipeOverrides]
  );

  const isKo = useAppStore((s) => s.language) === "ko";

  const cameraDistance = Math.max(geometry.totalHeight, geometry.footprintWidth, geometry.footprintDepth) * 1.8;

  // Campus camera: position far enough to see all buildings
  const campusSiteLayout = useMemo(
    () => campusData ? computeSiteLayout(campusData) : null,
    [campusData]
  );
  const campusCameraDistance = campusSiteLayout
    ? Math.max(campusSiteLayout.extents.width, campusSiteLayout.extents.depth) * 1.2
    : cameraDistance;

  const activeCameraDistance = campusData ? campusCameraDistance : cameraDistance;
  const activeTotalHeight = campusData ? 20 : geometry.totalHeight;

  const handleViewChange = (view: "front" | "side" | "top" | "iso") => {
    controlsRef.current?.setView(view);
  };

  const initializeDefaultViews = useViewStore((s) => s.initializeDefaultViews);
  useEffect(() => {
    if (campusData) return;
    const halfW = recipe.footprintWidth / 2;
    const halfD = recipe.footprintDepth / 2;
    const bbox = new THREE.Box3(
      new THREE.Vector3(-halfW, 0, -halfD),
      new THREE.Vector3(halfW, recipe.totalHeight, halfD),
    );
    initializeDefaultViews(recipe.floors, bbox, buildingPk);
  }, [campusData, recipe, buildingPk, initializeDefaultViews]);

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      {/* Contextual toolbar strip — replaces ViewerOverlay */}
      <ContextualToolbar
        onViewChange={handleViewChange}
        buildingName={geometry.buildingName}
        era={geometry.era}
        selectedFloor={modelSource === "parametric" ? selectedFloor : null}
      />

      {/* 3D Canvas — fills remaining space */}
      <div className="relative flex-1 min-h-0">
      {/* Composite loading overlay — visible while ledger or footprint fetch is in flight */}
      {isCompositeLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">건물 데이터 로딩 중…</p>
          </div>
        </div>
      )}
      <ViewerErrorBoundary>
      <Canvas
        camera={{
          position: [
            activeCameraDistance * 0.7,
            activeTotalHeight * 0.6 + activeCameraDistance * 0.3,
            activeCameraDistance * 0.7,
          ],
          fov: campusData ? 45 : 35,
          near: 0.1,
          far: activeCameraDistance * 10,
        }}
        gl={{
          antialias: true,
          outputColorSpace: THREE.SRGBColorSpace,
          localClippingEnabled: true,
        }}
        shadows={{ type: THREE.VSMShadowMap }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {/* Scene setup: solid background + HDR env for reflections */}
          <SceneSetup />

          {/* Hemisphere light — subtle sky/ground ambient fill */}
          <hemisphereLight
            args={["#b1e1ff", "#b97a20", 0.6]}
          />

          {/* Single directional light with soft VSM shadows */}
          <directionalLight
            position={[40, 60, 30]}
            intensity={2.0}
            color="#ffffff"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={200}
            shadow-camera-left={-60}
            shadow-camera-right={60}
            shadow-camera-top={60}
            shadow-camera-bottom={-60}
            shadow-bias={-0.0004}
            shadow-radius={4}
          />

          {/* Model rendering — campus mode or single-building mode */}
          {campusData ? (
            <CampusSceneContent
              campusData={campusData}
              activeBuildingPk={activeCampusBuilding}
              onBuildingSelect={setActiveCampusBuilding}
            />
          ) : (
            modelSource === "parametric" && (
              <>
                <ProceduralBuildingModel geometry={geometry} recipeOverride={recipe} onFloorSelect={setSelectedFloor} />
                <SiteContext recipe={recipe} showDemoNeighbors={buildingPk === DEMO_BUILDING_PK} />
                <BuildingLayers buildingPk={buildingPk} />
                <StructuralTooltip />
                <EquipmentClickHandler />
                <EquipmentHoverCard />
              </>
            )
          )}
          {!campusData && modelSource === "uploaded" && uploadedModel && (
            <Suspense fallback={null}>
              {uploadedModel.fileType === "ifc" ? (
                <IFCModel fileBuffer={uploadedModel.buffer} />
              ) : (
                <GLTFModel fileBuffer={uploadedModel.buffer} fileName={uploadedModel.fileName} />
              )}
            </Suspense>
          )}

          <SceneControls
            ref={controlsRef}
            targetHeight={activeTotalHeight}
            distance={activeCameraDistance}
          />

          {/* Outline + post-processing (OutlinePass-based, SAOPass scaffold kept inside) */}
          <ScenePostProcessing />
        </Suspense>
      </Canvas>
      </ViewerErrorBoundary>

      {/* Floor info — mid-left, above the budget strip */}
      {selectedFloor && modelSource === "parametric" && (
        <div className="absolute left-3 bottom-28 z-10 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-sm max-w-xs">
          <p className="text-sm font-semibold">
            {selectedFloor.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({selectedFloor.type === "below" ? (isKo ? "지하" : "Underground") : (isKo ? "지상" : "Above ground")})
            </span>
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{isKo ? "면적" : "Area"}</span>
            <span className="font-medium text-foreground">{formatArea(selectedFloor.area)}</span>
            <span>{isKo ? "용도" : "Use"}</span>
            <span className="font-medium text-foreground">{selectedFloor.use || "-"}</span>
            <span>{isKo ? "구조" : "Structure"}</span>
            <span className="font-medium text-foreground">{selectedFloor.structure || "-"}</span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute right-3 bottom-28 z-10 text-[10px] text-muted-foreground/60">
        {isKo ? "클릭: 층 선택 · 드래그: 회전 · 스크롤: 줌" : "Click: select floor · Drag: rotate · Scroll: zoom"}
      </div>

      {/* Twin-stage data-product overlay — release rail, prediction readout,
          feature vector. Only for single-building mode. */}
      {!campusData && (
        <ErrorBoundary>
          <TwinStageOverlay
            title={title}
            footprintGeometry={portfolioFootprint}
          />
        </ErrorBoundary>
      )}

      <LayerPanel
        visible={layerPanelOpen}
        onClose={() => setLayerPanelOpen(false)}
      />

      <ModelUploader
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onFileLoaded={handleFileLoaded}
      />
      </div>
    </div>
  );
}
