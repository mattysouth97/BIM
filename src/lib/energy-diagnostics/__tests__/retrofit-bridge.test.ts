import { describe, expect, it } from "vitest";

import {
  applyInfiltrationAssumption,
  loadRepresentativeCase,
  resolveVisibleConflict,
  runBaselineModel,
} from "@/components/energy-diagnostics/model-operations";
import { ENERGY_PRICES } from "@/lib/retrofit/cost-database";

import type { CompiledDegreeDayInput } from "../adapter";
import { analyzeRetrofitEconomics } from "../retrofit-bridge";

async function completedBaseline() {
  const reference = await loadRepresentativeCase();
  let model = applyInfiltrationAssumption(reference.model);
  const conflict = model.conflicts[0];
  if (!conflict.selectedFactId) throw new Error("reference conflict has no selection");
  model = resolveVisibleConflict(model, conflict.id, conflict.selectedFactId);
  return runBaselineModel(model);
}

describe("analyzeRetrofitEconomics", () => {
  it("returns null for a run that cannot anchor economics", async () => {
    const baseline = await completedBaseline();
    const failed = { ...baseline.run, status: "failed" as const, engineOutput: null };
    expect(analyzeRetrofitEconomics(failed)).toBeNull();
  });

  it("produces NPV-ranked, JSON-safe measures from the exact engine payload", async () => {
    const baseline = await completedBaseline();
    const analysis = analyzeRetrofitEconomics(baseline.run);
    expect(analysis).not.toBeNull();
    expect(analysis!.measures.length).toBeGreaterThan(0);

    for (const measure of analysis!.measures) {
      expect(Number.isFinite(measure.financials.npv)).toBe(true);
      expect(Number.isFinite(measure.estimatedCost)).toBe(true);
      // Infinity must never leak into a persistable field.
      expect(
        measure.discountedPaybackYears == null ||
          Number.isFinite(measure.discountedPaybackYears),
      ).toBe(true);
      expect(JSON.stringify(measure.discountedPaybackYears)).not.toContain("null,");
    }
    const npvs = analysis!.measures.map((measure) => measure.financials.npv);
    expect([...npvs].sort((a, b) => b - a)).toEqual(npvs);
  });

  it("keeps combined savings physically consistent with the baseline demand", async () => {
    const baseline = await completedBaseline();
    const analysis = analyzeRetrofitEconomics(baseline.run)!;
    // Site-energy savings on the heating side can never exceed what the
    // building actually consumes for heating.
    const siteHeating = baseline.run.engineOutput!.annualDemand.heatingDemand;
    const heatingSaving = analysis.measures
      .filter((measure) => measure.category === "envelope" || measure.category === "hvac")
      .reduce((sum, measure) => sum + measure.annualEnergySaving, 0);
    expect(heatingSaving).toBeLessThanOrEqual(siteHeating);
  });

  it("never proposes boiler-replacement measures for an electric heat-pump plant", async () => {
    const baseline = await completedBaseline();
    const input = baseline.run.engineInput as CompiledDegreeDayInput;
    const heating = input.payload.materials.hvac.heating;
    const analysis = analyzeRetrofitEconomics(baseline.run)!;
    if (heating.efficiency > 1.5) {
      expect(
        analysis.measures.some(
          (measure) =>
            measure.id === "hvac-boiler-upgrade" || measure.id === "hvac-heat-pump",
        ),
      ).toBe(false);
    }
  });

  it("does not propose heat recovery when the model already has it", async () => {
    const baseline = await completedBaseline();
    const input = baseline.run.engineInput as CompiledDegreeDayInput;
    const hasHeatRecovery =
      (input.payload.materials.hvac.ventilation?.heatRecoveryEfficiency ?? 0) > 0;
    const analysis = analyzeRetrofitEconomics(baseline.run)!;
    if (hasHeatRecovery) {
      expect(analysis.measures.some((measure) => measure.id === "hvac-hrv")).toBe(false);
    }
  });

  it("applies the public subsidy track to effective capex", async () => {
    const baseline = await completedBaseline();
    const none = analyzeRetrofitEconomics(baseline.run, "none")!;
    const subsidized = analyzeRetrofitEconomics(
      baseline.run,
      "public-seoul-or-central",
    )!;
    const noneById = new Map(none.measures.map((measure) => [measure.id, measure]));
    for (const measure of subsidized.measures) {
      const unsubsidized = noneById.get(measure.id);
      if (!unsubsidized) continue;
      expect(measure.financials.effectiveCapex).toBeLessThanOrEqual(
        unsubsidized.financials.effectiveCapex,
      );
    }
  });

  it("prices the baseline bill from the run's fuel split", async () => {
    const baseline = await completedBaseline();
    const analysis = analyzeRetrofitEconomics(baseline.run)!;
    const fuel = baseline.run.engineOutput!.annualDemand.fuelDemand!;
    expect(analysis.baselineAnnualEnergyCostKrw).toBeGreaterThan(0);
    expect(analysis.baselineAnnualEnergyCostKrw).toBeGreaterThanOrEqual(
      fuel.electricKwh * ENERGY_PRICES.electricity,
    );
  });
});
