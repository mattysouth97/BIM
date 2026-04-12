"use client";

import { useRef, useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useLayerStore } from "@/store/layer-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useSelectionStore, type SelectedEquipmentInfo } from "@/store/selection-store";
import { inferEquipmentSpecs } from "@/lib/energy/equipment-specs";
import { MEP_SUB_IDS, type MepSubLayerId } from "@/lib/layers/types";

/**
 * EquipmentClickHandler — click-to-inspect handler for MEP sub-layer objects.
 *
 * Allocates Raycaster ONCE via useRef (fixes structural-tooltip.tsx per-frame
 * allocation defect at line 83). Listens to pointerdown+pointerup on the canvas,
 * gates on movement delta < 5px (so camera drags don't trigger selection),
 * then raycasts against the 4 MEP sub-groups created in Phase 22.
 *
 * Writes a plain SelectedEquipmentInfo record to selection-store — never stores
 * the THREE.Object3D reference (PITFALLS.md Pitfall 9).
 *
 * Per D-01 (CONTEXT.md) + RESEARCH.md §Pattern 1 + Pitfall 1:
 * - `new THREE.Raycaster()` appears exactly ONCE, in the useRef initialiser.
 * - No Raycaster allocation inside useFrame, useEffect, or event handlers.
 *
 * Per D-02 (CONTEXT.md): pointerup with < 5px movement gate.
 * Per D-06 (CONTEXT.md): targets come ONLY from sub-mep-* named groups.
 * Per D-05 (CONTEXT.md): only plain SelectedEquipmentInfo stored — no THREE.* refs.
 */
export function EquipmentClickHandler() {
  const { scene, camera, gl } = useThree();
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const buildingPk = useActiveBuildingPk();
  const recipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);

  // PATTERN 1 (RESEARCH.md §Pattern 1): useRef allocation — NEVER re-allocate.
  // This is the ONLY `new THREE.Raycaster()` call in this file.
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!recipe) return; // no building loaded yet
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const down = pointerDownPos.current;
      pointerDownPos.current = null;
      if (!down) return;

      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      // Pitfall 5 gate: reject drags > 5px (camera rotation via OrbitControls)
      if (Math.hypot(dx, dy) > 5) return;

      const rect = canvas.getBoundingClientRect();
      mouseRef.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Pattern 8 (RESEARCH.md): collect targets ONLY from visible MEP sub-groups.
      // Never use scene.children — too broad and includes structural/envelope meshes.
      const targets: THREE.Object3D[] = [];
      let foundAnySubGroup = false;

      for (const subId of MEP_SUB_IDS) {
        if (!mepSubVisibility[subId]) continue;
        const subGroup = scene.getObjectByName(`sub-${subId}`);
        if (!subGroup) continue;
        foundAnySubGroup = true;
        subGroup.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) targets.push(obj);
        });
      }

      // Pitfall 6 guard: Phase 22 MEP sub-groups not present yet — graceful degradation
      if (!foundAnySubGroup) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[EquipmentClickHandler] No MEP sub-groups found — Phase 22 required"
          );
        }
        return;
      }

      if (targets.length === 0) return;

      const hits = raycasterRef.current.intersectObjects(targets, false);
      if (hits.length === 0) {
        // Miss on visible MEP area — dismiss any existing card
        useSelectionStore.getState().clearEquipment();
        return;
      }

      const obj = hits[0].object;
      // D-05 enforcement: extract plain data only — do NOT store obj/hits[0].point/THREE.*
      const userData = obj.userData ?? {};

      // Determine subLayerId by walking up parent chain until we find sub-mep-*
      let subLayerId: MepSubLayerId | null = null;
      let parent: THREE.Object3D | null = obj;
      while (parent) {
        if (typeof parent.name === "string" && parent.name.startsWith("sub-mep-")) {
          subLayerId = parent.name.slice("sub-".length) as MepSubLayerId;
          break;
        }
        parent = parent.parent;
      }

      if (!subLayerId) {
        // Hit object is not inside a known MEP sub-group — treat as miss
        useSelectionStore.getState().clearEquipment();
        return;
      }

      const specs = inferEquipmentSpecs(userData, recipe);
      const floorNo = typeof userData.floorNo === "number" ? userData.floorNo : null;
      const typeStr = String(userData.type ?? "unknown");
      const equipmentId = `${subLayerId}-${typeStr}${floorNo !== null ? `-floor-${floorNo}` : ""}`;

      const info: SelectedEquipmentInfo = {
        equipmentId,
        subLayerId,
        componentType: typeStr,
        floorNo,
        specs,
      };

      // Dispatch plain record — no THREE.Object3D, no Vector3, no GPU objects
      useSelectionStore.getState().selectEquipment(info);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [gl.domElement, camera, scene, mepSubVisibility, recipe]);

  // Null render — this component only registers event listeners
  return null;
}
