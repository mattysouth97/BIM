"use client";

import { create } from "zustand";
import { versionedMigrate } from "./persist-migrate";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorMode = "navigate" | "floor-edit" | "object-edit" | "properties";

interface EditorModeState {
  currentMode: EditorMode;
  previousMode: EditorMode | null; // for mode toggle — not persisted
  // Keyed by object UUID. Capped at MAX_PER_OBJECT_ENTRIES (LRU-style).
  perObjectModeMemory: Record<string, EditorMode>;

  setMode: (mode: EditorMode) => void;
  // Tab key equivalent — toggles navigate <-> most-recent-edit-mode.
  // If currently in navigate, switch to previousMode || 'floor-edit'.
  // If currently in any edit mode, switch to navigate (recording the edit mode in previousMode).
  toggleEditMode: () => void;
  rememberModeFor: (objectId: string, mode: EditorMode) => void;
  recallModeFor: (objectId: string) => EditorMode | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// LRU cap: keep only the most recent N object-mode associations to prevent
// unbounded growth of the persisted store entry over long sessions.
const MAX_PER_OBJECT_ENTRIES = 50;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEditorModeStore = create<EditorModeState>()(
  persist(
    (set, get) => ({
      currentMode: "navigate",
      previousMode: null,
      perObjectModeMemory: {},

      setMode: (mode) =>
        set((state) => {
          // Record outgoing edit mode so toggleEditMode can return to it
          const previous =
            state.currentMode !== "navigate" ? state.currentMode : state.previousMode;
          return {
            currentMode: mode,
            previousMode: previous,
          };
        }),

      toggleEditMode: () =>
        set((state) => {
          if (state.currentMode === "navigate") {
            // Navigate → most-recent edit mode (or floor-edit as default)
            return {
              currentMode: state.previousMode ?? "floor-edit",
              previousMode: "navigate",
            };
          }
          // Edit mode → navigate, remember current edit mode
          return {
            currentMode: "navigate",
            previousMode: state.currentMode,
          };
        }),

      rememberModeFor: (objectId, mode) =>
        set((state) => {
          const updated = { ...state.perObjectModeMemory, [objectId]: mode };
          const keys = Object.keys(updated);

          // Enforce LRU cap: drop the oldest entries when over limit
          if (keys.length > MAX_PER_OBJECT_ENTRIES) {
            const trimmed: Record<string, EditorMode> = {};
            // Keep the last MAX_PER_OBJECT_ENTRIES keys (most recently added)
            keys.slice(keys.length - MAX_PER_OBJECT_ENTRIES).forEach((k) => {
              trimmed[k] = updated[k];
            });
            return { perObjectModeMemory: trimmed };
          }

          return { perObjectModeMemory: updated };
        }),

      recallModeFor: (objectId) => get().perObjectModeMemory[objectId] ?? null,
    }),
    {
      name: "editor-mode-store",
      version: 1, // P2-07: initial version stamp
      migrate: versionedMigrate,
      // Only persist currentMode and perObjectModeMemory.
      // previousMode is transient — no need to restore across sessions.
      partialize: (state) => ({
        currentMode: state.currentMode,
        perObjectModeMemory: state.perObjectModeMemory,
      }),
    }
  )
);
