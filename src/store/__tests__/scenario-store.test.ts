import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useScenarioStore,
  type ScenarioBuildingInputs,
} from "../scenario-store";

const SAMPLE_INPUTS: ScenarioBuildingInputs = {
  buildingPk: "pk-123",
  totalFloorArea: 4_200,
  footprintArea: 600,
  roofType: "flat",
  sidoPrefix: "11",
};

describe("useScenarioStore", () => {
  beforeEach(() => {
    useScenarioStore.getState().resetScenario();
  });

  it("defaults to no budget and no building, without a funding-program field", () => {
    const s = useScenarioStore.getState();
    expect(s.capexBudgetKrw).toBeNull();
    expect(s).not.toHaveProperty("programTrack");
    expect(s.buildingInputs).toBeNull();
  });

  it("setCapexBudget updates the budget", () => {
    useScenarioStore.getState().setCapexBudget(500_000_000);
    expect(useScenarioStore.getState().capexBudgetKrw).toBe(500_000_000);
  });

  it("setBuildingInputs publishes and clears derived inputs", () => {
    useScenarioStore.getState().setBuildingInputs(SAMPLE_INPUTS);
    expect(useScenarioStore.getState().buildingInputs).toEqual(SAMPLE_INPUTS);

    useScenarioStore.getState().setBuildingInputs(null);
    expect(useScenarioStore.getState().buildingInputs).toBeNull();
  });

  it("ignores a previously saved subsidy when the store loads fresh", async () => {
    localStorage.setItem("bim-scenario-state", JSON.stringify({
      state: { programTrack: "public-local", capexBudgetKrw: 1_000_000_000 },
      version: 0,
    }));
    try {
      vi.resetModules();
      const { useScenarioStore: freshStore } = await import("../scenario-store");
      expect(freshStore.getState()).not.toHaveProperty("programTrack");
      expect(freshStore.getState()).not.toHaveProperty("setProgramTrack");
      expect(freshStore.getState().capexBudgetKrw).toBeNull();
      expect(freshStore.getState().appliedMeasureIds).toBeNull();
    } finally {
      localStorage.removeItem("bim-scenario-state");
    }
  });

  it("resetScenario restores all defaults", () => {
    const s = useScenarioStore.getState();
    s.setCapexBudget(1_000_000_000);
    s.setBuildingInputs(SAMPLE_INPUTS);

    useScenarioStore.getState().resetScenario();

    const after = useScenarioStore.getState();
    expect(after.capexBudgetKrw).toBeNull();
    expect(after).not.toHaveProperty("programTrack");
    expect(after.buildingInputs).toBeNull();
  });
});
