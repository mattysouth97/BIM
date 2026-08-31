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
/**
 * Per-element MEP network record (plain JSON) — present when the clicked
 * geometry derives from the canonical MEP graph (src/lib/mep): the user can
 * see which system a run belongs to, its engineered size, accumulated flow,
 * and the basis of every number (§25 interactive inspection).
 */
export interface MepSelectionInfo {
  mepId: string;
  systemName: string;
  systemNameKo: string;
  role?: string;
  sizeLabel?: string;
  flowLabel?: string;
  /** calculated | estimated | defaulted | imported | user */
  basis?: string;
  label?: string;
}

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
  /** Canonical MEP graph record for this element, when it has one. */
  mep?: MepSelectionInfo;
}

/** Energy-diagnosis object kinds that can be traced across 2D, data, and 3D. */
export type CanonicalSelectionKind =
  | "energy_fact"
  | "thermal_zone"
  | "source_reference"
  | "diagnostic_finding"
  | "simulation_series";

/**
 * JSON-only selection bridge for the canonical energy-diagnosis workflow.
 *
 * Stable application ids are stored instead of THREE objects or transient
 * scene UUIDs. `threeObjectIds` therefore contains authored object names/ids
 * such as `energy-zone:zone-west`, never `Object3D.uuid`.
 */
export type CanonicalSelection = Readonly<{
  kind: CanonicalSelectionKind;
  /** Building whose authored scene ids this selection belongs to. */
  buildingPk: string | null;
  /** Stable id of the selected fact, zone, source reference, or chart series. */
  id: string;
  /** Source document when the selection has drawing evidence. */
  documentId: string | null;
  /** Canonical model ids affected by this selection. */
  canonicalObjectIds: readonly string[];
  /** Stable authored scene object ids linked to the selection. */
  threeObjectIds: readonly string[];
  /** Selected room instance for an instanced thermal-zone mesh, when known. */
  roomId?: string;
  /** Exact simulation run backing a selected result series, when applicable. */
  runId?: string;
}>;

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

  // ── Canonical energy-diagnosis selection (additive) ──
  /** Current 2D/data/3D diagnosis selection. JSON-only and transient. */
  selectedCanonical: CanonicalSelection | null;
  /** Select a canonical energy fact, zone, source reference, or result series. */
  selectCanonical: (selection: CanonicalSelection) => void;
  /** Clear only the canonical diagnosis selection. */
  clearCanonicalSelection: () => void;
}

/**
 * Global selection store — bridges 3D scene click events to property panels.
 * NOT persisted (selection is transient — resets on page load).
 *
 * Usage in R3F components:
 *   useSelectionStore.getState().select("wall", wall.id)
 *   useSelectionStore.getState().selectEquipment(info)
 *   useSelectionStore.getState().selectCanonical(selection)
 *
 * Usage in React components:
 *   const { selectedType, selectedId, selectedEquipment } = useSelectionStore()
 */
export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedType: null,
  selectedId: null,
  buildingPk: null,
  selectedEquipment: null,
  selectedCanonical: null,

  select: (type, id, buildingPk) =>
    set({ selectedType: type, selectedId: id, buildingPk: buildingPk ?? null }),

  clearSelection: () =>
    set({
      selectedType: null,
      selectedId: null,
      buildingPk: null,
      selectedEquipment: null,
      selectedCanonical: null,
    }),

  selectEquipment: (info) =>
    set({ selectedEquipment: info }),

  clearEquipment: () =>
    set({ selectedEquipment: null }),

  selectCanonical: (selection) =>
    set({ selectedCanonical: selection }),

  clearCanonicalSelection: () =>
    set({ selectedCanonical: null }),
}));
