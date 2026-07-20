"use client";

import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { getTextureSet, getPBRMaterial, type TextureSet } from "@/lib/pbr-materials";
import type { BuildingEra } from "@/lib/material-types";

export interface TexturedMaterialProps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  color: string;
  roughness: number;
  metalness: number;
  normalScale: THREE.Vector2;
}

/** Normal scale per component — subtle for BIM structural clarity */
const NORMAL_SCALE: Record<string, [number, number]> = {
  wall:   [0.3, 0.3],
  column: [0.2, 0.2],
  slab:   [0.2, 0.2],
  roof:   [0.4, 0.4],
  ground: [0.15, 0.15],
};

/**
 * Loads PBR textures for a structural component and returns material props
 * ready for meshStandardMaterial.
 *
 * The returned `color` from getPBRMaterial tints the texture map (Three.js
 * multiplies map × color), preserving the desaturated BIM aesthetic.
 * The `roughness` base value MUST be passed through — Three.js defaults to
 * 1.0 if omitted, which makes steel/glass structures look completely matte.
 */
export function useTexturedMaterial(
  strctCd: string,
  era?: BuildingEra,
  component: "wall" | "column" | "slab" | "roof" | "ground" = "wall",
  mainPurpsCd?: string,
  roofType?: string,
): TexturedMaterialProps {
  const texSet = getTextureSet(strctCd, era, component, roofType);
  const pbr = getPBRMaterial(strctCd, mainPurpsCd, era);

  const [colorTexShared, normalTexShared, roughnessTexShared] = useTexture([
    texSet.colorMap,
    texSet.normalMap,
    texSet.roughnessMap,
  ]);

  // Clone shared cached textures before mutating repeat/colorSpace.
  // drei's useTexture caches by URL — mutating the shared object would corrupt
  // all other consumers that use a different repeat or colorSpace for the same path.
  const colorTex = useMemo(() => {
    const t = colorTexShared.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(texSet.repeat[0], texSet.repeat[1]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [colorTexShared, texSet.repeat]);

  const normalTex = useMemo(() => {
    const t = normalTexShared.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(texSet.repeat[0], texSet.repeat[1]);
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [normalTexShared, texSet.repeat]);

  const roughnessTex = useMemo(() => {
    const t = roughnessTexShared.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(texSet.repeat[0], texSet.repeat[1]);
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [roughnessTexShared, texSet.repeat]);

  // Dispose cloned textures when they are replaced
  useEffect(() => {
    return () => {
      colorTex.dispose();
      normalTex.dispose();
      roughnessTex.dispose();
    };
  }, [colorTex, normalTex, roughnessTex]);

  const ns = NORMAL_SCALE[component] || [0.3, 0.3];

  return {
    map: colorTex,
    normalMap: normalTex,
    roughnessMap: roughnessTex,
    color: pbr.color,
    roughness: pbr.roughness,
    metalness: pbr.metalness,
    normalScale: new THREE.Vector2(ns[0], ns[1]),
  };
}

/** Get texture config without loading (for preload or conditional use) */
export function useTextureConfig(
  strctCd: string,
  era?: BuildingEra,
  component: "wall" | "column" | "slab" | "roof" | "ground" = "wall",
  roofType?: string,
): TextureSet {
  return getTextureSet(strctCd, era, component, roofType);
}
