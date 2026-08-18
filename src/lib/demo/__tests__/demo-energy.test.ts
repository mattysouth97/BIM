import { describe, expect, it } from "vitest";
import { demoTitle } from "../demo-building";
import {
  DEMO_ACTUAL_EUI_KWH_PER_SQM,
  getDemoAnnualConsumption,
} from "../demo-energy";

describe("demo energy actuals", () => {
  it("returns three prior years that sum to the stated EUI", () => {
    const years = getDemoAnnualConsumption(2026);
    expect(years.map((y) => y.year)).toEqual([2023, 2024, 2025]);
    const latest = years[2]!;
    expect(latest.total_kwh).toBe(
      Math.round(DEMO_ACTUAL_EUI_KWH_PER_SQM * demoTitle.totArea),
    );
    expect(latest.electric_kwh + latest.gas_kwh).toBe(latest.total_kwh);
    expect(latest.district_kwh).toBe(0);
    expect(years[0]!.total_kwh).toBeGreaterThan(latest.total_kwh);
  });
});
