// src/lib/rendering/texture-atlas.ts
// Shared GPU textures for the architectural material factory. Populated from
// a React bridge (useTexture) so generators stay free of Suspense.

import type { Texture } from "three";

export type ArchitecturalTextureSetName =
  | "concrete_clean"
  | "concrete_rough"
  | "brick"
  | "metal_panel"
  | "wood"
  | "roof_flat"
  | "roof_tile";

export interface ArchitecturalTextureSet {
  color: Texture;
  normal: Texture;
  roughness: Texture;
}

export type ArchitecturalAtlas = Record<ArchitecturalTextureSetName, ArchitecturalTextureSet>;

export const ARCHITECTURAL_TEXTURE_SETS: readonly ArchitecturalTextureSetName[] = [
  "concrete_clean",
  "concrete_rough",
  "brick",
  "metal_panel",
  "wood",
  "roof_flat",
  "roof_tile",
] as const;

export function architecturalTextureUrls(): string[] {
  const urls: string[] = [];
  for (const name of ARCHITECTURAL_TEXTURE_SETS) {
    urls.push(
      `/textures/${name}/color.jpg`,
      `/textures/${name}/normal.jpg`,
      `/textures/${name}/roughness.jpg`,
    );
  }
  return urls;
}

let atlas: ArchitecturalAtlas | null = null;
const listeners = new Set<() => void>();

export function getArchitecturalAtlas(): ArchitecturalAtlas | null {
  return atlas;
}

export function setArchitecturalAtlas(next: ArchitecturalAtlas | null): void {
  atlas = next;
  listeners.forEach((fn) => fn());
}

export function subscribeArchitecturalAtlas(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function buildAtlasFromUrlList(textures: Texture[]): ArchitecturalAtlas {
  if (textures.length !== ARCHITECTURAL_TEXTURE_SETS.length * 3) {
    throw new Error("Architectural atlas texture count mismatch");
  }
  const result = {} as ArchitecturalAtlas;
  ARCHITECTURAL_TEXTURE_SETS.forEach((name, i) => {
    result[name] = {
      color: textures[i * 3],
      normal: textures[i * 3 + 1],
      roughness: textures[i * 3 + 2],
    };
  });
  return result;
}
