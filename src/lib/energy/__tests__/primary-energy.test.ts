import { describe, it, expect } from "vitest";
import {
  calculatePrimaryEnergy,
  PRIMARY_ENERGY_FACTORS,
} from "../primary-energy";

describe("calculatePrimaryEnergy", () => {
  it("converts electricity using factor 2.75", () => {
    const result = calculatePrimaryEnergy({ electric: 100, gas: 0 }, 1);
    expect(result.primaryEnergy.electric).toBeCloseTo(275, 5);
  });

  it("converts gas using factor 1.1", () => {
    const result = calculatePrimaryEnergy({ electric: 0, gas: 100 }, 1);
    expect(result.primaryEnergy.gas).toBeCloseTo(110, 5);
  });

  it("converts district heating using factor 0.728", () => {
    const result = calculatePrimaryEnergy(
      { electric: 0, gas: 0, districtHeating: 100 },
      1
    );
    expect(result.primaryEnergy.districtHeating).toBeCloseTo(72.8, 5);
  });

  it("converts district cooling using factor 0.937", () => {
    const result = calculatePrimaryEnergy(
      { electric: 0, gas: 0, districtCooling: 100 },
      1
    );
    expect(result.primaryEnergy.districtCooling).toBeCloseTo(93.7, 5);
  });

  it("renewable generation offsets primary energy at the grid-electricity factor (P2-02 s3)", () => {
    const withRenewable = calculatePrimaryEnergy({ electric: 1000, gas: 0, renewable: 100 }, 1);
    const withoutRenewable = calculatePrimaryEnergy({ electric: 1000, gas: 0, renewable: 0 }, 1);

    // Primary total drops by R × electricity factor (100 × 2.75 = 275).
    expect(withoutRenewable.primaryEnergy.total - withRenewable.primaryEnergy.total).toBeCloseTo(275, 5);
    // Delivered total drops by R.
    expect(withoutRenewable.deliveredEnergy.total - withRenewable.deliveredEnergy.total).toBeCloseTo(100, 5);
    // The renewable line is a reduction (≤ 0).
    expect(withRenewable.primaryEnergy.renewable).toBeLessThanOrEqual(0);
  });

  it("computes correct per-area intensity", () => {
    // 100 kWh electric → 275 kWh primary, over 50 m² → 5.5 kWh/m²
    const result = calculatePrimaryEnergy({ electric: 100, gas: 0 }, 50);
    expect(result.primaryEnergyPerArea).toBeCloseTo(5.5, 5);
  });

  it("zero inputs produce zero primary energy", () => {
    const result = calculatePrimaryEnergy(
      { electric: 0, gas: 0, districtHeating: 0, districtCooling: 0, renewable: 0 },
      100
    );
    expect(result.primaryEnergy.total).toBe(0);
    expect(result.primaryEnergyPerArea).toBe(0);
  });

  it("zero area returns zero per-area without division error", () => {
    const result = calculatePrimaryEnergy({ electric: 100, gas: 50 }, 0);
    expect(result.primaryEnergyPerArea).toBe(0);
  });

  it("sums all fuel types in total", () => {
    const result = calculatePrimaryEnergy(
      { electric: 100, gas: 100, districtHeating: 100 },
      1
    );
    const expected =
      100 * PRIMARY_ENERGY_FACTORS.electricity +
      100 * PRIMARY_ENERGY_FACTORS.gas +
      100 * PRIMARY_ENERGY_FACTORS.districtHeating;
    expect(result.primaryEnergy.total).toBeCloseTo(expected, 5);
  });

  it("exposes the conversion factors used", () => {
    const result = calculatePrimaryEnergy({ electric: 1, gas: 0 }, 1);
    expect(result.conversionFactorsUsed).toBe(PRIMARY_ENERGY_FACTORS);
  });

  it("omitting optional fields defaults to zero", () => {
    const result = calculatePrimaryEnergy({ electric: 50, gas: 20 }, 10);
    expect(result.deliveredEnergy.districtHeating).toBe(0);
    expect(result.deliveredEnergy.districtCooling).toBe(0);
    expect(result.deliveredEnergy.renewable).toBe(0);
  });
});
