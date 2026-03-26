"use client";

import { useState, useRef, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { useEnvironment, ContactShadows } from "@react-three/drei";
import { EffectComposer, SSAO, Bloom, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import type { BrTitleInfo, BrFloorInfo } from "@/lib/types";
import { generateBuildingGeometry, type FloorGeometry } from "@/lib/building-geometry";
import { inferMaterialProperties } from "@/lib/material-inference";
import { saveModel, loadModel } from "@/lib/model-storage";
import { useMaterialStore } from "@/store/material-store";
import { useBuildingFootprint } from "@/hooks/use-building-footprint";
import { BuildingModel } from "./building-model";
import { SceneControls, type SceneControlsRef } from "./scene-controls";
import { ViewerOverlay } from "./viewer-overlay";
import { MaterialPanel } from "./material-panel";
import { ModelUploader } from "./model-uploader";

const IFCModel = lazy(() =>
  import("./ifc-loader").then((m) => ({ default: m.IFCModel }))
);
const GLTFModel = lazy(() =>
  import("./gltf-loader").then((m) => ({ default: m.GLTFModel }))
);

type ModelSource = "parametric" | "uploaded";

/**
 * HDR Environment setup — loads real HDR for image-based lighting.
 * This provides physically accurate reflections and global illumination.
 */
function SceneEnvironment() {
  const { scene, gl } = useThree();

  // Try loading HDR, fall back to preset
  const envMap = useEnvironment({ files: "/hdr/sky.hdr" });

  useEffect(() => {
    if (envMap) {
      const pmrem = new THREE.PMREMGenerator(gl);
      const processed = pmrem.fromEquirectangular(envMap);
      scene.environment = processed.texture;
      scene.backgroundBlurriness = 0.8;
      scene.backgroundIntensity = 0.3;
      pmrem.dispose();
    }
  }, [envMap, scene, gl]);

  return null;
}

interface BuildingSceneProps {
  title: BrTitleInfo;
  floors: BrFloorInfo[];
}

export function BuildingScene({ title, floors }: BuildingSceneProps) {
  const [selectedFloor, setSelectedFloor] = useState<FloorGeometry | null>(null);
  const [materialPanelOpen, setMaterialPanelOpen] = useState(false);
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

  const cameraDistance = Math.max(geometry.totalHeight, geometry.footprintWidth, geometry.footprintDepth) * 1.8;

  const handleViewChange = (view: "front" | "side" | "top" | "iso") => {
    controlsRef.current?.setView(view);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        camera={{
          position: [cameraDistance * 0.7, geometry.totalHeight * 0.6 + cameraDistance * 0.3, cameraDistance * 0.7],
          fov: 35,
          near: 0.1,
          far: cameraDistance * 10,
        }}
        shadows="soft"
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {/* HDR Environment — image-based lighting for realistic reflections */}
          <SceneEnvironment />

          {/* Key light — warm sun from top-right */}
          <directionalLight
            position={[40, 60, 30]}
            intensity={2.5}
            color="#fff5e6"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={200}
            shadow-camera-left={-60}
            shadow-camera-right={60}
            shadow-camera-top={60}
            shadow-camera-bottom={-60}
            shadow-bias={-0.0001}
            shadow-normalBias={0.02}
          />

          {/* Fill light — cool blue from opposite side */}
          <directionalLight
            position={[-20, 30, -20]}
            intensity={0.8}
            color="#cce0ff"
          />

          {/* Rim light — subtle back light for edge definition */}
          <directionalLight
            position={[-10, 20, 40]}
            intensity={0.4}
            color="#ffffff"
          />

          {/* Ambient — very subtle base illumination */}
          <ambientLight intensity={0.15} color="#e8e0d8" />

          {/* Contact shadows for grounding */}
          <ContactShadows
            position={[0, -0.01, 0]}
            opacity={0.6}
            scale={Math.max(geometry.siteWidth, geometry.siteDepth, 50) * 2}
            blur={2.5}
            far={geometry.totalHeight * 2}
            color="#1a1a2e"
          />

          {/* Model rendering */}
          {modelSource === "parametric" && (
            <BuildingModel geometry={geometry} onFloorSelect={setSelectedFloor} />
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

          {/* Post-processing pipeline */}
          <EffectComposer enableNormalPass>
            <SSAO
              blendFunction={BlendFunction.MULTIPLY}
              samples={21}
              radius={7}
              intensity={25}
              luminanceInfluence={0.6}
              bias={0.035}
            />
            <Bloom
              intensity={0.12}
              luminanceThreshold={0.85}
              luminanceSmoothing={0.95}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.15} darkness={0.4} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      <ViewerOverlay
        selectedFloor={modelSource === "parametric" ? selectedFloor : null}
        buildingName={geometry.buildingName}
        era={geometry.era}
        onViewChange={handleViewChange}
        onToggleMaterialPanel={() => setMaterialPanelOpen(!materialPanelOpen)}
        materialPanelOpen={materialPanelOpen}
        modelSource={modelSource}
        hasUploadedModel={!!uploadedModel}
        onToggleModelSource={handleToggleModelSource}
        onUploadClick={() => setUploadDialogOpen(true)}
      />

      <MaterialPanel
        buildingPk={buildingPk}
        visible={materialPanelOpen}
        onClose={() => setMaterialPanelOpen(false)}
      />

      <ModelUploader
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onFileLoaded={handleFileLoaded}
      />
    </div>
  );
}
