"use client";

import { useState, useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useLayerStore } from "@/store/layer-store";

/**
 * StructuralTooltip — R3F component that shows a hover tooltip over structural
 * physical structural columns when the structure layer is active.
 *
 * Uses raycasting in useFrame (throttled every 3rd frame) to detect pointer
 * over column InstancedMesh instances and reads sizing labels from
 * im.userData.sizingLabels[instanceId].
 *
 * Hidden in plan view mode (orthographic 2D) per design spec.
 */
export function StructuralTooltip() {
  const isVisible = useLayerStore((s) => s.visibility["structure"]);
  const [hovered, setHovered] = useState<{
    position: THREE.Vector3;
    label: string;
  } | null>(null);

  const mouse = useRef(new THREE.Vector2());
  const frameCount = useRef(0);
  const raycaster = useRef(new THREE.Raycaster());

  const { scene, camera, gl } = useThree();

  // Register pointer move listener on canvas to track mouse position
  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
    };

    canvas.addEventListener("pointermove", onPointerMove);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
    };
  }, [gl.domElement]);

  useFrame(() => {
    // Throttle: check every 3rd frame for performance
    frameCount.current = (frameCount.current + 1) % 3;
    if (frameCount.current !== 0) return;

    if (!isVisible) {
      setHovered(null);
      return;
    }

    // The physical column mesh owns stress colors and sizing metadata. The
    // analysis layer intentionally contains annotations only, so no duplicate
    // geometry occupies the same volume.
    let columnMesh: THREE.InstancedMesh | null = null;
    scene.traverse((obj) => {
      if (
        !columnMesh &&
        obj instanceof THREE.InstancedMesh &&
        obj.userData.type === "column" &&
        Array.isArray(obj.userData.sizingLabels)
      ) {
        columnMesh = obj;
      }
    });

    if (!columnMesh) {
      setHovered(null);
      return;
    }

    // Raycast against the InstancedMesh
    raycaster.current.setFromCamera(mouse.current, camera);
    const intersections = raycaster.current.intersectObject(columnMesh, false);

    if (intersections.length > 0) {
      const hit = intersections[0];
      const instanceId = hit.instanceId;
      if (instanceId !== undefined) {
        const label = (columnMesh as THREE.InstancedMesh).userData.sizingLabels?.[instanceId];
        if (label) {
          setHovered({
            position: hit.point.clone(),
            label,
          });
          return;
        }
      }
    }

    setHovered(null);
  });

  if (!isVisible || !hovered) {
    return null;
  }

  return (
    <Html position={hovered.position} center style={{ pointerEvents: "none" }}>
      <div className="rounded px-2 py-1 text-xs font-mono bg-zinc-900 text-white shadow-lg whitespace-nowrap">
        {hovered.label}
      </div>
    </Html>
  );
}
