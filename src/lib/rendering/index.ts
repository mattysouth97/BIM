export type {
  ArchitecturalMaterialContext,
  CameraPresetId,
  MaterialFamily,
  QualityTier,
  RenderMode,
  SurfaceRole,
  TimeOfDayPreset,
  VisualMaterialId,
  VisualMaterialSpec,
  WeatherPreset,
} from "./types";

export { MATERIAL_ONTOLOGY, familyOf, getOntologyNode } from "./material-ontology";
export { MATERIAL_LIBRARY, getVisualMaterial, tryGetVisualMaterial } from "./material-library";
export { resolveVisualMaterial, resolveVisualMaterialId } from "./bim-material-mapping";
export {
  clampAlbedoHex,
  clampIor,
  clampMetalness,
  clampRoughness,
  isCadBlueGlass,
} from "./pbr-standards";
export { CAMERA_PRESETS, getCameraPreset } from "./camera-presets";
export { effectiveBudget, getQualityBudget } from "./quality-tiers";
export { SEOUL_WGS84, computeSunAngles, dateForPreset, evaluateSun, sunDirectionFromAngles } from "./solar";
export { getRenderRuntime, isRealisticMode, setRenderRuntime } from "./runtime";
export { createArchitecturalMaterial } from "./architectural-material";
export { materialContextFromRecipe } from "./material-context";
export { hashString01 } from "./hash";
