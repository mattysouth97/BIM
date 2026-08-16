import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProjectBrowser } from "../project-browser";
import { useViewStore } from "@/lib/bim/views/view-store";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useBimModelStore } from "@/store/bim-model-store";
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
    useBimModelStore.setState({
      snapshot: {
        buildingPk: "pk",
        levels: [
          {
            id: "level:1",
            name: "1F",
            elevation: 0,
            height: 3,
            floorNo: 1,
            associatedViewId: "plan-1",
          },
        ],
        grids: [],
        types: {},
        documents: [],
        visibility: {},
        elements: [
          {
            id: "W-1-S",
            origin: "generated",
            kind: "wall",
            category: "Walls",
            family: "Basic Wall",
            typeId: "generated-wall-exterior",
            buildingPk: "pk",
            levelId: "level:1",
            hostId: null,
            mark: "W-1-S",
            instanceParameters: {},
            placement: { x: 0, y: 0, z: 0, rotationY: 0 },
            phaseCreated: "existing",
            visible: true,
          },
        ],
      },
    });
  });
  afterEach(cleanup);

  it("lists views and activates a plan view", () => {
    render(<ProjectBrowser />);
    expect(screen.getByTestId("project-browser")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Plan — 1F" }));
    expect(useViewStore.getState().activeViewId).toBe("plan-1");
    expect(useRevitWorkflowStore.getState().workMode).toBe("views");
  });

  it("lists first-class levels from the BIM model", () => {
    render(<ProjectBrowser />);
    expect(screen.getByRole("button", { name: /1F\s+0\.00 m/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /1F\s+0\.00 m/ }));
    expect(useBimModelStore.getState().activeLevelId).toBe("level:1");
  });
});
