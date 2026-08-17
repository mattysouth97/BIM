"use client";

import { create } from "zustand";
import { versionedMigrate } from "./persist-migrate";
import { persist } from "zustand/middleware";
import type { LayerId, MepSubLayerId } from "@/lib/layers/types";
import { ALL_LAYER_IDS, MEP_SUB_IDS } from "@/lib/layers/types";
import type { AnalysisOverlayId } from "@/lib/layers/analysis/overlay-types";
import { ANALYSIS_OVERLAY_IDS } from "@/lib/layers/analysis/overlay-types";

interface LayerState {
  /** Visibility toggle per layer — envelope + structure on; diagnostics off */
  visibility: Record<LayerId, boolean>;

  /**
   * P2-22 — structural isolation view (Revit structural-discipline analog):
   * load-bearing elements render solid, everything else ghosts to
   * transparent gray (Solibri/xeokit x-ray convention). Session-only.
   */
  structuralIsolation: boolean;
  toggleStructuralIsolation: () => void;

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

  /** Animated airflow effect inside the HVAC sub-layer. */
  airflowVisible: boolean;

  /** Toggle only the airflow effect, leaving HVAC equipment visible. */
  toggleAirflow: () => void;

  /** Set airflow visibility explicitly. */
  setAirflowVisible: (visible: boolean) => void;

  /** Toggle a single MEP sub-layer's visibility */
  toggleMepSub: (id: MepSubLayerId) => void;

  /** Set a single MEP sub-layer's visibility explicitly */
  setMepSubVisible: (id: MepSubLayerId, visible: boolean) => void;

  /**
   * Analysis overlays (외피 열손실 / 구조 분리 / 에너지존). Separate from
   * `visibility` because these are physics/BIM read-outs drawn ON TOP of the
   * twin, not the twin's own envelope and structure geometry. Off by default —
   * an analysis x-ray should be opted into.
   */
  analysisOverlays: Record<AnalysisOverlayId, boolean>;

  /** Toggle one analysis overlay. */
  toggleAnalysisOverlay: (id: AnalysisOverlayId) => void;

  /** Set one analysis overlay's visibility explicitly. */
  setAnalysisOverlayVisible: (id: AnalysisOverlayId, visible: boolean) => void;

  /**
   * 내부 요소 — the SOLVED interior (partitions, hosted doors/windows, stairs,
   * guards) from `src/lib/interior`, drawn inside the massing shell. Not a
   * LayerId: LayerManager's five groups are recipe generators, and this layer
   * is snapshot-driven.
   *
   * OFF by default, and the default belongs to the WORKSPACE viewport: its
   * massing shell is opaque, so an interior nobody asked for is geometry that
   * cannot be seen and shadow work that is still paid for. The studio viewport
   * mounts `InteriorLayer` with an explicit `enabled` prop instead of reading
   * this — showing the solve is the whole point of that canvas, and it has no
   * layer panel to switch the toggle back on with. One field, two mount-site
   * defaults; a second field would let the two viewports disagree about what is
   * really one user preference.
   */
  interiorVisible: boolean;
  toggleInterior: () => void;
  setInteriorVisible: (visible: boolean) => void;

  /**
   * Include the envelope walls (and the windows hosted on them) in the interior
   * layer. Off by default: the procedural massing shell already draws the
   * facade, and drawing it twice z-fights. Governs walls and their openings
   * together — the interior never draws a window without the wall it punches.
   */
  interiorIncludeExterior: boolean;
  toggleInteriorIncludeExterior: () => void;
}

function buildDefault<T>(value: T): Record<LayerId, T> {
  return Object.fromEntries(ALL_LAYER_IDS.map((id) => [id, value])) as Record<LayerId, T>;
}

const defaultVisibility: Record<LayerId, boolean> = {
  envelope: true,
  structure: true,
  mep: false,
  "energy-zones": false,
  "retrofit-targets": false,
};
const defaultGenerated = buildDefault(false);
const defaultDensity = buildDefault(50);

const defaultMepSubVisibility = Object.fromEntries(
  MEP_SUB_IDS.map((id) => [id, true])
) as Record<MepSubLayerId, boolean>;

const defaultAnalysisOverlays = Object.fromEntries(
  ANALYSIS_OVERLAY_IDS.map((id) => [id, false])
) as Record<AnalysisOverlayId, boolean>;

export const INTERIOR_LAYER_META = {
  name: "Interior",
  nameKo: "내부 요소",
  color: "#c4a574",
  description: "Solved walls, doors, windows, and stairs",
  descriptionKo: "해석된 벽·문·창·계단",
} as const;

export const useLayerStore = create<LayerState>()(
  persist(
    (set) => ({
      visibility: { ...defaultVisibility },
      generated: { ...defaultGenerated },
      density: { ...defaultDensity },

      structuralIsolation: false,
      toggleStructuralIsolation: () =>
        set((state) => ({ structuralIsolation: !state.structuralIsolation })),

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
          airflowVisible: true,
          structuralIsolation: false,
          analysisOverlays: { ...defaultAnalysisOverlays },
          interiorVisible: false,
          interiorIncludeExterior: false,
        }),

      interiorVisible: false,
      toggleInterior: () =>
        set((state) => ({ interiorVisible: !state.interiorVisible })),
      setInteriorVisible: (visible) => set({ interiorVisible: visible }),

      interiorIncludeExterior: false,
      toggleInteriorIncludeExterior: () =>
        set((state) => ({
          interiorIncludeExterior: !state.interiorIncludeExterior,
        })),

      analysisOverlays: { ...defaultAnalysisOverlays },

      toggleAnalysisOverlay: (id) =>
        set((state) => ({
          analysisOverlays: {
            ...state.analysisOverlays,
            [id]: !state.analysisOverlays[id],
          },
        })),

      setAnalysisOverlayVisible: (id, visible) =>
        set((state) => ({
          analysisOverlays: { ...state.analysisOverlays, [id]: visible },
        })),

      mepSubVisibility: { ...defaultMepSubVisibility },
      airflowVisible: true,

      toggleAirflow: () =>
        set((state) => ({ airflowVisible: !state.airflowVisible })),

      setAirflowVisible: (visible) => set({ airflowVisible: visible }),

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
      version: 1, // P2-07: initial version stamp
      migrate: versionedMigrate,
      partialize: (s) => ({
        mepSubVisibility: s.mepSubVisibility,
        airflowVisible: s.airflowVisible,
        analysisOverlays: s.analysisOverlays,
        interiorVisible: s.interiorVisible,
        interiorIncludeExterior: s.interiorIncludeExterior,
      }),
      // Deep-merge persisted sub-visibility OVER the defaults so newly added
      // sub-layer ids (absent from older persisted snapshots) fall back to
      // visible instead of undefined (= hidden + unhoverable).
      merge: (persisted, current) => {
        const p = persisted as Partial<LayerState> | undefined;
        return {
          ...current,
          ...p,
          interiorVisible: p?.interiorVisible ?? current.interiorVisible,
          interiorIncludeExterior:
            p?.interiorIncludeExterior ?? current.interiorIncludeExterior,
          mepSubVisibility: {
            ...defaultMepSubVisibility,
            ...(p?.mepSubVisibility ?? {}),
          },
          analysisOverlays: {
            ...defaultAnalysisOverlays,
            ...(p?.analysisOverlays ?? {}),
          },
        };
      },
    }
  )
);
