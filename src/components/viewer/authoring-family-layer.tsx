"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { planAuthoringInstances } from "@/lib/bim/authoring-placements";
import { AUTHORING_ASSET_MANIFEST } from "@/lib/bim/authoring-asset-manifest";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";

for (const entry of Object.values(AUTHORING_ASSET_MANIFEST)) {
  if (entry?.uri) useGLTF.preload(entry.uri);
}

function FamilyInstance({
  url,
  position,
  scale,
  rotation,
}: {
  url: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
}) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [clone]);

  return (
    <primitive
      object={clone}
      position={position}
      scale={scale}
      rotation={rotation}
    />
  );
}

interface AuthoringFamilyLayerProps {
  recipe: BuildingRecipe;
}

export function AuthoringFamilyLayer({ recipe }: AuthoringFamilyLayerProps) {
  const workMode = useRevitWorkflowStore((s) => s.workMode);
  const selectedFamilyId = useRevitWorkflowStore((s) => s.selectedFamilyId);
  const poses = useMemo(
    () => planAuthoringInstances(recipe, selectedFamilyId),
    [recipe, selectedFamilyId]
  );

  if (workMode !== "authoring") return null;

  return (
    <group name="authoring-family-layer">
      {poses.map((pose) => (
        <FamilyInstance
          key={pose.id}
          url={pose.url}
          position={pose.position}
          scale={pose.scale}
          rotation={pose.rotation}
        />
      ))}
    </group>
  );
}
