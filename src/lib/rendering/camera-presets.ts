// src/lib/rendering/camera-presets.ts
// Architectural camera pack. FOV is vertical, Three.js convention.

import type { CameraPresetId } from "./types";

export interface CameraPreset {
  id: CameraPresetId;
  nameKo: string;
  nameEn: string;
  fov: number;
  near: number;
  farScale: number;
  /** Height of the orbit target as a fraction of building height. */
  targetHeightFactor: number;
  /** Camera distance as a multiple of the building's largest extent. */
  distanceFactor: number;
  /** Extra elevation of the camera as a fraction of building height. */
  eyeHeightFactor: number;
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  "human-eye": {
    id: "human-eye",
    nameKo: "사람 눈",
    nameEn: "Human eye",
    fov: 50,
    near: 0.12,
    farScale: 12,
    targetHeightFactor: 0.18,
    distanceFactor: 1.15,
    eyeHeightFactor: 0.08,
  },
  street: {
    id: "street",
    nameKo: "가로",
    nameEn: "Street view",
    fov: 45,
    near: 0.12,
    farScale: 14,
    targetHeightFactor: 0.12,
    distanceFactor: 1.35,
    eyeHeightFactor: 0.05,
  },
  "architectural-exterior": {
    id: "architectural-exterior",
    nameKo: "건축 외관",
    nameEn: "Architectural exterior",
    fov: 35,
    near: 0.2,
    farScale: 16,
    targetHeightFactor: 0.45,
    distanceFactor: 2.1,
    eyeHeightFactor: 0.35,
  },
  interior: {
    id: "interior",
    nameKo: "실내",
    nameEn: "Interior",
    fov: 55,
    near: 0.08,
    farScale: 8,
    targetHeightFactor: 0.35,
    distanceFactor: 0.45,
    eyeHeightFactor: 0.28,
  },
  "birds-eye": {
    id: "birds-eye",
    nameKo: "조감",
    nameEn: "Bird's eye",
    fov: 40,
    near: 0.5,
    farScale: 22,
    targetHeightFactor: 0.2,
    distanceFactor: 3.2,
    eyeHeightFactor: 2.4,
  },
  "urban-planning": {
    id: "urban-planning",
    nameKo: "도시계획",
    nameEn: "Urban planning",
    fov: 42,
    near: 1,
    farScale: 28,
    targetHeightFactor: 0,
    distanceFactor: 4.4,
    eyeHeightFactor: 3.6,
  },
  "technical-bim": {
    id: "technical-bim",
    nameKo: "기술 BIM",
    nameEn: "Technical BIM",
    fov: 35,
    near: 0.1,
    farScale: 10,
    targetHeightFactor: 0.5,
    distanceFactor: 2.3,
    eyeHeightFactor: 0.55,
  },
  presentation: {
    id: "presentation",
    nameKo: "프레젠테이션",
    nameEn: "Presentation",
    fov: 32,
    near: 0.25,
    farScale: 18,
    targetHeightFactor: 0.38,
    distanceFactor: 2.0,
    eyeHeightFactor: 0.28,
  },
};

export function getCameraPreset(id: CameraPresetId): CameraPreset {
  return CAMERA_PRESETS[id];
}
