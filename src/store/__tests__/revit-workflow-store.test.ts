import { describe, it, expect, beforeEach } from "vitest";
import { useRevitWorkflowStore } from "../revit-workflow-store";

describe("useRevitWorkflowStore", () => {
  beforeEach(() => {
    useRevitWorkflowStore.setState({
      workMode: "energy",
      leftDockTab: "insights",
      schedulePanelOpen: false,
      sheetPanelOpen: false,
      activeScheduleId: "wall-schedule-v1",
    });
  });

  it("starts on energy / insights so retrofit work is not displaced", () => {
    const state = useRevitWorkflowStore.getState();
    expect(state.workMode).toBe("energy");
    expect(state.leftDockTab).toBe("insights");
  });

  it("opens the browser and schedule panel in schedules mode", () => {
    useRevitWorkflowStore.getState().setWorkMode("schedules");
    const state = useRevitWorkflowStore.getState();
    expect(state.leftDockTab).toBe("browser");
    expect(state.schedulePanelOpen).toBe(true);
    expect(state.sheetPanelOpen).toBe(false);
  });

  it("opens the sheet panel in sheets mode", () => {
    useRevitWorkflowStore.getState().setWorkMode("sheets");
    const state = useRevitWorkflowStore.getState();
    expect(state.sheetPanelOpen).toBe(true);
    expect(state.schedulePanelOpen).toBe(false);
  });
});
