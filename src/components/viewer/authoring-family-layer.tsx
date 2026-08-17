"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { FamilyInstance } from "./family-instance";
import { planAuthoringInstances } from "@/lib/bim/authoring-placements";
import { AUTHORING_ASSET_MANIFEST } from "@/lib/bim/authoring-asset-manifest";
import { authoringFamilyUrl, getAuthoringFamily } from "@/lib/bim/family-catalog";
import { snapPoint } from "@/lib/bim/model";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useBimModelStore } from "@/store/bim-model-store";

for (const entry of Object.values(AUTHORING_ASSET_MANIFEST)) {
  if (entry?.uri) useGLTF.preload(entry.uri);
}

// `FamilyInstance` now lives in ./family-instance so the solved-interior layer
// places families through the same loader and the same GLTF cache.

interface AuthoringFamilyLayerProps {
  recipe: BuildingRecipe;
}

export function AuthoringFamilyLayer({ recipe }: AuthoringFamilyLayerProps) {
  const workMode = useRevitWorkflowStore((s) => s.workMode);
  const selectedFamilyId = useRevitWorkflowStore((s) => s.selectedFamilyId);
  const tool = useRevitWorkflowStore((s) => s.activeAuthoringTool);
  const sketchStart = useRevitWorkflowStore((s) => s.sketchStart);
  const setSketchStart = useRevitWorkflowStore((s) => s.setSketchStart);
  const snapshot = useBimModelStore((s) => s.snapshot);
  const activeLevelId = useBimModelStore((s) => s.activeLevelId);
  const applyPlace = useBimModelStore((s) => s.applyPlace);
  const applyWall = useBimModelStore((s) => s.applyWall);
  const applyFloorSketch = useBimModelStore((s) => s.applyFloorSketch);
  const applyHost = useBimModelStore((s) => s.applyHost);

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
        scale: [
          Number(el.instanceParameters.scaleX ?? 1),
          Number(el.instanceParameters.scaleY ?? 1),
          Number(el.instanceParameters.scaleZ ?? 1),
        ] as [number, number, number],
        rotation: [0, el.placement.rotationY, 0] as [number, number, number],
      }));
  }, [snapshot]);

  if (workMode !== "authoring") return null;

  const level =
    snapshot?.levels.find((l) => l.id === activeLevelId) ?? snapshot?.levels[0];
  const family = getAuthoringFamily(selectedFamilyId);
  const linear = family?.placement === "linear" || tool === "wall" || tool === "beam";
  const sketch = family?.placement?.startsWith("sketch") || tool === "floor" || tool === "roof" || tool === "ceiling";
  const hosted = family?.host === "wall" || tool === "door" || tool === "window";

  const snapped = (e: ThreeEvent<MouseEvent>) => {
    const raw = { x: e.point.x, z: e.point.z };
    return snapPoint(raw, {
      grids: snapshot?.grids,
      walls: snapshot?.elements,
      spacing: Math.max(recipe.column.spacing / 2, 0.5),
      orthoFrom: sketchStart,
    }).point;
  };

  const onPlace = (e: ThreeEvent<MouseEvent>) => {
    if (!selectedFamilyId || !snapshot || !family) return;
    e.stopPropagation();
    const pt = snapped(e);
    const y = level?.elevation ?? 0;

    if (linear || sketch) {
      if (!sketchStart) {
        setSketchStart(pt);
        return;
      }
      if (sketch) {
        applyFloorSketch({
          typeId: selectedFamilyId,
          buildingPk: snapshot.buildingPk,
          levelId: level?.id ?? null,
          a: sketchStart,
          b: pt,
        });
      } else {
        applyWall({
          typeId: selectedFamilyId,
          buildingPk: snapshot.buildingPk,
          levelId: level?.id ?? null,
          start: sketchStart,
          end: pt,
          heightM: level?.height ?? 3,
        });
      }
      setSketchStart(null);
      return;
    }

    if (hosted) {
      applyHost({
        typeId: selectedFamilyId,
        buildingPk: snapshot.buildingPk,
        levelId: level?.id ?? null,
        point: pt,
        y,
      });
      return;
    }

    applyPlace({
      typeId: selectedFamilyId,
      buildingPk: snapshot.buildingPk,
      levelId: level?.id ?? null,
      hostId: null,
      placement: { x: pt.x, y, z: pt.z, rotationY: 0 },
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
      {family && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, (level?.elevation ?? 0) + 0.02, 0]}
          onClick={onPlace}
        >
          <planeGeometry args={[recipe.footprintWidth * 3, recipe.footprintDepth * 3]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {sketchStart && (
        <mesh position={[sketchStart.x, (level?.elevation ?? 0) + 0.05, sketchStart.z]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial color="#2563eb" />
        </mesh>
      )}
    </group>
  );
}
