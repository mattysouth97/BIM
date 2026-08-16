import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProjectBrowser } from "../project-browser";
import { useViewStore } from "@/lib/bim/views/view-store";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useAppStore } from "@/store/app-store";

describe("ProjectBrowser", () => {
  beforeEach(() => {
    useAppStore.setState({ language: "en" });
    useViewStore.setState({
      views: [
        {
          id: "plan-1",
          name: "Plan — 1F",
          kind: "plan",
          cameraState: {
            kind: "ortho",
            position: [0, 10, 0],
            target: [0, 1, 0],
            zoom: 10,
            near: 0.1,
            far: 50,
          },
          levelElevation: 0,
          levelHeight: 3,
          levelId: "1",
        },
      ],
      activeViewId: null,
    });
    useRevitWorkflowStore.setState({ workMode: "energy" });
  });
  afterEach(cleanup);

  it("lists views and activates a plan view", () => {
    render(<ProjectBrowser />);
    expect(screen.getByTestId("project-browser")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Plan — 1F" }));
    expect(useViewStore.getState().activeViewId).toBe("plan-1");
    expect(useRevitWorkflowStore.getState().workMode).toBe("views");
  });
});
