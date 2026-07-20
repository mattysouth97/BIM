// src/components/workspace/__tests__/workflow-stepper.test.tsx
// P1-08 (b) — the stepper must route through guard-aware navigation:
// locked stages are disabled with a visible reason; unlocked stages navigate;
// backward navigation always works.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { WorkflowStepper } from "../workflow-stepper";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useMaterialStore } from "@/store/material-store";
import { TRIANGLE_RINGS } from "@/hooks/__tests__/test-fixtures";

const PK = "TEST-PK-STEPPER";

function resetStores() {
  useWorkflowStore.setState({
    stage: "search",
    completion: { search: false, upload: false, twin: false, report: false },
  });
  useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  useMaterialStore.setState({ properties: {} });
  useActiveBuildingStore.getState().clearActiveBuilding();
}

describe("WorkflowStepper (P1-08 b)", () => {
  beforeEach(resetStores);
  // vitest globals are off, so RTL's auto-cleanup never registers — clean up
  // explicitly or DOM from prior tests leaks into queries.
  afterEach(cleanup);

  it("blocks forward navigation past upload without a CAD footprint and shows the reason", () => {
    useWorkflowStore.setState({ stage: "upload" });
    useActiveBuildingStore.getState().setActiveBuilding(PK);

    render(<WorkflowStepper />);

    const twinButton = screen.getByRole("button", { name: /Twin/ });
    expect((twinButton as HTMLButtonElement).disabled).toBe(true);
    // Reason surfaced via title attribute — must reflect the real guard
    // (CAD footprint requirement), not an arbitrary string.
    expect(twinButton.getAttribute("title") ?? "").toMatch(/도면|CAD/);

    fireEvent.click(twinButton);
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it("allows forward navigation once the polygon override exists", () => {
    useWorkflowStore.setState({ stage: "upload" });
    useActiveBuildingStore.getState().setActiveBuilding(PK);
    act(() => {
      useRecipeStore.getState().setOverride(PK, "footprintPolygon", TRIANGLE_RINGS);
    });

    render(<WorkflowStepper />);

    const twinButton = screen.getByRole("button", { name: /Twin/ });
    expect((twinButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(twinButton);
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it("always allows backward navigation", () => {
    useWorkflowStore.setState({ stage: "twin" });
    useActiveBuildingStore.getState().setActiveBuilding(PK);

    render(<WorkflowStepper />);

    const searchButton = screen.getByRole("button", { name: /Search/ });
    expect((searchButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(searchButton);
    expect(useWorkflowStore.getState().stage).toBe("search");
  });

  it("contains no direct setStage escape hatch (guard fitness)", () => {
    // Behavioral proxy for the grep fitness: clicking Report from search with
    // no polygon must not move the stage, which setStage would have allowed.
    useWorkflowStore.setState({ stage: "search" });
    render(<WorkflowStepper />);

    fireEvent.click(screen.getByRole("button", { name: /Report/ }));
    expect(useWorkflowStore.getState().stage).toBe("search");
  });
});
