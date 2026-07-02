import { describe, it, expect, beforeEach } from "vitest";
import {
  useScenarioStore,
  DEFAULT_CAPEX_BUDGET_KRW,
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

  it("defaults to unsubsidised track with the ₩2.5억 budget and no building", () => {
    const s = useScenarioStore.getState();
    expect(s.capexBudgetKrw).toBe(DEFAULT_CAPEX_BUDGET_KRW);
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

  it("resetScenario restores all defaults", () => {
    const s = useScenarioStore.getState();
    s.setCapexBudget(1_000_000_000);
    s.setProgramTrack("public-local");
    s.setBuildingInputs(SAMPLE_INPUTS);

    useScenarioStore.getState().resetScenario();

    const after = useScenarioStore.getState();
    expect(after.capexBudgetKrw).toBe(DEFAULT_CAPEX_BUDGET_KRW);
    expect(after.programTrack).toBe("none");
    expect(after.buildingInputs).toBeNull();
  });
});
