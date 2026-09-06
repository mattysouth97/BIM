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
import { proposalVisualIds } from "@/lib/retrofit/measure-visuals";

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
   * Whether the 3D model shows the selected proposal (renewed walls, low-e
   * glass, new roof, PV, replacement plant) or the building as it stands.
   * Default on. The HUD's "제안 미리보기 / Preview proposal" switch writes it.
   *
   * This replaced `appliedMeasureIds` on 2026-09-06. That field was the only
   * driver of the envelope visuals and its only writer, `toggleAppliedMeasure`,
   * lost its last caller when `397882b` deleted the "클릭하여 3D 적용" buttons —
   * so from the user's side the visuals were unreachable while the code that
   * drew them looked alive. It is deleted rather than kept as a third state
   * nobody writes: the visuals now read the knapsack's `selectedMeasureIds`,
   * gated by this flag, which is the same set the numbers are computed from.
   * Session-only, deliberately: it says what you are looking at right now, and
   * persisting it would let a hydrated `false` silently hide the proposal on
   * a fresh page.
   */
  previewProposal: boolean;
  setCapexBudget: (krw: number) => void;
  setProgramTrack: (track: ProgramTrack) => void;
  setBuildingInputs: (inputs: ScenarioBuildingInputs | null) => void;
  setSelectedMeasureIds: (ids: string[] | null) => void;
  setPreviewProposal: (on: boolean) => void;
  resetScenario: () => void;
}

/** The data half of the store, without the actions. */
type ScenarioData = Omit<
  ScenarioState,
  | "setCapexBudget"
  | "setProgramTrack"
  | "setBuildingInputs"
  | "setSelectedMeasureIds"
  | "setPreviewProposal"
  | "resetScenario"
>;

/**
 * Starting values, as a factory so the store's initial state and
 * `resetScenario` cannot drift apart — a field added here reaches both.
 */
function initialScenarioData(): ScenarioData {
  return {
    capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
    programTrack: "none",
    buildingInputs: null,
    selectedMeasureIds: null,
    previewProposal: true,
  };
}

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set) => ({
      ...initialScenarioData(),

      setCapexBudget: (krw) => set({ capexBudgetKrw: krw }),
      setProgramTrack: (track) => set({ programTrack: track }),
      // A selection belongs to one building — switching buildings drops it so
      // building A's proposal never draws itself on building B in the frames
      // before the HUD republishes. Republishing the SAME building (an overlay
      // re-mount) keeps it.
      setBuildingInputs: (inputs) =>
        set((state) => ({
          buildingInputs: inputs,
          selectedMeasureIds:
            inputs?.buildingPk === state.buildingInputs?.buildingPk
              ? state.selectedMeasureIds
              : null,
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
      setPreviewProposal: (on) => set({ previewProposal: on }),
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

/**
 * The measure ids the 3D model should draw as proposed: the knapsack's
 * selection while the preview is on, nothing while it is off.
 *
 * Every visual consumer reads this rather than the raw fields, so the twin
 * and the model pages cannot end up showing different id sets. Both branches
 * return a referentially stable array — `selectedMeasureIds` is identity-
 * guarded in `setSelectedMeasureIds`, and "off" is one shared empty array —
 * so the layer generators do not regenerate on every render.
 */
export function useProposalVisualIds(): string[] {
  const previewProposal = useScenarioStore((s) => s.previewProposal);
  const selectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  return proposalVisualIds(previewProposal, selectedMeasureIds);
}
