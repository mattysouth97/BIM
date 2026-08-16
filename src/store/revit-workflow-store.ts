"use client";

import { create } from "zustand";
import {
  defaultLeftDockTab,
  type RevitWorkMode,
} from "@/lib/workflow/revit-workflow";

export type LeftDockTab = "insights" | "browser";

interface RevitWorkflowState {
  workMode: RevitWorkMode;
  leftDockTab: LeftDockTab;
  schedulePanelOpen: boolean;
  sheetPanelOpen: boolean;
  activeScheduleId: string;
  setWorkMode: (mode: RevitWorkMode) => void;
  setLeftDockTab: (tab: LeftDockTab) => void;
  setSchedulePanelOpen: (open: boolean) => void;
  setSheetPanelOpen: (open: boolean) => void;
  setActiveScheduleId: (id: string) => void;
}

export const useRevitWorkflowStore = create<RevitWorkflowState>()((set) => ({
  workMode: "energy",
  leftDockTab: "insights",
  schedulePanelOpen: false,
  sheetPanelOpen: false,
  activeScheduleId: "wall-schedule-v1",

  setWorkMode: (mode) =>
    set({
      workMode: mode,
      leftDockTab: defaultLeftDockTab(mode),
      schedulePanelOpen: mode === "schedules",
      sheetPanelOpen: mode === "sheets",
    }),

  setLeftDockTab: (tab) => set({ leftDockTab: tab }),
  setSchedulePanelOpen: (open) => set({ schedulePanelOpen: open }),
  setSheetPanelOpen: (open) => set({ sheetPanelOpen: open }),
  setActiveScheduleId: (id) => set({ activeScheduleId: id }),
}));
