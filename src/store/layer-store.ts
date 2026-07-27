"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayerId, MepSubLayerId } from "@/lib/layers/types";
import { ALL_LAYER_IDS, MEP_SUB_IDS } from "@/lib/layers/types";

interface LayerState {
  /** Visibility toggle per layer — all layers visible by default */
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

  /** Visibility toggle per MEP sub-layer — all sub-layers visible by default */
  mepSubVisibility: Record<MepSubLayerId, boolean>;

  /** Toggle a single MEP sub-layer's visibility */
  toggleMepSub: (id: MepSubLayerId) => void;

  /** Set a single MEP sub-layer's visibility explicitly */
  setMepSubVisible: (id: MepSubLayerId, visible: boolean) => void;
}

function buildDefault<T>(value: T): Record<LayerId, T> {
  return Object.fromEntries(ALL_LAYER_IDS.map((id) => [id, value])) as Record<LayerId, T>;
}

const defaultVisibility = buildDefault(true);
const defaultGenerated = buildDefault(false);
const defaultDensity = buildDefault(50);

const defaultMepSubVisibility = Object.fromEntries(
  MEP_SUB_IDS.map((id) => [id, true])
) as Record<MepSubLayerId, boolean>;

export const useLayerStore = create<LayerState>()(
  persist(
    (set) => ({
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
          mepSubVisibility: { ...defaultMepSubVisibility },
        }),

      mepSubVisibility: { ...defaultMepSubVisibility },

      toggleMepSub: (id) =>
        set((state) => ({
          mepSubVisibility: {
            ...state.mepSubVisibility,
            [id]: !state.mepSubVisibility[id],
          },
        })),

      setMepSubVisible: (id, visible) =>
        set((state) => ({
          mepSubVisibility: { ...state.mepSubVisibility, [id]: visible },
        })),
    }),
    {
      name: "bim-layer-store",
      partialize: (s) => ({
        mepSubVisibility: s.mepSubVisibility,
      }),
      // Deep-merge persisted sub-visibility OVER the defaults so newly added
      // sub-layer ids (absent from older persisted snapshots) fall back to
      // visible instead of undefined (= hidden + unhoverable).
      merge: (persisted, current) => {
        const p = persisted as Partial<LayerState> | undefined;
        return {
          ...current,
          ...p,
          mepSubVisibility: {
            ...defaultMepSubVisibility,
            ...(p?.mepSubVisibility ?? {}),
          },
        };
      },
    }
  )
);
