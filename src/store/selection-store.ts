"use client";

import { create } from "zustand";
import type { EquipmentSpec } from "@/lib/energy/equipment-specs";
import type { MepSubLayerId } from "@/lib/layers/types";

/** Discriminator for the type of selectable element in the 3D scene */
export type SelectableType = "wall" | "room" | "component" | null;

/**
 * Plain JSON-serialisable record extracted from a clicked MEP mesh.
 * MUST NOT contain any THREE.Object3D, Vector3, or THREE.* instances.
 * Per CONTEXT.md D-05 / PITFALLS.md Pitfall 9 — storing THREE objects here
 * leaks GPU memory when LayerManager rebuilds the MEP group on building change.
 */
export interface SelectedEquipmentInfo {
  /** Stable identifier, e.g. "mep-hvac-floor-3-cooling-branch" — derived at click time. */
  equipmentId: string;
  /** Which MEP sub-layer the hit object belongs to. */
  subLayerId: MepSubLayerId;
  /** Raw userData.type from the hit mesh (e.g. "cooling-branch"). */
  componentType: string;
  /** userData.floorNo if present, else null. */
  floorNo: number | null;
  /** Inferred spec — plain object, pre-computed at click time. */
  specs: EquipmentSpec;
}

interface SelectionState {
  // ── Existing fields (do not remove) ──
  selectedType: SelectableType;
  selectedId: string | null;
  /** For component selection, stores the buildingPk context */
  buildingPk: string | null;

  /** Select an element by type, id, and optional buildingPk */
  select: (type: SelectableType, id: string | null, buildingPk?: string) => void;
  /** Clear the current selection — also clears selectedEquipment */
  clearSelection: () => void;

  // ── Equipment selection (additive — no existing fields removed) ──
  /** Currently selected MEP equipment info, or null if nothing selected */
  selectedEquipment: SelectedEquipmentInfo | null;
  /** Set the selected equipment — does NOT mutate selectedType/selectedId/buildingPk */
  selectEquipment: (info: SelectedEquipmentInfo) => void;
  /** Clear equipment selection only — does NOT mutate selectedType/selectedId/buildingPk */
  clearEquipment: () => void;
}

/**
 * Global selection store — bridges 3D scene click events to property panels.
 * NOT persisted (selection is transient — resets on page load).
 *
 * Usage in R3F components:
 *   useSelectionStore.getState().select("wall", wall.id)
 *   useSelectionStore.getState().selectEquipment(info)
 *
 * Usage in React components:
 *   const { selectedType, selectedId, selectedEquipment } = useSelectionStore()
 */
export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedType: null,
  selectedId: null,
  buildingPk: null,
  selectedEquipment: null,

  select: (type, id, buildingPk) =>
    set({ selectedType: type, selectedId: id, buildingPk: buildingPk ?? null }),

  clearSelection: () =>
    set({ selectedType: null, selectedId: null, buildingPk: null, selectedEquipment: null }),

  selectEquipment: (info) =>
    set({ selectedEquipment: info }),

  clearEquipment: () =>
    set({ selectedEquipment: null }),
}));
