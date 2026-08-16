"use client";

// Authored BIM instances + type overrides + transaction log.
// Generated elements are always re-hydrated from the twin (not persisted).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { DerivedTwinElements } from "@/lib/bim/derive/twin-elements";
import {
  addDocument,
  beginCommit,
  changeElementType,
  createFloorSketch,
  createWall,
  deleteInstance,
  duplicateType,
  EMPTY_LOG,
  flipHosted,
  hideInView,
  hostOnNearestWall,
  hydrateBimModel,
  lastCommandName,
  placeInstance,
  redo,
  setInstanceParameter,
  setLevelElevation,
  setLevelName,
  setTypeParameter,
  undo,
  type BimDocumentItem,
  type BimElement,
  type BimModelSnapshot,
  type BimParamValue,
  type BimPlacement,
  type BimType,
  type TransactionLog,
  type Xz,
} from "@/lib/bim/model";

interface BuildingBimState {
  authored: BimElement[];
  typeOverrides: Record<string, Partial<BimType>>;
}

interface BimModelState {
  byBuilding: Record<string, BuildingBimState>;
  snapshot: BimModelSnapshot | null;
  log: TransactionLog;
  selectedElementId: string | null;
  activeLevelId: string | null;
  editingTypeId: string | null;

  hydrate: (input: {
    buildingPk: string;
    recipe: BuildingRecipe;
    derived: DerivedTwinElements;
  }) => void;
  selectElement: (id: string | null) => void;
  setActiveLevel: (id: string | null) => void;
  setEditingType: (id: string | null) => void;

  applyTypeParameter: (typeId: string, name: string, value: BimParamValue) => void;
  applyInstanceParameter: (elementId: string, name: string, value: BimParamValue) => void;
  applyChangeType: (elementId: string, typeId: string) => void;
  applyLevelElevation: (levelId: string, elevation: number) => Record<string, { height?: number }> | undefined;
  applyLevelName: (levelId: string, name: string) => void;
  applyPlace: (input: {
    typeId: string;
    buildingPk: string;
    levelId: string | null;
    hostId: string | null;
    placement: BimPlacement;
  }) => string | null;
  applyDelete: (elementId: string) => void;
  applyDuplicateType: (typeId: string, typeName: string) => void;
  applyWall: (input: {
    typeId: string;
    buildingPk: string;
    levelId: string | null;
    start: Xz;
    end: Xz;
    heightM: number;
  }) => string | null;
  applyFloorSketch: (input: {
    typeId: string;
    buildingPk: string;
    levelId: string | null;
    a: Xz;
    b: Xz;
  }) => string | null;
  applyHost: (input: {
    typeId: string;
    buildingPk: string;
    levelId: string | null;
    point: Xz;
    y: number;
  }) => string | null;
  applyFlip: (elementId: string, field: "hand" | "facing") => void;
  applyDocument: (item: BimDocumentItem) => void;
  applyHide: (viewId: string, payload: { elementId?: string; category?: string }) => void;
  undoLast: () => void;
  redoLast: () => void;
}

function emptyBuilding(): BuildingBimState {
  return { authored: [], typeOverrides: {} };
}

function persistAuthored(snapshot: BimModelSnapshot): BuildingBimState {
  return {
    authored: snapshot.elements.filter((el) => el.origin === "authored"),
    typeOverrides: Object.fromEntries(
      Object.entries(snapshot.types)
        .filter(([id]) => id.startsWith("generated-") || id.includes("__copy_"))
        .map(([id, type]) => [id, type]),
    ),
  };
}

function commit(
  name: string,
  before: BimModelSnapshot,
  result: { model: BimModelSnapshot },
  log: TransactionLog,
  byBuilding: Record<string, BuildingBimState>,
) {
  return {
    snapshot: result.model,
    log: beginCommit(log, name, before, result.model),
    byBuilding: {
      ...byBuilding,
      [result.model.buildingPk]: persistAuthored(result.model),
    },
  };
}

export const useBimModelStore = create<BimModelState>()(
  persist(
    (set, get) => ({
      byBuilding: {},
      snapshot: null,
      log: EMPTY_LOG,
      selectedElementId: null,
      activeLevelId: null,
      editingTypeId: null,

      hydrate: ({ buildingPk, recipe, derived }) => {
        const saved = get().byBuilding[buildingPk] ?? emptyBuilding();
        const snapshot = hydrateBimModel({
          buildingPk,
          recipe,
          derived,
          authoredElements: saved.authored,
          typeOverrides: saved.typeOverrides,
        });
        const current = get().snapshot;
        if (
          current &&
          current.buildingPk === buildingPk &&
          current.elements.length === snapshot.elements.length &&
          current.levels.length === snapshot.levels.length
        ) {
          // Keep in-session authored edits; only refresh generated + levels
          const authored = current.elements.filter((el) => el.origin === "authored");
          const generated = snapshot.elements.filter((el) => el.origin === "generated");
          set({
            snapshot: {
              ...snapshot,
              types: { ...snapshot.types, ...current.types },
              elements: [...generated, ...authored],
              documents: current.documents ?? [],
              visibility: current.visibility ?? {},
            },
          });
          return;
        }
        set({
          snapshot,
          activeLevelId: get().activeLevelId ?? snapshot.levels[0]?.id ?? null,
        });
      },

      selectElement: (id) => set({ selectedElementId: id }),
      setActiveLevel: (id) => set({ activeLevelId: id }),
      setEditingType: (id) => set({ editingTypeId: id }),

      applyTypeParameter: (typeId, name, value) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit(`Edit Type ${typeId}`, before, setTypeParameter(before, typeId, name, value), get().log, get().byBuilding));
      },

      applyInstanceParameter: (elementId, name, value) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit("Edit Instance", before, setInstanceParameter(before, elementId, name, value), get().log, get().byBuilding));
      },

      applyChangeType: (elementId, typeId) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit("Change Type", before, changeElementType(before, elementId, typeId), get().log, get().byBuilding));
      },

      applyLevelElevation: (levelId, elevation) => {
        const before = get().snapshot;
        if (!before) return undefined;
        const result = setLevelElevation(before, levelId, elevation);
        set(commit("Move Level", before, result, get().log, get().byBuilding));
        return result.recipeFloorEdits;
      },

      applyLevelName: (levelId, name) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit("Rename Level", before, setLevelName(before, levelId, name), get().log, get().byBuilding));
      },

      applyPlace: (input) => {
        const before = get().snapshot;
        if (!before) return null;
        const result = placeInstance({ model: before, ...input });
        const created = result.model.elements.find(
          (el) => el.origin === "authored" && !before.elements.some((b) => b.id === el.id),
        );
        set({
          ...commit(`Place ${input.typeId}`, before, result, get().log, get().byBuilding),
          selectedElementId: created?.id ?? get().selectedElementId,
        });
        return created?.id ?? null;
      },

      applyDelete: (elementId) => {
        const before = get().snapshot;
        if (!before) return;
        set({
          ...commit("Delete", before, deleteInstance(before, elementId), get().log, get().byBuilding),
          selectedElementId: get().selectedElementId === elementId ? null : get().selectedElementId,
        });
      },

      applyDuplicateType: (typeId, typeName) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit("Duplicate Type", before, duplicateType(before, typeId, typeName), get().log, get().byBuilding));
      },

      applyWall: (input) => {
        const before = get().snapshot;
        if (!before) return null;
        const result = createWall({ model: before, ...input });
        const created = result.model.elements.find(
          (el) => el.origin === "authored" && !before.elements.some((b) => b.id === el.id),
        );
        set({
          ...commit("Create Wall", before, result, get().log, get().byBuilding),
          selectedElementId: created?.id ?? get().selectedElementId,
        });
        return created?.id ?? null;
      },

      applyFloorSketch: (input) => {
        const before = get().snapshot;
        if (!before) return null;
        const result = createFloorSketch({ model: before, ...input });
        const created = result.model.elements.find(
          (el) => el.origin === "authored" && !before.elements.some((b) => b.id === el.id),
        );
        set({
          ...commit("Create Floor", before, result, get().log, get().byBuilding),
          selectedElementId: created?.id ?? get().selectedElementId,
        });
        return created?.id ?? null;
      },

      applyHost: (input) => {
        const before = get().snapshot;
        if (!before) return null;
        const result = hostOnNearestWall({ model: before, ...input });
        const created = result.model.elements.find(
          (el) => el.origin === "authored" && !before.elements.some((b) => b.id === el.id),
        );
        set({
          ...commit("Place Hosted", before, result, get().log, get().byBuilding),
          selectedElementId: created?.id ?? get().selectedElementId,
        });
        return created?.id ?? null;
      },

      applyFlip: (elementId, field) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit(`Flip ${field}`, before, flipHosted(before, elementId, field), get().log, get().byBuilding));
      },

      applyDocument: (item) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit("Annotate", before, addDocument(before, item), get().log, get().byBuilding));
      },

      applyHide: (viewId, payload) => {
        const before = get().snapshot;
        if (!before) return;
        set(commit("Hide in View", before, hideInView(before, viewId, payload), get().log, get().byBuilding));
      },

      undoLast: () => {
        const result = undo(get().log);
        if (!result.model) return;
        set({
          snapshot: result.model,
          log: result.log,
          byBuilding: {
            ...get().byBuilding,
            [result.model.buildingPk]: persistAuthored(result.model),
          },
        });
      },

      redoLast: () => {
        const result = redo(get().log);
        if (!result.model) return;
        set({
          snapshot: result.model,
          log: result.log,
          byBuilding: {
            ...get().byBuilding,
            [result.model.buildingPk]: persistAuthored(result.model),
          },
        });
      },
    }),
    {
      name: "bim-model-authored",
      version: 1,
      partialize: (s) => ({ byBuilding: s.byBuilding }),
    },
  ),
);

export function useBimCommandName(): string | null {
  return lastCommandName(useBimModelStore.getState().log);
}
