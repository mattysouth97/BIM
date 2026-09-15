"use client";

import { Component, Suspense, useEffect, type ReactNode } from "react";
import { useTexture } from "@react-three/drei";
import { currentBudget } from "@/lib/rendering/runtime";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  architecturalTextureUrls,
  buildAtlasFromUrlList,
  isColorChannelUrl,
  setArchitecturalAtlas,
} from "@/lib/rendering/texture-atlas";

// Two fixed lists, built once. A single list whose length depended on the
// quality tier would change `useTexture`'s hook count on a tier switch, which
// React forbids — so each variant is its own component with its own constant.
const TEXTURE_URLS = architecturalTextureUrls(false);
const TEXTURE_URLS_WITH_NORMAL = architecturalTextureUrls(true);

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

function TextureBridgeInner({ withNormal }: { withNormal: boolean }) {
  const urls = withNormal ? TEXTURE_URLS_WITH_NORMAL : TEXTURE_URLS;
  const textures = useTexture(urls);
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
      // Derived from the URL, not from position: the list is deduplicated, so
      // an aliased set can drop a pair and shift every index after it.
      tex.colorSpace = isColorChannelUrl(urls[i])
        ? THREE.SRGBColorSpace
        : THREE.LinearSRGBColorSpace;
      clones.push(tex);
    }
    try {
      setArchitecturalAtlas(buildAtlasFromUrlList(clones, withNormal));
    } catch (err) {
      console.warn("[render] architectural atlas not applied", err);
    }
    return () => {
      setArchitecturalAtlas(null);
      clones.forEach((tex) => tex.dispose());
    };
  }, [textures, gl, urls, withNormal]);

  return null;
}

/**
 * Loads the architectural PBR texture sets once per Canvas and publishes
 * them to the material factory. A missing JPG must never blank the building.
 */
export function ArchitecturalTextureBridge() {
  const withNormal = currentBudget().normalMaps;
  return (
    <TextureBoundary>
      <Suspense fallback={null}>
        {/* Keyed so a tier change REMOUNTS rather than re-rendering with a
            different-length URL list: `useTexture` would otherwise change its
            hook count between renders of the same component, which React
            forbids. A remount also disposes the old textures through the
            existing cleanup. */}
        <TextureBridgeInner key={withNormal ? "with-normal" : "no-normal"} withNormal={withNormal} />
      </Suspense>
    </TextureBoundary>
  );
}
