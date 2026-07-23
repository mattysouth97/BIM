import { describe, it, expect, beforeEach } from "vitest";
import { recoverWorkflowStage } from "../workflow-stage-recovery";
import { useWorkflowStore } from "@/store/workflow-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useRecipeStore } from "@/store/recipe-store";

// Minimal valid guard footprint: one outer ring with ≥3 points
const TRIANGLE: [number, number][][] = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
];

beforeEach(() => {
  useWorkflowStore.setState({ stage: "search", cadSkipped: {} });
  useActiveBuildingStore.getState().clearActiveBuilding();
  useRecipeStore.setState({ overrides: {} });
});

describe("recoverWorkflowStage (P2-16)", () => {
  it("retreats twin → upload when the transient stores are empty (reload)", () => {
    useWorkflowStore.setState({ stage: "twin" });
    const recovered = recoverWorkflowStage();
    expect(recovered).toBe("upload");
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("retreats report → upload when the transient stores are empty (reload)", () => {
    useWorkflowStore.setState({ stage: "report" });
    const recovered = recoverWorkflowStage();
    expect(recovered).toBe("upload");
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("is a no-op on the search stage", () => {
    expect(recoverWorkflowStage()).toBeNull();
    expect(useWorkflowStore.getState().stage).toBe("search");
  });

  it("is a no-op on the upload stage (search guard always passes)", () => {
    useWorkflowStore.setState({ stage: "upload" });
    expect(recoverWorkflowStage()).toBeNull();
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("keeps the twin stage when the active building still has a footprint", () => {
    useActiveBuildingStore.getState().setActiveBuilding("bldg-A");
    useRecipeStore.setState({
      overrides: { "bldg-A": { footprintPolygon: TRIANGLE } },
    });
    useWorkflowStore.setState({ stage: "twin" });
    expect(recoverWorkflowStage()).toBeNull();
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it("keeps the twin stage when the user skipped CAD for the active building (P2-17)", () => {
    useActiveBuildingStore.getState().setActiveBuilding("bldg-A");
    useWorkflowStore.setState({ stage: "twin", cadSkipped: { "bldg-A": true } });
    expect(recoverWorkflowStage()).toBeNull();
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it("does not accept another building's CAD skip as proof (P2-17)", () => {
    useActiveBuildingStore.getState().setActiveBuilding("bldg-A");
    useWorkflowStore.setState({ stage: "twin", cadSkipped: { "bldg-B": true } });
    expect(recoverWorkflowStage()).toBe("upload");
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("does not accept another building's footprint as proof", () => {
    useActiveBuildingStore.getState().setActiveBuilding("bldg-A");
    useRecipeStore.setState({
      overrides: { "bldg-B": { footprintPolygon: TRIANGLE } },
    });
    useWorkflowStore.setState({ stage: "twin" });
    expect(recoverWorkflowStage()).toBe("upload");
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("is idempotent (strict-mode double invocation safe)", () => {
    useWorkflowStore.setState({ stage: "report" });
    recoverWorkflowStage();
    const second = recoverWorkflowStage();
    // Second run starts from "upload", whose path has no failing guard before it
    expect(second).toBeNull();
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  // ─── P2-24 — cad-first recovery ────────────────────────────────────────────

  it('persisted stage "params" with empty stores retreats to "upload" (cad-first)', () => {
    useWorkflowStore.setState({ stage: "params" });
    expect(recoverWorkflowStage()).toBe("upload");
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("cad draft on twin with a footprint but no params retreats to params", () => {
    useActiveBuildingStore.getState().setActiveBuilding("cad-abc");
    useRecipeStore.setState({
      overrides: { "cad-abc": { footprintPolygon: TRIANGLE } },
    });
    useWorkflowStore.setState({ stage: "twin" });
    expect(recoverWorkflowStage()).toBe("params");
    expect(useWorkflowStore.getState().stage).toBe("params");
  });

  it("cad draft on twin with empty stores retreats to upload, never search", () => {
    useActiveBuildingStore.getState().setActiveBuilding("cad-abc");
    useWorkflowStore.setState({ stage: "twin" });
    expect(recoverWorkflowStage()).toBe("upload");
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });
});
