/* @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CanonicalSimulationResult } from "@/lib/energy-diagnostics/types";

import { ResultComparison } from "../result-comparison";

afterEach(cleanup);

function result(
  annualByEndUseKwh: CanonicalSimulationResult["annualByEndUseKwh"],
): CanonicalSimulationResult {
  return {
    annualEnergyKwh: 1_000,
    energyUseIntensityKwhPerM2: 100,
    annualByEndUseKwh,
    monthly: [],
    zones: [],
    peakHeatingKw: 12,
    peakCoolingKw: null,
  };
}

describe("ResultComparison end-use method disclosure", () => {
  it("labels ratio-estimated end uses in both result columns with annual units", () => {
    render(
      <ResultComparison
        locale="en"
        baseline={result({
          heating: 400,
          cooling: 100,
          lighting: 300,
          equipment: 200,
        })}
        scenario={result({
          heating: 350,
          cooling: 90,
          lighting: 310,
          equipment: 210,
        })}
      />,
    );

    expect(screen.getByText("Annual energy by end use")).toBeTruthy();
    expect(screen.getByText(/Unit\/period: kWh\/yr/)).toBeTruthy();
    expect(screen.getByText(/fixed use-type ratio estimates/)).toBeTruthy();

    for (const testId of [
      "end-use-baseline-lighting",
      "end-use-baseline-equipment",
      "end-use-scenario-lighting",
      "end-use-scenario-equipment",
    ]) {
      expect(
        within(screen.getByTestId(testId)).getByText(
          "Ratio-estimated (use type)",
        ),
      ).toBeTruthy();
    }

    expect(
      within(screen.getByTestId("end-use-baseline-lighting")).getByText(
        "300 kWh/yr",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("end-use-baseline-lighting")).getByRole(
        "img",
        {
          name: "Lighting: 300 kWh/yr; Ratio-estimated (use type)",
        },
      ),
    ).toBeTruthy();
  });
});
