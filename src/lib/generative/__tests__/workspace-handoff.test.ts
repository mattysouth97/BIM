import { beforeEach, describe, expect, it } from "vitest";

import { prepareGeneratedWorkspaceSession } from "../workspace-handoff";
import { useLayerStore } from "@/store/layer-store";
import { useRevitWorkflowStore } from "@/store/revit-workflow-store";
import { useWorkflowStore } from "@/store/workflow-store";

describe("prepareGeneratedWorkspaceSession", () => {
  beforeEach(() => {
    useRevitWorkflowStore.setState({
      workMode: "energy",
      leftDockTab: "insights",
    });
    useLayerStore.getState().setInteriorVisible(false);
    useWorkflowStore.getState().setStage("search");
  });

  it("opens the twin for review with the interior visible, not 3D authoring", () => {
    prepareGeneratedWorkspaceSession();

    expect(useRevitWorkflowStore.getState().workMode).toBe("energy");
    expect(useLayerStore.getState().interiorVisible).toBe(true);
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });
});
