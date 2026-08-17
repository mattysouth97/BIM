import { beforeEach, describe, expect, it } from "vitest";

import {
  prepareDemoWorkspaceSession,
  prepareGeneratedWorkspaceSession,
} from "../workspace-handoff";
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

describe("prepareDemoWorkspaceSession", () => {
  beforeEach(() => {
    useLayerStore.getState().setInteriorVisible(false);
    useLayerStore.getState().setLayerVisible("envelope", true);
    useLayerStore.getState().setLayerVisible("mep", false);
    useWorkflowStore.getState().setStage("search");
  });

  it("turns the solved interior on so the demo is a building, not a box", () => {
    prepareDemoWorkspaceSession();
    const layers = useLayerStore.getState();
    expect(layers.interiorVisible).toBe(true);
    expect(layers.visibility.envelope).toBe(false);
    expect(layers.visibility.structure).toBe(true);
    expect(layers.visibility.mep).toBe(true);
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });
});
