import { describe, expect, it } from "vitest";

import {
  ENERGY_DIAGNOSTIC_FIXTURES,
  getEnergyDiagnosticFixture,
} from "../fixtures";
import { relativeError } from "../geometry";
import { representativeOfficeDrawingSetInputs } from "../reference-office-sources";
import {
  compileCanonicalModelToEngineInput,
  runSimulation,
} from "../adapter";
import { validateCanonicalEnergyModel } from "../validation";

describe("controlled energy-diagnostics fixtures A-E", () => {
  it("ships all five reusable non-proprietary truth models", () => {
    expect(ENERGY_DIAGNOSTIC_FIXTURES.map((fixture) => fixture.id)).toEqual([
      "fixture-a",
      "fixture-b",
      "fixture-c",
      "fixture-d",
      "fixture-e",
    ]);
  });

  it.each(ENERGY_DIAGNOSTIC_FIXTURES)(
    "$id stays within the 1% geometry acceptance gate",
    (fixture) => {
      const floorArea = fixture.model.geometry.floorPlates.reduce(
        (sum, plate) => sum + (plate.areaSqm.value ?? 0),
        0,
      );
      const conditionedArea = fixture.model.geometry.spaces.reduce(
        (sum, space) =>
          sum + (space.conditioned.value ? (space.floorAreaSqm.value ?? 0) : 0),
        0,
      );
      const volume = fixture.model.geometry.thermalZones.reduce(
        (sum, zone) => sum + (zone.volumeM3.value ?? 0),
        0,
      );
      const exteriorCount = fixture.model.geometry.surfaces.filter(
        (surface) => surface.boundaryCondition.value === "outdoors",
      ).length;

      expect(relativeError(floorArea, fixture.expected.totalFloorAreaSqm)).toBeLessThan(0.01);
      expect(relativeError(conditionedArea, fixture.expected.totalConditionedAreaSqm)).toBeLessThan(0.01);
      expect(relativeError(volume, fixture.expected.totalZoneVolumeM3)).toBeLessThan(0.01);
      expect(fixture.model.geometry.storeys).toHaveLength(fixture.expected.storeyCount);
      expect(fixture.model.geometry.thermalZones).toHaveLength(fixture.expected.thermalZoneCount);
      expect(exteriorCount).toBe(fixture.expected.exteriorSurfaceCount);
      for (const pair of fixture.expected.openingHostPairs) {
        expect(
          fixture.model.geometry.openings.find((opening) => opening.id === pair.openingId)
            ?.hostSurfaceId,
        ).toBe(pair.hostSurfaceId);
      }
    },
  );

  it("models unconditioned area explicitly rather than as a zero-load conditioned zone", () => {
    const model = getEnergyDiagnosticFixture("fixture-e").model;
    const unconditioned = model.geometry.thermalZones.find(
      (zone) => zone.conditioned.value === false,
    );
    expect(unconditioned?.floorAreaSqm.value).toBe(50);
    expect(unconditioned?.volumeM3.value).toBe(150);
  });

  it("provides a seven-document representative office set", () => {
    const sources = representativeOfficeDrawingSetInputs();
    expect(sources).toHaveLength(7);
    expect(sources.some((source) => source.fileName.includes("floor-plan"))).toBe(true);
    expect(sources.some((source) => source.fileName.includes("window-schedule"))).toBe(true);
    expect(sources.some((source) => source.fileName.includes("hvac-equipment"))).toBe(true);
    expect(sources.some((source) => source.fileName.includes("lighting-plan"))).toBe(true);
    const planBytes = sources[0].content;
    expect(typeof planBytes).toBe("string");
    if (typeof planBytes === "string") {
      expect(planBytes).toContain("LEVELS 01-03 TYPICAL");
      expect(planBytes).toContain("NORTH ARROW 0 DEG");
      expect(planBytes).toContain("BIM_NORTH");
    }
  });

  it.each(["fixture-a", "fixture-b", "fixture-d"] as const)(
    "%s passes preflight and completes the real existing-engine path",
    (fixtureId) => {
      const model = getEnergyDiagnosticFixture(fixtureId).model;
      const validation = validateCanonicalEnergyModel(model);
      expect(validation.validForSimulation, validation.issues.map((issue) => issue.code).join(", ")).toBe(true);

      const input = compileCanonicalModelToEngineInput(model);
      const run = runSimulation(input, {
        now: () => "2026-02-01T00:00:00.000Z",
      });
      expect(run.status).toBe("succeeded");
      expect(run.result?.annualEnergyKwh).toBeGreaterThan(0);
      expect(run.result?.peakCoolingKw).toBeNull();
    },
  );
});
