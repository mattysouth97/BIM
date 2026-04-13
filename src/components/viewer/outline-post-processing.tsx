"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { useOutlineStore } from "@/store/outline-store";

// SAOPass import kept as scaffold for future re-enablement:
// import { SAOPass } from "three/examples/jsm/postprocessing/SAOPass.js";

/**
 * ScenePostProcessing — unified EffectComposer with outline support.
 *
 * Pass chain: RenderPass → [SAOPass — disabled, see above] → OutlinePass → OutputPass
 *
 * OutlinePass config:
 *   edgeStrength: 3.0  — visible edge brightness
 *   edgeGlow: 0.0      — no bloom fringe
 *   edgeThickness: 1.0 — tight 1-pixel outline
 *   visibleEdgeColor: #00d4aa (teal)
 *   hiddenEdgeColor: #004433 (dark teal for occluded edges)
 *
 * Priority: hoveredObjects > selectedObjects (hover always wins).
 * Replaces the former SAOPostProcessing component.
 */
export function ScenePostProcessing() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const outlinePassRef = useRef<OutlinePass | null>(null);

  const hoveredObjects = useOutlineStore((s) => s.hoveredObjects);
  const selectedObjects = useOutlineStore((s) => s.selectedObjects);

  // Build composer once on mount
  useEffect(() => {
    const composer = new EffectComposer(gl);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // SAOPass scaffold — uncomment to re-enable ambient occlusion:
    // const saoPass = new SAOPass(scene, camera);
    // saoPass.params.saoBias = 1.0;
    // saoPass.params.saoIntensity = 0.004;
    // saoPass.params.saoScale = 2;
    // saoPass.params.saoKernelRadius = 15;
    // saoPass.params.saoMinResolution = 0;
    // saoPass.params.saoBlur = true;
    // saoPass.params.saoBlurRadius = 12;
    // saoPass.params.saoBlurStdDev = 6;
    // saoPass.params.saoBlurDepthCutoff = 0.01;
    // composer.addPass(saoPass);

    const resolution = new THREE.Vector2(size.width, size.height);
    const outlinePass = new OutlinePass(resolution, scene, camera);
    outlinePass.edgeStrength = 3.0;
    outlinePass.edgeGlow = 0.0;
    outlinePass.edgeThickness = 1.0;
    outlinePass.visibleEdgeColor.set("#00d4aa");
    outlinePass.hiddenEdgeColor.set("#004433");
    composer.addPass(outlinePass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    composerRef.current = composer;
    outlinePassRef.current = outlinePass;

    return () => {
      composer.dispose();
      composerRef.current = null;
      outlinePassRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  // Resize when viewport changes
  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size]);

  // Update OutlinePass selected objects: hover takes priority over selection
  useEffect(() => {
    if (!outlinePassRef.current) return;
    const targets = hoveredObjects.length > 0 ? hoveredObjects : selectedObjects;
    outlinePassRef.current.selectedObjects = targets;
  }, [hoveredObjects, selectedObjects]);

  // Take over the render loop (priority 1 — same as former SAOPostProcessing)
  useFrame(() => {
    composerRef.current?.render();
  }, 1);

  return null;
}
