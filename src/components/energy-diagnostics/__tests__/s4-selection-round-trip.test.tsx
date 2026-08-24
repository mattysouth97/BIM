/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/viewer/building-scene", () => ({
  BuildingScene: (props: {
    energyZoneAnalysisOverride?: readonly { key: string }[] | null;
    onEnergyZoneSelect?: (zoneId: string) => void;
  }) => {
    const zoneId = props.energyZoneAnalysisOverride?.[0]?.key ?? null;
    return (
      <div
        data-testid="mock-existing-building-scene"
        data-zone-id={zoneId ?? ""}
      >
        <button
          type="button"
          disabled={!zoneId}
          onClick={() => zoneId && props.onEnergyZoneSelect?.(zoneId)}
        >
          Pick zone in existing overlay
        </button>
      </div>
    );
  },
}));

import {
  compileCanonicalModelToEngineInput,
  runSimulation,
} from "@/lib/energy-diagnostics/adapter";
import { replaceFact } from "@/lib/energy-diagnostics/facts";
import { getEnergyDiagnosticFixture } from "@/lib/energy-diagnostics/fixtures";
import type {
  AssumptionRecord,
  CanonicalEnergyModel,
  EnergyFact,
} from "@/lib/energy-diagnostics/types";
import { useBimModelStore } from "@/store/bim-model-store";
import { useLayerStore } from "@/store/layer-store";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useSelectionStore } from "@/store/selection-store";

import { EnergyDiagnosisScene } from "../energy-diagnosis-scene";
import { EnergyDiagnosisWorkspace } from "../energy-diagnosis-workspace";

const NOW = "2026-08-24T00:00:00.000Z";

function addVisibleRuleAssumptions(
  model: CanonicalEnergyModel,
): CanonicalEnergyModel {
  const existingIds = new Set(model.assumptions.map((assumption) => assumption.id));
  const missingRecords: AssumptionRecord[] = [
    ...new Set(
      model.facts.flatMap((fact) =>
        fact.assumptionId && !existingIds.has(fact.assumptionId)
          ? [fact.assumptionId]
          : [],
      ),
    ),
  ].map((id) => ({
    id,
    key: `test-visible-rule.${id}`,
    title: "Visible deterministic zoning rule",
    explanation: "The controlled fixture exposes its deterministic zoning rule for UI integration testing.",
    trigger: "A fixture zone was derived from reviewed source spaces.",
    scopeObjectIds: model.geometry.thermalZones.map((zone) => zone.id),
    method: "rule_inference",
    simulationImpact: "Groups source spaces into canonical thermal zones.",
    reversible: true,
  }));
  return {
    ...model,
    assumptions: [...model.assumptions, ...missingRecords],
  };
}

function completedModel(): {
  model: CanonicalEnergyModel;
  fact: EnergyFact<unknown>;
  sourceId: string;
} {
  const fixture = getEnergyDiagnosticFixture("fixture-a");
  const sourceFact = fixture.model.facts.find(
    (fact) => fact.sourceRefs.length > 0,
  );
  if (!sourceFact) throw new Error("Fixture has no source-backed fact");
  const source = sourceFact.sourceRefs[0];
  const fact: EnergyFact<unknown> = {
    ...sourceFact,
    sourceRefs: [{
      ...source,
      boundingBox: { x: 12, y: 24, width: 80, height: 18 },
      linked3dObjectId: "three-linked-source-region",
    }],
  };
  let model = replaceFact(fixture.model, fact);
  model = addVisibleRuleAssumptions(model);
  const input = compileCanonicalModelToEngineInput(model);
  const run = runSimulation(input, { now: () => NOW });
  if (run.status !== "succeeded") throw new Error("Fixture simulation failed");
  return {
    model: { ...model, simulationRuns: [run] },
    fact,
    sourceId: source.id,
  };
}

function resetViewerStores(): void {
  useBimModelStore.setState({
    snapshot: null,
    activeLevelId: null,
    selectedElementId: null,
  });
  useRecipeStore.setState({ baseRecipes: {} });
  useMaterialStore.setState({ properties: {} });
  useSelectionStore.setState({ selectedCanonical: null });
  useLayerStore.getState().setAnalysisOverlayVisible("overlay-zone", false);
  useLayerStore.getState().setAnalysisOverlayVisible("overlay-envelope", false);
}

beforeEach(resetViewerStores);
afterEach(() => {
  cleanup();
  resetViewerStores();
});

describe("S4 canonical selection round trip", () => {
  it("keeps fact, source-region, zone, and result IDs stable through review, inspector, and the existing overlay", async () => {
    const { model, fact, sourceId } = completedModel();
    const source = fact.sourceRefs[0];
    const document = model.drawingSet.documents.find(
      (candidate) => candidate.id === source.documentId,
    );
    if (!document) throw new Error("Source document is missing");
    const onSelectionChange = vi.fn();

    render(
      <EnergyDiagnosisWorkspace
        locale="en"
        initialModel={model}
        onSelectionChange={onSelectionChange}
        renderScene={(context) => <EnergyDiagnosisScene context={context} />}
      />,
    );

    const reviewPanel = screen.getByTestId("stage-panel-review");
    const factButton = within(reviewPanel).getByText(fact.key).closest("button");
    if (!factButton) throw new Error("Review fact has no selection button");
    fireEvent.click(factButton);

    const factSelection = onSelectionChange.mock.calls.at(-1)?.[0];
    const expectedCanonicalIds = model.mappings
      .filter((mapping) =>
        mapping.sourceEntityRefs.some((candidate) => candidate.id === sourceId),
      )
      .map((mapping) => mapping.canonicalObjectId);
    expect(factSelection).toMatchObject({
      kind: "energy_fact",
      id: fact.id,
      documentId: document.id,
      canonicalObjectIds: expectedCanonicalIds,
    });
    expect(factSelection.threeObjectIds).toContain("three-linked-source-region");
    expect(
      within(screen.getByTestId("evidence-inspector")).getByText(fact.key),
    ).toBeTruthy();
    expect(screen.getByText("Evidence region")).toBeTruthy();
    expect(screen.getByText("x 12 · y 24 · w 80 · h 18")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "3D energy model" }));
    await screen.findByTestId("mock-existing-building-scene");
    await waitFor(() => {
      expect(useSelectionStore.getState().selectedCanonical).toMatchObject({
        kind: "energy_fact",
        id: fact.id,
        canonicalObjectIds: expectedCanonicalIds,
      });
    });

    const sourceButton = within(screen.getByTestId("evidence-inspector"))
      .getByText(document.fileName)
      .closest("button");
    if (!sourceButton) throw new Error("Inspector source has no selection button");
    fireEvent.click(sourceButton);

    expect(onSelectionChange.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "source_reference",
      id: sourceId,
      documentId: document.id,
      canonicalObjectIds: expectedCanonicalIds,
    });
    expect(screen.getByTestId("source-review-canvas")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: `${document.fileName} drawing and extraction overlay`,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "3D energy model" }));
    await waitFor(() => {
      expect(useSelectionStore.getState().selectedCanonical).toMatchObject({
        kind: "source_reference",
        id: sourceId,
        canonicalObjectIds: expectedCanonicalIds,
      });
    });

    const scene = screen.getByTestId("mock-existing-building-scene");
    const overlayZoneId = scene.getAttribute("data-zone-id");
    expect(model.geometry.thermalZones.some((zone) => zone.id === overlayZoneId)).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Pick zone in existing overlay" }),
    );

    const zoneSelection = onSelectionChange.mock.calls.at(-1)?.[0];
    expect(zoneSelection).toMatchObject({
      kind: "thermal_zone",
      id: overlayZoneId,
      canonicalObjectIds: [overlayZoneId],
    });
    await waitFor(() => {
      expect(useSelectionStore.getState().selectedCanonical).toMatchObject({
        kind: "thermal_zone",
        id: overlayZoneId,
      });
    });

    const selectedZone = model.geometry.thermalZones.find(
      (zone) => zone.id === overlayZoneId,
    );
    const selectedSpace = model.geometry.spaces.find((space) =>
      selectedZone?.sourceSpaceIds.includes(space.id),
    );
    if (!selectedZone || !selectedSpace) throw new Error("Selected zone has no source space");
    fireEvent.click(screen.getByRole("tab", { name: "Source drawing" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `${selectedSpace.name.value} select thermal zone`,
      }),
    );
    expect(onSelectionChange.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "thermal_zone",
      id: selectedZone.id,
      canonicalObjectIds: [selectedZone.id],
    });

    fireEvent.click(screen.getByTestId("diagnosis-stage-simulation"));
    fireEvent.click(screen.getByTestId("result-annualEnergyKwh-baseline"));
    const run = model.simulationRuns[0];
    const resultSelection = onSelectionChange.mock.calls.at(-1)?.[0];
    expect(resultSelection).toMatchObject({
      kind: "simulation_result",
      id: `simulation-result:${run.id}:annualEnergyKwh`,
      runId: run.id,
    });
    expect(resultSelection.canonicalObjectIds).toEqual(
      model.geometry.thermalZones
        .filter((zone) => zone.conditioned.value === true)
        .map((zone) => zone.id),
    );
    await waitFor(() => {
      expect(useSelectionStore.getState().selectedCanonical).toMatchObject({
        kind: "simulation_series",
        id: `simulation-result:${run.id}:annualEnergyKwh`,
        runId: run.id,
        canonicalObjectIds: resultSelection.canonicalObjectIds,
      });
    });
  });
});
