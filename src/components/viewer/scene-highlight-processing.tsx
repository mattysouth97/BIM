"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { useOutlineStore } from "@/store/outline-store";

/**
 * Dual-state scene highlighting. Orange communicates the immediate hover
 * target; teal preserves the selected object while the pointer moves elsewhere.
 */
export function SceneHighlightProcessing() {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer | null>(null);
  const selectedPass = useRef<OutlinePass | null>(null);
  const hoverPass = useRef<OutlinePass | null>(null);
  const hoveredObjects = useOutlineStore((s) => s.hoveredObjects);
  const selectedObjects = useOutlineStore((s) => s.selectedObjects);

  useEffect(() => {
    const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      samples: 4,
      type: THREE.HalfFloatType,
    });
    const nextComposer = new EffectComposer(gl, renderTarget);
    nextComposer.addPass(new RenderPass(scene, camera));

    const resolution = new THREE.Vector2(size.width, size.height);
    const nextSelectedPass = new OutlinePass(resolution, scene, camera);
    configureOutline(nextSelectedPass, {
      strength: 3.2,
      glow: 0.08,
      thickness: 1.4,
      visible: "#2dd4bf",
      hidden: "#0f766e",
    });
    nextComposer.addPass(nextSelectedPass);

    const nextHoverPass = new OutlinePass(resolution, scene, camera);
    configureOutline(nextHoverPass, {
      strength: 5.5,
      glow: 0.35,
      thickness: 2.4,
      visible: "#fb923c",
      hidden: "#9a3412",
    });
    nextComposer.addPass(nextHoverPass);
    const outputPass = new OutputPass();
    nextComposer.addPass(outputPass);

    composer.current = nextComposer;
    selectedPass.current = nextSelectedPass;
    hoverPass.current = nextHoverPass;

    return () => {
      nextSelectedPass.dispose();
      nextHoverPass.dispose();
      outputPass.dispose();
      nextComposer.dispose();
      renderTarget.dispose();
      composer.current = null;
      selectedPass.current = null;
      hoverPass.current = null;
    };
    // The composer is intentionally rebuilt only when the GL scene/camera changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
  }, [size]);

  useEffect(() => {
    if (selectedPass.current) {
      selectedPass.current.selectedObjects = selectedObjects;
    }
    if (hoverPass.current) {
      hoverPass.current.selectedObjects = hoveredObjects;
    }
  }, [hoveredObjects, selectedObjects]);

  useFrame(() => {
    composer.current?.render();
  }, 1);

  return null;
}

function configureOutline(
  pass: OutlinePass,
  values: {
    strength: number;
    glow: number;
    thickness: number;
    visible: string;
    hidden: string;
  }
) {
  pass.edgeStrength = values.strength;
  pass.edgeGlow = values.glow;
  pass.edgeThickness = values.thickness;
  pass.pulsePeriod = 0;
  pass.visibleEdgeColor.set(values.visible);
  pass.hiddenEdgeColor.set(values.hidden);
}
