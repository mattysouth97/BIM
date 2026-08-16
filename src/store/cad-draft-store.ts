// src/store/cad-draft-store.ts
// Two slices, one hook:
//   1. 2D drafting document (undo/redo, layers, idb persistence) used by the
//      CAD viewer / draw tools. Mutations sync to cad-viewer-store.updateDoc.
//   2. P2-24 CAD-first draft params (floors/year/sigungu), keyed by draft PK.
//      Params are NOT persisted — after reload, WorkflowStageRecovery retreats
//      the draft to upload. Persisting params is a documented v1 non-goal.

"use client";

import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { CadDocument, CadEntity, CadPolyline } from "@/lib/cad/doc/types";
import type { NewEntity } from "@/lib/cad/doc/draw-tools";
import { computeExtents } from "@/lib/cad/doc/extents";
import { joinConnectedEntities } from "@/lib/cad/doc/join";
import type { CadDraftParams } from "@/lib/workflow/cad-draft";
import { useCadViewerStore } from "./cad-viewer-store";

export interface DraftStorage {
  load(key: string): Promise<CadDocument | undefined>;
  save(key: string, doc: CadDocument): Promise<void>;
}

const idbStorage: DraftStorage = {
  load: (key) => idbGet<CadDocument>(key),
  save: (key, doc) => idbSet(key, doc),
};

let storage: DraftStorage = idbStorage;

const UNDO_CAP = 50;

const DEFAULT_LAYER = "DRAFT";

function blankDoc(id: string): CadDocument {
  return {
    id,
    layers: [{ name: DEFAULT_LAYER, colorIndex: 3, visible: true }],
    entities: [],
    unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 20, y: 20 } },
    warnings: [],
    stats: { totalParsed: 0, mapped: 0, skipped: {} },
  };
}

function maxEntityId(doc: CadDocument): number {
  let max = -1;
  for (const e of doc.entities) {
    const m = /^e(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

interface CadDraftState {
  // ── 2D drafting slice ────────────────────────────────────────────────────
  doc: CadDocument | null;
  past: CadDocument[];
  future: CadDocument[];
  activeLayer: string;
  selectedEntityId: string | null;
  persistKey: string | null;
  startDraft: (base: CadDocument, persistKey: string) => void;
  newDrawing: (id: string, persistKey: string) => void;
  loadDraft: (persistKey: string) => Promise<CadDocument | null>;
  addEntity: (e: NewEntity) => void;
  deleteEntity: (id: string) => void;
  /**
   * AutoCAD JOIN: weld connected open linework into polylines.
   * If an entity is selected, only its connected component is joined.
   * Returns any newly closed outlines (ready to use as a footprint).
   */
  joinConnected: () => CadPolyline[];
  addLayer: (name: string, colorIndex?: number) => void;
  setActiveLayer: (name: string) => void;
  selectEntity: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  endDraft: () => void;
  _setStorage: (s: DraftStorage) => void;

  // ── P2-24 cad-first params slice ─────────────────────────────────────────
  /** Draft params keyed by draft PK. Absent key = params stage not completed. */
  drafts: Record<string, CadDraftParams>;
  setDraftParams: (pk: string, params: CadDraftParams) => void;
  clearDraft: (pk: string) => void;
}

let nextId = 0;

export const useCadDraftStore = create<CadDraftState>()((set, get) => {
  /** Commit a mutated doc: push undo snapshot, persist, sync viewer. */
  const commit = (doc: CadDocument) => {
    const { doc: prev, past, persistKey } = get();
    set({
      doc,
      past: prev ? [...past.slice(-(UNDO_CAP - 1)), prev] : past,
      future: [],
    });
    if (persistKey) void storage.save(persistKey, doc).catch(() => {});
    useCadViewerStore.getState().updateDoc(doc);
  };

  const begin = (doc: CadDocument, persistKey: string) => {
    nextId = maxEntityId(doc) + 1;
    set({
      doc, persistKey, past: [], future: [], selectedEntityId: null,
      activeLayer: doc.layers.some((l) => l.name === DEFAULT_LAYER)
        ? DEFAULT_LAYER
        : doc.layers[0]?.name ?? "0",
    });
    useCadViewerStore.getState().updateDoc(doc);
  };

  return {
    doc: null, past: [], future: [],
    activeLayer: "0", selectedEntityId: null, persistKey: null,
    drafts: {},

    startDraft: (base, persistKey) => begin(base, persistKey),

    newDrawing: (id, persistKey) => begin(blankDoc(id), persistKey),

    loadDraft: async (persistKey) => {
      try {
        return (await storage.load(persistKey)) ?? null;
      } catch {
        return null;
      }
    },

    addEntity: (e) => {
      const { doc, activeLayer } = get();
      if (!doc) return;
      const entity = { ...e, id: `e${nextId++}`, layer: activeLayer } as CadEntity;
      const entities = [...doc.entities, entity];
      commit({
        ...doc,
        entities,
        extents: computeExtents(entities),
        stats: { ...doc.stats, mapped: entities.length },
      });
    },

    deleteEntity: (id) => {
      const { doc } = get();
      if (!doc) return;
      const entities = doc.entities.filter((e) => e.id !== id);
      if (entities.length === doc.entities.length) return;
      set({ selectedEntityId: null });
      commit({
        ...doc,
        entities,
        extents: computeExtents(entities),
        stats: { ...doc.stats, mapped: entities.length },
      });
    },

    joinConnected: () => {
      const { doc, selectedEntityId } = get();
      if (!doc) return [];
      const result = joinConnectedEntities(doc.entities, {
        seedIds: selectedEntityId ? [selectedEntityId] : undefined,
      });
      if (!result.changed) return [];
      commit({
        ...doc,
        entities: result.entities,
        extents: computeExtents(result.entities),
        stats: { ...doc.stats, mapped: result.entities.length },
      });
      const keepId = result.closed[0]?.id ?? selectedEntityId;
      if (keepId && result.entities.some((e) => e.id === keepId)) {
        set({ selectedEntityId: keepId });
      }
      return result.closed;
    },

    addLayer: (name, colorIndex = 7) => {
      const { doc } = get();
      if (!doc) return;
      if (doc.layers.some((l) => l.name === name)) {
        set({ activeLayer: name });
        return;
      }
      commit({
        ...doc,
        layers: [...doc.layers, { name, colorIndex, visible: true }],
      });
      set({ activeLayer: name });
    },

    setActiveLayer: (name) => set({ activeLayer: name }),
    selectEntity: (id) => set({ selectedEntityId: id }),

    undo: () => {
      const { doc, past, future, persistKey } = get();
      if (!doc || past.length === 0) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selectedEntityId: null });
      if (persistKey) void storage.save(persistKey, prev).catch(() => {});
      useCadViewerStore.getState().updateDoc(prev);
    },

    redo: () => {
      const { doc, past, future, persistKey } = get();
      if (!doc || future.length === 0) return;
      const next = future[0];
      set({ doc: next, past: [...past, doc], future: future.slice(1), selectedEntityId: null });
      if (persistKey) void storage.save(persistKey, next).catch(() => {});
      useCadViewerStore.getState().updateDoc(next);
    },

    endDraft: () =>
      set({ doc: null, past: [], future: [], selectedEntityId: null, persistKey: null }),

    _setStorage: (s) => { storage = s; },

    setDraftParams: (pk, params) =>
      set((state) => ({ drafts: { ...state.drafts, [pk]: params } })),

    clearDraft: (pk) =>
      set((state) => {
        const { [pk]: _, ...rest } = state.drafts;
        return { drafts: rest };
      }),
  };
});
