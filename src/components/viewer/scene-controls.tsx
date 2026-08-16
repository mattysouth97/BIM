"use client";

import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import * as THREE from "three";
import { useViewStore } from "@/lib/bim/views/view-store";
import { applyViewToCamera } from "@/lib/bim/views/view-engine";

export interface SceneControlsRef {
  setView: (view: "front" | "side" | "top" | "iso") => void;
}

interface SceneControlsProps {
  targetHeight: number;
  distance: number;
}

export const SceneControls = forwardRef<SceneControlsRef, SceneControlsProps>(
  function SceneControls({ targetHeight, distance }, ref) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controlsRef = useRef<any>(null);
    const { camera, set, gl, size, invalidate } = useThree();
    const perspRef = useRef<THREE.PerspectiveCamera | null>(
      (camera as THREE.PerspectiveCamera).isPerspectiveCamera
        ? (camera as THREE.PerspectiveCamera)
        : null,
    );
    const orthoRef = useRef<THREE.OrthographicCamera | null>(null);

    const activeViewId = useViewStore((s) => s.activeViewId);
    const views = useViewStore((s) => s.views);
    const activeView = views.find((v) => v.id === activeViewId) ?? null;
    const lockRotate = !!activeView && activeView.kind !== "3d";
    const lockTop = activeView?.kind === "plan";

    const applyPreset = useCallback(
      (view: "front" | "side" | "top" | "iso") => {
        useViewStore.getState().setActiveView(null);
        const persp = perspRef.current;
        if (!persp) return;
        if (camera !== persp) set({ camera: persp });
        gl.clippingPlanes = [];
        gl.localClippingEnabled = false;
        const target = new THREE.Vector3(0, targetHeight / 2, 0);
        const d = distance;
        const positions: Record<string, THREE.Vector3> = {
          front: new THREE.Vector3(0, targetHeight / 2, d),
          side: new THREE.Vector3(d, targetHeight / 2, 0),
          top: new THREE.Vector3(0, d * 1.5, 0.01),
          iso: new THREE.Vector3(d * 0.7, targetHeight / 2 + d * 0.5, d * 0.7),
        };
        persp.position.copy(positions[view]);
        persp.lookAt(target);
        if (controlsRef.current) {
          controlsRef.current.object = persp;
          controlsRef.current.target.copy(target);
          controlsRef.current.update();
        }
        invalidate();
      },
      [camera, set, gl, targetHeight, distance, invalidate],
    );

    useImperativeHandle(ref, () => ({ setView: applyPreset }), [applyPreset]);

    useEffect(() => {
      const aspect = size.width / Math.max(size.height, 1);
      if (!orthoRef.current) {
        const half = 20;
        orthoRef.current = new THREE.OrthographicCamera(
          -half * aspect,
          half * aspect,
          half,
          -half,
          0.1,
          5000,
        );
      }

      if (!activeView) {
        const persp = perspRef.current;
        if (persp && camera !== persp) set({ camera: persp });
        gl.clippingPlanes = [];
        gl.localClippingEnabled = false;
        return;
      }

      const wantsOrtho = activeView.cameraState.kind === "ortho";
      const nextCam = wantsOrtho
        ? orthoRef.current!
        : (perspRef.current ?? camera);

      if (camera !== nextCam) set({ camera: nextCam });

      applyViewToCamera(
        activeView,
        nextCam,
        controlsRef.current ?? undefined,
        aspect,
      );

      if (controlsRef.current) {
        controlsRef.current.object = nextCam;
        controlsRef.current.update();
      }

      const planes = (activeView.clippingPlanes ?? []).map(
        (d) => new THREE.Plane(new THREE.Vector3(...d.normal), d.constant),
      );
      gl.clippingPlanes = planes;
      gl.localClippingEnabled = planes.length > 0;
      invalidate();
    }, [activeView, camera, set, gl, size, invalidate]);

    return (
      <OrbitControls
        ref={controlsRef}
        target={[0, targetHeight / 2, 0]}
        maxPolarAngle={lockTop ? 0.001 : Math.PI * 0.85}
        minDistance={5}
        maxDistance={distance * 4}
        enableDamping
        dampingFactor={0.1}
        enableRotate={!lockRotate}
        enableZoom
      />
    );
  }
);
