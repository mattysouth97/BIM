"use client";

import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { useViewStore } from "@/lib/bim/views/view-store";
import { applyViewToCamera } from "@/lib/bim/views/view-engine";
import { toThreePlane, type ViewDefinition } from "@/lib/bim/views/view-definition";

export interface SceneControlsRef {
  setView: (view: "front" | "side" | "top" | "iso") => void;
}

interface SceneControlsProps {
  targetHeight: number;
  distance: number;
}

function applyClipping(
  scene: THREE.Scene,
  gl: THREE.WebGLRenderer,
  view: ViewDefinition | null
): void {
  const planes =
    view?.clippingPlanes?.map((desc) => toThreePlane(desc, THREE)) ?? [];
  gl.localClippingEnabled = planes.length > 0;
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if ("clippingPlanes" in mat) {
        (mat as THREE.Material & { clippingPlanes: THREE.Plane[] }).clippingPlanes =
          planes;
      }
    }
  });
}

export const SceneControls = forwardRef<SceneControlsRef, SceneControlsProps>(
  function SceneControls({ targetHeight, distance }, ref) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controlsRef = useRef<any>(null);
    const { camera, scene, gl } = useThree();
    const activeViewId = useViewStore((s) => s.activeViewId);
    const views = useViewStore((s) => s.views);

    const setView = useCallback(
      (view: "front" | "side" | "top" | "iso") => {
        useViewStore.getState().setActiveView(null);
        applyClipping(scene, gl, null);
        const target = new THREE.Vector3(0, targetHeight / 2, 0);
        const d = distance;
        const positions: Record<string, THREE.Vector3> = {
          front: new THREE.Vector3(0, targetHeight / 2, d),
          side: new THREE.Vector3(d, targetHeight / 2, 0),
          top: new THREE.Vector3(0, d * 1.5, 0.01),
          iso: new THREE.Vector3(d * 0.7, targetHeight / 2 + d * 0.5, d * 0.7),
        };
        camera.position.copy(positions[view]);
        camera.lookAt(target);
        if (controlsRef.current) {
          controlsRef.current.target.copy(target);
          controlsRef.current.update();
        }
      },
      [camera, targetHeight, distance, scene, gl]
    );

    useEffect(() => {
      if (!activeViewId) {
        applyClipping(scene, gl, null);
        return;
      }
      const view = views.find((v) => v.id === activeViewId);
      if (!view) return;
      applyViewToCamera(view, camera, controlsRef.current ?? undefined);
      applyClipping(scene, gl, view);
    }, [activeViewId, views, camera, scene, gl]);

    useImperativeHandle(ref, () => ({ setView }), [setView]);

    return (
      <OrbitControls
        ref={controlsRef}
        target={[0, targetHeight / 2, 0]}
        maxPolarAngle={Math.PI * 0.85}
        minDistance={5}
        maxDistance={distance * 4}
        enableDamping
        dampingFactor={0.1}
        enableRotate
        enableZoom
      />
    );
  }
);
