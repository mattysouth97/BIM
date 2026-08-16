"use client";

import { create } from "zustand";
import {
  defaultLeftDockTab,
  type RevitWorkMode,
} from "@/lib/workflow/revit-workflow";
import {
  defaultFamilyForTool,
  getAuthoringFamily,
  type AuthoringToolId,
} from "@/lib/bim/family-catalog";

export type LeftDockTab = "insights" | "browser";

interface RevitWorkflowState {
  workMode: RevitWorkMode;
  leftDockTab: LeftDockTab;
  schedulePanelOpen: boolean;
  sheetPanelOpen: boolean;
  activeScheduleId: string;
  selectedFamilyId: string | null;
  activeAuthoringTool: AuthoringToolId | null;
  sketchStart: { x: number; z: number } | null;
  setWorkMode: (mode: RevitWorkMode) => void;
  setLeftDockTab: (tab: LeftDockTab) => void;
  setSchedulePanelOpen: (open: boolean) => void;
  setSheetPanelOpen: (open: boolean) => void;
  setActiveScheduleId: (id: string) => void;
  setSelectedFamilyId: (id: string | null) => void;
  setActiveAuthoringTool: (tool: AuthoringToolId) => void;
  setSketchStart: (pt: { x: number; z: number } | null) => void;
}

export const useRevitWorkflowStore = create<RevitWorkflowState>()((set) => ({
  workMode: "energy",
  leftDockTab: "insights",
  schedulePanelOpen: false,
  sheetPanelOpen: false,
  activeScheduleId: "wall-schedule-v1",
  selectedFamilyId: null,
  activeAuthoringTool: null,
  sketchStart: null,

  setWorkMode: (mode) =>
    set((s) => {
      const enteringAuthoring = mode === "authoring";
      const tool = enteringAuthoring
        ? (s.activeAuthoringTool ?? "wall")
        : s.activeAuthoringTool;
      const family =
        enteringAuthoring && !s.selectedFamilyId
          ? defaultFamilyForTool(tool ?? "wall").id
          : s.selectedFamilyId;
      return {
        workMode: mode,
        leftDockTab: defaultLeftDockTab(mode),
        schedulePanelOpen: mode === "schedules",
        sheetPanelOpen: mode === "sheets",
        activeAuthoringTool: tool,
        selectedFamilyId: family,
      };
    }),

  setLeftDockTab: (tab) => set({ leftDockTab: tab }),
  setSchedulePanelOpen: (open) => set({ schedulePanelOpen: open }),
  setSheetPanelOpen: (open) => set({ sheetPanelOpen: open }),
  setActiveScheduleId: (id) => set({ activeScheduleId: id }),
  setSelectedFamilyId: (id) =>
    set({
      selectedFamilyId: id,
      activeAuthoringTool: getAuthoringFamily(id)?.tool ?? null,
    }),
  setActiveAuthoringTool: (tool) =>
    set((s) => {
      const current = getAuthoringFamily(s.selectedFamilyId);
      const nextFamily =
        current?.tool === tool ? current.id : defaultFamilyForTool(tool).id;
      return {
        activeAuthoringTool: tool,
        selectedFamilyId: nextFamily,
        workMode: "authoring",
        leftDockTab: "browser",
        sketchStart: null,
      };
    }),
  setSketchStart: (pt) => set({ sketchStart: pt }),
}));
