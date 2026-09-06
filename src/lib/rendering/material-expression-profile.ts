import type { MaterialSampleKind } from "@/lib/reference-buildings/material-appearance";

/** Appearance choices only: tile dimensions are nominal illustrations, never
 * measurements of the source building's brick courses, grain or finish. */
export const MATERIAL_TEXTURE_PROFILES = {
  concrete_rough: { metresPerTile: [2, 1], normalStrength: 0.32, roughness: [0.72, 0.98], tint: "#eeede8", metalness: 0 },
  brick: { metresPerTile: [1.05, 1.2], normalStrength: 0.36, roughness: [0.66, 0.96], tint: "#ffffff", metalness: 0 },
  wood: { metresPerTile: [1, 1], normalStrength: 0.27, roughness: [0.42, 0.78], tint: "#f4eee5", metalness: 0 },
  metal_panel: { metresPerTile: [1, 1], normalStrength: 0.18, roughness: [0.34, 0.57], tint: "#eef1f2", metalness: 0.72 },
} as const;

export type MaterialTextureKind = keyof typeof MATERIAL_TEXTURE_PROFILES;
export const MATERIAL_TEXTURE_TYPES = Object.keys(MATERIAL_TEXTURE_PROFILES) as MaterialTextureKind[];
export const MATERIAL_TEXTURE_CHANNELS = ["color", "normal", "roughness"] as const;
export const MATERIAL_TEXTURE_URLS = MATERIAL_TEXTURE_TYPES.flatMap((kind) => MATERIAL_TEXTURE_CHANNELS.map((channel) => `/textures/${kind}/${channel}.jpg`));

export function textureKindForSample(kind: MaterialSampleKind): MaterialTextureKind | null {
  if (kind === "brick" || kind === "wood") return kind;
  if (kind === "metal" || kind === "framing") return "metal_panel";
  if (["concrete", "masonry", "mortar", "gravel"].includes(kind)) return "concrete_rough";
  return null;
}
