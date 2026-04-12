"use client";

// src/lib/bim/sheets/sheet-store.ts
// Zustand store for sheet definitions with persistence.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SheetDefinition, ViewportBlock } from "./sheet-types";

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface SheetState {
  /** All sheets in the project. */
  sheets: SheetDefinition[];
  /** Currently active sheet ID, or null when no sheet is selected. */
  activeSheetId: string | null;

  // --- Sheet CRUD ---

  /** Add a new sheet. If it is the first sheet it becomes the active sheet. */
  addSheet: (sheet: SheetDefinition) => void;
  /** Remove a sheet by ID. If it was active, clears activeSheetId. */
  removeSheet: (id: string) => void;
  /** Replace an existing sheet definition (matched by id). No-op if not found. */
  updateSheet: (id: string, patch: Partial<Omit<SheetDefinition, "id">>) => void;

  // --- Active sheet ---

  /** Set the active sheet. */
  setActiveSheet: (id: string | null) => void;

  // --- Viewport CRUD ---

  /** Append a viewport to a sheet. */
  addViewport: (sheetId: string, viewport: ViewportBlock) => void;
  /** Remove a viewport from a sheet by viewport ID. */
  removeViewport: (sheetId: string, viewportId: string) => void;
  /** Update fields of an existing viewport. */
  updateViewport: (sheetId: string, viewportId: string, patch: Partial<Omit<ViewportBlock, "id">>) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useSheetStore = create<SheetState>()(
  persist(
    (set, get) => ({
      sheets: [],
      activeSheetId: null,

      // --- Sheet CRUD ---

      addSheet: (sheet) =>
        set((state) => {
          const isFirst = state.sheets.length === 0;
          return {
            sheets: [...state.sheets, sheet],
            activeSheetId: isFirst ? sheet.id : state.activeSheetId,
          };
        }),

      removeSheet: (id) =>
        set((state) => ({
          sheets: state.sheets.filter((s) => s.id !== id),
          activeSheetId: state.activeSheetId === id ? null : state.activeSheetId,
        })),

      updateSheet: (id, patch) =>
        set((state) => ({
          sheets: state.sheets.map((s) =>
            s.id === id ? { ...s, ...patch } : s
          ),
        })),

      // --- Active sheet ---

      setActiveSheet: (id) => set({ activeSheetId: id }),

      // --- Viewport CRUD ---

      addViewport: (sheetId, viewport) =>
        set((state) => ({
          sheets: state.sheets.map((s) =>
            s.id === sheetId
              ? { ...s, viewports: [...s.viewports, viewport] }
              : s
          ),
        })),

      removeViewport: (sheetId, viewportId) =>
        set((state) => ({
          sheets: state.sheets.map((s) =>
            s.id === sheetId
              ? { ...s, viewports: s.viewports.filter((v) => v.id !== viewportId) }
              : s
          ),
        })),

      updateViewport: (sheetId, viewportId, patch) =>
        set((state) => ({
          sheets: state.sheets.map((s) =>
            s.id === sheetId
              ? {
                  ...s,
                  viewports: s.viewports.map((v) =>
                    v.id === viewportId ? { ...v, ...patch } : v
                  ),
                }
              : s
          ),
        })),
    }),
    {
      name: "bim-sheet-store",
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Returns the currently active SheetDefinition, or undefined. */
export function selectActiveSheet(state: SheetState): SheetDefinition | undefined {
  return state.sheets.find((s) => s.id === state.activeSheetId);
}
