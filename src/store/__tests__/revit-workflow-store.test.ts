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
      selectedFamilyId: null,
      activeAuthoringTool: null,
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

  it("enters building authoring with a wall type selected", () => {
    useRevitWorkflowStore.getState().setWorkMode("authoring");
    const state = useRevitWorkflowStore.getState();
    expect(state.workMode).toBe("authoring");
    expect(state.leftDockTab).toBe("browser");
    expect(state.activeAuthoringTool).toBe("wall");
    expect(state.selectedFamilyId).toBe("wall-basic-generic-200");
  });

  it("switching authoring tools picks that tool's default type", () => {
    useRevitWorkflowStore.getState().setActiveAuthoringTool("door");
    const state = useRevitWorkflowStore.getState();
    expect(state.workMode).toBe("authoring");
    expect(state.activeAuthoringTool).toBe("door");
    expect(state.selectedFamilyId).toBe("door-single-flush-910");
  });
});
