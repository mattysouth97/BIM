"use client";

import { useFrame, useThree } from "@react-three/fiber";
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
import { toThreePlane, type ViewDefinition } from "@/lib/bim/views/view-definition";
import type { SceneFocusTarget } from "./diagnostic-selection-types";

export interface SceneControlsRef {
  setView: (view: "front" | "side" | "top" | "iso") => void;
}

interface SceneControlsProps {
  targetHeight: number;
  distance: number;
  focusTarget?: SceneFocusTarget | null;
}

export type SceneFocusPose = Readonly<{
  target: readonly [number, number, number];
  position: readonly [number, number, number];
  distance: number;
}>;

export function cameraPoseForFocusTarget(
  focusTarget: SceneFocusTarget,
  fovDeg: number,
  minimumDistance: number,
  maximumDistance: number,
): SceneFocusPose {
  const [rawX, rawY, rawZ] = focusTarget.viewDirection ?? [0.72, 0.52, 0.72];
  const length = Math.hypot(rawX, rawY, rawZ);
  const direction =
    length > 0.0001
      ? [rawX / length, rawY / length, rawZ / length]
      : [0.65, 0.48, 0.65];
  const halfFov = Math.max(5, Math.min(fovDeg, 120)) * Math.PI / 360;
  const fitDistance = Math.max(focusTarget.radius, 0.1) / Math.tan(halfFov) * 1.28;
  const distance = Math.min(
    Math.max(fitDistance, minimumDistance),
    Math.max(maximumDistance, minimumDistance),
  );
  const target = focusTarget.center;
  return Object.freeze({
    target,
    position: Object.freeze([
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ] as const),
    distance,
  });
}

type CameraTransition = {
  camera: THREE.PerspectiveCamera;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
};

function applyClipping(
  scene: THREE.Scene,
  gl: THREE.WebGLRenderer,
  view: ViewDefinition | null
): void {
  const planes =
    view?.clippingPlanes?.map((desc) => toThreePlane(desc, THREE)) ?? [];
  gl.localClippingEnabled = planes.length > 0;
  gl.clippingPlanes = planes;
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
  function SceneControls({ targetHeight, distance, focusTarget }, ref) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controlsRef = useRef<any>(null);
    const { camera, set, gl, size, invalidate, scene } = useThree();
    const perspRef = useRef<THREE.PerspectiveCamera | null>(
      (camera as THREE.PerspectiveCamera).isPerspectiveCamera
        ? (camera as THREE.PerspectiveCamera)
        : null,
    );
    const orthoRef = useRef<THREE.OrthographicCamera | null>(null);
    const focusTransitionRef = useRef<CameraTransition | null>(null);

    const activeViewId = useViewStore((s) => s.activeViewId);
    const views = useViewStore((s) => s.views);
    const activeView = views.find((v) => v.id === activeViewId) ?? null;
    const lockRotate = !!activeView && activeView.kind !== "3d";
    const lockTop = activeView?.kind === "plan";

    const applyPreset = useCallback(
      (view: "front" | "side" | "top" | "iso") => {
        focusTransitionRef.current = null;
        useViewStore.getState().setActiveView(null);
        const persp = perspRef.current;
        if (!persp) return;
        if (camera !== persp) set({ camera: persp });
        applyClipping(scene, gl, null);
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
      [camera, set, gl, targetHeight, distance, invalidate, scene],
    );

    useImperativeHandle(ref, () => ({ setView: applyPreset }), [applyPreset]);

    useFrame((_state, delta) => {
      const transition = focusTransitionRef.current;
      if (!transition) return;
      transition.elapsed += Math.min(delta, 0.1);
      const progress = Math.min(
        transition.elapsed / Math.max(transition.duration, 0.001),
        1,
      );
      const eased = 1 - Math.pow(1 - progress, 3);
      transition.camera.position.lerpVectors(
        transition.fromPosition,
        transition.toPosition,
        eased,
      );
      transition.camera.lookAt(
        new THREE.Vector3().lerpVectors(
          transition.fromTarget,
          transition.toTarget,
          eased,
        ),
      );
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(
          transition.fromTarget,
          transition.toTarget,
          eased,
        );
        controlsRef.current.update();
      }
      invalidate();
      if (progress >= 1) focusTransitionRef.current = null;
    });

    useEffect(() => {
      if (!focusTarget) {
        focusTransitionRef.current = null;
        return;
      }
      const perspective = perspRef.current;
      if (!perspective) return;
      useViewStore.getState().setActiveView(null);
      if (camera !== perspective) set({ camera: perspective });
      applyClipping(scene, gl, null);
      const pose = cameraPoseForFocusTarget(
        focusTarget,
        perspective.fov,
        5,
        distance * 4,
      );
      const toPosition = new THREE.Vector3(...pose.position);
      const toTarget = new THREE.Vector3(...pose.target);
      const fromTarget = controlsRef.current?.target?.clone?.() ??
        new THREE.Vector3(0, targetHeight / 2, 0);
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        perspective.position.copy(toPosition);
        perspective.lookAt(toTarget);
        if (controlsRef.current) {
          controlsRef.current.object = perspective;
          controlsRef.current.target.copy(toTarget);
          controlsRef.current.update();
        }
        focusTransitionRef.current = null;
        invalidate();
        return;
      }
      if (controlsRef.current) controlsRef.current.object = perspective;
      focusTransitionRef.current = {
        camera: perspective,
        fromPosition: perspective.position.clone(),
        toPosition,
        fromTarget,
        toTarget,
        elapsed: 0,
        duration: 0.42,
      };
      invalidate();
    }, [camera, distance, focusTarget, gl, invalidate, scene, set, targetHeight]);

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
        applyClipping(scene, gl, null);
        return;
      }

      focusTransitionRef.current = null;

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

      applyClipping(scene, gl, activeView);
      invalidate();
    }, [activeView, camera, set, gl, size, invalidate, scene]);

    return (
      <OrbitControls
        ref={controlsRef}
        target={[0, targetHeight / 2, 0]}
        maxPolarAngle={lockTop ? 0.001 : Math.PI * 0.85}
        minDistance={5}
        maxDistance={distance * 4}
        enableDamping
        dampingFactor={0.1}
        onStart={() => {
          focusTransitionRef.current = null;
        }}
        enableRotate={!lockRotate}
        enableZoom
      />
    );
  }
);
