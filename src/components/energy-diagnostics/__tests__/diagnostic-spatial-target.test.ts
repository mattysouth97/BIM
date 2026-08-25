import { describe, expect, it } from "vitest";

import { getEnergyDiagnosticFixture } from "@/lib/energy-diagnostics/fixtures";
import { canonicalModelToViewerBridge } from "@/lib/energy-diagnostics/viewer-bridge";

import { deriveDiagnosticSpatialTarget } from "../diagnostic-spatial-target";
import type { DiagnosisSelection } from "../types";

function findingSelection(
  id: string,
  canonicalObjectIds: readonly string[],
  threeObjectIds: readonly string[] = [],
): DiagnosisSelection {
  return {
    kind: "diagnostic_finding",
    id,
    documentId: null,
    canonicalObjectIds,
    threeObjectIds,
  };
}

describe("diagnostic spatial target", () => {
  it("uses exact canonical wall geometry and its outward orientation", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const bridge = canonicalModelToViewerBridge(model);
    const surface = model.geometry.surfaces.find(
      (candidate) => candidate.type === "exterior_wall",
    );
    if (!surface) throw new Error("fixture has no exterior wall");

    const target = deriveDiagnosticSpatialTarget(
      model,
      bridge,
      findingSelection("finding:wall", [surface.id]),
    );

    expect(target).toMatchObject({
      precision: "exact_surface",
      patches: [{
        canonicalObjectId: surface.id,
        objectName: surface.threeObjectId,
        kind: "wall",
      }],
    });
    expect(target?.patches[0].points).toHaveLength(2);
    expect(target?.focus.center[1]).toBeGreaterThan(0);
    expect(target?.focus.radius).toBeGreaterThan(1);
    expect(target?.focus.viewDirection).toHaveLength(3);
    expect(target?.fallbackObjectIds).toEqual([]);
  });

  it("highlights an opening's known host without inventing its position", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const bridge = canonicalModelToViewerBridge(model);
    const opening = model.geometry.openings[0];
    if (!opening) throw new Error("fixture has no hosted opening");
    const host = model.geometry.surfaces.find(
      (surface) => surface.id === opening.hostSurfaceId,
    );
    if (!host) throw new Error("fixture opening has no host surface");

    const target = deriveDiagnosticSpatialTarget(
      model,
      bridge,
      findingSelection("finding:window", [opening.id]),
    );

    expect(target?.precision).toBe("host_surface");
    expect(target?.patches.map((patch) => patch.canonicalObjectId)).toEqual([
      host.id,
    ]);
    expect(
      target?.patches.some(
        (patch) => patch.canonicalObjectId === opening.id,
      ),
    ).toBe(false);
  });

  it("removes true-north rotation when focusing geometry in drawing coordinates", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-a").model;
    const surface = baseline.geometry.surfaces.find(
      (candidate) => candidate.type === "exterior_wall",
    );
    if (!surface) throw new Error("fixture has no exterior wall");
    const rotated = {
      ...baseline,
      site: {
        ...baseline.site,
        northOrientationDeg: {
          ...baseline.site.northOrientationDeg,
          value: 90,
        },
      },
      geometry: {
        ...baseline.geometry,
        surfaces: baseline.geometry.surfaces.map((candidate) => ({
          ...candidate,
          azimuthDeg: {
            ...candidate.azimuthDeg,
            value:
              candidate.azimuthDeg.value == null
                ? null
                : (candidate.azimuthDeg.value + 90) % 360,
          },
        })),
      },
    };

    const baselineTarget = deriveDiagnosticSpatialTarget(
      baseline,
      canonicalModelToViewerBridge(baseline),
      findingSelection("finding:baseline-wall", [surface.id]),
    );
    const rotatedTarget = deriveDiagnosticSpatialTarget(
      rotated,
      canonicalModelToViewerBridge(rotated),
      findingSelection("finding:rotated-wall", [surface.id]),
    );

    expect(rotatedTarget?.focus.viewDirection).toEqual(
      baselineTarget?.focus.viewDirection,
    );
  });

  it("keeps a building-wide finding honestly building-wide", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const bridge = canonicalModelToViewerBridge(model);
    const target = deriveDiagnosticSpatialTarget(
      model,
      bridge,
      findingSelection("finding:infiltration", [model.building.id]),
    );

    expect(target?.precision).toBe("building");
    expect(target?.patches).toEqual([]);
    expect(target?.fallbackObjectIds).toEqual([
      "envelope-shell:Walls",
      "envelope-shell:Windows",
      "envelope-shell:Roof",
      "envelope-shell:Ground Floor",
    ]);
    expect(target?.focus.center[1]).toBe(bridge.recipe.totalHeight / 2);
  });

  it("does not move or highlight the viewer when a finding has no spatial evidence", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const bridge = canonicalModelToViewerBridge(model);

    expect(
      deriveDiagnosticSpatialTarget(
        model,
        bridge,
        findingSelection("finding:non-spatial", ["metric:annual-energy"]),
      ),
    ).toBeNull();
  });
});
