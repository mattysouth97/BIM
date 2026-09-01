// src/lib/rendering/types.ts
// Render-engine types. BIM geometry and engineering metadata stay authoritative;
// these describe how that truth is interpreted visually.

export type RenderMode = "bim" | "realistic" | "hyperreal";

export type QualityTier =
  | "performance"
  | "balanced"
  | "high"
  | "ultra"
  | "presentation";

export type TimeOfDayPreset =
  | "08:00"
  | "12:00"
  | "16:00"
  | "golden"
  | "overcast"
  | "night";

export type WeatherPreset = "clear" | "overcast" | "rain" | "fog";

export type CameraPresetId =
  | "human-eye"
  | "street"
  | "architectural-exterior"
  | "interior"
  | "birds-eye"
  | "urban-planning"
  | "technical-bim"
  | "presentation";

export type SurfaceRole =
  | "wall"
  | "glass"
  | "mullion"
  | "slab"
  | "column"
  | "beam"
  | "roof"
  | "parapet"
  | "ground"
  | "pavement"
  | "sidewalk"
  | "foundation"
  | "interior"
  | "vegetation"
  | "neighbor";

export type MaterialFamily =
  | "concrete"
  | "brick"
  | "stone"
  | "metal"
  | "glass"
  | "wood"
  | "roof"
  | "ground"
  | "paint"
  | "vegetation"
  | "water";

export type VisualMaterialId =
  | "concrete-cast"
  | "concrete-precast"
  | "concrete-polished"
  | "concrete-board-formed"
  | "concrete-exposed-aggregate"
  | "concrete-architectural"
  | "brick-red-clay"
  | "brick-brown-clay"
  | "brick-white"
  | "brick-weathered"
  | "brick-glazed"
  | "stone-granite"
  | "stone-limestone"
  | "stone-marble"
  | "stone-sandstone"
  | "stone-slate"
  | "metal-aluminum"
  | "metal-stainless"
  | "metal-galvanized"
  | "metal-painted-steel"
  | "metal-copper"
  | "metal-zinc"
  | "metal-weathering-steel"
  | "glass-clear"
  | "glass-low-e"
  | "glass-tinted"
  | "glass-reflective"
  | "glass-frosted"
  | "glass-laminated"
  | "wood-oak"
  | "wood-pine"
  | "wood-cedar"
  | "wood-engineered"
  | "wood-exterior-weathered"
  | "roof-asphalt"
  | "roof-membrane"
  | "roof-clay-tile"
  | "roof-concrete-tile"
  | "roof-standing-seam"
  | "roof-green"
  | "ground-asphalt"
  | "ground-concrete-pavement"
  | "ground-paver"
  | "ground-gravel"
  | "ground-soil"
  | "ground-grass"
  | "paint-stucco"
  | "interior-cavity";

export interface VisualMaterialSpec {
  id: VisualMaterialId;
  family: MaterialFamily;
  nameKo: string;
  nameEn: string;
  /** sRGB hex. Calibrated dielectric/metal albedo, not a lit photograph. */
  albedo: string;
  roughness: number;
  metalness: number;
  ior: number;
  /** Real-world metres covered by one texture tile (U, V). */
  metersPerTile: readonly [number, number];
  textureSet?: "concrete_clean" | "concrete_rough" | "brick" | "metal_panel" | "wood" | "roof_flat" | "roof_tile";
  stochastic: "offset" | "rotate" | "none";
  weathering: {
    rainStreaks: number;
    groundDirt: number;
    oxidation: number;
    fade: number;
  };
  glass?: {
    opacity: number;
    transmission: number;
    envMapIntensity: number;
  };
  envMapIntensity: number;
  /** 0–1, used as a shader LOD / normal intensity scale. */
  microDetail: number;
}

export interface ArchitecturalMaterialContext {
  seed: number;
  buildingHeight: number;
  era?: string;
  strctCd?: string;
  mainPurpsCd?: string;
  visualId?: string;
}

export interface QualityBudget {
  tier: QualityTier;
  shadowMapSize: number;
  gtao: boolean;
  gtaoSamples: number;
  smaa: boolean;
  contactShadows: boolean;
  weathering: boolean;
  stochastic: boolean;
  triplanar: boolean;
  vegetation: boolean;
  maxPixelRatio: number;
  envFromSky: boolean;
}
