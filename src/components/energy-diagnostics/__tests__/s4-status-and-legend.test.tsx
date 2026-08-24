/* @vitest-environment happy-dom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { AnalysisLegend } from "@/components/viewer/analysis-legend";
import { getEnergyDiagnosticFixture } from "@/lib/energy-diagnostics/fixtures";
import type {
  CanonicalEnergyModel,
  ConflictRecord,
  EnergyFact,
} from "@/lib/energy-diagnostics/types";
import {
  buildZoneOverlay,
  type EnergyZone,
} from "@/lib/layers/analysis/zone-overlay";
import { useAppStore } from "@/store/app-store";
import { useLayerStore } from "@/store/layer-store";

import { EvidenceInspector } from "../evidence-inspector";

const NOW = "2026-08-24T00:00:00.000Z";

function sourceFact(): {
  model: CanonicalEnergyModel;
  fact: EnergyFact<unknown>;
} {
  const model = getEnergyDiagnosticFixture("fixture-a").model;
  const fact = model.facts.find(
    (candidate) =>
      candidate.sourceRefs.length > 0 && candidate.assumptionId == null,
  );
  if (!fact) throw new Error("Fixture has no independently sourced fact");
  return { model, fact };
}

function renderInspector(
  model: CanonicalEnergyModel,
  fact: EnergyFact<unknown>,
) {
  return render(
    <EvidenceInspector
      model={model}
      fact={fact}
      locale="en"
      onSelectDocument={vi.fn()}
      onSelectSourceReference={vi.fn()}
      onResolveConflict={vi.fn()}
    />,
  );
}

function zone(input: Readonly<{
  key: string;
  programKey: string;
  label: string;
  value: number | null;
  status: "area_apportioned_approximation" | "missing";
}>): EnergyZone {
  return {
    key: input.key,
    keySource: "canonical_zone_id",
    programKey: input.programKey,
    labelKo: input.label,
    labelEn: input.label,
    levelId: "level-1",
    floorNo: 1,
    elevationM: 0,
    storeyHeightM: 3,
    rooms: [{
      id: `room-${input.key}`,
      x: 0,
      z: 0,
      widthM: 10,
      depthM: 10,
      areaSqm: 100,
    }],
    areaSqm: 100,
    areaShare: 0.5,
    demandKwhPerYear: input.value ?? 0,
    intensityKwhPerSqm: input.value == null ? 0 : input.value / 100,
    resultValueKwhPerYear: input.value,
    resultIntensityKwhPerSqm:
      input.value == null ? null : input.value / 100,
    resultStatus: input.status,
    resultSemantics: {
      metric: "annual_energy",
      unit: "kWh/year",
      period: "annual",
      evidenceStatus: input.status,
      allocationMethod:
        input.status === "area_apportioned_approximation"
          ? "conditioned_floor_area_share"
          : "engine_result",
      source: "selected_simulation_run",
      sourceFactIds: [`fact-${input.key}`],
      explanation:
        input.status === "missing"
          ? "No selected-run value is available."
          : "Annual result apportioned by conditioned floor area.",
    },
    bandIndex: 0,
    color: input.status === "missing" ? "#64748b" : "#2563eb",
  };
}

beforeEach(() => {
  useAppStore.setState({ language: "en" });
  useLayerStore.getState().setAnalysisOverlayVisible("overlay-envelope", false);
  useLayerStore.getState().setAnalysisOverlayVisible("overlay-structure", false);
  useLayerStore.getState().setAnalysisOverlayVisible("overlay-zone", false);
});

afterEach(() => {
  cleanup();
  useLayerStore.getState().setAnalysisOverlayVisible("overlay-zone", false);
});

describe("S4 non-colour state presentation", () => {
  it("names a missing fact and explains the absent source without relying on colour", () => {
    const { model, fact } = sourceFact();
    const missingFact: EnergyFact<unknown> = {
      ...fact,
      value: null,
      status: "missing",
      confidence: null,
      sourceRefs: [],
      extractionMethod: "engine_default",
      authority: "regional_or_engine_default",
      reviewedByUser: false,
      updatedAt: NOW,
    };

    renderInspector(model, missingFact);

    const inspector = within(screen.getByTestId("evidence-inspector"));
    expect(inspector.getByText("Missing")).toBeTruthy();
    expect(
      inspector.getByText(
        "No drawing region is linked. This is user input or an explicit assumption.",
      ),
    ).toBeTruthy();
  });

  it("names a conflict, explains the disagreement, and exposes the selected candidate semantically", () => {
    const { model, fact } = sourceFact();
    const alternate: EnergyFact<unknown> = {
      ...fact,
      id: `${fact.id}-alternate`,
      value: typeof fact.value === "number" ? fact.value + 1 : `${String(fact.value)} alternate`,
      updatedAt: NOW,
    };
    const conflict: ConflictRecord<unknown> = {
      id: "conflict-s4-visible",
      key: fact.key,
      affectedObjectIds: [model.building.id],
      candidates: [
        { fact, priority: 2 },
        { fact: alternate, priority: 3 },
      ],
      selectedFactId: fact.id,
      selectionRationale: "The stronger source is selected, but both values remain visible.",
      resolutionStatus: "auto_selected_visible",
      blocking: true,
      downstreamImpact: "The disagreement blocks simulation until confirmed.",
      createdAt: NOW,
    };
    const conflictedModel: CanonicalEnergyModel = {
      ...model,
      conflicts: [conflict],
    };

    renderInspector(conflictedModel, fact);

    const inspector = within(screen.getByTestId("evidence-inspector"));
    expect(inspector.getByText("Conflict")).toBeTruthy();
    const panel = within(screen.getByTestId("conflict-resolution-panel"));
    expect(panel.getByText("Drawing values disagree")).toBeTruthy();
    expect(
      panel.getByText("The disagreement blocks simulation until confirmed."),
    ).toBeTruthy();
    const candidates = panel.getAllByRole("button");
    expect(candidates).toHaveLength(2);
    expect(candidates[0].getAttribute("aria-pressed")).toBe("true");
    expect(candidates[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("uses a missing wireframe pattern and a textual legend with unit, annual period, and allocation method", () => {
    const calculated = zone({
      key: "zone-office",
      programKey: "office",
      label: "Office",
      value: 2_400,
      status: "area_apportioned_approximation",
    });
    const missing = zone({
      key: "zone-service",
      programKey: "service",
      label: "Service",
      value: null,
      status: "missing",
    });
    const overlay = buildZoneOverlay([missing]);
    const mesh = overlay.getObjectByName(
      "energy-zone:zone-service",
    ) as THREE.InstancedMesh;

    expect(mesh.userData.resultStatus).toBe("missing");
    expect(mesh.userData.selectionStyle).toBe("missing_wireframe");
    expect((mesh.material as THREE.MeshBasicMaterial).wireframe).toBe(true);
    expect(mesh.userData.resultSemantics).toMatchObject({
      unit: "kWh/year",
      period: "annual",
      evidenceStatus: "missing",
    });

    useLayerStore.getState().setAnalysisOverlayVisible("overlay-zone", true);
    render(
      <AnalysisLegend
        buildingPk="s4-building"
        zoneAnalysisOverride={[calculated, missing]}
      />,
    );

    expect(screen.getByText("Energy zones")).toBeTruthy();
    expect(screen.getByText("selected run")).toBeTruthy();
    expect(screen.getByText("2,400 kWh/yr")).toBeTruthy();
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(
      screen.getByText(
        /Zone demand = zone floor-area share × building heating\+cooling demand/,
      ),
    ).toBeTruthy();
    expect(calculated.resultSemantics).toMatchObject({
      unit: "kWh/year",
      period: "annual",
      allocationMethod: "conditioned_floor_area_share",
    });
  });
});
