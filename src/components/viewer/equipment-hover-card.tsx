"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useLayerStore } from "@/store/layer-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import {
  inferEquipmentSpecs,
  type EquipmentSpec,
} from "@/lib/energy/equipment-specs";
import { MEP_SUB_IDS } from "@/lib/layers/types";

interface HoverInfo {
  position: THREE.Vector3;
  componentType: string;
  floorNo: number | null;
  specs: EquipmentSpec;
}

/**
 * EquipmentHoverCard — hover content card for MEP equipment showing energy
 * usage metrics and the efficiency grade.
 *
 * Follows the StructuralTooltip pattern (throttled useFrame raycast + drei
 * <Html> tethered at the hit point) but targets the 4 MEP sub-groups and
 * renders the inferEquipmentSpecs energy card. The Raycaster is allocated
 * exactly once via useRef (Pattern 1 — never per frame).
 */
export function EquipmentHoverCard() {
  const mepVisible = useLayerStore((s) => s.visibility["mep"]);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const buildingPk = useActiveBuildingPk();
  const recipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);

  const [hover, setHover] = useState<HoverInfo | null>(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2(2, 2)); // off-screen until first move
  const pointerInside = useRef(false);
  const frameCount = useRef(0);
  // Spec cache: recomputing inferEquipmentSpecs every hover frame is wasteful
  const specCache = useRef(new Map<string, EquipmentSpec>());

  const { scene, camera, gl } = useThree();

  useEffect(() => {
    specCache.current.clear();
  }, [recipe]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      pointerInside.current = true;
    };
    const onPointerLeave = () => {
      pointerInside.current = false;
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [gl.domElement]);

  useFrame(() => {
    // Throttle: every 3rd frame, matching StructuralTooltip
    frameCount.current = (frameCount.current + 1) % 3;
    if (frameCount.current !== 0) return;

    if (!mepVisible || !recipe || !pointerInside.current) {
      if (hover) setHover(null);
      return;
    }

    // Collect targets only from visible MEP sub-groups (Pattern 8)
    const targets: THREE.Object3D[] = [];
    for (const subId of MEP_SUB_IDS) {
      if (!mepSubVisibility[subId]) continue;
      const subGroup = scene.getObjectByName(`sub-${subId}`);
      if (!subGroup) continue;
      subGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) targets.push(obj);
      });
    }
    if (targets.length === 0) {
      if (hover) setHover(null);
      return;
    }

    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const hits = raycasterRef.current.intersectObjects(targets, false);
    if (hits.length === 0) {
      if (hover) setHover(null);
      return;
    }

    const obj = hits[0].object;
    const userData = obj.userData ?? {};
    const typeStr = String(userData.type ?? "unknown");
    const floorNo = typeof userData.floorNo === "number" ? userData.floorNo : null;

    const cacheKey = `${typeStr}-${floorNo ?? "na"}`;
    let specs = specCache.current.get(cacheKey);
    if (!specs) {
      specs = inferEquipmentSpecs(userData, recipe);
      specCache.current.set(cacheKey, specs);
    }

    setHover({
      position: hits[0].point.clone(),
      componentType: typeStr,
      floorNo,
      specs,
    });
  });

  // Cursor affordance — DOM mutation lives in an effect (React Compiler
  // forbids mutating external values inside the useFrame callback).
  useEffect(() => {
    const el = gl.domElement;
    // Imperative DOM cursor styling on the WebGL canvas — intentional
    // external mutation inside an effect with symmetric cleanup.
    // eslint-disable-next-line
    el.style.cursor = hover ? "pointer" : "";
    return () => {
      el.style.cursor = "";
    };
  }, [hover, gl.domElement]);

  const kwhLabel = useMemo(() => {
    if (!hover) return "";
    const kwh = hover.specs.annualKwh;
    return kwh >= 1000
      ? `${(kwh / 1000).toFixed(1)} MWh/yr`
      : `${kwh.toLocaleString()} kWh/yr`;
  }, [hover]);

  if (!mepVisible || !hover) return null;

  return (
    <Html
      position={hover.position}
      style={{ pointerEvents: "none", transform: "translate(14px, -50%)" }}
      zIndexRange={[100, 40]}
    >
      <div className="min-w-44 max-w-56 rounded-md border border-zinc-700/70 bg-zinc-900/90 px-3 py-2 text-[11px] leading-tight text-zinc-100 shadow-xl backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{hover.specs.categoryKo}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: hover.specs.gradeColor,
              color: "#0b0b0b",
            }}
          >
            {hover.specs.efficiencyGradeLabel}
          </span>
        </div>
        <div className="text-zinc-400">{hover.specs.categoryEn}</div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
          <span className="text-zinc-400">용량</span>
          <span className="text-right font-mono">{hover.specs.capacity}</span>
          <span className="text-zinc-400">연간 사용량</span>
          <span className="text-right font-mono">{kwhLabel}</span>
          <span className="text-zinc-400">설치년도</span>
          <span className="text-right font-mono">{hover.specs.installYear}</span>
          {hover.floorNo !== null && (
            <>
              <span className="text-zinc-400">층</span>
              <span className="text-right font-mono">{hover.floorNo}F</span>
            </>
          )}
        </div>
        <div className="mt-1 text-[10px] text-zinc-500">
          모델 추정치 · {hover.specs.standardRef}
        </div>
      </div>
    </Html>
  );
}
