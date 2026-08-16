"use client";

// src/lib/bim/views/view-store.ts
// Zustand store for BIM view management with persistence.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as THREE from "three";
import type { ViewDefinition } from "./view-definition";
import { computeDefaultViewsForBuilding, type ViewFloorInput } from "./view-engine";

// ─── State shape ──────────────────────────────────────────────────────────────

function isGeneratedViewId(id: string): boolean {
  return (
    id === "3d-iso" ||
    id === "section-long" ||
    id.startsWith("plan-") ||
    id.startsWith("elev-")
  );
}

interface ViewState {
  /** All registered views for the current building */
  views: ViewDefinition[];

  /** ID of the currently active view; null = free-camera mode */
  activeViewId: string | null;

  /** Building these views belong to — regenerated when it changes */
  activeBuildingPk: string | null;

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
   * @param floors  Floor specs (recipe or FloorGeometry)
   * @param bbox    Full building bounding box (THREE.Box3)
   * @param buildingPk  When the pk changes, user views from another twin are dropped
   */
  initializeDefaultViews: (
    floors: ViewFloorInput[],
    bbox: THREE.Box3,
    buildingPk?: string,
  ) => void;

  /** Replace all views (used internally and for testing) */
  _setViews: (views: ViewDefinition[]) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      views: [],
      activeViewId: null,
      activeBuildingPk: null,

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

      initializeDefaultViews: (floors, bbox, buildingPk) => {
        const generated = computeDefaultViewsForBuilding(floors, bbox);
        const sameBuilding =
          buildingPk !== undefined && buildingPk === get().activeBuildingPk;

        const existing = get().views;
        const userViews = sameBuilding
          ? existing.filter(
              (v) =>
                !isGeneratedViewId(v.id) &&
                !generated.some((g) => g.id === v.id),
            )
          : [];

        const merged = [...generated, ...userViews];

        set((state) => ({
          views: merged,
          activeBuildingPk: buildingPk ?? state.activeBuildingPk,
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
        activeViewId: state.activeViewId,
        activeBuildingPk: state.activeBuildingPk,
      }),
    }
  )
);
