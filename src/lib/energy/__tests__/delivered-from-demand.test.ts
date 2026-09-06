// src/lib/energy/__tests__/delivered-from-demand.test.ts
// P1-05 — the single shared fuel-split + building-type helpers. The split
// mirrors what report-stage derived inline: electric = cooling + 15% of total
// (lighting/equipment), gas = heating + 10% of total (DHW).

import { describe, it, expect } from "vitest";
import {
  deliveredFromDemand,
  isResidentialOccupancy,
  buildingTypeForGrade,
  gradeTableIsFromOccupancy,
} from "../delivered-from-demand";
import { calculatePrimaryEnergy } from "../primary-energy";
import type { MaterialProperties } from "@/lib/material-types";

describe("deliveredFromDemand", () => {
  it("splits demand into electric/gas exactly as the report stage did", () => {
    const delivered = deliveredFromDemand({
      heatingDemand: 60_000,
      coolingDemand: 40_000,
      totalDemand: 150_000,
    });

    expect(delivered.electric).toBe(40_000 + 150_000 * 0.15); // 62,500
    expect(delivered.gas).toBe(60_000 + 150_000 * 0.1); // 75,000
    expect(delivered.districtHeating).toBe(0);
    expect(delivered.districtCooling).toBe(0);
    expect(delivered.renewable).toBe(0);
  });

  it("produces the hand-computed primary intensity from the item spec", () => {
    const delivered = deliveredFromDemand({
      heatingDemand: 60_000,
      coolingDemand: 40_000,
      totalDemand: 150_000,
    });
    const primary = calculatePrimaryEnergy(delivered, 1000);

    // 62,500 × 2.75 + 75,000 × 1.1 = 254,375 kWh → 254.375 kWh/m²
    expect(primary.primaryEnergy.total).toBeCloseTo(254_375, 5);
    expect(primary.primaryEnergyPerArea).toBeCloseTo(254.375, 5);
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
