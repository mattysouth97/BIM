"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  WorkflowStage,
  STAGE_ORDER,
  STAGE_GUARDS,
  type StageGuardContext,
} from "@/lib/workflow/stages";

interface WorkflowState {
  stage: WorkflowStage;
  completion: Record<WorkflowStage, boolean>;
  setStage: (next: WorkflowStage) => void;
  canAdvance: (ctx?: StageGuardContext) => boolean;
  advance: (ctx?: StageGuardContext) => void;
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
        }),
    }),
    {
      name: "bim-workflow-state",
      partialize: (state) => ({
        stage: state.stage,
        completion: state.completion,
      }),
    }
  )
);
