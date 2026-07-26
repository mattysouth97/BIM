"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import type { BuildingGeometry, FloorGeometry } from "@/lib/building-geometry";
import { toRecipe } from "@/lib/building-geometry";
import { ProceduralBuilding } from "@/lib/procedural/procedural-building";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { GroundPlane } from "./ground-plane";
import { useLayerStore } from "@/store/layer-store";
import { InfoEdges } from "./info-edges";
import { useOutlineHover } from "@/hooks/use-outline-hover";
import { useEquipmentAssets } from "@/hooks/use-equipment-assets";
import { useScenarioStore } from "@/store/scenario-store";
import {
  deriveEquipmentScenario,
  equipmentScenarioKey,
} from "@/lib/layers/equipment-scenario";

interface ProceduralBuildingModelProps {
  geometry: BuildingGeometry;
  /** If provided, use this recipe instead of computing from geometry */
  recipeOverride?: BuildingRecipe;
  onFloorSelect?: (floor: FloorGeometry | null) => void;
  /** When true, suppresses the GroundPlane rendered beneath the building (for campus mode) */
  hideGroundPlane?: boolean;
}

/** Convert a FloorSpec back to a FloorGeometry for compatibility with existing UI */
function floorSpecToGeometry(spec: FloorSpec, geo: BuildingGeometry): FloorGeometry | null {
  return geo.floors.find(f => f.floorNo === spec.floorNo) ?? null;
}

/**
 * Collect informational meshes from a group for edge overlay rendering.
 * Criteria (skip InstancedMesh — EdgesGeometry degrades for instanced):
 *   - Plain THREE.Mesh only
 *   - userData.type === "slab" OR name starts with "facade" OR userData.informational === true
 */
function collectInformationalMeshes(group: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh) return;
    const ud = obj.userData;
    if (
      ud?.type === "slab" ||
      obj.name.startsWith("facade") ||
      ud?.informational === true
    ) {
      result.push(obj);
    }
  });
  return result;
}

export function ProceduralBuildingModel({ geometry, recipeOverride, onFloorSelect, hideGroundPlane }: ProceduralBuildingModelProps) {
  const builderRef = useRef<ProceduralBuilding | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const selectedRef = useRef<number | null>(null);
  const [group, setGroup] = useState<THREE.Group | null>(null);

  const baseRecipe = useMemo(() => toRecipe(geometry), [geometry]);
  const recipe = recipeOverride ?? baseRecipe;

  // Detailed Blender structural kit (columns, beams, mullions, panels, roof
  // furniture) — regenerate once the GLB cache is preloaded.
  const equipmentAssetsReady = useEquipmentAssets();

  // Green-retrofit envelope scenario: the knapsack-selected measures decide
  // WHICH facade hardware renders (baseline vs thermally-broken mullions,
  // plain vs externally-insulated spandrel panels). Measure-selection churn
  // (e.g. toggling a measure that maps to no hardware, like
  // envelope-roof-insulation) still produces a new selectedMeasureIds
  // identity, but deriveEquipmentScenario's OUTPUT is what actually matters
  // for regeneration. `equipmentScenario` below is stabilized on
  // equipmentScenarioKey (its stable semantic fingerprint) using React's
  // "adjust state during render" pattern, so it keeps the SAME object
  // reference — and the generate effect below does not re-run — whenever
  // the derived scenario is unchanged.
  const selectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  const derivedScenario = useMemo(
    () => deriveEquipmentScenario(selectedMeasureIds),
    [selectedMeasureIds]
  );
  const derivedScenarioKey = equipmentScenarioKey(derivedScenario);
  const [scenarioKey, setScenarioKey] = useState(derivedScenarioKey);
  const [equipmentScenario, setEquipmentScenario] = useState(derivedScenario);
  if (derivedScenarioKey !== scenarioKey) {
    setScenarioKey(derivedScenarioKey);
    setEquipmentScenario(derivedScenario);
  }

  // Generate building geometry — setGroup triggers re-render so <primitive> picks it up
  useEffect(() => {
    // Clean up previous
    if (groupRef.current && groupRef.current.parent) {
      groupRef.current.parent.remove(groupRef.current);
    }
    if (builderRef.current) {
      builderRef.current.dispose();
    }

    const builder = new ProceduralBuilding(recipe, equipmentScenario);
    const g = builder.generate();

    builderRef.current = builder;
    groupRef.current = g;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroup(g);

    return () => {
      builder.dispose();
      builderRef.current = null;
      groupRef.current = null;
      setGroup(null);
    };
  }, [recipe, equipmentAssetsReady, equipmentScenario]);

  // Sync Digital Twin layer visibility to named mesh groups.
  // Depends on `group` state so it re-runs after building generation completes.
  const layerVisibility = useLayerStore((s) => s.visibility);
  useEffect(() => {
    if (!group) return;

    group.traverse((child) => {
      const n = child.name;

      // Envelope layer: facade panels, glass, mullions, parapet, roof
      if (
        n === "facade" ||
        n.startsWith("facade-section-") ||
        n === "roof" ||
        n === "roof-furniture"
      ) {
        child.visible = layerVisibility["envelope"] ?? true;
      }

      // Structure layer: floor slabs, columns, and beams
      if (n === "slabs" || n === "columns" || n === "beams") {
        child.visible = layerVisibility["structure"] ?? true;
      }

      // MEP / energy-zones / retrofit-targets: no geometry yet — no-op
    });
  }, [group, layerVisibility]);

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

  // Collect informational meshes after group is generated
  const informationalMeshes = useMemo<THREE.Mesh[]>(() => {
    if (!group) return [];
    return collectInformationalMeshes(group);
  }, [group]);

  const { onPointerOver, onPointerOut } = useOutlineHover();

  return (
    <>
      {!hideGroundPlane && (
        <GroundPlane siteWidth={geometry.siteWidth} siteDepth={geometry.siteDepth} era={geometry.era} />
      )}
      {group && (
        <primitive
          object={group}
          onClick={handleClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        />
      )}
      {informationalMeshes.map((mesh, i) => (
        <InfoEdges key={i} mesh={mesh} />
      ))}
    </>
  );
}
