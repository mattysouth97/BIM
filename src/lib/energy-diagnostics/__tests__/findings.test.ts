import { describe, expect, it } from "vitest";

import {
  applyInfiltrationAssumption,
  loadRepresentativeCase,
  resolveVisibleConflict,
  runBaselineModel,
  runImprovementScenario,
} from "@/components/energy-diagnostics/model-operations";

import { generateDiagnosticFindings } from "../findings";
import { validateCanonicalEnergyModel } from "../validation";

async function completedBaseline() {
  const reference = await loadRepresentativeCase();
  let model = applyInfiltrationAssumption(reference.model);
  const conflict = model.conflicts[0];
  if (!conflict.selectedFactId) throw new Error("reference conflict has no selection");
  model = resolveVisibleConflict(model, conflict.id, conflict.selectedFactId);
  return runBaselineModel(model);
}

describe("generateDiagnosticFindings", () => {
  it("reports the infiltration share as a ranked, evidence-linked finding", async () => {
    const baseline = await completedBaseline();
    const findings = generateDiagnosticFindings({
      model: baseline.model,
      validation: validateCanonicalEnergyModel(baseline.model),
      run: baseline.run,
    });

    const infiltration = findings.find(
      (finding) => finding.id === "finding:infiltration-share",
    );
    expect(infiltration).toBeDefined();
    expect(["high", "medium"]).toContain(infiltration!.severity);
    expect(infiltration!.impactSimulated).toBe(true);
    expect(infiltration!.relatedFactIds).toContain(
      baseline.model.envelope.infiltrationAirChangesPerHour.id,
    );
    const shareEvidence = infiltration!.evidence[0];
    expect(shareEvidence.unit).toBe("%");
    expect(Number(shareEvidence.value)).toBeGreaterThanOrEqual(25);
    // The engine's own heat-loss output backs the share.
    const engineShare =
      (baseline.run.engineOutput!.heatLoss.elements.find(
        (element) => element.element === "Infiltration/Ventilation",
      )?.heatLoss ?? 0) /
      baseline.run.engineOutput!.heatLoss.totalHeatLoss;
    expect(Number(shareEvidence.value)).toBeCloseTo(engineShare * 100, 0);
  });

  it("still reports the dominant conduction element separately from infiltration", async () => {
    const baseline = await completedBaseline();
    const findings = generateDiagnosticFindings({
      model: baseline.model,
      validation: validateCanonicalEnergyModel(baseline.model),
      run: baseline.run,
    });
    const dominant = findings.find((finding) =>
      finding.id.startsWith("finding:dominant-envelope:"),
    );
    expect(dominant).toBeDefined();
    expect(dominant!.id).not.toContain("infiltration");
  });

  it("describes a scenario comparison in well-formed Korean", async () => {
    const baseline = await completedBaseline();
    const alternative = runImprovementScenario(baseline.model, {
      infiltrationAch: 0.25,
    });
    const findings = generateDiagnosticFindings({
      model: alternative.model,
      validation: validateCanonicalEnergyModel(alternative.model),
      run: alternative.run,
      baselineRun: baseline.run,
    });
    const comparison = findings.find((finding) =>
      finding.id.startsWith("finding:scenario-comparison:"),
    );
    expect(comparison).toBeDefined();
    expect(comparison!.title).toMatch(/(감소|증가)했습니다$/);
    expect(comparison!.title).not.toMatch(/u[0-9a-f]{4}/);
  });
});
