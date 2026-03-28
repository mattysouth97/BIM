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
import { applyOverrides } from "@/lib/procedural/recipe";
import { useBuildingFootprint } from "@/hooks/use-building-footprint";
import { ProceduralBuildingModel } from "./procedural-building-model";
import { BuildingLayers } from "./building-layers";
import { SceneControls, type SceneControlsRef } from "./scene-controls";
import { ViewerOverlay } from "./viewer-overlay";
import { ConfigPanel } from "./config-panel";
import { LayerPanel } from "./layer-panel";
import { ModelUploader } from "./model-uploader";
import { useAuthoringStore } from "@/store/authoring-store";
import { useComponentStore } from "@/store/component-store";
import { ElementSelector } from "./element-selector";
import { TransformGizmo } from "./transform-gizmo";
import { PropertiesPanel } from "./properties-panel";
import { ComponentPalette } from "./component-palette";
import { PlacedComponents } from "./placed-components";
import { AnnotationTools } from "./annotation-tools";
import { EnergyCards } from "./energy-cards";
import { ErrorBoundary, ViewerErrorBoundary } from "@/components/error-boundary";
import { PlanView } from "./plan-view";
import { PlanGrid } from "./plan-grid";
import { WallDrawer } from "./wall-drawer";

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
    scene.background = new THREE.Color(0xf5f5f5);
  }, [scene]);

  // Load HDR for environment reflections only (not background)
  const envMap = useEnvironment({ files: "/hdr/studio.hdr" });

  useEffect(() => {
    if (envMap) {
      const pmrem = new THREE.PMREMGenerator(gl);
      const processed = pmrem.fromEquirectangular(envMap);
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
    saoPass.params.saoBias = 0.5;
    saoPass.params.saoIntensity = 0.015;
    saoPass.params.saoScale = 5;
    saoPass.params.saoKernelRadius = 50;
    saoPass.params.saoMinResolution = 0;
    saoPass.params.saoBlur = true;
    saoPass.params.saoBlurRadius = 8;
    saoPass.params.saoBlurStdDev = 4;
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

/** Apply an edit value (from undo/redo) to a scene object — called outside R3F context */
function applyEditValue(_elementId: string, _property: string, _value: unknown) {
  // Undo/redo of transform operations is handled by the store;
  // scene-level application happens through React re-render of TransformGizmo.
  // Direct scene mutation for positional undo would require a scene ref,
  // which is handled in-canvas by the TransformGizmo and PropertiesPanel components.
}

interface BuildingSceneProps {
  title: BrTitleInfo;
  floors: BrFloorInfo[];
}

export function BuildingScene({ title, floors }: BuildingSceneProps) {
  const [selectedFloor, setSelectedFloor] = useState<FloorGeometry | null>(null);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [modelSource, setModelSource] = useState<ModelSource>("parametric");
  const [uploadedModel, setUploadedModel] = useState<{
    buffer: ArrayBuffer;
    fileName: string;
    fileType: "ifc" | "gltf" | "glb";
  } | null>(null);
  const controlsRef = useRef<SceneControlsRef>(null);

  const buildingPk = String(title.mgmBldrgstPk || "unknown");

  const address = title.platPlcNm || title.newPlatPlc || "";
  const { data: footprintData } = useBuildingFootprint(address);
  const footprintPolygon = footprintData?.polygon ?? undefined;

  const geometry = useMemo(() => {
    const geo = generateBuildingGeometry(title, floors);
    if (footprintPolygon && footprintPolygon.length >= 3) {
      geo.footprintPolygon = footprintPolygon as [number, number][];
      const xs = footprintPolygon.map(p => p[0]);
      const zs = footprintPolygon.map(p => p[1]);
      geo.footprintWidth = Math.max(...xs) - Math.min(...xs);
      geo.footprintDepth = Math.max(...zs) - Math.min(...zs);
    }
    return geo;
  }, [title, floors, footprintPolygon]);

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
      }
    });
  }, [buildingPk]);

  const handleFileLoaded = useCallback(
    async (buffer: ArrayBuffer, fileName: string, fileType: "ifc" | "gltf" | "glb") => {
      setUploadedModel({ buffer, fileName, fileType });
      setModelSource("uploaded");
      await saveModel(buildingPk, buffer, fileName, fileType);
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

  // Authoring mode: undo/redo keyboard shortcuts
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);
  const undoAction = useAuthoringStore((s) => s.undo);
  const redoAction = useAuthoringStore((s) => s.redo);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isAuthoring) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Ctrl+Z = undo, Ctrl+Shift+Z = redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const edit = undoAction();
        if (edit) {
          // Apply oldValue to the scene object
          applyEditValue(edit.elementId, edit.property, edit.oldValue);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const edit = redoAction();
        if (edit) {
          applyEditValue(edit.elementId, edit.property, edit.newValue);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthoring, undoAction, redoAction]);

  const cameraDistance = Math.max(geometry.totalHeight, geometry.footprintWidth, geometry.footprintDepth) * 1.8;

  const handleViewChange = (view: "front" | "side" | "top" | "iso") => {
    controlsRef.current?.setView(view);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ViewerErrorBoundary>
      <Canvas
        camera={{
          position: [cameraDistance * 0.7, geometry.totalHeight * 0.6 + cameraDistance * 0.3, cameraDistance * 0.7],
          fov: 35,
          near: 0.1,
          far: cameraDistance * 10,
        }}
        gl={{
          antialias: true,
          outputColorSpace: THREE.SRGBColorSpace,
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

          {/* Model rendering */}
          {modelSource === "parametric" && (
            <>
              <ProceduralBuildingModel geometry={geometry} recipeOverride={recipe} onFloorSelect={setSelectedFloor} />
              <BuildingLayers recipe={recipe} />
            </>
          )}
          {modelSource === "uploaded" && uploadedModel && (
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
            targetHeight={geometry.totalHeight}
            distance={cameraDistance}
          />

          {/* Authoring components — only rendered in edit mode */}
          {isAuthoring && modelSource === "parametric" && (
            <>
              <ElementSelector />
              <TransformGizmo />
              <PlacedComponents buildingPk={buildingPk} recipe={recipe} />
              <AnnotationTools recipe={recipe} />
            </>
          )}

          {/* Plan view: camera, grid, wall drawing */}
          <PlanView
            buildingHeight={geometry.totalHeight}
            buildingWidth={geometry.footprintWidth}
            buildingDepth={geometry.footprintDepth}
          />
          <PlanGrid />
          <WallDrawer />

          {/* SAO ambient occlusion post-processing */}
          <SAOPostProcessing />
        </Suspense>
      </Canvas>
      </ViewerErrorBoundary>

      <ViewerOverlay
        selectedFloor={modelSource === "parametric" ? selectedFloor : null}
        buildingName={geometry.buildingName}
        era={geometry.era}
        onViewChange={handleViewChange}
        onToggleConfigPanel={() => setConfigPanelOpen(!configPanelOpen)}
        configPanelOpen={configPanelOpen}
        onToggleLayerPanel={() => setLayerPanelOpen(!layerPanelOpen)}
        layerPanelOpen={layerPanelOpen}
        modelSource={modelSource}
        hasUploadedModel={!!uploadedModel}
        onToggleModelSource={handleToggleModelSource}
        onUploadClick={() => setUploadDialogOpen(true)}
      />

      {/* Energy metric cards — bottom-left, visible when building loaded */}
      {modelSource === "parametric" && (
        <ErrorBoundary>
          <EnergyCards buildingPk={buildingPk} />
        </ErrorBoundary>
      )}

      <ErrorBoundary>
        <ConfigPanel
          buildingPk={buildingPk}
          visible={configPanelOpen}
          onClose={() => setConfigPanelOpen(false)}
        />
      </ErrorBoundary>

      <LayerPanel
        visible={layerPanelOpen}
        onClose={() => setLayerPanelOpen(false)}
      />

      {/* Properties panel for selected authoring element */}
      {isAuthoring && (
        <ErrorBoundary>
          <PropertiesPanel />
        </ErrorBoundary>
      )}

      <ErrorBoundary>
        <ComponentPalette />
      </ErrorBoundary>

      <ModelUploader
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onFileLoaded={handleFileLoaded}
      />
    </div>
  );
}
