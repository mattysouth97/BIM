"use client";

import { create } from "zustand";
import { versionedMigrate } from "./persist-migrate";
import { persist } from "zustand/middleware";
import type {
  AnnotationInstance,
  ElementId,
} from "@/lib/bim/annotations/annotation-types";

// Re-export types so consumers can import from one place
export type {
  AnnotationInstance,
  AnnotationKind,
  ElementId,
  DimensionAnnotation,
  AreaLabelAnnotation,
  LevelMarkerAnnotation,
  SectionPlaneAnnotation,
  DimensionParams,
  AreaLabelParams,
  LevelMarkerParams,
  SectionPlaneParams,
} from "@/lib/bim/annotations/annotation-types";

// ── Store shape ───────────────────────────────────────────────────────────────

interface AnnotationState {
  /** All active annotation instances */
  annotations: AnnotationInstance[];

  /** ID of the currently selected annotation, or null */
  selectedAnnotationId: string | null;

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Add a new annotation (full AnnotationInstance required — caller supplies id + createdAt) */
  addAnnotation: (anno: AnnotationInstance) => void;

  /** Remove an annotation by ID */
  removeAnnotation: (id: string) => void;

  /** Partially update an annotation's params or top-level fields */
  updateAnnotation: (id: string, patch: Partial<Omit<AnnotationInstance, "id" | "kind">>) => void;

  /** Remove all annotations */
  clearAll: () => void;

  /** Remove all annotations whose anchorElementId matches the given element */
  removeByAnchor: (elementId: ElementId | string) => void;

  /** Select an annotation (pass null to deselect) */
  selectAnnotation: (id: string | null) => void;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set) => ({
      annotations: [],
      selectedAnnotationId: null,

      addAnnotation: (anno) =>
        set((state) => ({
          annotations: [...state.annotations, anno],
        })),

      removeAnnotation: (id) =>
        set((state) => ({
          annotations: state.annotations.filter((a) => a.id !== id),
          selectedAnnotationId:
            state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
        })),

      updateAnnotation: (id, patch) =>
        set((state) => ({
          annotations: state.annotations.map((a) =>
            a.id === id ? ({ ...a, ...patch } as AnnotationInstance) : a
          ),
        })),

      clearAll: () =>
        set({ annotations: [], selectedAnnotationId: null }),

      removeByAnchor: (elementId) =>
        set((state) => {
          const removed = new Set(
            state.annotations
              .filter((a) => a.anchorElementId === elementId)
              .map((a) => a.id)
          );
          return {
            annotations: state.annotations.filter((a) => !removed.has(a.id)),
            selectedAnnotationId:
              state.selectedAnnotationId && removed.has(state.selectedAnnotationId)
                ? null
                : state.selectedAnnotationId,
          };
        }),

      selectAnnotation: (id) => set({ selectedAnnotationId: id }),
    }),
    {
      name: "bim-annotation-store",
      version: 1, // P2-07: initial version stamp
      migrate: versionedMigrate,
      // Only persist the annotations array — UI selection state is ephemeral
      partialize: (state) => ({
        annotations: state.annotations,
      }),
    }
  )
);
