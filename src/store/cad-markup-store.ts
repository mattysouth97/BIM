// src/store/cad-markup-store.ts
// 2D drawing-space markups, keyed by CadDocument id. Local-first via
// idb-keyval; storage is injectable so tests run without IndexedDB.
// NOT the 3D annotation-store — that anchors to BIM elements.

"use client";

import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Vec2 } from "@/lib/cad/doc/types";

export type CadTool = "pan" | "measure" | "note" | "leader" | "cloud" | "select";

export type CadMarkup =
  | { id: string; kind: "note"; position: Vec2; text: string }
  | { id: string; kind: "leader"; from: Vec2; to: Vec2; text: string }
  | { id: string; kind: "cloud"; min: Vec2; max: Vec2 }
  | { id: string; kind: "measure"; a: Vec2; b: Vec2 };

export interface MarkupStorage {
  load(docId: string): Promise<CadMarkup[] | undefined>;
  save(docId: string, markups: CadMarkup[]): Promise<void>;
}

const IDB_PREFIX = "cad-markups:";

const idbStorage: MarkupStorage = {
  load: (docId) => idbGet<CadMarkup[]>(`${IDB_PREFIX}${docId}`),
  save: (docId, markups) => idbSet(`${IDB_PREFIX}${docId}`, markups),
};

interface CadMarkupState {
  docId: string | null;
  markups: CadMarkup[];
  tool: CadTool;
  addMarkup: (m: CadMarkup) => void;
  updateMarkup: (id: string, patch: Partial<CadMarkup>) => void;
  removeMarkup: (id: string) => void;
  clearAll: () => void;
  setTool: (tool: CadTool) => void;
  /** Switches document context and hydrates its markups asynchronously. */
  loadForDocument: (docId: string) => void;
  /** Test seam. */
  _setStorage: (s: MarkupStorage) => void;
}

let storage: MarkupStorage = idbStorage;

export const useCadMarkupStore = create<CadMarkupState>()((set, get) => {
  const persist = () => {
    const { docId, markups } = get();
    if (docId) void storage.save(docId, markups).catch(() => {});
  };
  return {
    docId: null,
    markups: [],
    tool: "pan",
    addMarkup: (m) => { set((s) => ({ markups: [...s.markups, m] })); persist(); },
    updateMarkup: (id, patch) => {
      set((s) => ({
        markups: s.markups.map((m) =>
          m.id === id ? ({ ...m, ...patch } as CadMarkup) : m,
        ),
      }));
      persist();
    },
    removeMarkup: (id) => {
      set((s) => ({ markups: s.markups.filter((m) => m.id !== id) }));
      persist();
    },
    clearAll: () => { set({ markups: [] }); persist(); },
    setTool: (tool) => set({ tool }),
    loadForDocument: (docId) => {
      set({ docId, markups: [] });
      void storage.load(docId).then((loaded) => {
        // Guard against a doc switch racing the async load.
        if (loaded && get().docId === docId) set({ markups: loaded });
      }).catch(() => {});
    },
    _setStorage: (s) => { storage = s; },
  };
});
