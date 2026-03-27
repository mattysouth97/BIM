"use client";

import { create } from "zustand";

/** A single property edit for undo/redo */
export interface ElementEdit {
  elementId: string;
  property: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

export type AuthoringElementType = "wall" | "slab" | "column" | "roof" | "component" | null;
export type TransformMode = "translate" | "rotate" | "scale";

interface AuthoringState {
  selectedElementId: string | null;
  selectedElementType: AuthoringElementType;
  transformMode: TransformMode;
  editHistory: ElementEdit[];
  redoHistory: ElementEdit[];
  isAuthoring: boolean;

  selectElement: (id: string | null, type: AuthoringElementType) => void;
  setTransformMode: (mode: TransformMode) => void;
  pushEdit: (edit: ElementEdit) => void;
  undo: () => ElementEdit | undefined;
  redo: () => ElementEdit | undefined;
  toggleAuthoring: () => void;
  clearSelection: () => void;
}

export const useAuthoringStore = create<AuthoringState>()((set, get) => ({
  selectedElementId: null,
  selectedElementType: null,
  transformMode: "translate",
  editHistory: [],
  redoHistory: [],
  isAuthoring: false,

  selectElement: (id, type) =>
    set({ selectedElementId: id, selectedElementType: type }),

  setTransformMode: (mode) => set({ transformMode: mode }),

  pushEdit: (edit) =>
    set((state) => ({
      editHistory: [...state.editHistory, edit],
      redoHistory: [], // clear redo on new edit
    })),

  undo: () => {
    const { editHistory, redoHistory } = get();
    if (editHistory.length === 0) return undefined;
    const last = editHistory[editHistory.length - 1];
    set({
      editHistory: editHistory.slice(0, -1),
      redoHistory: [...redoHistory, last],
    });
    return last;
  },

  redo: () => {
    const { editHistory, redoHistory } = get();
    if (redoHistory.length === 0) return undefined;
    const last = redoHistory[redoHistory.length - 1];
    set({
      redoHistory: redoHistory.slice(0, -1),
      editHistory: [...editHistory, last],
    });
    return last;
  },

  toggleAuthoring: () =>
    set((state) => ({
      isAuthoring: !state.isAuthoring,
      // Clear selection when exiting edit mode
      ...(!state.isAuthoring ? {} : { selectedElementId: null, selectedElementType: null }),
    })),

  clearSelection: () =>
    set({ selectedElementId: null, selectedElementType: null }),
}));
