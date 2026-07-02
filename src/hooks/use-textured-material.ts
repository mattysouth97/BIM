"use client";

import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useEffect } from "react";
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

  const [colorTex, normalTex, roughnessTex] = useTexture([
    texSet.colorMap,
    texSet.normalMap,
    texSet.roughnessMap,
  ]);

  useEffect(() => {
    for (const tex of [colorTex, normalTex, roughnessTex]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(texSet.repeat[0], texSet.repeat[1]);
    }
    // eslint-disable-next-line react-hooks/immutability
    colorTex.colorSpace = THREE.SRGBColorSpace;
    // eslint-disable-next-line react-hooks/immutability
    normalTex.colorSpace = THREE.LinearSRGBColorSpace;
    // eslint-disable-next-line react-hooks/immutability
    roughnessTex.colorSpace = THREE.LinearSRGBColorSpace;
  }, [colorTex, normalTex, roughnessTex, texSet.repeat]);

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
