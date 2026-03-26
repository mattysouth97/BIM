"use client";

import { useMemo, useEffect, useRef, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { BuildingGeometry, FloorGeometry } from "@/lib/building-geometry";
import { toRecipe } from "@/lib/building-geometry";
import { ProceduralBuilding } from "@/lib/procedural/procedural-building";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { GroundPlane } from "./ground-plane";

interface ProceduralBuildingModelProps {
  geometry: BuildingGeometry;
  /** If provided, use this recipe instead of computing from geometry */
  recipeOverride?: BuildingRecipe;
  onFloorSelect?: (floor: FloorGeometry | null) => void;
}

/** Convert a FloorSpec back to a FloorGeometry for compatibility with existing UI */
function floorSpecToGeometry(spec: FloorSpec, geo: BuildingGeometry): FloorGeometry | null {
  return geo.floors.find(f => f.floorNo === spec.floorNo) ?? null;
}

export function ProceduralBuildingModel({ geometry, recipeOverride, onFloorSelect }: ProceduralBuildingModelProps) {
  const { scene } = useThree();
  const builderRef = useRef<ProceduralBuilding | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const selectedRef = useRef<number | null>(null);

  const baseRecipe = useMemo(() => toRecipe(geometry), [geometry]);
  const recipe = recipeOverride ?? baseRecipe;

  // Generate building geometry
  useEffect(() => {
    // Clean up previous
    if (groupRef.current && groupRef.current.parent) {
      groupRef.current.parent.remove(groupRef.current);
    }
    if (builderRef.current) {
      builderRef.current.dispose();
    }

    const builder = new ProceduralBuilding(recipe);
    const group = builder.generate();

    builderRef.current = builder;
    groupRef.current = group;

    // Add to the parent group (scene will pick this up via the primitive)
    return () => {
      builder.dispose();
      builderRef.current = null;
      groupRef.current = null;
    };
  }, [recipe]);

  // Floor selection via raycaster on slab instances
  const handleClick = useCallback((event: THREE.Event & { instanceId?: number; object?: THREE.Object3D }) => {
    if (!builderRef.current) return;
    if (!event.object || !('instanceId' in event)) return;

    const obj = event.object as THREE.InstancedMesh;
    if (obj.userData?.type !== "slab") return;

    const instanceId = event.instanceId as number;
    const floorSpec = builderRef.current.getFloorFromInstanceId(instanceId);
    if (!floorSpec) return;

    const newSelection = selectedRef.current === floorSpec.floorNo ? null : floorSpec.floorNo;
    selectedRef.current = newSelection;

    if (onFloorSelect) {
      if (newSelection !== null) {
        onFloorSelect(floorSpecToGeometry(floorSpec, geometry));
      } else {
        onFloorSelect(null);
      }
    }
  }, [geometry, onFloorSelect]);

  const group = useMemo(() => {
    if (!builderRef.current) return null;
    return builderRef.current.getGroup();
  }, [recipe]);

  return (
    <>
      <GroundPlane siteWidth={geometry.siteWidth} siteDepth={geometry.siteDepth} era={geometry.era} />
      {group && (
        <primitive object={group} onClick={handleClick} />
      )}
    </>
  );
}
