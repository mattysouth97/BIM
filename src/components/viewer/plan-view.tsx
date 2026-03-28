"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { usePlanStore } from "@/store/plan-store";

interface PlanViewProps {
  buildingHeight: number;
  buildingWidth: number;
  buildingDepth: number;
  floorHeight?: number;
}

/**
 * Switches to an orthographic top-down camera when viewMode === "plan".
 * Restores the perspective camera when switching back to 3D.
 */
export function PlanView({
  buildingHeight,
  buildingWidth,
  buildingDepth,
  floorHeight = 3.0,
}: PlanViewProps) {
  const viewMode = usePlanStore((s) => s.viewMode);
  const activeFloor = usePlanStore((s) => s.activeFloor);

  const { set, get, size } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perspectiveCamRef = useRef<any>(null);
  const orthoCamRef = useRef<THREE.OrthographicCamera | null>(null);

  // Create orthographic camera once
  useEffect(() => {
    const aspect = size.width / size.height;
    const viewSpan = Math.max(buildingWidth, buildingDepth, 20) * 1.2;
    const halfH = viewSpan / 2;
    const halfW = halfH * aspect;

    const cam = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      0.1,
      buildingHeight + 200
    );
    orthoCamRef.current = cam;

    return () => {
      cam.clear();
    };
    // Only re-create on significant dimension changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingWidth, buildingDepth, buildingHeight]);

  // Update ortho cam bounds when viewport resizes
  useEffect(() => {
    const cam = orthoCamRef.current;
    if (!cam) return;
    const aspect = size.width / size.height;
    const viewSpan = Math.max(buildingWidth, buildingDepth, 20) * 1.2;
    const halfH = viewSpan / 2;
    const halfW = halfH * aspect;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.updateProjectionMatrix();
  }, [size, buildingWidth, buildingDepth]);

  // Switch camera when viewMode changes
  useEffect(() => {
    const cam = orthoCamRef.current;
    if (!cam) return;

    if (viewMode === "plan") {
      // Save current perspective camera
      perspectiveCamRef.current = get().camera;

      // Position orthographic camera above, looking down -Y
      const lookY = activeFloor * floorHeight;
      cam.position.set(0, buildingHeight + 50, 0);
      cam.up.set(0, 0, -1); // Z-up convention for top-down
      cam.lookAt(0, lookY, 0);
      cam.updateProjectionMatrix();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set({ camera: cam as any });
    } else if (perspectiveCamRef.current) {
      set({ camera: perspectiveCamRef.current as any });
    }
  }, [viewMode, activeFloor, buildingHeight, floorHeight, set, get]);

  // Handle scroll zoom in plan view
  useEffect(() => {
    if (viewMode !== "plan") return;

    const handleWheel = (e: WheelEvent) => {
      const cam = orthoCamRef.current;
      if (!cam) return;
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      cam.left *= zoomFactor;
      cam.right *= zoomFactor;
      cam.top *= zoomFactor;
      cam.bottom *= zoomFactor;
      cam.updateProjectionMatrix();
    };

    const canvas = document.querySelector("canvas");
    canvas?.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas?.removeEventListener("wheel", handleWheel);
  }, [viewMode]);

  return null;
}
