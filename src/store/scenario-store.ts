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
import type { RoofPlaneSet } from "@/lib/retrofit/pv-layout";
import {
  proposalVisualIds,
  effectiveMeasureIds,
} from "@/lib/retrofit/measure-visuals";

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
  /**
   * OPTIONAL budget, KRW. `null` (the default) means no ceiling: the
   * recommendation is every measure with a positive NPV within the horizon,
   * the knapsack is not called, and no utilisation is rendered. A value means
   * "best set within ₩X" — today's knapsack, utilisation and over-budget
   * reasons. Per building and session-only: the old ₩2.5억 default followed a
   * reader across reloads and buildings and marked chips with a number nobody
   * set for that building. Lane 3D, user-approved 2026-09-06.
   */
  capexBudgetKrw: number | null;
  /**
   * Derived engine inputs for the active building, published by the surface
   * that has the ledger data. `null` until a building is loaded.
   */
  buildingInputs: ScenarioBuildingInputs | null;
  /**
   * The knapsack's RECOMMENDATION — the NPV-optimal subset within the budget,
   * published by the HUD after each evaluation. `null` = nothing evaluated yet.
   *
   * Since 2026-09-06 this is advice, not the answer. It marks chips 추천; it
   * does not decide what the building shows or what the economics price.
   * `appliedMeasureIds` does.
   */
  selectedMeasureIds: string[] | null;
  /**
   * The work the USER has chosen — the primary selection. It drives the 3D
   * visuals, the delta strip and the economics.
   *
   * `null` means "not seeded for this building yet": the HUD copies the first
   * recommendation in once, so the page arrives useful. From that moment it is
   * the user's, and **nothing but the user changes it**. That is the whole
   * point of the field. Budget changes never replace the user's chosen work.
   *
   * It was deleted earlier the same day for having no writer at all. It is back
   * because it now has one — the measure chip row — not because the mechanism
   * that had none was revived.
   */
  appliedMeasureIds: string[] | null;
  /**
   * Whether the 3D model shows the chosen work (renewed walls, low-e glass,
   * new roof, PV, replacement plant) or the building as it stands. Default on.
   * The HUD's "제안 미리보기 / Preview proposal" switch writes it.
   *
   * Session-only, deliberately: it says what you are looking at right now, and
   * persisting it would let a hydrated `false` silently hide the proposal on
   * a fresh page.
   */
  previewProposal: boolean;
  /**
   * The active building's measured roof planes (stage 1 of the PV placement
   * methodology) — published by the surface that has them: the model page
   * fetches `roof-planes.json`, the twin derives them from its plates. ONE
   * copy, so the PV drawn, the legend's count and the kWp the economics
   * prices all come from one layout of one roof. Session-only; cleared when
   * the building changes exactly like the chosen work.
   */
  roofPlanes: RoofPlaneSet | null;
  setRoofPlanes: (planes: RoofPlaneSet | null) => void;
  setCapexBudget: (krw: number | null) => void;
  setBuildingInputs: (inputs: ScenarioBuildingInputs | null) => void;
  setSelectedMeasureIds: (ids: string[] | null) => void;
  /** Write the user's chosen work. `null` returns to "follow the recommendation". */
  setAppliedMeasureIds: (ids: string[] | null) => void;
  setPreviewProposal: (on: boolean) => void;
  resetScenario: () => void;
}

/** The data half of the store, without the actions. */
type ScenarioData = Omit<
  ScenarioState,
  | "setCapexBudget"
  | "setBuildingInputs"
  | "setSelectedMeasureIds"
  | "setAppliedMeasureIds"
  | "setPreviewProposal"
  | "setRoofPlanes"
  | "resetScenario"
>;

/**
 * Starting values, as a factory so the store's initial state and
 * `resetScenario` cannot drift apart — a field added here reaches both.
 */
function initialScenarioData(): ScenarioData {
  return {
    capexBudgetKrw: null,
    buildingInputs: null,
    selectedMeasureIds: null,
    appliedMeasureIds: null,
    previewProposal: true,
    roofPlanes: null,
  };
}

// All remaining scenario state belongs to this building/session. The removed
// funding-program feature was the only persisted field. Do not hydrate the old
// bim-scenario-state record: a saved subsidy must not silently alter costs.
export const useScenarioStore = create<ScenarioState>()(
    (set) => ({
      ...initialScenarioData(),

      setCapexBudget: (krw) => set({ capexBudgetKrw: krw }),
      // A selection belongs to one building — switching buildings drops BOTH
      // the recommendation and the user's chosen work, so building A's
      // proposal never draws itself on building B in the frames before the HUD
      // republishes, and A's chosen work is never re-priced against B's
      // envelope. Republishing the SAME building (an overlay re-mount) keeps
      // both: a re-mount must not silently discard what the user picked.
      setBuildingInputs: (inputs) =>
        set((state) => {
          const sameBuilding =
            inputs?.buildingPk === state.buildingInputs?.buildingPk;
          return {
            buildingInputs: inputs,
            selectedMeasureIds: sameBuilding ? state.selectedMeasureIds : null,
            appliedMeasureIds: sameBuilding ? state.appliedMeasureIds : null,
            roofPlanes: sameBuilding ? state.roofPlanes : null,
            capexBudgetKrw: sameBuilding ? state.capexBudgetKrw : null,
          };
        }),
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
      setAppliedMeasureIds: (ids) => set({ appliedMeasureIds: ids }),
      setPreviewProposal: (on) => set({ previewProposal: on }),
      setRoofPlanes: (planes) => set({ roofPlanes: planes }),
      resetScenario: () => set(initialScenarioData()),
    }),
);

/**
 * The work in force: what the user chose, falling back to the recommendation
 * only until the HUD has seeded the user's set for this building.
 *
 * ONE definition, used by the visuals, the delta strip and the economics, so
 * the picture, the kWh and the NPV on a single frame cannot describe three
 * different buildings.
 */
export function useEffectiveMeasureIds(): string[] {
  const appliedMeasureIds = useScenarioStore((s) => s.appliedMeasureIds);
  const selectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  return effectiveMeasureIds(appliedMeasureIds, selectedMeasureIds);
}

/**
 * The measure ids the 3D model should draw as proposed. **The single gate.**
 *
 * The twin's viewer and the model-page viewer both resolve what to draw
 * through this one selector, and nothing else may. Two selectors is what let
 * the two surfaces disagree about "the" selection before, so do not add a
 * second one — extend this.
 *
 * Semantics, pinned by test in `measure-visuals.test.ts`:
 *
 *   chip on                    → drawn
 *   chip off but 추천-marked    → NOT drawn; the mark is advice, and a
 *                                recommendation must never put geometry on a
 *                                building the user did not choose
 *   제안 미리보기 off            → nothing drawn, whatever is chosen
 *   user's set not yet seeded  → the recommendation is drawn, which is the
 *                                one moment it decides anything
 *
 * Both empty branches return a referentially stable array — the store's
 * setters are identity-guarded and "off" is one shared empty array — so the
 * layer generators do not regenerate on every render.
 */
export function useProposalVisualIds(): string[] {
  const previewProposal = useScenarioStore((s) => s.previewProposal);
  const effective = useEffectiveMeasureIds();
  return proposalVisualIds(previewProposal, effective);
}
