import { describe, expect, it } from "vitest";

import { demoFloors, demoTitle } from "@/lib/demo/demo-building";
import { compileCanonicalModelToEngineInput, runSimulation } from "../adapter";
import { ingestDrawingSet } from "../ingestion";
import { buildLedgerBaselineModel } from "../ledger-baseline-model";
import { diagnosticSourceFromLedger } from "../ledger-source";

describe("ledger baseline — physical plausibility", () => {
  it("produces an EUI in the range a 2008 Korean office actually occupies", async () => {
    const source = diagnosticSourceFromLedger({
      title: demoTitle,
      floors: demoFloors,
    });
    const ingestion = await ingestDrawingSet([source], {
      setName: "register",
      ingestedAt: "2026-04-01T00:00:00.000Z",
    });
    const outcome = buildLedgerBaselineModel({
      ingestion,
      title: demoTitle,
      floors: demoFloors,
      locale: "ko",
      now: "2026-04-01T00:00:00.000Z",
    });
    if (outcome.status !== "created") throw new Error(outcome.message);

    const run = runSimulation(compileCanonicalModelToEngineInput(outcome.model));
    const result = run.result!;
    const eui = result.energyUseIntensityKwhPerM2;

    // Recorded for reference: the demo 10F/B2 2008 office lands at
    // ~332 kWh/m2/yr, heating-dominated, with its two basements excluded.
    expect(outcome.storeyCount).toBe(10);
    expect(outcome.excludedBasementCount).toBe(2);
    expect(result.annualEnergyKwh).toBeGreaterThan(0);

    // A mid-2000s Korean office typically lands ~100-400 kWh/m2/yr.
    expect(eui).toBeGreaterThan(50);
    expect(eui).toBeLessThan(600);
    // Every end use is a finite, non-negative number.
    for (const value of Object.values(result.annualByEndUseKwh)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});
