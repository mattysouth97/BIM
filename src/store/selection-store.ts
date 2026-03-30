"use client";

import { create } from "zustand";

/** Discriminator for the type of selectable element in the 3D scene */
export type SelectableType = "wall" | "room" | "component" | null;

interface SelectionState {
  selectedType: SelectableType;
  selectedId: string | null;
  /** For component selection, stores the buildingPk context */
  buildingPk: string | null;

  /** Select an element by type, id, and optional buildingPk */
  select: (type: SelectableType, id: string | null, buildingPk?: string) => void;
  /** Clear the current selection */
  clearSelection: () => void;
}

/**
 * Global selection store — bridges 3D scene click events to property panels.
 * NOT persisted (selection is transient — resets on page load).
 *
 * Usage in R3F components:
 *   useSelectionStore.getState().select("wall", wall.id)
 *
 * Usage in React components:
 *   const { selectedType, selectedId } = useSelectionStore()
 */
export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedType: null,
  selectedId: null,
  buildingPk: null,

  select: (type, id, buildingPk) =>
    set({ selectedType: type, selectedId: id, buildingPk: buildingPk ?? null }),

  clearSelection: () =>
    set({ selectedType: null, selectedId: null, buildingPk: null }),
}));
