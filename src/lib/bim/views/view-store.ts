"use client";

// src/lib/bim/views/view-store.ts
// Zustand store for BIM view management with persistence.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as THREE from "three";
import type { ViewDefinition } from "./view-definition";
import type { FloorGeometry } from "@/lib/building-geometry";
import { computeDefaultViewsForBuilding } from "./view-engine";

// ─── State shape ──────────────────────────────────────────────────────────────

interface ViewState {
  /** All registered views for the current building */
  views: ViewDefinition[];

  /** ID of the currently active view; null = free-camera mode */
  activeViewId: string | null;

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Add a new view (no-op if id already present) */
  addView: (view: ViewDefinition) => void;

  /** Remove a view by id; if it was active, activeViewId is cleared */
  removeView: (id: string) => void;

  /** Set the active view by id (null to return to free camera) */
  setActiveView: (id: string | null) => void;

  /**
   * Populate the store with the full default view set for a building.
   * Any existing auto-generated views (plan-*, elev-*) are replaced.
   * User-created views (section-*, custom ids) are preserved.
   *
   * @param floors  FloorGeometry array from building-geometry.ts
   * @param bbox    Full building bounding box (THREE.Box3)
   */
  initializeDefaultViews: (floors: FloorGeometry[], bbox: THREE.Box3) => void;

  /** Replace all views (used internally and for testing) */
  _setViews: (views: ViewDefinition[]) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      views: [],
      activeViewId: null,

      addView: (view) =>
        set((state) => {
          if (state.views.some((v) => v.id === view.id)) return state;
          return { views: [...state.views, view] };
        }),

      removeView: (id) =>
        set((state) => ({
          views: state.views.filter((v) => v.id !== id),
          activeViewId: state.activeViewId === id ? null : state.activeViewId,
        })),

      setActiveView: (id) => set({ activeViewId: id }),

      initializeDefaultViews: (floors, bbox) => {
        const generated = computeDefaultViewsForBuilding(floors, bbox);

        // Keep user-created views (not plan-* or elev-*)
        const existing = get().views;
        const userViews = existing.filter(
          (v) =>
            !v.id.startsWith("plan-") &&
            !v.id.startsWith("elev-") &&
            !generated.some((g) => g.id === v.id)
        );

        const merged = [...generated, ...userViews];

        set((state) => ({
          views: merged,
          // If the previously active view no longer exists, clear it
          activeViewId:
            state.activeViewId !== null &&
            merged.some((v) => v.id === state.activeViewId)
              ? state.activeViewId
              : null,
        }));
      },

      _setViews: (views) => set({ views }),
    }),
    {
      name: "bim-view-store",
      partialize: (state) => ({
        views: state.views,
        activeViewId: state.activeViewId,
      }),
    }
  )
);
