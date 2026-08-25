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
    diagnosticSpatialTarget?: {
      precision: string;
      patches: readonly unknown[];
    } | null;
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
      data-focus-precision={props.diagnosticSpatialTarget?.precision ?? "none"}
      data-focus-patch-count={props.diagnosticSpatialTarget?.patches.length ?? 0}
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
    const viewport = screen.getByTestId("energy-diagnosis-scene");
    expect(viewport.className).toContain("h-[clamp(28rem,62svh,52rem)]");
    expect(viewport.className).toContain("min-h-[28rem]");
    expect(viewport.className).toContain("min-w-0");
    expect(viewport.className).toContain("max-w-full");
    expect(viewport.className).toContain("overflow-hidden");
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

  it("passes an exact finding surface to the viewer and announces camera focus", async () => {
    const reference = await loadRepresentativeCase();
    const surface = reference.model.geometry.surfaces.find(
      (candidate) => candidate.type === "exterior_wall",
    );
    if (!surface) throw new Error("reference model has no exterior wall");
    const onSelectZone = vi.fn();
    useSelectionStore.setState({
      selectedCanonical: {
        kind: "thermal_zone",
        buildingPk: `energy-diagnostics:${reference.model.building.id}`,
        id: reference.model.geometry.thermalZones[0].id,
        documentId: null,
        canonicalObjectIds: [reference.model.geometry.thermalZones[0].id],
        threeObjectIds: [],
      },
    });

    render(
      <EnergyDiagnosisScene
        context={{
          locale: "en",
          model: reference.model,
          selected: {
            kind: "diagnostic_finding",
            id: "finding:selected-wall",
            documentId: null,
            canonicalObjectIds: [surface.id],
            threeObjectIds: surface.threeObjectId
              ? [surface.threeObjectId]
              : [],
          },
          baselineRun: null,
          scenarioRun: null,
          activeRun: null,
          spatialResults: null,
          onSelectZone,
          onSelectObject: vi.fn(),
        }}
      />,
    );

    const viewport = screen.getByTestId("energy-diagnosis-scene");
    const scene = screen.getByTestId("mock-building-scene");
    const status = screen.getByTestId("diagnostic-spatial-selection-status");
    expect(viewport.getAttribute("data-focus-precision")).toBe("exact_surface");
    expect(viewport.getAttribute("data-highlighted-object-count")).toBe("1");
    expect(scene.getAttribute("data-focus-precision")).toBe("exact_surface");
    expect(scene.getAttribute("data-focus-patch-count")).toBe("1");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toContain("camera focused");
    await waitFor(() => {
      expect(useSelectionStore.getState().selectedCanonical?.kind).toBe(
        "diagnostic_finding",
      );
    });
    expect(onSelectZone).not.toHaveBeenCalled();
  });
});
