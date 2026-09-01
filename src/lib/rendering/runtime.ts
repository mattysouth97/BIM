// src/lib/rendering/runtime.ts
// Process-local snapshot of render settings so pure Three.js generators
// (no React) can read the active mode without importing the Zustand store.

import type {
  QualityTier,
  RenderMode,
  TimeOfDayPreset,
  WeatherPreset,
} from "./types";
import { effectiveBudget } from "./quality-tiers";

export interface RenderRuntime {
  mode: RenderMode;
  quality: QualityTier;
  timeOfDay: TimeOfDayPreset;
  weather: WeatherPreset;
  wetness: number;
}

export const DEFAULT_RENDER_RUNTIME: RenderRuntime = {
  mode: "realistic",
  quality: "high",
  timeOfDay: "12:00",
  weather: "clear",
  wetness: 0,
};

let runtime: RenderRuntime = { ...DEFAULT_RENDER_RUNTIME };

export function getRenderRuntime(): RenderRuntime {
  return runtime;
}

export function setRenderRuntime(next: Partial<RenderRuntime>): RenderRuntime {
  const weather = next.weather ?? runtime.weather;
  const wetness =
    next.wetness ?? (weather === "rain" ? 0.65 : next.weather !== undefined ? 0 : runtime.wetness);
  runtime = { ...runtime, ...next, wetness };
  return runtime;
}

export function isRealisticMode(mode: RenderMode = runtime.mode): boolean {
  return mode === "realistic" || mode === "hyperreal";
}

export function currentBudget() {
  return effectiveBudget(runtime.mode, runtime.quality);
}
