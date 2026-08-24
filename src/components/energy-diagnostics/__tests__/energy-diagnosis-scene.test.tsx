/* @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/viewer/building-scene", () => ({
  BuildingScene: (props: {
    envelopeAnalysisOverride?: {
      resultSemantics: { source: string; inputHash: string | null };
    } | null;
    energyZoneAnalysisOverride?: readonly {
      resultSemantics: { source: string };
    }[] | null;
  }) => (
    <div
      data-testid="mock-building-scene"
      data-envelope-source={
        props.envelopeAnalysisOverride?.resultSemantics.source ?? "none"
      }
      data-envelope-input-hash={
        props.envelopeAnalysisOverride?.resultSemantics.inputHash ?? "none"
      }
      data-zone-source={
        props.energyZoneAnalysisOverride?.[0]?.resultSemantics.source ?? "none"
      }
    />
  ),
}));

import { useBimModelStore } from "@/store/bim-model-store";
import { useLayerStore } from "@/store/layer-store";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useSelectionStore } from "@/store/selection-store";

import { EnergyDiagnosisScene } from "../energy-diagnosis-scene";
import {
  applyInfiltrationAssumption,
  loadRepresentativeCase,
  resolveVisibleConflict,
  runBaselineModel,
  spatialResultsForRun,
} from "../model-operations";

describe("EnergyDiagnosisScene selected-run bridge", () => {
  beforeEach(() => {
    useBimModelStore.setState({
      snapshot: null,
      activeLevelId: null,
      selectedElementId: null,
    });
    useRecipeStore.setState({ baseRecipes: {} });
    useMaterialStore.setState({ properties: {} });
    useSelectionStore.setState({ selectedCanonical: null });
    useLayerStore.getState().setAnalysisOverlayVisible("overlay-zone", false);
    useLayerStore
      .getState()
      .setAnalysisOverlayVisible("overlay-envelope", false);
  });

  afterEach(() => cleanup());

  it("renders exact run mappings and restores global viewer state on unmount", async () => {
    const reference = await loadRepresentativeCase();
    let model = applyInfiltrationAssumption(reference.model);
    const conflict = model.conflicts[0];
    if (!conflict.selectedFactId) throw new Error("reference conflict has no selection");
    model = resolveVisibleConflict(model, conflict.id, conflict.selectedFactId);
    const completed = runBaselineModel(model);
    const zone = completed.model.geometry.thermalZones[0];
    const spatialResults = spatialResultsForRun(completed.run);
    if (!zone || !spatialResults) throw new Error("reference run has no spatial result");

    const view = render(
      <EnergyDiagnosisScene
        context={{
          locale: "en",
          model: completed.model,
          selected: {
            kind: "thermal_zone",
            id: zone.id,
            documentId: null,
            canonicalObjectIds: [zone.id],
            threeObjectIds: [],
          },
          baselineRun: completed.run,
          scenarioRun: null,
          activeRun: completed.run,
          spatialResults,
          onSelectZone: vi.fn(),
          onSelectObject: vi.fn(),
        }}
      />,
    );

    const scene = await screen.findByTestId("mock-building-scene");
    expect(scene.getAttribute("data-zone-source")).toBe(
      "selected_simulation_run",
    );
    expect(scene.getAttribute("data-envelope-source")).toBe(
      "selected_simulation_run",
    );
    expect(scene.getAttribute("data-envelope-input-hash")).toBe(
      completed.run.engineInput.inputHash,
    );
    await waitFor(() => {
      expect(useLayerStore.getState().analysisOverlays["overlay-zone"]).toBe(true);
      expect(
        useLayerStore.getState().analysisOverlays["overlay-envelope"],
      ).toBe(true);
      expect(useSelectionStore.getState().selectedCanonical).toMatchObject({
        kind: "thermal_zone",
        buildingPk: expect.stringMatching(/^energy-diagnostics:/),
        id: zone.id,
      });
    });

    view.unmount();

    expect(useBimModelStore.getState().snapshot).toBeNull();
    expect(useRecipeStore.getState().baseRecipes).toEqual({});
    expect(useMaterialStore.getState().properties).toEqual({});
    expect(useLayerStore.getState().analysisOverlays["overlay-zone"]).toBe(false);
    expect(
      useLayerStore.getState().analysisOverlays["overlay-envelope"],
    ).toBe(false);
    expect(useSelectionStore.getState().selectedCanonical).toBeNull();
  });
});
