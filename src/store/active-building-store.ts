"use client";

// src/store/active-building-store.ts
// P1-08 (c) — the real "which building is the user working on" state.
//
// Before this store, useActiveBuildingPk returned the FIRST key of the
// material store — an insertion-order lottery that showed the wrong building
// in multi-building (campus) sessions. This store is set exactly where a
// building is chosen (building-page resolution) and carries the sigunguCd so
// every energy consumer can share the same regional climate (P1-08 d).
//
// NOT persisted: the active building is a per-session navigation fact; the
// building page re-sets it on every resolution. (If persistence is ever
// added, mirror the useHydration pattern — see workflow-stepper.tsx.)
//
// Deliberately separate from selection-store.buildingPk, which tracks 3D
// scene click-selection, not workspace scoping.

import { create } from "zustand";

interface ActiveBuildingState {
  /** mgmBldrgstPk of the building the workspace is scoped to. null = none chosen yet. */
  buildingPk: string | null;
  /** 시군구 code of that building for regional HDD/CDD lookups. null = unknown. */
  sigunguCd: string | null;
  setActiveBuilding: (buildingPk: string, sigunguCd?: string) => void;
  clearActiveBuilding: () => void;
}

export const useActiveBuildingStore = create<ActiveBuildingState>()((set) => ({
  buildingPk: null,
  sigunguCd: null,

  // sigunguCd omitted ⇒ explicitly null (unknown), never a stale carry-over
  // from the previously active building.
  setActiveBuilding: (buildingPk, sigunguCd) =>
    set({ buildingPk, sigunguCd: sigunguCd ?? null }),

  clearActiveBuilding: () => set({ buildingPk: null, sigunguCd: null }),
}));
