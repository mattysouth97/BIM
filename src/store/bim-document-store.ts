"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TwinPhaseId } from "@/lib/bim/phases/apply-phase";

interface BimDocumentState {
  phase: TwinPhaseId;
  scheduleOpen: boolean;
  activeScheduleId: string | null;
  setPhase: (phase: TwinPhaseId) => void;
  setScheduleOpen: (open: boolean) => void;
  toggleSchedule: () => void;
  setActiveSchedule: (id: string | null) => void;
}

export const useBimDocumentStore = create<BimDocumentState>()(
  persist(
    (set) => ({
      phase: "existing",
      scheduleOpen: false,
      activeScheduleId: "wall-schedule-v1",
      setPhase: (phase) => set({ phase }),
      setScheduleOpen: (open) => set({ scheduleOpen: open }),
      toggleSchedule: () =>
        set((s) => ({
          scheduleOpen: !s.scheduleOpen,
          activeScheduleId: s.activeScheduleId ?? "wall-schedule-v1",
        })),
      setActiveSchedule: (id) =>
        set({
          activeScheduleId: id,
          scheduleOpen: id !== null,
        }),
    }),
    {
      name: "bim-document-ui",
      partialize: (s) => ({
        phase: s.phase,
        scheduleOpen: s.scheduleOpen,
        activeScheduleId: s.activeScheduleId,
      }),
    },
  ),
);
