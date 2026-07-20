// src/lib/energy/__tests__/delivered-from-demand.test.ts
// P1-05 — the single shared fuel-split + building-type helpers. The split
// mirrors what report-stage derived inline: electric = cooling + 15% of total
// (lighting/equipment), gas = heating + 10% of total (DHW).

import { describe, it, expect } from "vitest";
import {
  deliveredFromDemand,
  isResidentialOccupancy,
  buildingTypeFromMaterials,
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

  it("buildingTypeFromMaterials maps to the official threshold-table keys", () => {
    expect(buildingTypeFromMaterials(withDensity(0.2))).toBe("residential");
    expect(buildingTypeFromMaterials(withDensity(0.04))).toBe("non-residential");
    expect(buildingTypeFromMaterials(undefined)).toBe("non-residential");
  });
});
