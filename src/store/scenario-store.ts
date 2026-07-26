"use client";

// src/store/scenario-store.ts
//
// Single source of truth for the retrofit investment scenario (D₃).
//
// Before this store, the Twin-stage overlay and the SceneOutliner left dock
// each derived their own engine inputs (floor areas, HDD region, tariffs),
// so the two surfaces displayed disagreeing numbers for the same building.
// Now whichever surface has the richest data (BuildingScene, via the
// TwinStageOverlay) publishes the derived inputs here, and every consumer
// feeds `useRetrofitScenario` from the same record.

import { create } from "zustand";
import type { ProgramTrack } from "@/lib/retrofit/cost-database";

/** Engine inputs derived from ledger title + footprint geometry. */
export interface ScenarioBuildingInputs {
  /** Building primary key these inputs were derived for. */
  buildingPk: string;
  /** Total conditioned floor area (m²) — title.totArea when available. */
  totalFloorArea: number;
  /** Footprint / roof area (m²) — projected polygon area or archArea. */
  footprintArea: number;
  /** Roof typology for solar potential. */
  roofType: "flat" | "gable" | "hip" | "sawtooth";
  /** 2-digit sido prefix for regional HDD lookup. */
  sidoPrefix: string;
}

export const DEFAULT_CAPEX_BUDGET_KRW = 250_000_000; // ₩2.5억 default scenario

interface ScenarioState {
  /** CAPEX budget in KRW driving the knapsack selection. */
  capexBudgetKrw: number;
  /** 그린리모델링 program track. Default "none" = unsubsidised (legacy behavior). */
  programTrack: ProgramTrack;
  /**
   * Derived engine inputs for the active building, published by the surface
   * that has the ledger data. `null` until a building is loaded.
   */
  buildingInputs: ScenarioBuildingInputs | null;
  /**
   * Knapsack-selected retrofit measure ids, published by the twin-stage
   * overlay after each budget/track evaluation. `null` = no scenario has
   * been evaluated yet (3D layers render the showcase equipment kit).
   * Drives the physical equipment swaps in the MEP layers.
   */
  selectedMeasureIds: string[] | null;
  setCapexBudget: (krw: number) => void;
  setProgramTrack: (track: ProgramTrack) => void;
  setBuildingInputs: (inputs: ScenarioBuildingInputs | null) => void;
  setSelectedMeasureIds: (ids: string[] | null) => void;
  resetScenario: () => void;
}

export const useScenarioStore = create<ScenarioState>()((set) => ({
  capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
  programTrack: "none",
  buildingInputs: null,
  selectedMeasureIds: null,

  setCapexBudget: (krw) => set({ capexBudgetKrw: krw }),
  setProgramTrack: (track) => set({ programTrack: track }),
  setBuildingInputs: (inputs) => set({ buildingInputs: inputs }),
  setSelectedMeasureIds: (ids) =>
    set((state) => {
      // Referential stability: skip the update when the id set is unchanged
      // so 3D layers don't regenerate on every knapsack re-evaluation.
      const prev = state.selectedMeasureIds;
      if (
        prev !== null &&
        ids !== null &&
        prev.length === ids.length &&
        prev.every((v, i) => v === ids[i])
      ) {
        return state;
      }
      if (prev === null && ids === null) return state;
      return { selectedMeasureIds: ids };
    }),
  resetScenario: () =>
    set({
      capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
      programTrack: "none",
      buildingInputs: null,
      selectedMeasureIds: null,
    }),
}));
