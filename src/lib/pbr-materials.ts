// src/lib/pbr-materials.ts
import type { BuildingEra } from "./material-types";
import { STRUCTURE_TO_WALL_KEY } from "./korean-building-codes";

export interface PBRMaterialConfig {
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  /**
   * Visual material id from the rendering ontology. Engineering values are
   * unchanged; the renderer uses this only to pick a surface appearance.
   */
  visualId?: string;
}

/** Structure code → PBR material params */
export const STRUCTURE_MATERIALS: Record<string, PBRMaterialConfig> = {
  "11": { color: "#B8B0A8", roughness: 0.9, metalness: 0.0 },    // RC
  "12": { color: "#A8A0A0", roughness: 0.7, metalness: 0.2 },    // SRC
  "13": { color: "#C0C8D0", roughness: 0.3, metalness: 0.6 },    // Steel
  "14": { color: "#C8C0B8", roughness: 0.6, metalness: 0.05 },   // Precast
  "15": { color: "#B08050", roughness: 0.85, metalness: 0.0 },    // Timber
  "21": { color: "#A05030", roughness: 0.9, metalness: 0.0 },     // Brick
  "22": { color: "#908070", roughness: 0.85, metalness: 0.0 },    // Block
  "23": { color: "#A0A090", roughness: 0.95, metalness: 0.0 },    // Stone
  "24": { color: "#A05030", roughness: 0.9, metalness: 0.0 },     // Masonry
  "41": { color: "#B0B8C0", roughness: 0.5, metalness: 0.3 },     // Steel-RC (alternative code)
  "42": { color: "#A8A0A0", roughness: 0.7, metalness: 0.2 },     // SRC (alternative code)
};

export const DEFAULT_MATERIAL: PBRMaterialConfig = {
  color: "#B0C4DE", roughness: 0.7, metalness: 0.1,
};

/** Window material for glass surfaces */
export const WINDOW_MATERIAL: PBRMaterialConfig = {
  color: "#88BBDD", roughness: 0.1, metalness: 0.3,
  transparent: true, opacity: 0.4,
  emissive: "#334455", emissiveIntensity: 0.15,
  visualId: "glass-clear",
};

/** Roof material by type */
export const ROOF_MATERIALS: Record<string, PBRMaterialConfig> = {
  flat: { color: "#808080", roughness: 0.8, metalness: 0.1 },
  gable: { color: "#705040", roughness: 0.7, metalness: 0.0 },
  hip: { color: "#705040", roughness: 0.7, metalness: 0.0 },
};

/** Use type modifiers — applied on top of structure material */
export const USE_TYPE_MODIFIERS: Record<string, Partial<PBRMaterialConfig>> = {
  "02000": { color: "#B8C0C8" },    // Apartment — lighter concrete
  "14000": { color: "#C0C8D0", roughness: 0.3, metalness: 0.5 },  // Office — more glass
  "17000": { color: "#808890", roughness: 0.6, metalness: 0.4 },  // Factory — metal panels
  "18000": { color: "#708090", roughness: 0.6, metalness: 0.3 },  // Warehouse — metal
  "07000": { color: "#C8C0B0" },    // Retail — polished
};

/** Get PBR config for a building */
export function getPBRMaterial(strctCd: string, mainPurpsCd?: string, era?: BuildingEra): PBRMaterialConfig {
  const base = STRUCTURE_MATERIALS[strctCd] || DEFAULT_MATERIAL;
  const useModifier = mainPurpsCd ? USE_TYPE_MODIFIERS[mainPurpsCd] : undefined;

  const result = { ...base };
  if (useModifier) {
    Object.assign(result, useModifier);
  }

  // Modern buildings tend to have more glass/metal
  if (era === "2020+" || era === "2010-2019") {
    result.roughness = Math.max(result.roughness - 0.1, 0.1);
    result.metalness = Math.min(result.metalness + 0.1, 0.8);
  }

  return result;
}

/** Ground floor gets different treatment (entrance, retail) */
export function getGroundFloorMaterial(mainPurpsCd?: string): PBRMaterialConfig {
  if (mainPurpsCd === "07000") { // Retail
    return { color: "#D0C8B8", roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.6 };
  }
  return { color: "#A0A098", roughness: 0.8, metalness: 0.05 };
}

// --- Texture System ---

export interface TextureSet {
  colorMap: string;
  normalMap: string;
  roughnessMap: string;
  repeat: [number, number];
}

/** Maps structure category + era to texture directory name */
const TEXTURE_MAP: Record<string, Record<"old" | "new", string>> = {
  rc:      { old: "concrete_rough", new: "concrete_clean" },
  src:     { old: "concrete_rough", new: "concrete_clean" },
  steel:   { old: "metal_panel",    new: "metal_panel" },
  masonry: { old: "brick",          new: "brick" },
  timber:  { old: "wood",           new: "wood" },
};

const ROOF_TEXTURE_MAP: Record<string, string> = {
  flat:  "roof_flat",
  gable: "roof_tile",
  hip:   "roof_tile",
  other: "roof_tile",
};

/** UV repeat per component type */
const COMPONENT_REPEAT: Record<string, [number, number]> = {
  wall:   [3, 3],
  column: [1, 2],
  slab:   [4, 4],
  roof:   [2, 2],
  ground: [8, 8],
};

function isOldEra(era?: BuildingEra): boolean {
  if (!era) return true;
  return era === "pre-1970" || era === "1970-1989" || era === "1990-1999";
}

function makeTextureSet(dirname: string, repeat: [number, number]): TextureSet {
  return {
    colorMap: `/textures/${dirname}/color.jpg`,
    normalMap: `/textures/${dirname}/normal.jpg`,
    roughnessMap: `/textures/${dirname}/roughness.jpg`,
    repeat,
  };
}

/** Get texture set for a structure code + era + component */
export function getTextureSet(
  strctCd: string,
  era?: BuildingEra,
  component: "wall" | "column" | "slab" | "roof" | "ground" = "wall",
  roofType?: string,
): TextureSet {
  const repeat = COMPONENT_REPEAT[component] || [2, 2];

  if (component === "roof") {
    const dirname = ROOF_TEXTURE_MAP[roofType || "flat"] || "roof_flat";
    return makeTextureSet(dirname, repeat);
  }

  if (component === "slab" || component === "ground") {
    const dirname = isOldEra(era) ? "concrete_rough" : "concrete_clean";
    return makeTextureSet(dirname, repeat);
  }

  const wallKey = STRUCTURE_TO_WALL_KEY[strctCd] || "rc";
  const eraKey = isOldEra(era) ? "old" : "new";
  const mapping = TEXTURE_MAP[wallKey] || TEXTURE_MAP["rc"];
  return makeTextureSet(mapping[eraKey], repeat);
}
