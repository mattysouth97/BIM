"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { planAuthoringInstances } from "@/lib/bim/authoring-placements";
import { AUTHORING_ASSET_MANIFEST } from "@/lib/bim/authoring-asset-manifest";
import { authoringFamilyUrl, getAuthoringFamily } from "@/lib/bim/family-catalog";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useBimModelStore } from "@/store/bim-model-store";

for (const entry of Object.values(AUTHORING_ASSET_MANIFEST)) {
  if (entry?.uri) useGLTF.preload(entry.uri);
}

function FamilyInstance({
  url,
  position,
  scale,
  rotation,
  instanceId,
}: {
  url: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  instanceId?: string;
}) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  const selectElement = useBimModelStore((s) => s.selectElement);

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
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!instanceId) return;
        e.stopPropagation();
        selectElement(instanceId);
      }}
    />
  );
}

interface AuthoringFamilyLayerProps {
  recipe: BuildingRecipe;
}

export function AuthoringFamilyLayer({ recipe }: AuthoringFamilyLayerProps) {
  const workMode = useRevitWorkflowStore((s) => s.workMode);
  const selectedFamilyId = useRevitWorkflowStore((s) => s.selectedFamilyId);
  const tool = useRevitWorkflowStore((s) => s.activeAuthoringTool);
  const snapshot = useBimModelStore((s) => s.snapshot);
  const activeLevelId = useBimModelStore((s) => s.activeLevelId);
  const applyPlace = useBimModelStore((s) => s.applyPlace);

  const generatedPoses = useMemo(
    () => planAuthoringInstances(recipe, selectedFamilyId),
    [recipe, selectedFamilyId],
  );

  const authoredPoses = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.elements
      .filter((el) => el.origin === "authored" && el.visible)
      .map((el) => ({
        id: el.id,
        url: authoringFamilyUrl(el.typeId),
        position: [el.placement.x, el.placement.y, el.placement.z] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        rotation: [0, el.placement.rotationY, 0] as [number, number, number],
      }));
  }, [snapshot]);

  if (workMode !== "authoring") return null;

  const level =
    snapshot?.levels.find((l) => l.id === activeLevelId) ?? snapshot?.levels[0];
  const family = getAuthoringFamily(selectedFamilyId);
  const canPlace = Boolean(family && tool && tool !== "wall");

  const onPlace = (e: ThreeEvent<MouseEvent>) => {
    if (!canPlace || !selectedFamilyId || !snapshot) return;
    e.stopPropagation();
    const host =
      snapshot.elements.find(
        (el) => el.kind === "wall" && el.levelId === (level?.id ?? null),
      )?.id ?? null;
    applyPlace({
      typeId: selectedFamilyId,
      buildingPk: snapshot.buildingPk,
      levelId: level?.id ?? null,
      hostId: family?.host === "wall" ? host : null,
      placement: {
        x: e.point.x,
        y: level?.elevation ?? 0,
        z: e.point.z,
        rotationY: 0,
      },
    });
  };

  return (
    <group name="authoring-family-layer">
      {generatedPoses.map((pose) => (
        <FamilyInstance
          key={pose.id}
          url={pose.url}
          position={pose.position}
          scale={pose.scale}
          rotation={pose.rotation}
        />
      ))}
      {authoredPoses.map((pose) => (
        <FamilyInstance
          key={pose.id}
          url={pose.url}
          position={pose.position}
          scale={pose.scale}
          rotation={pose.rotation}
          instanceId={pose.id}
        />
      ))}
      {canPlace && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, (level?.elevation ?? 0) + 0.02, 0]}
          onClick={onPlace}
        >
          <planeGeometry args={[recipe.footprintWidth * 2, recipe.footprintDepth * 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
