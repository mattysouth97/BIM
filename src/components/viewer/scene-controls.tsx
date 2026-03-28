"use client";

import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { usePlanStore } from "@/store/plan-store";

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
    const { camera } = useThree();
    const viewMode = usePlanStore((s) => s.viewMode);
    const isPlan = viewMode === "plan";

    const setView = useCallback(
      (view: "front" | "side" | "top" | "iso") => {
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
      [camera, targetHeight, distance]
    );

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
        enableRotate={!isPlan}
        enableZoom={!isPlan}
      />
    );
  }
);
