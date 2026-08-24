import { describe, expect, it } from "vitest";
import {
  compileCanonicalModelToEngineInput,
  mapResultsToCanonicalObjects,
  runSimulation,
  type CompiledDegreeDayInput,
} from "../adapter";
import { generateDiagnosticFindings } from "../findings";
import { getEnergyDiagnosticFixture } from "../fixtures";
import { createEnergyScenario } from "../scenarios";
import type { CanonicalEnergyModel, ConflictRecord } from "../types";
import { validateCanonicalEnergyModel } from "../validation";

const FIXED_TIME = "2026-08-23T00:00:00.000Z";

function run(input: CompiledDegreeDayInput) {
  return runSimulation(input, { now: () => FIXED_TIME });
}

describe("canonical model degree-day adapter", () => {
  it.each(["fixture-a", "fixture-b", "fixture-c", "fixture-d", "fixture-e"] as const)(
    "completes a real simulation for controlled %s",
    (fixtureId) => {
      const model = getEnergyDiagnosticFixture(fixtureId).model;
      const validation = validateCanonicalEnergyModel(model);
      expect(
        validation.validForSimulation,
        validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"),
      ).toBe(true);
      const simulation = run(compileCanonicalModelToEngineInput(model));
      expect(simulation.status).toBe("succeeded");
      expect(simulation.result?.annualEnergyKwh).toBeGreaterThan(0);
      expect(simulation.engineOutput?.engineId).toBe("bimfit-degree-day");
    },
  );

  it("carries canonical opening dimensions and sill placement into the exact recipe", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-d").model;
    const opening = baseline.geometry.openings[0];
    const model = {
      ...baseline,
      geometry: {
        ...baseline.geometry,
        openings: [
          {
            ...opening,
            sillHeightM: { ...opening.sillHeightM, value: 1.2 },
          },
        ],
      },
    };

    const input = compileCanonicalModelToEngineInput(model);

    expect(input.payload.recipe.facade).toMatchObject({
      windowWidth: opening.widthM.value,
      windowHeight: opening.heightM.value,
      sillHeight: 1.2,
    });
    expect(input.payload.recipe.facade.windowRatio).toBeGreaterThan(0);
    expect(
      input.payload.provenance.find(
        (entry) => entry.inputPath === "recipe.facade.sillHeight",
      )?.factIds,
    ).toContain(opening.sillHeightM.id);

    const zeroSill = {
      ...baseline,
      geometry: {
        ...baseline.geometry,
        openings: [
          {
            ...opening,
            sillHeightM: { ...opening.sillHeightM, value: 0 },
          },
        ],
      },
    };
    expect(
      compileCanonicalModelToEngineInput(zeroSill).payload.recipe.facade
        .sillHeight,
    ).toBe(0);
  });

  it("validates, compiles, runs the existing engine, and exposes approximations", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const validation = validateCanonicalEnergyModel(model);
    expect(validation.validForSimulation).toBe(true);
    expect(validation.readiness.every((category) => category.status !== "blocked")).toBe(true);

    const input = compileCanonicalModelToEngineInput(model);
    expect(input.engineId).toBe("bimfit-degree-day");
    expect(input.inputHash).toMatch(/^fnv1a32x2-/);
    expect(input.payload.materials.envelope.airtightness.ach50).toBe(10);
    expect(input.payload.materials.hvac.ventilation.airflowRate).toBe(3_600);
    expect(input.payload.provenance.find((entry) =>
      entry.inputPath === "materials.hvac.ventilation.airflowRate",
    )?.transformation).toContain("multiplied by 3.6");
    expect(input.payload.approximations.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["screening_method", "ratio_attribution", "area_apportionment"]),
    );
    expect(input.payload.materials.envelope.foundation.groundTemperature).toBe(13.5);
    expect(
      input.payload.approximations.find(
        (entry) => entry.id === "engine-assumption:thermal-bridge-zero",
      ),
    ).toMatchObject({
      kind: "engine_default",
      affectedInputPaths: ["materials.envelope.walls[].thermalBridge"],
      sourceFactIds: [model.envelope.thermalBridgeNotes.id],
    });
    expect(
      input.payload.approximations.find(
        (entry) => entry.id === "engine-assumption:ground-temperature",
      ),
    ).toMatchObject({
      kind: "engine_default",
      affectedInputPaths: [
        "materials.envelope.foundation.groundTemperature",
      ],
    });
    expect(
      input.payload.provenance.find(
        (entry) =>
          entry.inputPath ===
          "materials.envelope.foundation.groundTemperature",
      )?.factIds,
    ).toEqual(
      expect.arrayContaining([
        model.site.weatherSource.id,
        model.site.location.id,
        model.site.groundRelationship.id,
      ]),
    );

    const simulation = run(input);
    expect(simulation.status).toBe("succeeded");
    expect(simulation.result?.annualEnergyKwh).toBeGreaterThan(0);
    expect(simulation.result?.annualByEndUseKwh.heating).toBeGreaterThan(0);
    expect(simulation.result?.monthly).toEqual([]);
    expect(simulation.result?.peakHeatingKw).toBeGreaterThan(0);
    expect(simulation.result?.peakCoolingKw).toBeNull();
    expect(simulation.result?.zones.every((zone) =>
      zone.peakHeatingKw === null && zone.peakCoolingKw === null,
    )).toBe(true);
    expect(simulation.warnings.some((warning) => warning.includes("ratio"))).toBe(true);
    expect(simulation.engineInput).toEqual(input);
  });

  it("is deterministic for identical canonical inputs", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const firstInput = compileCanonicalModelToEngineInput(model);
    const secondInput = compileCanonicalModelToEngineInput(model);
    const first = run(firstInput);
    const second = run(secondInput);

    expect(firstInput).toEqual(secondInput);
    expect(firstInput.inputHash).toBe(secondInput.inputHash);
    expect(first.engineOutput).toEqual(second.engineOutput);
    expect(first.result).toEqual(second.result);
  });

  it("reduces controlled heating demand when wall U-value improves without mutating baseline", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const baselineWallU = model.envelope.constructions[0].uValueWPerM2K;
    const baselineValue = baselineWallU.value;
    const scenario = createEnergyScenario({
      id: "scenario-better-wall",
      name: "Better wall",
      baseline: model,
      now: FIXED_TIME,
      changes: [{
        id: "delta-better-wall",
        path: "envelope.constructions.0.uValueWPerM2K",
        baselineFact: baselineWallU,
        value: 0.15,
      }],
    });

    const baselineRun = run(compileCanonicalModelToEngineInput(model));
    const scenarioInput = compileCanonicalModelToEngineInput(model, scenario);
    const scenarioRun = run(scenarioInput);

    expect(model.envelope.constructions[0].uValueWPerM2K.value).toBe(baselineValue);
    expect(scenario).not.toHaveProperty("baseline");
    expect(scenario.deltas).toHaveLength(1);
    expect(scenarioInput.payload.materials.envelope.walls[0].uValue).toBe(0.15);
    expect(scenarioRun.engineOutput!.annualDemand.heatingDemand)
      .toBeLessThan(baselineRun.engineOutput!.annualDemand.heatingDemand);
  });

  it("reduces cooling electricity when cooling COP improves", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const baselineCop = model.systems.hvac[0].coolingCop;
    const scenario = createEnergyScenario({
      id: "scenario-better-cop",
      name: "Better cooling COP",
      baseline: model,
      now: FIXED_TIME,
      changes: [{
        id: "delta-better-cop",
        path: "systems.hvac.0.coolingCop",
        baselineFact: baselineCop,
        value: 5,
      }],
    });
    const baseline = run(compileCanonicalModelToEngineInput(model));
    const improved = run(compileCanonicalModelToEngineInput(model, scenario));

    expect(improved.engineOutput!.annualDemand.coolingDemand)
      .toBeLessThan(baseline.engineOutput!.annualDemand.coolingDemand);
    expect(improved.engineOutput!.annualDemand.heatingDemand)
      .toBeCloseTo(baseline.engineOutput!.annualDemand.heatingDemand, 8);
  });

  it("derives average WWR from reviewed opening area and responds directionally", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const openingArea = model.geometry.openings[0].areaSqm;
    const scenario = createEnergyScenario({
      id: "scenario-smaller-window",
      name: "Smaller window",
      baseline: model,
      now: FIXED_TIME,
      changes: [{
        id: "delta-smaller-window",
        path: "geometry.openings.0.areaSqm",
        baselineFact: openingArea,
        value: 1.5,
      }],
    });
    const baselineInput = compileCanonicalModelToEngineInput(model);
    const scenarioInput = compileCanonicalModelToEngineInput(model, scenario);
    const baseline = run(baselineInput);
    const smaller = run(scenarioInput);

    expect(scenarioInput.payload.materials.envelope.windows.windowToWallRatio.N)
      .toBeLessThan(baselineInput.payload.materials.envelope.windows.windowToWallRatio.N);
    expect(smaller.engineOutput!.annualDemand.coolingDemand)
      .toBeLessThan(baseline.engineOutput!.annualDemand.coolingDemand);
  });

  it("blocks unresolved blocking conflicts before engine compilation", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-a").model;
    const wallU = baseline.envelope.constructions[0].uValueWPerM2K;
    const conflict: ConflictRecord<number> = {
      id: "conflict-wall-u",
      key: wallU.key,
      affectedObjectIds: [baseline.envelope.constructions[0].id],
      candidates: [{ fact: wallU, priority: 2 }],
      selectedFactId: null,
      selectionRationale: null,
      resolutionStatus: "unresolved",
      blocking: true,
      downstreamImpact: "Wall heating demand changes.",
      createdAt: FIXED_TIME,
    };
    const model: CanonicalEnergyModel = {
      ...baseline,
      conflicts: [conflict],
    };

    const validation = validateCanonicalEnergyModel(model);
    expect(validation.validForSimulation).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "SIMULATION_BLOCKING_CONFLICT"))
      .toBe(true);
    expect(() => compileCanonicalModelToEngineInput(model)).toThrow(/not simulation-ready/);
  });

  it("never reports a tampered or failed engine input as successful", () => {
    const input = compileCanonicalModelToEngineInput(
      getEnergyDiagnosticFixture("fixture-a").model,
    );
    const tampered = {
      ...input,
      payload: {
        ...input.payload,
        climate: { ...input.payload.climate, hdd: input.payload.climate.hdd + 1 },
      },
    } as CompiledDegreeDayInput;
    const failed = run(tampered);

    expect(failed.status).toBe("failed");
    expect(failed.result).toBeNull();
    expect(failed.engineOutput).toBeNull();
    expect(failed.error?.kind).toBe("adapter");
    expect(failed.error?.message).toContain("hash mismatch");
  });

  it("maps zones and envelope results to stable 3D IDs without turning missing data into zero", () => {
    const model = getEnergyDiagnosticFixture("fixture-e").model;
    const input = compileCanonicalModelToEngineInput(model);
    const simulation = run(input);
    expect(simulation.status).toBe("succeeded");
    const spatial = mapResultsToCanonicalObjects(
      simulation.result!,
      input,
      simulation.engineOutput!,
    );

    const conditioned = spatial.zones.find((zone) => zone.value != null);
    const unconditioned = spatial.zones.find((zone) => zone.status === "not_applicable");
    expect(conditioned?.threeObjectIds[0]).toMatch(/^three-/);
    expect(conditioned?.status).toBe("area_apportioned_approximation");
    expect(unconditioned?.value).toBeNull();
    expect(spatial.envelope.some((surface) => surface.value != null)).toBe(true);
  });

  it("creates only evidence-backed validation and simulation findings", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const validation = validateCanonicalEnergyModel(model);
    const input = compileCanonicalModelToEngineInput(model);
    const simulation = run(input);
    const spatial = mapResultsToCanonicalObjects(
      simulation.result!,
      input,
      simulation.engineOutput!,
    );
    const findings = generateDiagnosticFindings({ model, validation, run: simulation, spatial });

    expect(findings.some((finding) => finding.id === "finding:ratio-estimated-non-hvac"))
      .toBe(true);
    expect(findings.some((finding) => finding.impactSimulated &&
      finding.relatedSimulationPaths.length > 0)).toBe(true);
    expect(findings.every((finding) =>
      finding.evidence.length > 0 && finding.recommendedDesignAction.length > 0,
    )).toBe(true);
  });
});
