import { describe, it, expect, beforeEach } from "vitest";
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

  it("defaults to unsubsidised track, NO budget (Lane 3D), and no building", () => {
    const s = useScenarioStore.getState();
    expect(s.capexBudgetKrw).toBeNull();
    expect(s.programTrack).toBe("none");
    expect(s.buildingInputs).toBeNull();
  });

  it("setCapexBudget updates the budget", () => {
    useScenarioStore.getState().setCapexBudget(500_000_000);
    expect(useScenarioStore.getState().capexBudgetKrw).toBe(500_000_000);
  });

  it("setProgramTrack switches tracks", () => {
    useScenarioStore.getState().setProgramTrack("private-base");
    expect(useScenarioStore.getState().programTrack).toBe("private-base");
  });

  it("setBuildingInputs publishes and clears derived inputs", () => {
    useScenarioStore.getState().setBuildingInputs(SAMPLE_INPUTS);
    expect(useScenarioStore.getState().buildingInputs).toEqual(SAMPLE_INPUTS);

    useScenarioStore.getState().setBuildingInputs(null);
    expect(useScenarioStore.getState().buildingInputs).toBeNull();
  });

  it("persists only the budget and program track so tomorrow reopens the same answer", () => {
    useScenarioStore.getState().setCapexBudget(500_000_000);
    useScenarioStore.getState().setProgramTrack("public-seoul-or-central");
    useScenarioStore.getState().setBuildingInputs(SAMPLE_INPUTS);
    const partial = useScenarioStore.persist.getOptions().partialize!(
      useScenarioStore.getState(),
    );
    // The budget is per building and never persisted (Lane 3D).
    expect(partial).toEqual({
      programTrack: "public-seoul-or-central",
    });
    expect(partial).not.toHaveProperty("buildingInputs");
    expect(partial).not.toHaveProperty("capexBudgetKrw");
  });

  it("resetScenario restores all defaults", () => {
    const s = useScenarioStore.getState();
    s.setCapexBudget(1_000_000_000);
    s.setProgramTrack("public-local");
    s.setBuildingInputs(SAMPLE_INPUTS);

    useScenarioStore.getState().resetScenario();

    const after = useScenarioStore.getState();
    expect(after.capexBudgetKrw).toBeNull();
    expect(after.programTrack).toBe("none");
    expect(after.buildingInputs).toBeNull();
  });
});
