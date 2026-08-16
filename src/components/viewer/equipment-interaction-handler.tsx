"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useLayerStore } from "@/store/layer-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import {
  useSelectionStore,
  type SelectedEquipmentInfo,
} from "@/store/selection-store";
import { useOutlineStore } from "@/store/outline-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { inferEquipmentSpecs } from "@/lib/energy/equipment-specs";
import {
  MEP_SUB_CONFIGS,
  MEP_SUB_IDS,
  type MepSubLayerId,
} from "@/lib/layers/types";
import { useT } from "@/lib/i18n";

/**
 * Precise MEP hover + selection. Instanced equipment is mirrored to invisible
 * single-instance proxy meshes so post-processing outlines only the unit under
 * the pointer instead of the complete instanced set.
 */
export function EquipmentInteractionHandler() {
  const { scene, camera, gl } = useThree();
  const { t } = useT();
  const mepVisible = useLayerStore((s) => s.visibility.mep);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const buildingPk = useActiveBuildingPk();
  const recipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const selectedEquipment = useSelectionStore((s) => s.selectedEquipment);
  const setHoveredOutline = useOutlineStore((s) => s.setHovered);
  const clearHoveredOutline = useOutlineStore((s) => s.clearHovered);
  const setSelectedOutline = useOutlineStore((s) => s.setSelected);

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const instanceMatrix = useRef(new THREE.Matrix4());
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const pointerInside = useRef(false);
  const frameCount = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outlineResources = useRef<OutlineResources | null>(null);
  const selectedSource = useRef<THREE.Object3D | null>(null);
  const [hovered, setHovered] = useState<HoveredEquipment | null>(null);

  useEffect(() => {
    const resources = createOutlineResources();
    outlineResources.current = resources;
    scene.add(resources.hoverProxy, resources.selectedProxy);
    return () => {
      scene.remove(resources.hoverProxy, resources.selectedProxy);
      resources.hoverProxy.visible = false;
      resources.selectedProxy.visible = false;
      selectedSource.current = null;
      useOutlineStore.getState().clearHovered("equipment");
      useOutlineStore.getState().setSelected([]);
      resources.emptyGeometry.dispose();
      resources.proxyMaterial.dispose();
      outlineResources.current = null;
    };
  }, [scene]);

  const collectTargets = useCallback((): THREE.Object3D[] => {
    if (!mepVisible) return [];
    const targets: THREE.Object3D[] = [];
    for (const subId of MEP_SUB_IDS) {
      if (!mepSubVisibility[subId]) continue;
      const subGroup = scene.getObjectByName(`sub-${subId}`);
      if (!subGroup || !subGroup.visible) continue;
      subGroup.traverse((object) => {
        if ((object as THREE.Mesh).isMesh && object.visible) {
          targets.push(object);
        }
      });
    }
    return targets;
  }, [mepSubVisibility, mepVisible, scene]);

  const castAtPointer = useCallback((): THREE.Intersection | null => {
    const targets = collectTargets();
    if (targets.length === 0) return null;
    const targetSet = new Set(targets);
    raycaster.current.setFromCamera(mouse.current, camera);
    const hits = raycaster.current.intersectObjects(scene.children, true);

    // Resolve the first visible surface in the whole scene, not merely the
    // first MEP object. This prevents equipment behind a solid façade, slab,
    // or another unit from claiming hover/click.
    for (const hit of hits) {
      if (targetSet.has(hit.object)) return hit;
      if (isOccludingSurface(hit.object)) return null;
    }
    return null;
  }, [camera, collectTargets, scene.children]);

  const clearHover = useCallback(() => {
    const resources = outlineResources.current;
    if (resources) resources.hoverProxy.visible = false;
    clearHoveredOutline("equipment");
    setHovered(null);
    if (canvasRef.current) canvasRef.current.style.cursor = "";
  }, [clearHoveredOutline]);

  const setEquipmentHovered = useCallback(
    (objects: THREE.Object3D[]) => setHoveredOutline(objects, "equipment"),
    [setHoveredOutline]
  );

  const applyOutline = useCallback(
    (
      proxyKind: "hover" | "selected",
      object: THREE.Object3D,
      instanceId: number | undefined,
      apply: (objects: THREE.Object3D[]) => void
    ) => {
      const resources = outlineResources.current;
      if (!resources) return;
      const proxy =
        proxyKind === "hover" ? resources.hoverProxy : resources.selectedProxy;
      if (object instanceof THREE.InstancedMesh && instanceId !== undefined) {
        object.getMatrixAt(instanceId, instanceMatrix.current);
        proxy.geometry = object.geometry;
        proxy.matrix.multiplyMatrices(object.matrixWorld, instanceMatrix.current);
        proxy.matrixWorld.copy(proxy.matrix);
        proxy.visible = true;
        apply([proxy]);
        return;
      }
      proxy.visible = false;
      apply([object]);
    },
    []
  );

  const describeHit = useCallback(
    (hit: THREE.Intersection): HitDescription | null => {
      const subLayerId = findMepSubLayer(hit.object);
      if (!subLayerId || !recipe) return null;

      const userData = hit.object.userData ?? {};
      const componentType = String(userData.type ?? "equipment");
      const aboveFloors = recipe.floors.filter((floor) => floor.type === "above");
      return {
        key: `${hit.object.uuid}:${hit.instanceId ?? "mesh"}`,
        object: hit.object,
        instanceId: hit.instanceId,
        subLayerId,
        componentType,
        floorNo: resolveFloorNo(
          hit.object,
          hit.instanceId,
          aboveFloors
        ),
        specs: inferEquipmentSpecs(userData, recipe),
      };
    },
    [recipe]
  );

  useEffect(() => {
    const canvas = gl.domElement;
    canvasRef.current = canvas;
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerInside.current = true;
      mouse.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
    };
    const onPointerLeave = () => {
      pointerInside.current = false;
      clearHover();
    };

    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvasRef.current = null;
    };
  }, [clearHover, gl.domElement]);

  useFrame(() => {
    if (
      selectedSource.current &&
      !belongsToScene(selectedSource.current, scene)
    ) {
      selectedSource.current = null;
      const resources = outlineResources.current;
      if (resources) resources.selectedProxy.visible = false;
      setSelectedOutline([]);
      useSelectionStore.getState().clearEquipment();
    }

    frameCount.current = (frameCount.current + 1) % 3;
    if (frameCount.current !== 0 || !pointerInside.current || !recipe) return;

    const hit = castAtPointer();
    const description = hit ? describeHit(hit) : null;
    if (!hit || !description) {
      if (hovered) clearHover();
      return;
    }

    applyOutline(
      "hover",
      description.object,
      description.instanceId,
      setEquipmentHovered
    );
    if (canvasRef.current) canvasRef.current.style.cursor = "pointer";

    const position = hit.point.clone();
    position.y += 0.28;
    setHovered((current) => {
      if (
        current?.key === description.key &&
        current.position.distanceToSquared(position) < 0.04
      ) {
        return current;
      }
      return {
        key: description.key,
        position,
        subLayerId: description.subLayerId,
        componentType: description.componentType,
        floorNo: description.floorNo,
        categoryKo: description.specs.categoryKo,
        categoryEn: description.specs.categoryEn,
      };
    });
  });

  useEffect(() => {
    if (!recipe) return;
    const canvas = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      pointerDown.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      const down = pointerDown.current;
      pointerDown.current = null;
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      mouse.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const hit = castAtPointer();
      const description = hit ? describeHit(hit) : null;

      if (!description) {
        useSelectionStore.getState().clearEquipment();
        selectedSource.current = null;
        const resources = outlineResources.current;
        if (resources) resources.selectedProxy.visible = false;
        setSelectedOutline([]);
        return;
      }

      const info: SelectedEquipmentInfo = {
        equipmentId: `${description.subLayerId}-${description.componentType}${
          description.floorNo !== null ? `-floor-${description.floorNo}` : ""
        }-${description.instanceId ?? "mesh"}`,
        subLayerId: description.subLayerId,
        componentType: description.componentType,
        floorNo: description.floorNo,
        specs: description.specs,
      };
      useSelectionStore.getState().selectEquipment(info);
      useWorkspaceStore.getState().setRightDockOpen(true);
      selectedSource.current = description.object;
      applyOutline(
        "selected",
        description.object,
        description.instanceId,
        setSelectedOutline
      );
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [
    applyOutline,
    castAtPointer,
    describeHit,
    gl.domElement,
    recipe,
    setSelectedOutline,
  ]);

  useEffect(() => {
    if (
      selectedEquipment &&
      mepVisible &&
      mepSubVisibility[selectedEquipment.subLayerId]
    ) {
      return;
    }
    selectedSource.current = null;
    const resources = outlineResources.current;
    if (resources) resources.selectedProxy.visible = false;
    setSelectedOutline([]);
  }, [
    mepSubVisibility,
    mepVisible,
    selectedEquipment,
    setSelectedOutline,
  ]);

  if (!hovered) return null;
  const subConfig = MEP_SUB_CONFIGS[hovered.subLayerId];

  return (
    <Html
      position={hovered.position}
      zIndexRange={[40, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div className="relative ml-4 -translate-y-1/2">
        <div className="absolute -left-4 top-1/2 h-px w-4 bg-orange-400/80" />
        <div className="absolute -left-[18px] top-1/2 size-2 -translate-y-1/2 rounded-full border border-orange-200 bg-orange-500 shadow-[0_0_14px_rgba(251,146,60,0.9)]" />
        <div className="w-56 overflow-hidden rounded-xl border border-orange-400/55 bg-zinc-950/94 text-zinc-50 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <div className="h-0.5 bg-gradient-to-r from-orange-500 via-amber-300 to-transparent" />
          <div className="p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.9)]" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                {t(subConfig.nameKo, subConfig.name)}
              </span>
            </div>
            <p className="text-sm font-semibold leading-tight">
              {t(hovered.categoryKo, hovered.categoryEn)}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-2 text-[10px]">
              <span className="truncate font-mono text-zinc-400">
                {humanizeComponentType(hovered.componentType)}
              </span>
              <span className="shrink-0 text-zinc-300">
                {hovered.floorNo !== null
                  ? `${hovered.floorNo}F`
                  : t("설비", "Equipment")}
              </span>
            </div>
            <p className="mt-2 text-[10px] text-zinc-400">
              {t("클릭하여 성능 정보 보기", "Click to inspect performance")}
            </p>
          </div>
        </div>
      </div>
    </Html>
  );
}

interface HitDescription {
  key: string;
  object: THREE.Object3D;
  instanceId?: number;
  subLayerId: MepSubLayerId;
  componentType: string;
  floorNo: number | null;
  specs: ReturnType<typeof inferEquipmentSpecs>;
}

interface HoveredEquipment {
  key: string;
  position: THREE.Vector3;
  subLayerId: MepSubLayerId;
  componentType: string;
  floorNo: number | null;
  categoryKo: string;
  categoryEn: string;
}

interface OutlineResources {
  emptyGeometry: THREE.BufferGeometry;
  proxyMaterial: THREE.MeshBasicMaterial;
  hoverProxy: THREE.Mesh;
  selectedProxy: THREE.Mesh;
}

function createOutlineResources(): OutlineResources {
  const emptyGeometry = new THREE.BufferGeometry();
  const proxyMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  return {
    emptyGeometry,
    proxyMaterial,
    hoverProxy: createOutlineProxy(
      "mep-hover-instance-proxy",
      emptyGeometry,
      proxyMaterial
    ),
    selectedProxy: createOutlineProxy(
      "mep-selected-instance-proxy",
      emptyGeometry,
      proxyMaterial
    ),
  };
}

function createOutlineProxy(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

function findMepSubLayer(object: THREE.Object3D): MepSubLayerId | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.name.startsWith("sub-mep-")) {
      return current.name.slice("sub-".length) as MepSubLayerId;
    }
    current = current.parent;
  }
  return null;
}

function belongsToScene(
  object: THREE.Object3D,
  scene: THREE.Scene
): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === scene) return true;
    current = current.parent;
  }
  return false;
}

function isOccludingSurface(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.Mesh) || !isEffectivelyVisible(object)) {
    return false;
  }
  if (object.name.endsWith("-instance-proxy")) return false;

  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.some(
    (material) =>
      material.visible &&
      material.colorWrite &&
      !(
        material.transparent &&
        (material.opacity < 0.35 || !material.depthWrite)
      )
  );
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function resolveFloorNo(
  object: THREE.Object3D,
  instanceId: number | undefined,
  aboveFloors: Array<{ floorNo: number }>
): number | null {
  if (typeof object.userData.floorNo === "number") return object.userData.floorNo;
  if (instanceId === undefined || aboveFloors.length === 0) return null;

  const instancesPerFloor = Number(object.userData.instancesPerFloor);
  if (Number.isFinite(instancesPerFloor) && instancesPerFloor > 0) {
    return (
      aboveFloors[
        Math.min(
          Math.floor(instanceId / instancesPerFloor),
          aboveFloors.length - 1
        )
      ]?.floorNo ?? null
    );
  }
  return null;
}

function humanizeComponentType(value: string): string {
  return value
    .replace(/^(cooling|heating|vent|dhw|lighting)-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
