import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RevitWorkRail } from "../revit-work-rail";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useAppStore } from "@/store/app-store";

describe("RevitWorkRail", () => {
  beforeEach(() => {
    useAppStore.setState({ language: "en" });
    useRevitWorkflowStore.setState({
      workMode: "energy",
      leftDockTab: "insights",
      schedulePanelOpen: false,
      sheetPanelOpen: false,
    });
  });
  afterEach(cleanup);

  it("renders every mode incl. 작성, and switches on click", () => {
    render(<RevitWorkRail />);
    expect(screen.getByTestId("revit-work-rail")).toBeTruthy();
    // Authoring reaches the palette + AuthoringFamilyLayer; without the rail
    // button both are unreachable code.
    expect(screen.getByRole("button", { name: "Authoring" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Views" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Schedules" }));
    expect(useRevitWorkflowStore.getState().workMode).toBe("schedules");
    expect(useRevitWorkflowStore.getState().schedulePanelOpen).toBe(true);
  });
});
