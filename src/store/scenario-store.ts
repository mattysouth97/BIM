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
import { persist } from "zustand/middleware";
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
  /**
   * P2-20 — measures the user has clicked "apply" on in the manifest. This
   * drives the 3D visual response (tints, PV panels); it is independent of
   * the knapsack's budget-optimal recommendation set. Session-only.
   */
  appliedMeasureIds: string[];
  setCapexBudget: (krw: number) => void;
  setProgramTrack: (track: ProgramTrack) => void;
  setBuildingInputs: (inputs: ScenarioBuildingInputs | null) => void;
  setSelectedMeasureIds: (ids: string[] | null) => void;
  toggleAppliedMeasure: (measureId: string) => void;
  clearAppliedMeasures: () => void;
  resetScenario: () => void;
}

/** The data half of the store, without the actions. */
type ScenarioData = Omit<
  ScenarioState,
  | "setCapexBudget"
  | "setProgramTrack"
  | "setBuildingInputs"
  | "setSelectedMeasureIds"
  | "toggleAppliedMeasure"
  | "clearAppliedMeasures"
  | "resetScenario"
>;

/**
 * Starting values, as a factory so the store's initial state and
 * `resetScenario` cannot drift apart — a field added here reaches both.
 * A factory rather than a shared constant so each reset gets its own
 * `appliedMeasureIds` array instead of aliasing one across resets.
 */
function initialScenarioData(): ScenarioData {
  return {
    capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
    programTrack: "none",
    buildingInputs: null,
    selectedMeasureIds: null,
    appliedMeasureIds: [],
  };
}

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set) => ({
      ...initialScenarioData(),

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
      toggleAppliedMeasure: (measureId) =>
        set((state) => ({
          appliedMeasureIds: state.appliedMeasureIds.includes(measureId)
            ? state.appliedMeasureIds.filter((id) => id !== measureId)
            : [...state.appliedMeasureIds, measureId],
        })),
      clearAppliedMeasures: () => set({ appliedMeasureIds: [] }),
      resetScenario: () => set(initialScenarioData()),
    }),
    {
      name: "bim-scenario-state",
      partialize: (state) => ({
        capexBudgetKrw: state.capexBudgetKrw,
        programTrack: state.programTrack,
      }),
    },
  ),
);
