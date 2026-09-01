"use client";

import { Component, Suspense, useEffect, type ReactNode } from "react";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  architecturalTextureUrls,
  buildAtlasFromUrlList,
  setArchitecturalAtlas,
} from "@/lib/rendering/texture-atlas";

const TEXTURE_URLS = architecturalTextureUrls();

class TextureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[render] architectural textures unavailable; procedural fallback", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function TextureBridgeInner() {
  const textures = useTexture(TEXTURE_URLS);
  const { gl } = useThree();

  useEffect(() => {
    const list = Array.isArray(textures) ? textures : [textures];
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const clones: THREE.Texture[] = [];
    for (let i = 0; i < list.length; i++) {
      const tex = list[i].clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = anisotropy;
      tex.needsUpdate = true;
      const kind = i % 3;
      tex.colorSpace = kind === 0 ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      clones.push(tex);
    }
    try {
      setArchitecturalAtlas(buildAtlasFromUrlList(clones));
    } catch (err) {
      console.warn("[render] architectural atlas not applied", err);
    }
    return () => {
      setArchitecturalAtlas(null);
      clones.forEach((tex) => tex.dispose());
    };
  }, [textures, gl]);

  return null;
}

/**
 * Loads the architectural PBR texture sets once per Canvas and publishes
 * them to the material factory. A missing JPG must never blank the building.
 */
export function ArchitecturalTextureBridge() {
  return (
    <TextureBoundary>
      <Suspense fallback={null}>
        <TextureBridgeInner />
      </Suspense>
    </TextureBoundary>
  );
}
