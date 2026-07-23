"use client";

// src/store/cad-draft-store.ts
// P2-24 — manual parameters of CAD-first drafts, keyed by draft PK (cad-…).
//
// Deliberately NOT persisted, mirroring active-building-store and the
// transient footprint override (P2-07/P2-16 pattern): after a reload,
// WorkflowStageRecovery retreats the draft to the upload stage, where
// re-uploading and re-entering three fields is cheap. Persisting drafts is a
// documented v1 non-goal of the cad-first flow.

import { create } from "zustand";
import type { CadDraftParams } from "@/lib/workflow/cad-draft";

interface CadDraftState {
  /** Draft params keyed by draft PK. Absent key = params stage not completed. */
  drafts: Record<string, CadDraftParams>;
  setDraftParams: (pk: string, params: CadDraftParams) => void;
  clearDraft: (pk: string) => void;
}

export const useCadDraftStore = create<CadDraftState>()((set) => ({
  drafts: {},

  setDraftParams: (pk, params) =>
    set((state) => ({ drafts: { ...state.drafts, [pk]: params } })),

  clearDraft: (pk) =>
    set((state) => {
      const { [pk]: _, ...rest } = state.drafts;
      return { drafts: rest };
    }),
}));
