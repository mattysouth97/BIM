import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveVisualState,
  hasAnyVisual,
  proposalVisualIds,
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

describe("proposalVisualIds — the one gate between the knapsack and the model", () => {
  it("shows the knapsack's selection while the preview is on", () => {
    const selected = ["envelope-wall-insulation", "solar-pv-flat"];
    expect(proposalVisualIds(true, selected)).toBe(selected);
    expect(deriveVisualState(proposalVisualIds(true, selected)).wallsUpgraded).toBe(true);
  });

  it("shows the building as it stands while the preview is off", () => {
    const selected = ["envelope-wall-insulation", "solar-pv-flat"];
    expect(proposalVisualIds(false, selected)).toEqual([]);
    expect(deriveVisualState(proposalVisualIds(false, selected))).toEqual(NO_RETROFIT_VISUALS);
  });

  it("treats an unevaluated scenario as nothing proposed, not as an error", () => {
    expect(proposalVisualIds(true, null)).toEqual([]);
    expect(proposalVisualIds(false, null)).toEqual([]);
  });

  it("returns a stable reference either way, so layers do not regenerate", () => {
    // The generators key off this array's identity; a fresh [] per render
    // would rebuild the MEP scene on every frame.
    expect(proposalVisualIds(false, ["a"])).toBe(proposalVisualIds(false, ["b"]));
    expect(proposalVisualIds(true, null)).toBe(proposalVisualIds(false, null));
  });
});

describe("scenario-store — the proposal is what the model draws", () => {
  beforeEach(() => {
    useScenarioStore.setState({
      capexBudgetKrw: DEFAULT_CAPEX_BUDGET_KRW,
      programTrack: "none",
      buildingInputs: null,
      selectedMeasureIds: null,
      previewProposal: true,
    });
  });

  it("previews the proposal by default", () => {
    expect(useScenarioStore.getState().previewProposal).toBe(true);
  });

  it("setPreviewProposal is the only writer of that flag", () => {
    useScenarioStore.getState().setPreviewProposal(false);
    expect(useScenarioStore.getState().previewProposal).toBe(false);
    useScenarioStore.getState().setPreviewProposal(true);
    expect(useScenarioStore.getState().previewProposal).toBe(true);
  });

  it("switching buildings drops the selection; republishing the same one keeps it", () => {
    const inputs = {
      buildingPk: "bldg-A",
      totalFloorArea: 1000,
      footprintArea: 250,
      roofType: "flat" as const,
      sidoPrefix: "11",
    };
    useScenarioStore.getState().setBuildingInputs(inputs);
    useScenarioStore.getState().setSelectedMeasureIds(["solar-pv-flat"]);

    // Republishing the SAME building (overlay re-mount) keeps the selection
    useScenarioStore.getState().setBuildingInputs({ ...inputs });
    expect(useScenarioStore.getState().selectedMeasureIds).toEqual(["solar-pv-flat"]);

    // A different building drops it, so building A's proposal never draws
    // itself on building B in the frames before the HUD republishes.
    useScenarioStore.getState().setBuildingInputs({ ...inputs, buildingPk: "bldg-B" });
    expect(useScenarioStore.getState().selectedMeasureIds).toBeNull();
  });

  it("resetScenario returns to previewing an empty selection", () => {
    useScenarioStore.getState().setSelectedMeasureIds(["lighting-led"]);
    useScenarioStore.getState().setPreviewProposal(false);
    useScenarioStore.getState().resetScenario();
    expect(useScenarioStore.getState().selectedMeasureIds).toBeNull();
    expect(useScenarioStore.getState().previewProposal).toBe(true);
  });

  it("keeps the selection's identity when the knapsack republishes the same set", () => {
    useScenarioStore.getState().setSelectedMeasureIds(["envelope-wall-insulation"]);
    const first = useScenarioStore.getState().selectedMeasureIds;
    useScenarioStore.getState().setSelectedMeasureIds(["envelope-wall-insulation"]);
    expect(useScenarioStore.getState().selectedMeasureIds).toBe(first);
  });
});
