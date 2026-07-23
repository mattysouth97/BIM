import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveVisualState,
  hasAnyVisual,
  NO_RETROFIT_VISUALS,
} from "../measure-visuals";
import { useScenarioStore, DEFAULT_CAPEX_BUDGET_KRW } from "@/store/scenario-store";

describe("deriveVisualState", () => {
  it("returns all-false for no applied measures", () => {
    const s = deriveVisualState([]);
    expect(s).toEqual(NO_RETROFIT_VISUALS);
    expect(hasAnyVisual(s)).toBe(false);
  });

  it("maps each generator ID family to its flag", () => {
    expect(deriveVisualState(["envelope-wall-insulation"]).wallsUpgraded).toBe(true);
    expect(deriveVisualState(["envelope-roof-insulation"]).roofUpgraded).toBe(true);
    expect(deriveVisualState(["envelope-window-replacement"]).windowsUpgraded).toBe(true);
    expect(deriveVisualState(["envelope-floor-insulation"]).floorsUpgraded).toBe(true);
    expect(deriveVisualState(["hvac-boiler-upgrade"]).hvacUpgraded).toBe(true);
    expect(deriveVisualState(["hvac-heat-pump"]).hvacUpgraded).toBe(true);
    expect(deriveVisualState(["lighting-led-smart"]).lightingUpgraded).toBe(true);
    expect(deriveVisualState(["solar-pv-flat"]).solarInstalled).toBe(true);
    expect(deriveVisualState(["solar-pv-gable"]).solarInstalled).toBe(true);
  });

  it("combines multiple applied measures", () => {
    const s = deriveVisualState([
      "envelope-window-replacement",
      "hvac-hrv",
      "solar-pv-flat",
    ]);
    expect(s.windowsUpgraded).toBe(true);
    expect(s.hvacUpgraded).toBe(true);
    expect(s.solarInstalled).toBe(true);
    expect(s.wallsUpgraded).toBe(false);
    expect(hasAnyVisual(s)).toBe(true);
  });

  it("ignores unknown IDs", () => {
    expect(deriveVisualState(["mystery-measure"])).toEqual(NO_RETROFIT_VISUALS);
  });
});

describe("scenario-store applied measures (P2-20)", () => {
  beforeEach(() => {
    useScenarioStore.setState({
      capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
      programTrack: "none",
      buildingInputs: null,
      appliedMeasureIds: [],
    });
  });

  it("toggleAppliedMeasure adds then removes", () => {
    useScenarioStore.getState().toggleAppliedMeasure("hvac-hrv");
    expect(useScenarioStore.getState().appliedMeasureIds).toEqual(["hvac-hrv"]);
    useScenarioStore.getState().toggleAppliedMeasure("hvac-hrv");
    expect(useScenarioStore.getState().appliedMeasureIds).toEqual([]);
  });

  it("switching buildings clears applied measures; same building keeps them", () => {
    const inputs = {
      buildingPk: "bldg-A",
      totalFloorArea: 1000,
      footprintArea: 250,
      roofType: "flat" as const,
      sidoPrefix: "11",
    };
    useScenarioStore.getState().setBuildingInputs(inputs);
    useScenarioStore.getState().toggleAppliedMeasure("solar-pv-flat");

    // Republishing the SAME building (overlay re-mount) keeps the selection
    useScenarioStore.getState().setBuildingInputs({ ...inputs });
    expect(useScenarioStore.getState().appliedMeasureIds).toEqual(["solar-pv-flat"]);

    // A different building clears it
    useScenarioStore.getState().setBuildingInputs({ ...inputs, buildingPk: "bldg-B" });
    expect(useScenarioStore.getState().appliedMeasureIds).toEqual([]);
  });

  it("resetScenario clears applied measures", () => {
    useScenarioStore.getState().toggleAppliedMeasure("lighting-led");
    useScenarioStore.getState().resetScenario();
    expect(useScenarioStore.getState().appliedMeasureIds).toEqual([]);
  });
});
