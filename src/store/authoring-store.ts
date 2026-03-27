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
export type AnnotationMode = "none" | "dimension" | "area" | "level" | "section";

/** Stored annotation descriptor */
export interface AnnotationEntry {
  id: string;
  type: AnnotationMode;
  /** Serializable data for recreation (e.g. start/end points, area value) */
  data: Record<string, unknown>;
}

interface AuthoringState {
  selectedElementId: string | null;
  selectedElementType: AuthoringElementType;
  transformMode: TransformMode;
  editHistory: ElementEdit[];
  redoHistory: ElementEdit[];
  isAuthoring: boolean;

  // Annotation state
  annotationMode: AnnotationMode;
  annotations: AnnotationEntry[];
  sectionPosition: number; // 0-1 normalized position along axis
  sectionAxis: "x" | "z";

  selectElement: (id: string | null, type: AuthoringElementType) => void;
  setTransformMode: (mode: TransformMode) => void;
  pushEdit: (edit: ElementEdit) => void;
  undo: () => ElementEdit | undefined;
  redo: () => ElementEdit | undefined;
  toggleAuthoring: () => void;
  clearSelection: () => void;

  // Annotation actions
  setAnnotationMode: (mode: AnnotationMode) => void;
  addAnnotation: (annotation: AnnotationEntry) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  setSectionPosition: (pos: number) => void;
  setSectionAxis: (axis: "x" | "z") => void;
}

export const useAuthoringStore = create<AuthoringState>()((set, get) => ({
  selectedElementId: null,
  selectedElementType: null,
  transformMode: "translate",
  editHistory: [],
  redoHistory: [],
  isAuthoring: false,

  annotationMode: "none",
  annotations: [],
  sectionPosition: 0.5,
  sectionAxis: "x",

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

  setAnnotationMode: (mode) =>
    set({ annotationMode: mode }),

  addAnnotation: (annotation) =>
    set((state) => ({ annotations: [...state.annotations, annotation] })),

  removeAnnotation: (id) =>
    set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) })),

  clearAnnotations: () =>
    set({ annotations: [], annotationMode: "none" }),

  setSectionPosition: (pos) =>
    set({ sectionPosition: pos }),

  setSectionAxis: (axis) =>
    set({ sectionAxis: axis }),
}));
