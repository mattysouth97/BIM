"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useActiveBuildingStore } from "./active-building-store";
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

/**
 * P2-16 — every annotation is stamped with the building it was authored on.
 * `buildingPk: null` marks pre-v2 legacy annotations whose building is
 * unknown; they are retained but never attributed to a specific building
 * (attributing them anywhere would re-create the cross-building
 * anchorElementId-collision bug this scoping fixes).
 */
export type ScopedAnnotation = AnnotationInstance & { buildingPk: string | null };

/**
 * Pure selector: the annotations belonging to one building. Strict equality —
 * building A's annotations can never surface on building B's model, and
 * legacy null-scoped annotations only appear while no building is active.
 */
export function annotationsForBuilding(
  annotations: ScopedAnnotation[],
  buildingPk: string | null
): ScopedAnnotation[] {
  return annotations.filter((a) => a.buildingPk === buildingPk);
}

interface AnnotationState {
  /** All annotation instances across all buildings (filter with annotationsForBuilding) */
  annotations: ScopedAnnotation[];

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

      // Stamps the annotation with the active building at authoring time
      // (signature unchanged — callers keep supplying a plain AnnotationInstance).
      addAnnotation: (anno) =>
        set((state) => ({
          annotations: [
            ...state.annotations,
            { ...anno, buildingPk: useActiveBuildingStore.getState().buildingPk },
          ],
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
            a.id === id ? ({ ...a, ...patch } as ScopedAnnotation) : a
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
      version: 2, // P2-16: annotations gained a buildingPk scope
      // v0/v1 payloads carried un-scoped AnnotationInstance[]; stamp them
      // buildingPk: null (unknown building) instead of dropping the data.
      // Unknown future versions fall back to defaults (undefined), matching
      // the shared versionedMigrate policy.
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          const p = persisted as { annotations?: AnnotationInstance[] } | null;
          if (!p || !Array.isArray(p.annotations)) return undefined;
          return {
            annotations: p.annotations.map(
              (a): ScopedAnnotation => ({ ...a, buildingPk: null })
            ),
          };
        }
        return undefined;
      },
      // Only persist the annotations array — UI selection state is ephemeral
      partialize: (state) => ({
        annotations: state.annotations,
      }),
    }
  )
);
