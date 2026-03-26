"use client";

import { create } from "zustand";
import type { LayerId } from "@/lib/layers/types";

interface LayerState {
  /** Visibility toggle per layer — only layer 1 visible by default */
  visibility: Record<LayerId, boolean>;

  /** Whether a layer has been generated (lazy generation tracking) */
  generated: Record<LayerId, boolean>;

  /** Toggle a layer's visibility */
  toggleLayer: (id: LayerId) => void;

  /** Set a layer's visibility explicitly */
  setLayerVisible: (id: LayerId, visible: boolean) => void;

  /** Mark a layer as generated */
  setGenerated: (id: LayerId) => void;

  /** Reset all layers to default state */
  resetAll: () => void;
}

const defaultVisibility: Record<LayerId, boolean> = {
  1: true,
  2: false,
  3: false,
  4: false,
  5: false,
  6: false,
  7: false,
  8: false,
  9: false,
  10: false,
};

const defaultGenerated: Record<LayerId, boolean> = {
  1: false,
  2: false,
  3: false,
  4: false,
  5: false,
  6: false,
  7: false,
  8: false,
  9: false,
  10: false,
};

export const useLayerStore = create<LayerState>()((set) => ({
  visibility: { ...defaultVisibility },
  generated: { ...defaultGenerated },

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

  resetAll: () =>
    set({
      visibility: { ...defaultVisibility },
      generated: { ...defaultGenerated },
    }),
}));
