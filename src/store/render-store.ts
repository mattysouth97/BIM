"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versionedMigrate } from "./persist-migrate";
import type {
  CameraPresetId,
  QualityTier,
  RenderMode,
  TimeOfDayPreset,
  WeatherPreset,
} from "@/lib/rendering/types";
import { setRenderRuntime } from "@/lib/rendering/runtime";

interface RenderState {
  mode: RenderMode;
  quality: QualityTier;
  timeOfDay: TimeOfDayPreset;
  weather: WeatherPreset;
  cameraPreset: CameraPresetId;
  setMode: (mode: RenderMode) => void;
  setQuality: (quality: QualityTier) => void;
  setTimeOfDay: (timeOfDay: TimeOfDayPreset) => void;
  setWeather: (weather: WeatherPreset) => void;
  setCameraPreset: (cameraPreset: CameraPresetId) => void;
}

const defaults = {
  mode: "realistic" as RenderMode,
  quality: "high" as QualityTier,
  timeOfDay: "12:00" as TimeOfDayPreset,
  weather: "clear" as WeatherPreset,
  cameraPreset: "architectural-exterior" as CameraPresetId,
};

function pushRuntime(s: Pick<RenderState, "mode" | "quality" | "timeOfDay" | "weather">) {
  setRenderRuntime({
    mode: s.mode,
    quality: s.quality,
    timeOfDay: s.timeOfDay,
    weather: s.weather,
    wetness: s.weather === "rain" ? 0.65 : 0,
  });
}

export const useRenderStore = create<RenderState>()(
  persist(
    (set, get) => ({
      ...defaults,
      setMode: (mode) => {
        set({ mode });
        pushRuntime(get());
      },
      setQuality: (quality) => {
        set({ quality });
        pushRuntime(get());
      },
      setTimeOfDay: (timeOfDay) => {
        set({ timeOfDay });
        pushRuntime(get());
      },
      setWeather: (weather) => {
        set({ weather });
        pushRuntime(get());
      },
      setCameraPreset: (cameraPreset) => set({ cameraPreset }),
    }),
    {
      name: "bim-render-settings",
      version: 1,
      migrate: versionedMigrate,
      partialize: (s) => ({
        mode: s.mode,
        quality: s.quality,
        timeOfDay: s.timeOfDay,
        weather: s.weather,
        cameraPreset: s.cameraPreset,
      }),
    },
  ),
);

pushRuntime(useRenderStore.getState());
