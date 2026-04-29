"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GeometrySource = "procedural" | "vworld-3d";

interface GeometrySourceState {
  source: GeometrySource;
  setSource: (next: GeometrySource) => void;
  toggle: () => void;
}

export const useGeometrySourceStore = create<GeometrySourceState>()(
  persist(
    (set, get) => ({
      source: "procedural",
      setSource: (next) => set({ source: next }),
      toggle: () =>
        set({ source: get().source === "procedural" ? "vworld-3d" : "procedural" }),
    }),
    {
      name: "bim-geometry-source",
    }
  )
);
