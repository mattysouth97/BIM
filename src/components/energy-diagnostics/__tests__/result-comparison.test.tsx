/* @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  CanonicalSimulationResult,
  EnergyScenario,
} from "@/lib/energy-diagnostics/types";

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

  it("preserves small nonzero baseline-to-alternative deltas", () => {
    const endUses = {
      heating: 400,
      cooling: 100,
      lighting: 300,
      equipment: 200,
    };
    const baseline = result(endUses);
    const scenario = {
      ...result(endUses),
      annualEnergyKwh: baseline.annualEnergyKwh + 0.04,
      energyUseIntensityKwhPerM2:
        baseline.energyUseIntensityKwhPerM2 + 0.004,
    };

    render(
      <ResultComparison
        locale="en"
        baseline={baseline}
        scenario={scenario}
      />,
    );

    expect(
      within(screen.getByTestId("result-annualEnergyKwh-scenario")).getByText(
        "0.04 kWh/yr",
      ),
    ).toBeTruthy();
    expect(
      within(
        screen.getByTestId("result-energyUseIntensityKwhPerM2-scenario"),
      ).getByText("0.004 kWh/m²·yr"),
    ).toBeTruthy();
  });

  it("identifies a stale draft as a prior run and names the evaluated scenario", () => {
    const evaluatedScenario = {
      id: "scenario-window-u-1-30",
      name: "Improvement window-u-1.30",
      deltas: [],
    } as unknown as EnergyScenario;

    render(
      <ResultComparison
        locale="en"
        baseline={result({ heating: 400 })}
        scenario={result({ heating: 350 })}
        evaluatedScenario={evaluatedScenario}
        scenarioIsPrior
      />,
    );

    expect(screen.getByTestId("comparison-scenario-prior")).toBeTruthy();
    expect(screen.getAllByText("Prior alternative").length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("comparison-evaluated-scenario").textContent,
    ).toContain(evaluatedScenario.name);
    expect(screen.getByTestId("result-annualEnergyKwh-scenario")).toBeTruthy();
  });
});
