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

/**
 * Only the channels the renderer actually samples.
 *
 * There is deliberately no `normal` here. `architectural-material.ts` replaces
 * UV sampling with triplanar projection and skips `normalMap` entirely, and
 * every quality tier sets `triplanar: true` — so a normal channel on the atlas
 * was downloaded on the default path and read by nothing. The BIM-mode ground
 * plane still uses normal maps, but it loads them through `pbr-materials.ts`,
 * outside this atlas.
 */
export interface ArchitecturalTextureSet {
  color: Texture;
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

const ATLAS_CHANNELS = ["color", "roughness"] as const;

/**
 * Set name → the directory its pixels actually live in.
 *
 * `roof_flat` shipped as a byte-identical copy of `concrete_rough` (same md5 on
 * every channel). The *name* stays — `material-library.ts` references it — but
 * both resolve to one set of files, so the duplicate never reaches the wire.
 */
const TEXTURE_SOURCE_DIR: Record<ArchitecturalTextureSetName, string> = {
  concrete_clean: "concrete_clean",
  concrete_rough: "concrete_rough",
  brick: "brick",
  metal_panel: "metal_panel",
  wood: "wood",
  roof_flat: "concrete_rough",
  roof_tile: "roof_tile",
};

function textureUrl(dir: string, channel: string): string {
  return `/textures/${dir}/${channel}.jpg`;
}

/** True when a URL from `architecturalTextureUrls()` carries colour data (sRGB). */
export function isColorChannelUrl(url: string): boolean {
  return url.endsWith("/color.jpg");
}

/** Deduplicated URL list — aliased sets are fetched once, not once per name. */
export function architecturalTextureUrls(): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const name of ARCHITECTURAL_TEXTURE_SETS) {
    for (const channel of ATLAS_CHANNELS) {
      const url = textureUrl(TEXTURE_SOURCE_DIR[name], channel);
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
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

/** `textures` must be in the exact order `architecturalTextureUrls()` returns. */
export function buildAtlasFromUrlList(textures: Texture[]): ArchitecturalAtlas {
  const urls = architecturalTextureUrls();
  if (textures.length !== urls.length) {
    throw new Error("Architectural atlas texture count mismatch");
  }

  const byUrl = new Map<string, Texture>();
  urls.forEach((url, i) => byUrl.set(url, textures[i]));

  const result = {} as ArchitecturalAtlas;
  for (const name of ARCHITECTURAL_TEXTURE_SETS) {
    const dir = TEXTURE_SOURCE_DIR[name];
    const color = byUrl.get(textureUrl(dir, "color"));
    const roughness = byUrl.get(textureUrl(dir, "roughness"));
    if (!color || !roughness) {
      throw new Error(`Architectural atlas missing channel for set "${name}"`);
    }
    result[name] = { color, roughness };
  }
  return result;
}
