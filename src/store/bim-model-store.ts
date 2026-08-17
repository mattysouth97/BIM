"use client";

// Authored BIM instances + type overrides + transaction log.
// Generated elements are always re-hydrated from the twin (not persisted).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { DerivedTwinElements } from "@/lib/bim/derive/twin-elements";
import { AUTHORING_FAMILIES } from "@/lib/bim/family-catalog";
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
  typeFromAuthoringFamily,
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
  /**
   * Ingest a BIM snapshot that is already complete — the generative engine's
   * `buildDesign` output — instead of re-deriving one from a recipe. The
   * authored overlay is identical to `hydrate`'s; only the base model differs.
   */
  hydrateFromSnapshot: (input: {
    buildingPk: string;
    snapshot: BimModelSnapshot;
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

/* --- overlay helpers, shared by the two hydration paths ------------- */
//
// `hydrateBimModel` derives its base model from a recipe and then overlays the
// persisted authored work on top. A generative snapshot arrives already built,
// so only the OVERLAY half applies — these three helpers are that half, kept
// identical to `hydrate.ts` so a building authored over a generated design and
// one authored over a ledger twin behave the same.

/**
 * The authoring catalogue, which the generative emitter has no reason to ship:
 * it emits the types it generated. A generative type always wins an id clash —
 * it describes geometry that exists.
 */
function withAuthoringTypes(types: Record<string, BimType>): Record<string, BimType> {
  const catalogue: Record<string, BimType> = {};
  for (const family of AUTHORING_FAMILIES) {
    catalogue[family.id] = typeFromAuthoringFamily(family);
  }
  return { ...catalogue, ...types };
}

/** Same merge as `hydrateBimModel`: patch over base, parameters merged. */
function withTypeOverrides(
  types: Record<string, BimType>,
  overrides: Record<string, Partial<BimType>>,
): Record<string, BimType> {
  const merged = { ...types };
  for (const [id, patch] of Object.entries(overrides)) {
    const base = merged[id];
    merged[id] = {
      ...(base ?? {
        id,
        category: "Generic",
        categoryKo: "일반",
        family: "Generic",
        familyKo: "일반",
        typeName: id,
        typeNameKo: id,
        parameters: {},
      }),
      ...patch,
      parameters: { ...(base?.parameters ?? {}), ...(patch.parameters ?? {}) },
    };
  }
  return merged;
}

/** Authored elements sit at their level's elevation plus their own offsets. */
function rebaseAuthored(elements: BimElement[], levels: BimModelSnapshot["levels"]): BimElement[] {
  const levelById = new Map(levels.map((l) => [l.id, l]));
  return elements.map((el) => {
    const level = el.levelId ? levelById.get(el.levelId) : undefined;
    if (!level) return el;
    const offsetM = Number(el.instanceParameters.baseOffsetMm ?? 0) / 1000;
    const sillM = Number(el.instanceParameters.sillHeightMm ?? 0) / 1000;
    return { ...el, placement: { ...el.placement, y: level.elevation + offsetM + sillM } };
  });
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

      hydrateFromSnapshot: ({ buildingPk, snapshot }) => {
        const saved = get().byBuilding[buildingPk] ?? emptyBuilding();
        const types = withTypeOverrides(withAuthoringTypes(snapshot.types), saved.typeOverrides);

        // Generation-sourced records are taken verbatim — generationSource,
        // locked, system and dependsOn are the engine's statements about the
        // design, and re-deriving them here would be a second opinion. The only
        // field that can move is the owning pk, and only when it disagrees with
        // the pk this model is filed under.
        const generated = snapshot.elements
          .filter((el) => el.origin !== "authored")
          .map((el) => (el.buildingPk === buildingPk ? el : { ...el, buildingPk }));

        // Authored work can arrive from two places: carried inside the stored
        // design, or persisted here by this browser. The store is the later
        // record of the two, so it wins on id.
        const authoredById = new Map<string, BimElement>();
        for (const el of snapshot.elements) {
          if (el.origin === "authored") authoredById.set(el.id, el);
        }
        for (const el of saved.authored) {
          if (el.buildingPk !== buildingPk || el.origin !== "authored") continue;
          authoredById.set(el.id, el);
        }
        const authored = rebaseAuthored([...authoredById.values()], snapshot.levels);

        const next: BimModelSnapshot = {
          buildingPk,
          levels: snapshot.levels,
          grids: snapshot.grids,
          types,
          elements: [...generated, ...authored],
          documents: snapshot.documents ?? [],
          visibility: snapshot.visibility ?? {},
        };

        const current = get().snapshot;
        if (
          current &&
          current.buildingPk === buildingPk &&
          current.elements.length === next.elements.length &&
          current.levels.length === next.levels.length
        ) {
          // Same rule as `hydrate`: a re-run must not throw away edits made
          // since the last one. Only the generated half is refreshed.
          const inSession = current.elements.filter((el) => el.origin === "authored");
          set({
            snapshot: {
              ...next,
              types: { ...next.types, ...current.types },
              elements: [...generated, ...inSession],
              documents: current.documents ?? [],
              visibility: current.visibility ?? {},
            },
          });
          return;
        }

        set({
          snapshot: next,
          activeLevelId: get().activeLevelId ?? next.levels[0]?.id ?? null,
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
