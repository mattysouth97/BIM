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
  /**
   * Present only when the active quality tier asks for it.
   *
   * The channel was removed entirely once, because nothing sampled it: the
   * mesh `normalMap` is skipped under triplanar and every tier sets
   * `triplanar: true`, so six normal maps were downloaded and read by nothing.
   * It is back because the shader now samples it triplanar itself — but it
   * stays optional, and `performance` and BIM mode still never fetch it.
   */
  normal?: Texture;
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
const ATLAS_CHANNELS_WITH_NORMAL = ["color", "roughness", "normal"] as const;

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

/**
 * Deduplicated URL list — aliased sets are fetched once, not once per name.
 *
 * `withNormal` is a parameter rather than a read of the current tier so the
 * result stays a pure function of its argument: the bridge builds one fixed
 * list per variant at module scope, which is what keeps `useTexture`'s hook
 * count stable when the tier changes.
 */
export function architecturalTextureUrls(withNormal = false): string[] {
  const channels = withNormal ? ATLAS_CHANNELS_WITH_NORMAL : ATLAS_CHANNELS;
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const name of ARCHITECTURAL_TEXTURE_SETS) {
    for (const channel of channels) {
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
export function buildAtlasFromUrlList(textures: Texture[], withNormal = false): ArchitecturalAtlas {
  const urls = architecturalTextureUrls(withNormal);
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
    // Absent when the tier did not request it — the shader reads the strength
    // uniform, so a missing map disables the effect rather than breaking it.
    const normal = withNormal ? byUrl.get(textureUrl(dir, "normal")) : undefined;
    if (withNormal && !normal) {
      throw new Error(`Architectural atlas missing normal channel for set "${name}"`);
    }
    result[name] = normal ? { color, roughness, normal } : { color, roughness };
  }
  return result;
}
