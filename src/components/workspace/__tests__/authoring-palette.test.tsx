import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AuthoringPalette } from "../authoring-palette";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useAppStore } from "@/store/app-store";

describe("AuthoringPalette", () => {
  beforeEach(() => {
    useAppStore.setState({ language: "en" });
    useRevitWorkflowStore.setState({
      workMode: "authoring",
      leftDockTab: "browser",
      selectedFamilyId: "wall-basic-generic-200",
      activeAuthoringTool: "wall",
    });
  });
  afterEach(cleanup);

  it("renders building tools and applies a door type", () => {
    render(<AuthoringPalette />);
    expect(screen.getByTestId("authoring-palette")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Door" }));
    expect(useRevitWorkflowStore.getState().activeAuthoringTool).toBe("door");
    expect(useRevitWorkflowStore.getState().selectedFamilyId).toBe(
      "door-single-flush-910"
    );
    fireEvent.click(screen.getByRole("button", { name: /Double-Flush/ }));
    expect(useRevitWorkflowStore.getState().selectedFamilyId).toBe(
      "door-double-flush-1800"
    );
  });
});
