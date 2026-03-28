"use client";

import { create } from "zustand";
import type { LayerId } from "@/lib/layers/types";

interface LayerState {
  /** Visibility toggle per layer — only layer 1 visible by default */
  visibility: Record<LayerId, boolean>;

  /** Whether a layer has been generated (lazy generation tracking) */
  generated: Record<LayerId, boolean>;

  /** Density per layer (0-100), controls element counts in generators */
  density: Record<LayerId, number>;

  /** Toggle a layer's visibility */
  toggleLayer: (id: LayerId) => void;

  /** Set a layer's visibility explicitly */
  setLayerVisible: (id: LayerId, visible: boolean) => void;

  /** Mark a layer as generated */
  setGenerated: (id: LayerId) => void;

  /** Set density for a layer (0-100) */
  setDensity: (id: LayerId, value: number) => void;

  /** Reset all layers to default state */
  resetAll: () => void;
}

const defaultVisibility: Record<LayerId, boolean> = {
  1: true, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false,
  8: false, 9: false, 10: false, 11: false, 12: false, 13: false, 14: false,
  15: false,
};

const defaultGenerated: Record<LayerId, boolean> = {
  1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false,
  8: false, 9: false, 10: false, 11: false, 12: false, 13: false, 14: false,
  15: false,
};

const defaultDensity: Record<LayerId, number> = {
  1: 50, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 50,
  8: 50, 9: 50, 10: 50, 11: 50, 12: 50, 13: 50, 14: 50,
  15: 50,
};

export const useLayerStore = create<LayerState>()((set) => ({
  visibility: { ...defaultVisibility },
  generated: { ...defaultGenerated },
  density: { ...defaultDensity },

  toggleLayer: (id) =>
    set((state) => ({
      visibility: { ...state.visibility, [id]: !state.visibility[id] },
    })),

  setLayerVisible: (id, visible) =>
    set((state) => ({
      visibility: { ...state.visibility, [id]: visible },
    })),

  setGenerated: (id) =>
    set((state) => ({
      generated: { ...state.generated, [id]: true },
    })),

  setDensity: (id, value) =>
    set((state) => ({
      density: { ...state.density, [id]: value },
    })),

  resetAll: () =>
    set({
      visibility: { ...defaultVisibility },
      generated: { ...defaultGenerated },
      density: { ...defaultDensity },
    }),
}));
