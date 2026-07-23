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
   * P2-20 — measures the user has clicked "apply" on in the manifest. This
   * drives the 3D visual response (tints, PV panels); it is independent of
   * the knapsack's budget-optimal recommendation set. Session-only.
   */
  appliedMeasureIds: string[];
  setCapexBudget: (krw: number) => void;
  setProgramTrack: (track: ProgramTrack) => void;
  setBuildingInputs: (inputs: ScenarioBuildingInputs | null) => void;
  toggleAppliedMeasure: (measureId: string) => void;
  clearAppliedMeasures: () => void;
  resetScenario: () => void;
}

export const useScenarioStore = create<ScenarioState>()((set) => ({
  capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
  programTrack: "none",
  buildingInputs: null,
  appliedMeasureIds: [],

  setCapexBudget: (krw) => set({ capexBudgetKrw: krw }),
  setProgramTrack: (track) => set({ programTrack: track }),
  // Applied measures belong to one building — switching buildings clears them
  // so building A's visual transformations never appear on building B.
  setBuildingInputs: (inputs) =>
    set((state) => ({
      buildingInputs: inputs,
      appliedMeasureIds:
        inputs?.buildingPk === state.buildingInputs?.buildingPk
          ? state.appliedMeasureIds
          : [],
    })),
  toggleAppliedMeasure: (measureId) =>
    set((state) => ({
      appliedMeasureIds: state.appliedMeasureIds.includes(measureId)
        ? state.appliedMeasureIds.filter((id) => id !== measureId)
        : [...state.appliedMeasureIds, measureId],
    })),
  clearAppliedMeasures: () => set({ appliedMeasureIds: [] }),
  resetScenario: () =>
    set({
      capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
      programTrack: "none",
      buildingInputs: null,
      appliedMeasureIds: [],
    }),
}));
