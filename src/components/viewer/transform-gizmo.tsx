"use client";

import { useEffect, useRef, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useAuthoringStore } from "@/store/authoring-store";

/**
 * TransformControls gizmo that attaches to the currently selected element.
 * Disables OrbitControls during drag. Pushes edits to undo stack on drag end.
 * Keyboard: G = translate, R = rotate, S = scale
 */
export function TransformGizmo() {
  const { scene } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformRef = useRef<any>(null);

  const selectedElementId = useAuthoringStore((s) => s.selectedElementId);
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);
  const transformMode = useAuthoringStore((s) => s.transformMode);
  const setTransformMode = useAuthoringStore((s) => s.setTransformMode);
  const pushEdit = useAuthoringStore((s) => s.pushEdit);

  // Track pre-drag state for undo
  const dragStartState = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  } | null>(null);

  // Find the selected object in the scene
  const getSelectedObject = useCallback((): THREE.Object3D | null => {
    if (!selectedElementId) return null;
    let found: THREE.Object3D | null = null;
    scene.traverse((obj) => {
      if (obj.uuid === selectedElementId) {
        found = obj;
      }
    });
    return found;
  }, [scene, selectedElementId]);

  // Attach TransformControls to selected object
  useEffect(() => {
    const controls = transformRef.current;
    if (!controls || !isAuthoring) return;

    const obj = getSelectedObject();
    if (obj) {
      controls.attach(obj);
    } else {
      controls.detach();
    }

    return () => {
      controls.detach();
    };
  }, [selectedElementId, isAuthoring, getSelectedObject]);

  // Handle drag start/end for undo and OrbitControls disable
  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return;

    const onDragStart = () => {
      const obj = controls.object as THREE.Object3D | undefined;
      if (obj) {
        dragStartState.current = {
          position: obj.position.clone(),
          rotation: obj.rotation.clone(),
          scale: obj.scale.clone(),
        };
      }

      // Dispatch event to signal OrbitControls to disable
      window.dispatchEvent(new CustomEvent("transform-drag", { detail: { dragging: true } }));
    };

    const onDragEnd = () => {
      const obj = controls.object as THREE.Object3D | undefined;
      if (obj && dragStartState.current && selectedElementId) {
        const prop = transformMode;
        let oldValue: unknown;
        let newValue: unknown;

        if (prop === "translate") {
          oldValue = dragStartState.current.position.toArray();
          newValue = obj.position.toArray();
        } else if (prop === "rotate") {
          oldValue = [dragStartState.current.rotation.x, dragStartState.current.rotation.y, dragStartState.current.rotation.z];
          newValue = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
        } else {
          oldValue = dragStartState.current.scale.toArray();
          newValue = obj.scale.toArray();
        }

        pushEdit({
          elementId: selectedElementId,
          property: prop,
          oldValue,
          newValue,
          timestamp: Date.now(),
        });
      }
      dragStartState.current = null;

      window.dispatchEvent(new CustomEvent("transform-drag", { detail: { dragging: false } }));
    };

    controls.addEventListener("dragging-changed", (event: { value: boolean }) => {
      if (event.value) onDragStart();
      else onDragEnd();
    });

    return () => {
      controls.removeEventListener("dragging-changed", onDragStart);
    };
  }, [transformMode, selectedElementId, pushEdit]);

  // Keyboard shortcuts: G/R/S for transform modes
  useEffect(() => {
    if (!isAuthoring) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case "g":
          setTransformMode("translate");
          break;
        case "r":
          setTransformMode("rotate");
          break;
        case "s":
          setTransformMode("scale");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthoring, setTransformMode]);

  if (!isAuthoring || !selectedElementId) return null;

  return (
    <TransformControls
      ref={transformRef}
      mode={transformMode}
      size={0.8}
    />
  );
}
