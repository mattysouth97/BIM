import { describe, expect, it } from "vitest";
import { calculateDeliveredCO2 } from "../co2-emissions";
import { CO2_FACTORS } from "../co2-factors";

describe("whole-building delivered emissions", () => {
  it("clips excess generation at electricity consumption and preserves heating emissions", () => {
    const result = calculateDeliveredCO2({ electric: 1000, gas: 2000, districtHeating: 0, districtCooling: 0, renewable: 9000 }, 100);
    expect(result.electricCO2).toBe(0);
    expect(result.totalCO2).toBe(2 * CO2_FACTORS.gas);
    expect(result.co2PerSqm).toBe(result.totalCO2 * 1000 / 100);
  });
  it("states the district-cooling emissions proxy only when used", () => {
    const result = calculateDeliveredCO2({ electric: 0, gas: 0, districtHeating: 0, districtCooling: 1000, renewable: 0 }, 100);
    expect(result.fossilCO2).toBe(CO2_FACTORS.districtHeating);
    expect(result.assumption).toContain("district-heating");
  });
});
