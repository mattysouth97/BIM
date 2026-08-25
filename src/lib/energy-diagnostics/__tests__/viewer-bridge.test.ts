import { describe, expect, it } from "vitest";

import { getEnergyDiagnosticFixture } from "../fixtures";
import { compileCanonicalModelToEngineInput } from "../adapter";
import {
  canonicalModelToViewerBridge,
  ENERGY_DIAGNOSTICS_BUILDING_PREFIX,
  recipeAtViewerOrigin,
} from "../viewer-bridge";

describe("canonical energy model to existing viewer bridge", () => {
  it("preserves storeys, spaces, floor area, voids, and stable canonical zone IDs", () => {
    const model = getEnergyDiagnosticFixture("fixture-d").model;
    const bridge = canonicalModelToViewerBridge(model);

    expect(bridge.buildingPk).toBe(
      `${ENERGY_DIAGNOSTICS_BUILDING_PREFIX}${model.building.id}`,
    );
    expect(bridge.snapshot.levels).toHaveLength(3);
    expect(bridge.snapshot.elements).toHaveLength(model.geometry.spaces.length);
    expect(bridge.recipe.officialFloorAreaSqm).toBe(1_184);
    expect(bridge.recipe.footprintPolygon).toHaveLength(1);
    expect(bridge.title.totArea).toBe(1_184);
    expect(bridge.warnings).toContain(
      "BuildingScene repeats the lowest valid floor plate; differing upper-floor plates and voids remain exact in the canonical model and are shown in the zone overlay.",
    );

    const canonicalZoneIds = new Set(model.geometry.thermalZones.map((zone) => zone.id));
    for (const room of bridge.snapshot.elements) {
      expect(room.category).toBe("Rooms");
      expect(canonicalZoneIds.has(String(room.instanceParameters.canonicalZoneId))).toBe(true);
    }
    for (const mapping of model.mappings) {
      expect(
        bridge.snapshot.elements.some((element) =>
          mapping.threeObjectIds.includes(element.id),
        ),
      ).toBe(true);
    }
  });

  it("does not turn a missing simulation input into a viewer-side model fact", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-a").model;
    const missingInfiltration = {
      ...baseline.envelope.infiltrationAirChangesPerHour,
      value: null,
      status: "missing" as const,
      confidence: null,
    };
    const model = {
      ...baseline,
      envelope: {
        ...baseline.envelope,
        infiltrationAirChangesPerHour: missingInfiltration,
      },
    };

    const bridge = canonicalModelToViewerBridge(model);

    expect(bridge.snapshot.elements.length).toBeGreaterThan(0);
    expect(model.envelope.infiltrationAirChangesPerHour.value).toBeNull();
  });

  it("uses the canonical sill fact for display placement", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-d").model;
    const opening = baseline.geometry.openings[0];
    const model = {
      ...baseline,
      geometry: {
        ...baseline.geometry,
        openings: [
          {
            ...opening,
            sillHeightM: { ...opening.sillHeightM, value: 1.35 },
          },
        ],
      },
    };

    expect(canonicalModelToViewerBridge(model).recipe.facade.sillHeight).toBe(
      1.35,
    );
  });

  it("renders an explicit zero-opening model without fabricated glazing", () => {
    const bridge = canonicalModelToViewerBridge(
      getEnergyDiagnosticFixture("fixture-e").model,
    );

    expect(bridge.recipe.facade.windowRatio).toBe(0);
  });

  it("recenters canonical coordinates around the existing viewer origin", () => {
    const bridge = canonicalModelToViewerBridge(
      getEnergyDiagnosticFixture("fixture-d").model,
    );
    const exterior = bridge.recipe.footprintPolygon?.[0] ?? [];
    const xs = exterior.map(([x]) => x);
    const zs = exterior.map(([, z]) => z);

    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 8);
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 8);
    expect(
      Math.max(
        ...bridge.snapshot.elements.map((element) =>
          Math.abs(element.placement.x),
        ),
      ),
    ).toBeLessThanOrEqual(bridge.recipe.footprintWidth / 2);
    expect(
      Math.max(
        ...bridge.snapshot.elements.map((element) =>
          Math.abs(element.placement.z),
        ),
      ),
    ).toBeLessThanOrEqual(bridge.recipe.footprintDepth / 2);
  });

  it("aligns the absolute engine recipe with viewer-local evidence geometry", () => {
    const model = getEnergyDiagnosticFixture("fixture-d").model;
    const bridge = canonicalModelToViewerBridge(model);
    const compiled = compileCanonicalModelToEngineInput(model);
    const displayRecipe = recipeAtViewerOrigin(
      compiled.payload.recipe,
      bridge.displayOrigin,
    );

    expect(bridge.displayOrigin).not.toEqual([0, 0]);
    expect(compiled.payload.recipe.footprintPolygon).not.toEqual(
      bridge.recipe.footprintPolygon,
    );
    expect(displayRecipe.footprintPolygon).toEqual(
      bridge.recipe.footprintPolygon,
    );
    expect(compiled.payload.recipe.footprintPolygon?.[0]?.[0]).toEqual([0, 0]);
  });
});
