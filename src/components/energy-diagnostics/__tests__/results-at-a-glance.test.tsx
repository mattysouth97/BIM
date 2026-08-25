/* @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DegreeDaySimulationRun } from "@/lib/energy-diagnostics/adapter";
import type { DiagnosticFinding } from "@/lib/energy-diagnostics/findings";
import type {
  CanonicalSimulationResult,
  EnergyScenario,
} from "@/lib/energy-diagnostics/types";

import { ResultsAtAGlance } from "../results-at-a-glance";

afterEach(cleanup);

function result(annualEnergyKwh = 1_000): CanonicalSimulationResult {
  return {
    annualEnergyKwh,
    energyUseIntensityKwhPerM2: annualEnergyKwh / 10,
    annualByEndUseKwh: {},
    monthly: [],
    zones: [],
    peakHeatingKw: null,
    peakCoolingKw: null,
  };
}

function run({
  id,
  scenarioId,
  status = "succeeded",
  annualEnergyKwh = 1_000,
}: Readonly<{
  id: string;
  scenarioId: string;
  status?: DegreeDaySimulationRun["status"];
  annualEnergyKwh?: number;
}>): DegreeDaySimulationRun {
  return {
    id,
    scenarioId,
    status,
    result: status === "succeeded" ? result(annualEnergyKwh) : null,
    engineOutput: null,
  } as unknown as DegreeDaySimulationRun;
}

function finding(
  id: string,
  severity: DiagnosticFinding["severity"],
): DiagnosticFinding {
  return {
    id,
    title: `${severity} finding`,
    severity,
    affectedObjectIds: [`surface-${id}`],
    evidence: [],
    relatedSourceRefs: [],
    relatedFactIds: [],
    relatedSimulationPaths: ["result.annualEnergyKwh"],
    explanation: `${severity} evidence-backed explanation`,
    confidence: 0.82,
    recommendedDesignAction: `Review ${id}`,
    impactSimulated: true,
  };
}

const baseline = run({ id: "baseline-run", scenarioId: "baseline" });
const evaluatedScenario = {
  id: "alternative-1",
  name: "Improvement window-u-1.30",
  deltas: [],
} as unknown as EnergyScenario;

describe("ResultsAtAGlance", () => {
  it("renders only for a successful canonical result", () => {
    const { rerender } = render(
      <ResultsAtAGlance
        baselineRun={run({
          id: "failed-run",
          scenarioId: "baseline",
          status: "failed",
        })}
        scenarioRun={null}
        findings={[]}
        selectedFindingId={null}
        locale="en"
        onSelectFinding={vi.fn()}
        canEvaluateFinding={() => false}
        onEvaluateFinding={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("results-at-a-glance")).toBeNull();

    rerender(
      <ResultsAtAGlance
        baselineRun={baseline}
        scenarioRun={null}
        findings={[]}
        selectedFindingId={null}
        locale="en"
        onSelectFinding={vi.fn()}
        canEvaluateFinding={() => false}
        onEvaluateFinding={vi.fn()}
      />,
    );

    expect(screen.getByTestId("results-at-a-glance")).toBeTruthy();
    expect(screen.getByText("1,000")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("shows the three highest-priority findings and delegates selection", () => {
    const onSelectFinding = vi.fn();
    const low = finding("low", "low");
    const blocking = finding("blocking", "blocking");
    const medium = finding("medium", "medium");
    const high = finding("high", "high");

    render(
      <ResultsAtAGlance
        baselineRun={baseline}
        scenarioRun={null}
        findings={[low, medium, blocking, high]}
        selectedFindingId={high.id}
        locale="en"
        onSelectFinding={onSelectFinding}
        canEvaluateFinding={() => false}
        onEvaluateFinding={vi.fn()}
      />,
    );

    expect(screen.getByText("3 of 4")).toBeTruthy();
    expect(screen.getByText("blocking finding")).toBeTruthy();
    expect(screen.getByText("high finding")).toBeTruthy();
    expect(screen.getByText("medium finding")).toBeTruthy();
    expect(screen.queryByText("low finding")).toBeNull();

    const highButton = screen.getByTestId("results-glance-finding-high");
    expect(highButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(highButton);
    expect(onSelectFinding).toHaveBeenCalledWith(high);
  });

  it("uses the existing evaluation handler without claiming uncalculated savings", () => {
    const high = finding("high", "high");
    const onEvaluateFinding = vi.fn();

    render(
      <ResultsAtAGlance
        baselineRun={baseline}
        scenarioRun={null}
        findings={[high]}
        selectedFindingId={null}
        locale="en"
        onSelectFinding={vi.fn()}
        canEvaluateFinding={(candidate) => candidate.id === high.id}
        onEvaluateFinding={onEvaluateFinding}
      />,
    );

    const improvement = screen.getByTestId("results-glance-improvement");
    expect(within(improvement).getByText("Not calculated yet")).toBeTruthy();
    fireEvent.click(within(improvement).getByRole("button", {
      name: "Evaluate top opportunity",
    }));
    expect(onEvaluateFinding).toHaveBeenCalledWith(high);
  });

  it("reports the actual alternative rerun delta without rounding a small change to zero", () => {
    render(
      <ResultsAtAGlance
        baselineRun={baseline}
        scenarioRun={run({
          id: "alternative-run",
          scenarioId: "alternative-1",
          annualEnergyKwh: 999.96,
        })}
        evaluatedScenario={evaluatedScenario}
        findings={[]}
        selectedFindingId={null}
        locale="en"
        onSelectFinding={vi.fn()}
        canEvaluateFinding={() => false}
        onEvaluateFinding={vi.fn()}
      />,
    );

    const delta = screen.getByTestId("results-glance-scenario-delta");
    expect(delta.textContent).toContain("0.004% lower");
    expect(screen.getByText(/0.04 kWh\/yr less/)).toBeTruthy();
  });

  it("keeps a prior delta visible but labels its stored evaluated input", () => {
    render(
      <ResultsAtAGlance
        baselineRun={baseline}
        scenarioRun={run({
          id: "alternative-run",
          scenarioId: evaluatedScenario.id,
          annualEnergyKwh: 900,
        })}
        evaluatedScenario={evaluatedScenario}
        scenarioIsPrior
        findings={[]}
        selectedFindingId={null}
        locale="en"
        onSelectFinding={vi.fn()}
        canEvaluateFinding={() => false}
        onEvaluateFinding={vi.fn()}
      />,
    );

    expect(screen.getByTestId("results-glance-scenario-prior")).toBeTruthy();
    expect(
      screen.getByTestId("results-glance-evaluated-scenario").textContent,
    ).toContain(evaluatedScenario.name);
    expect(screen.getByTestId("results-glance-scenario-delta")).toBeTruthy();
    expect(screen.getByText("Prior evaluated alternative")).toBeTruthy();
  });
});
