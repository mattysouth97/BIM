"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  WorkflowStage,
  STAGE_ORDER,
  STAGE_GUARDS,
} from "@/lib/workflow/stages";

interface WorkflowState {
  stage: WorkflowStage;
  completion: Record<WorkflowStage, boolean>;
  setStage: (next: WorkflowStage) => void;
  canAdvance: () => boolean;
  advance: () => void;
  retreat: () => void;
  markComplete: (stage: WorkflowStage) => void;
  resetWorkflow: () => void;
}

const initialCompletion: Record<WorkflowStage, boolean> = {
  select: false,
  assemble: false,
  configure: false,
  analyze: false,
  export: false,
};

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      stage: "select",
      completion: { ...initialCompletion },

      setStage: (next) => set({ stage: next }),

      canAdvance: () => {
        const current = get().stage;
        const guard = STAGE_GUARDS[current];
        if (!guard) return false; // terminal stage
        return guard();
      },

      advance: () => {
        const current = get().stage;
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
          stage: "select",
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
