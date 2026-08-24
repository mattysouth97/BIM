import { describe, expect, it } from "vitest";

import { getEnergyDiagnosticFixture } from "../fixtures";
import type { Space, ThermalZone } from "../types";
import { mergeThermalZones, splitThermalZone } from "../zoning";

const EDITED_AT = "2026-08-24T00:00:00.000Z";

function zoneForSpace(
  zones: readonly ThermalZone[],
  spaceId: string,
): ThermalZone {
  const zone = zones.find((candidate) =>
    candidate.sourceSpaceIds.includes(spaceId),
  );
  if (!zone) throw new Error(`Missing fixture zone for ${spaceId}.`);
  return zone;
}

function spaceById(spaces: readonly Space[], spaceId: string): Space {
  const space = spaces.find((candidate) => candidate.id === spaceId);
  if (!space) throw new Error(`Missing fixture space ${spaceId}.`);
  return space;
}

describe("thermal-zone merge edits", () => {
  it("aggregates source spaces and quantities without making identity input-order dependent", () => {
    const model = getEnergyDiagnosticFixture("fixture-b").model;
    const north = zoneForSpace(model.geometry.thermalZones, "b-north");
    const south = zoneForSpace(model.geometry.thermalZones, "b-south");

    const merged = mergeThermalZones({
      zones: [north, south],
      name: "North and south offices",
      createdAt: EDITED_AT,
    });
    const reversed = mergeThermalZones({
      zones: [south, north],
      name: "North and south offices",
      createdAt: EDITED_AT,
    });

    expect(reversed).toEqual(merged);
    expect(merged.sourceSpaceIds).toEqual(["b-north", "b-south"]);
    expect(merged.storeyIds).toEqual(["storey-fixture-b-0"]);
    expect(merged.floorAreaSqm).toMatchObject({
      value: (north.floorAreaSqm.value ?? 0) + (south.floorAreaSqm.value ?? 0),
      unit: "m2",
      status: "inferred",
    });
    expect(merged.volumeM3).toMatchObject({
      value: (north.volumeM3.value ?? 0) + (south.volumeM3.value ?? 0),
      unit: "m3",
      status: "inferred",
    });
    expect(merged.floorAreaSqm.sourceRefs.map((source) => source.id)).toEqual(
      [...new Set([
        ...north.floorAreaSqm.sourceRefs,
        ...north.volumeM3.sourceRefs,
        ...south.floorAreaSqm.sourceRefs,
        ...south.volumeM3.sourceRefs,
      ].map((source) => source.id))].sort(),
    );
    expect(merged.orientationBand).toMatchObject({
      value: "mixed",
      status: "user_confirmed",
      reviewedByUser: true,
    });
    expect(merged.name).toMatchObject({
      value: "North and south offices",
      status: "user_confirmed",
      reviewedByUser: true,
    });
    expect(merged.conditioned.value).toBe(true);
    expect(merged.usageProfileId).toBe("usage-office");
    expect(merged.hvacSystemIds).toEqual(["hvac-main"]);
    expect(merged.stableKey).toBe(
      `user-merge:${[north.id, south.id].sort().join("+")}`,
    );
    expect(Object.isFrozen(merged)).toBe(true);
  });

  it("rejects a merge that has fewer than two zones", () => {
    const zone = getEnergyDiagnosticFixture("fixture-a").model.geometry
      .thermalZones[0];

    expect(() =>
      mergeThermalZones({ zones: [zone], name: "Invalid", createdAt: EDITED_AT }),
    ).toThrow("At least two zones are required to merge.");
  });

  it("rejects mixing conditioned and unconditioned zones", () => {
    const zones = getEnergyDiagnosticFixture("fixture-e").model.geometry
      .thermalZones;
    const conditioned = zoneForSpace(zones, "e-office");
    const unconditioned = zoneForSpace(zones, "e-parking");

    expect(() =>
      mergeThermalZones({
        zones: [conditioned, unconditioned],
        name: "Invalid mixed conditioning",
        createdAt: EDITED_AT,
      }),
    ).toThrow("Conditioned and unconditioned zones cannot be merged.");
  });
});

describe("thermal-zone split edits", () => {
  it("creates a deterministic, lossless partition with user-confirmed names", () => {
    const model = getEnergyDiagnosticFixture("fixture-b").model;
    const north = zoneForSpace(model.geometry.thermalZones, "b-north");
    const south = zoneForSpace(model.geometry.thermalZones, "b-south");
    const merged = mergeThermalZones({
      zones: [north, south],
      name: "Combined offices",
      createdAt: EDITED_AT,
    });
    const groups = [
      { name: "North office", sourceSpaceIds: ["b-north"] },
      { name: "South office", sourceSpaceIds: ["b-south"] },
    ] as const;

    const split = splitThermalZone({
      zone: merged,
      spaces: model.geometry.spaces,
      groups,
      createdAt: EDITED_AT,
    });
    const reordered = splitThermalZone({
      zone: merged,
      spaces: model.geometry.spaces,
      groups: [...groups].reverse(),
      createdAt: EDITED_AT,
    });

    expect(split.flatMap((zone) => zone.sourceSpaceIds).sort()).toEqual(
      merged.sourceSpaceIds,
    );
    expect(split.reduce((total, zone) => total + (zone.floorAreaSqm.value ?? 0), 0))
      .toBe(merged.floorAreaSqm.value);
    expect(split.reduce((total, zone) => total + (zone.volumeM3.value ?? 0), 0))
      .toBe(merged.volumeM3.value);
    for (const zone of split) {
      const sourceSpace = spaceById(model.geometry.spaces, zone.sourceSpaceIds[0]);
      expect(zone.floorAreaSqm.value).toBe(sourceSpace.floorAreaSqm.value);
      expect(zone.volumeM3.value).toBe(sourceSpace.volumeM3.value);
      expect(zone.name).toMatchObject({
        status: "user_confirmed",
        reviewedByUser: true,
      });
    }
    expect(
      Object.fromEntries(split.map((zone) => [zone.sourceSpaceIds[0], zone.id])),
    ).toEqual(
      Object.fromEntries(
        reordered.map((zone) => [zone.sourceSpaceIds[0], zone.id]),
      ),
    );
    expect(Object.isFrozen(split)).toBe(true);
  });

  it.each([
    {
      label: "omits a source space",
      groups: [{ name: "North only", sourceSpaceIds: ["b-north"] }],
    },
    {
      label: "assigns a source space twice",
      groups: [
        { name: "North", sourceSpaceIds: ["b-north"] },
        { name: "Both", sourceSpaceIds: ["b-north", "b-south"] },
      ],
    },
  ])("rejects a partition that $label", ({ groups }) => {
    const model = getEnergyDiagnosticFixture("fixture-b").model;
    const merged = mergeThermalZones({
      zones: [
        zoneForSpace(model.geometry.thermalZones, "b-north"),
        zoneForSpace(model.geometry.thermalZones, "b-south"),
      ],
      name: "Combined offices",
      createdAt: EDITED_AT,
    });

    expect(() =>
      splitThermalZone({
        zone: merged,
        spaces: model.geometry.spaces,
        groups,
        createdAt: EDITED_AT,
      }),
    ).toThrow("Split groups must assign each source space exactly once.");
  });

  it("rejects a partition whose declared source space does not exist", () => {
    const model = getEnergyDiagnosticFixture("fixture-b").model;
    const merged = mergeThermalZones({
      zones: [
        zoneForSpace(model.geometry.thermalZones, "b-north"),
        zoneForSpace(model.geometry.thermalZones, "b-south"),
      ],
      name: "Combined offices",
      createdAt: EDITED_AT,
    });
    const zoneWithUnknownSpace: ThermalZone = {
      ...merged,
      sourceSpaceIds: ["b-north", "missing-space"],
    };

    expect(() =>
      splitThermalZone({
        zone: zoneWithUnknownSpace,
        spaces: model.geometry.spaces,
        groups: [
          { name: "North", sourceSpaceIds: ["b-north"] },
          { name: "Missing", sourceSpaceIds: ["missing-space"] },
        ],
        createdAt: EDITED_AT,
      }),
    ).toThrow("Unknown split space missing-space.");
  });
});
