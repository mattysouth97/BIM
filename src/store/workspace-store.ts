"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Size constants (exported for downstream use by WorkspaceShell in Phase 15)
// ---------------------------------------------------------------------------

export const LEFT_DOCK_MIN = 12;
export const LEFT_DOCK_MAX = 28;
export const LEFT_DOCK_DEFAULT = 18;

export const RIGHT_DOCK_MIN = 16;
export const RIGHT_DOCK_MAX = 35;
export const RIGHT_DOCK_DEFAULT = 22;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface WorkspaceState {
  // Panel open/collapsed flags
  leftDockOpen: boolean;
  rightDockOpen: boolean;
  bottomShelfOpen: boolean;

  // Panel sizes (percentage of parent container)
  leftDockSize: number; // default 18, min 12, max 28
  rightDockSize: number; // default 22, min 16, max 35

  // Actions
  toggleLeftDock: () => void;
  toggleRightDock: () => void;
  toggleBottomShelf: () => void;
  setLeftDockOpen: (open: boolean) => void;
  setRightDockOpen: (open: boolean) => void;
  setBottomShelfOpen: (open: boolean) => void;
  setLeftDockSize: (size: number) => void;
  setRightDockSize: (size: number) => void;
  resetLayout: () => void;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const defaults = {
  leftDockOpen: true,
  rightDockOpen: true,
  bottomShelfOpen: true,
  leftDockSize: LEFT_DOCK_DEFAULT,
  rightDockSize: RIGHT_DOCK_DEFAULT,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...defaults,

      toggleLeftDock: () =>
        set((s) => ({ leftDockOpen: !s.leftDockOpen })),
      toggleRightDock: () =>
        set((s) => ({ rightDockOpen: !s.rightDockOpen })),
      toggleBottomShelf: () =>
        set((s) => ({ bottomShelfOpen: !s.bottomShelfOpen })),

      setLeftDockOpen: (open) => set({ leftDockOpen: open }),
      setRightDockOpen: (open) => set({ rightDockOpen: open }),
      setBottomShelfOpen: (open) => set({ bottomShelfOpen: open }),

      setLeftDockSize: (size) =>
        set({ leftDockSize: Math.min(LEFT_DOCK_MAX, Math.max(LEFT_DOCK_MIN, size)) }),
      setRightDockSize: (size) =>
        set({ rightDockSize: Math.min(RIGHT_DOCK_MAX, Math.max(RIGHT_DOCK_MIN, size)) }),

      resetLayout: () => set({ ...defaults }),
    }),
    {
      name: "bim-workspace-layout",
      partialize: (s) => ({
        leftDockOpen: s.leftDockOpen,
        rightDockOpen: s.rightDockOpen,
        bottomShelfOpen: s.bottomShelfOpen,
        leftDockSize: s.leftDockSize,
        rightDockSize: s.rightDockSize,
      }),
    }
  )
);
