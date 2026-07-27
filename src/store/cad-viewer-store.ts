// src/store/cad-viewer-store.ts
// Holds the CadDocument currently open in the full-screen CAD viewer plus
// per-session layer visibility. Opening seeds visibility from the DXF layer
// table; closing drops the document (markups persist separately).

"use client";

import { create } from "zustand";
import type { CadDocument } from "@/lib/cad/doc/types";

interface CadViewerState {
  doc: CadDocument | null;
  layerVisibility: Record<string, boolean>;
  openViewer: (doc: CadDocument) => void;
  closeViewer: () => void;
  toggleLayer: (name: string) => void;
  setAllLayers: (visible: boolean) => void;
}

export const useCadViewerStore = create<CadViewerState>()((set) => ({
  doc: null,
  layerVisibility: {},
  openViewer: (doc) =>
    set({
      doc,
      layerVisibility: Object.fromEntries(doc.layers.map((l) => [l.name, l.visible])),
    }),
  closeViewer: () => set({ doc: null, layerVisibility: {} }),
  toggleLayer: (name) =>
    set((s) => ({ layerVisibility: { ...s.layerVisibility, [name]: !s.layerVisibility[name] } })),
  setAllLayers: (visible) =>
    set((s) => ({
      layerVisibility: Object.fromEntries(Object.keys(s.layerVisibility).map((k) => [k, visible])),
    })),
}));
