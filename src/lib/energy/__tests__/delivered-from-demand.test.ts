// src/lib/energy/__tests__/delivered-from-demand.test.ts
// Phase 01 (Honest Physics), D-05/D-06/D-07 — deliveredFromDemand no longer
// splits a flat share of total; it sums each named end use's kWh into the
// fuel bucket that end use's OWN `fuel` field declares. These tests build
// EndUseLoads fixtures directly (unit-level, not through buildEndUseLoads)
// so the routing itself — not buildEndUseLoads's own derivations — is what
// is under test here.

import { describe, it, expect } from "vitest";
import {
  deliveredFromDemand,
  isResidentialOccupancy,
  buildingTypeForGrade,
  gradeTableIsFromOccupancy,
} from "../delivered-from-demand";
import type { EndUseLoads, FueledLoad, DeliveredFuel } from "../end-uses";
import type { MaterialProperties } from "@/lib/material-types";

/** A minimal FueledLoad fixture — provenance content is irrelevant to routing. */
function fueled(kwh: number, fuel: DeliveredFuel): FueledLoad {
  return { kwh, fuel, provenance: { source: "modeled", basis: "test fixture" } };
}

function loads(overrides: Partial<EndUseLoads>): EndUseLoads {
  return {
    hvac: {
      heating: fueled(0, "gas"),
      cooling: fueled(0, "electric"),
    },
    lighting: fueled(0, "electric"),
    dhw: fueled(0, "electric"),
    plug: fueled(0, "electric"),
    onSiteGeneration: { kwh: 0, provenance: { source: "modeled", basis: "test fixture" } },
    ...overrides,
  };
}

describe("deliveredFromDemand", () => {
  it("D-05/D-07: sums each end use's kWh into the fuel bucket it declares, no share-of-total arithmetic", () => {
    const delivered = deliveredFromDemand(
      loads({
        hvac: { heating: fueled(60_000, "gas"), cooling: fueled(40_000, "electric") },
        lighting: fueled(12_000, "electric"),
        dhw: fueled(8_000, "electric"),
        plug: fueled(6_000, "electric"),
      }),
    );

    // electric = cooling + lighting + dhw + plug (every electric end use)
    expect(delivered.electric).toBe(40_000 + 12_000 + 8_000 + 6_000);
    // gas = heating only
    expect(delivered.gas).toBe(60_000);
    expect(delivered.districtHeating).toBe(0);
    expect(delivered.districtCooling).toBe(0);
    expect(delivered.renewable).toBe(0);
  });

  it("D-06: a district-heat heating fuel routes into districtHeating, with the gas leg at 0", () => {
    const delivered = deliveredFromDemand(
      loads({
        hvac: {
          heating: fueled(60_000, "districtHeating"),
          cooling: fueled(40_000, "electric"),
        },
      }),
    );
    expect(delivered.districtHeating).toBe(60_000);
    expect(delivered.gas).toBe(0);
  });

  it("D-06: a district cooling systemType routes into districtCooling", () => {
    const delivered = deliveredFromDemand(
      loads({
        hvac: {
          heating: fueled(60_000, "gas"),
          cooling: fueled(40_000, "districtCooling"),
        },
      }),
    );
    expect(delivered.districtCooling).toBe(40_000);
    expect(delivered.electric).toBe(0);
  });

  it("D-07: onSiteGeneration.kwh reaches renewable, and only renewable", () => {
    const delivered = deliveredFromDemand(
      loads({ onSiteGeneration: { kwh: 5_000, provenance: { source: "modeled", basis: "test" } } }),
    );
    expect(delivered.renewable).toBe(5_000);
    expect(delivered.electric).toBe(0);
  });
});

describe("building-type helpers", () => {
  const withDensity = (occupancyDensity: number) =>
    ({ occupancy: { occupancyDensity } }) as unknown as MaterialProperties;

  it("occupancyDensity > 0.1 means residential (matches existing call sites)", () => {
    expect(isResidentialOccupancy(withDensity(0.2))).toBe(true);
    expect(isResidentialOccupancy(withDensity(0.1))).toBe(false);
    expect(isResidentialOccupancy(withDensity(0.04))).toBe(false);
    expect(isResidentialOccupancy(undefined)).toBe(false);
    expect(
      isResidentialOccupancy({} as unknown as MaterialProperties)
    ).toBe(false);
  });

  it("buildingTypeForGrade maps to the official threshold-table keys", () => {
    expect(buildingTypeForGrade(withDensity(0.2))).toBe("residential");
    expect(buildingTypeForGrade(withDensity(0.04))).toBe("non-residential");
    expect(buildingTypeForGrade(undefined)).toBe("non-residential");
  });
});

describe("buildingTypeForGrade: the use code decides the threshold table", () => {
  const withDensity = (occupancyDensity: number) =>
    ({ occupancy: { occupancyDensity } }) as unknown as MaterialProperties;

  // Occupancy density that a dwelling really has — and which the old
  // heuristic read as non-residential, because dwellings are the LEAST
  // densely occupied buildings there are.
  const dwellingDensity = withDensity(0.03);

  it("01000 단독주택 and 02000 공동주택 are residential, whatever the density says", () => {
    expect(isResidentialOccupancy(dwellingDensity)).toBe(false);
    expect(buildingTypeForGrade(dwellingDensity, "01000")).toBe("residential");
    expect(buildingTypeForGrade(dwellingDensity, "02000")).toBe("residential");
  });

  it("a use code this app CAN classify as non-dwelling never falls back", () => {
    // 업무 / 공장 / 판매. A dense office used to come out "residential" on
    // density alone; its use code now settles it.
    const denseOffice = withDensity(0.2);
    expect(isResidentialOccupancy(denseOffice)).toBe(true);
    for (const code of ["14000", "17000", "18000", "07000", "11000"]) {
      expect(buildingTypeForGrade(denseOffice, code)).toBe("non-residential");
    }
  });

  it("a code it cannot classify is not a decision, and falls through to occupancy", () => {
    // 09000 의료시설 → ledgerUseCategory "default". Treating "default" as
    // non-residential would be the same silent-default mistake one level up.
    expect(gradeTableIsFromOccupancy("09000")).toBe(true);
    expect(buildingTypeForGrade(withDensity(0.2), "09000")).toBe("residential");
    expect(buildingTypeForGrade(withDensity(0.03), "09000")).toBe("non-residential");
  });

  it("no use code at all keeps the old behaviour exactly", () => {
    // A generated design or an authored model has only occupancy to go on.
    expect(gradeTableIsFromOccupancy(undefined)).toBe(true);
    expect(buildingTypeForGrade(withDensity(0.2))).toBe("residential");
    expect(buildingTypeForGrade(withDensity(0.04))).toBe("non-residential");
    expect(buildingTypeForGrade(undefined)).toBe("non-residential");
  });

  it("an empty-string use code is treated as absent, not as unclassifiable", () => {
    expect(buildingTypeForGrade(withDensity(0.2), "")).toBe("residential");
    expect(gradeTableIsFromOccupancy("")).toBe(true);
  });
});
