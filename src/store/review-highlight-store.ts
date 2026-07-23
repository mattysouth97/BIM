"use client";

import { create } from "zustand";

/** Engine element categories that can be highlighted (mirrors engine ElementKind). */
export type HighlightKind = "wall" | "slab" | "window" | "door";

interface ReviewHighlightState {
  /** The element category currently highlighted from a HITL-flag click, or null. */
  highlightKind: HighlightKind | null;
  /** Set the highlighted category (null clears). */
  setHighlightKind: (kind: HighlightKind | null) => void;
  /** Toggle — clicking the same kind again clears it. */
  toggleHighlightKind: (kind: HighlightKind) => void;
}

/**
 * Transient (not persisted): clicking a HITL flag in the fidelity panel pulses
 * the matching mesh category in the 3D viewer. Category-level, NOT per-element —
 * generated-IFC expressIds have no per-mesh correspondence in the procedural
 * building, so a flag's kind maps to a mesh category (window→glass,
 * wall→facade panels/mullions, slab→slabs; door has no distinct mesh).
 */
export const useReviewHighlightStore = create<ReviewHighlightState>((set) => ({
  highlightKind: null,
  setHighlightKind: (kind) => set({ highlightKind: kind }),
  toggleHighlightKind: (kind) =>
    set((s) => ({ highlightKind: s.highlightKind === kind ? null : kind })),
}));
