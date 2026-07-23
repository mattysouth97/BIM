"use client";

import { create } from "zustand";
import { versionedMigrate } from "./persist-migrate";
import { persist } from "zustand/middleware";
import {
  WorkflowStage,
  STAGE_ORDER,
  STAGE_GUARDS,
  getBlockingStage,
  type StageGuardContext,
} from "@/lib/workflow/stages";

interface WorkflowState {
  stage: WorkflowStage;
  completion: Record<WorkflowStage, boolean>;
  /**
   * P2-17 — buildings whose CAD upload the user explicitly skipped this
   * session. Deliberately NOT persisted (excluded from partialize), mirroring
   * the transient footprint override it substitutes for: after a reload both
   * paths retreat to the upload stage via WorkflowStageRecovery, where
   * skipping again is one click.
   */
  cadSkipped: Record<string, boolean>;
  /** Record that the active building proceeds without a CAD drawing. */
  skipCad: (buildingPk: string) => void;
  setStage: (next: WorkflowStage) => void;
  canAdvance: (ctx?: StageGuardContext) => boolean;
  advance: (ctx?: StageGuardContext) => void;
  /**
   * P1-08 (b) — guard-aware navigation for arbitrary jumps (stepper clicks).
   * Backward/same-stage always succeeds; forward jumps require every
   * intermediate stage's forward guard to pass. Returns whether the move
   * happened. UI navigation must use this, never raw setStage.
   */
  goToStage: (target: WorkflowStage, ctx?: StageGuardContext) => boolean;
  retreat: () => void;
  markComplete: (stage: WorkflowStage) => void;
  resetWorkflow: () => void;
}

const initialCompletion: Record<WorkflowStage, boolean> = {
  search: false,
  upload: false,
  twin:   false,
  report: false,
};

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      stage: "search",
      completion: { ...initialCompletion },
      cadSkipped: {},

      skipCad: (buildingPk) =>
        set((state) => ({
          cadSkipped: { ...state.cadSkipped, [buildingPk]: true },
        })),

      setStage: (next) => set({ stage: next }),

      canAdvance: (ctx) => {
        const current = get().stage;
        const guard = STAGE_GUARDS[current];
        if (!guard) return false; // terminal stage
        return guard(ctx);
      },

      advance: (ctx) => {
        const current = get().stage;
        const guard = STAGE_GUARDS[current];
        if (guard && !guard(ctx)) {
          return; // guard blocks advance
        }
        const idx = STAGE_ORDER.indexOf(current);
        if (idx < STAGE_ORDER.length - 1) {
          set({ stage: STAGE_ORDER[idx + 1] });
        }
        // no-op at terminal
      },

      goToStage: (target, ctx) => {
        const current = get().stage;
        if (getBlockingStage(current, target, ctx) !== null) {
          return false;
        }
        set({ stage: target });
        return true;
      },

      retreat: () => {
        const current = get().stage;
        const idx = STAGE_ORDER.indexOf(current);
        if (idx > 0) {
          set({ stage: STAGE_ORDER[idx - 1] });
        }
        // no-op at start
      },

      markComplete: (stage) =>
        set((state) => ({
          completion: { ...state.completion, [stage]: true },
        })),

      resetWorkflow: () =>
        set({
          stage: "search",
          completion: { ...initialCompletion },
          cadSkipped: {},
        }),
    }),
    {
      name: "bim-workflow-state",
      version: 1, // P2-07: initial version stamp
      migrate: versionedMigrate,
      partialize: (state) => ({
        stage: state.stage,
        completion: state.completion,
      }),
    }
  )
);
