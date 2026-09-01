"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { useOutlineStore } from "@/store/outline-store";
import { useRenderStore } from "@/store/render-store";
import { effectiveBudget, isRealisticMode } from "@/lib/rendering";

/**
 * Dual-state scene highlighting plus optional GTAO / SMAA in realistic modes.
 * Orange communicates the immediate hover target; teal preserves selection.
 */
export function SceneHighlightProcessing() {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer | null>(null);
  const selectedPass = useRef<OutlinePass | null>(null);
  const hoverPass = useRef<OutlinePass | null>(null);
  const gtaoPass = useRef<GTAOPass | null>(null);
  const hoveredObjects = useOutlineStore((s) => s.hoveredObjects);
  const selectedObjects = useOutlineStore((s) => s.selectedObjects);
  const mode = useRenderStore((s) => s.mode);
  const quality = useRenderStore((s) => s.quality);

  useEffect(() => {
    const budget = effectiveBudget(mode, quality);
    const realistic = isRealisticMode(mode);
    const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      samples: budget.smaa ? 0 : 4,
      type: THREE.HalfFloatType,
    });
    const nextComposer = new EffectComposer(gl, renderTarget);
    nextComposer.addPass(new RenderPass(scene, camera));

    if (realistic && budget.gtao) {
      const nextGtao = new GTAOPass(scene, camera, size.width, size.height);
      nextGtao.output = GTAOPass.OUTPUT.Default;
      nextGtao.blendIntensity = 0.72;
      nextGtao.updateGtaoMaterial({
        radius: 0.22,
        distanceExponent: 1,
        thickness: 1,
        scale: 0.9,
        samples: budget.gtaoSamples,
        distanceFallOff: 1,
      });
      nextComposer.addPass(nextGtao);
      gtaoPass.current = nextGtao;
    } else {
      gtaoPass.current = null;
    }

    if (realistic && budget.smaa) {
      nextComposer.addPass(new SMAAPass());
    }

    const resolution = new THREE.Vector2(size.width, size.height);
    const nextSelectedPass = new OutlinePass(resolution, scene, camera);
    configureOutline(nextSelectedPass, {
      strength: realistic ? 2.2 : 3.2,
      glow: realistic ? 0.02 : 0.08,
      thickness: realistic ? 1.0 : 1.4,
      visible: "#2dd4bf",
      hidden: "#0f766e",
    });
    nextComposer.addPass(nextSelectedPass);

    const nextHoverPass = new OutlinePass(resolution, scene, camera);
    configureOutline(nextHoverPass, {
      strength: realistic ? 3.4 : 5.5,
      glow: realistic ? 0.12 : 0.35,
      thickness: realistic ? 1.6 : 2.4,
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
      gtaoPass.current = null;
    };
    // Rebuild when the GL context or quality tier changes. Size is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, mode, quality]);

  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
    gtaoPass.current?.setSize(size.width, size.height);
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
