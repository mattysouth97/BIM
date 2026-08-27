import { describe, expect, it } from "vitest";

import { demoFloors, demoTitle } from "@/lib/demo/demo-building";

import { compileCanonicalModelToEngineInput, runSimulation } from "../adapter";
import { ingestDrawingSet } from "../ingestion";
import {
  LEDGER_ENVELOPE_ASSUMPTION_ID,
  buildLedgerBaselineModel,
} from "../ledger-baseline-model";
import { diagnosticSourceFromLedger } from "../ledger-source";
import {
  commitRefinement,
  refinableFacts,
  type RefinementOutcome,
} from "../refinement";
import type { CanonicalEnergyModel, EnergyFact } from "../types";

const NOW = "2026-04-02T00:00:00.000Z";

async function baseline(): Promise<CanonicalEnergyModel> {
  const source = diagnosticSourceFromLedger({
    title: demoTitle,
    floors: demoFloors,
  });
  const ingestion = await ingestDrawingSet([source], {
    setName: "register",
    ingestedAt: NOW,
  });
  const outcome = buildLedgerBaselineModel({
    ingestion,
    title: demoTitle,
    floors: demoFloors,
    locale: "ko",
    now: NOW,
  });
  if (outcome.status !== "created") throw new Error(outcome.message);
  return outcome.model;
}

function annualKwh(model: CanonicalEnergyModel): number {
  const run = runSimulation(compileCanonicalModelToEngineInput(model));
  if (run.status !== "succeeded" || !run.result) {
    throw new Error("simulation did not succeed");
  }
  return run.result.annualEnergyKwh;
}

function wallU(model: CanonicalEnergyModel): EnergyFact<number> {
  const fact = refinableFacts(model, "envelope").find((candidate) =>
    candidate.key.includes("ledger-construction-wall"),
  );
  if (!fact) throw new Error("no wall U-value fact");
  return fact;
}

function applied(outcome: RefinementOutcome) {
  if (outcome.status !== "applied") {
    throw new Error(`refinement rejected: ${outcome.message}`);
  }
  return outcome;
}

describe("refinableFacts", () => {
  it("offers the envelope, systems and operation values a user can actually state", async () => {
    const model = await baseline();
    const envelope = refinableFacts(model, "envelope").map((f) => f.key);
    const systems = refinableFacts(model, "systems").map((f) => f.key);
    const usage = refinableFacts(model, "usage").map((f) => f.key);

    expect(envelope.some((key) => key.endsWith(".uValueWPerM2K"))).toBe(true);
    expect(envelope).toContain("envelope.infiltrationAirChangesPerHour");
    expect(systems.some((key) => key.endsWith(".heatingEfficiency"))).toBe(true);
    expect(systems.some((key) => key.endsWith(".coolingCop"))).toBe(true);
    expect(
      usage.some((key) => key.endsWith(".lightingPowerDensityWPerSqm")),
    ).toBe(true);
    // Every offered value starts life as an era-code assumption.
    for (const fact of refinableFacts(model, "envelope")) {
      expect(fact.assumptionId).toBeDefined();
    }
  });
});

describe("commitRefinement", () => {
  it("replaces an assumed U-value and moves the energy result", async () => {
    const model = await baseline();
    const before = wallU(model);
    const beforeKwh = annualKwh(model);

    const outcome = applied(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: before.id,
              // A real insulated wall, far better than the 2000-2009 default.
              value: 0.17,
              provenance: {
                kind: "stated_by_user",
                note: "2021 외단열 시공 상세",
              },
            },
          ],
        },
        NOW,
      ),
    );

    const after = outcome.model.facts.find((f) => f.id === before.id);
    expect(after?.value).toBe(0.17);
    // Identity survives, so everything referencing the fact still resolves.
    expect(after?.id).toBe(before.id);
    expect(after?.key).toBe(before.key);
    expect(after?.unit).toBe(before.unit);

    // And it actually changes the answer.
    const afterKwh = annualKwh(outcome.model);
    expect(afterKwh).toBeLessThan(beforeKwh);
  });

  it("marks a stated value as the user's assertion, not a document reading", async () => {
    const model = await baseline();
    const before = wallU(model);
    const outcome = applied(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: before.id,
              value: 0.24,
              provenance: { kind: "stated_by_user" },
            },
          ],
        },
        NOW,
      ),
    );

    const after = outcome.model.facts.find((f) => f.id === before.id)!;
    expect(after.status).toBe("user_confirmed");
    expect(after.extractionMethod).toBe("user_input");
    expect(after.authority).toBe("user_confirmed_project_value");
    // Never dressed up as a specification reading, and no invented confidence.
    expect(after.authority).not.toBe("explicit_schedule_or_specification");
    expect(after.confidence).toBeNull();
    expect(after.sourceRefs).toEqual([]);
    expect(after.reviewedByUser).toBe(true);
    // The era assumption no longer applies to it.
    expect(after.assumptionId).toBeUndefined();
  });

  it("marks a value read from a document as extracted, citing that document", async () => {
    const model = await baseline();
    const before = wallU(model);
    const sourceRef = model.geometry.floorPlates[0].boundary.sourceRefs[0];

    const outcome = applied(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: before.id,
              value: 0.31,
              provenance: {
                kind: "read_from_document",
                sourceRefs: [sourceRef],
                confidence: 0.95,
              },
            },
          ],
        },
        NOW,
      ),
    );

    const after = outcome.model.facts.find((f) => f.id === before.id)!;
    expect(after.status).toBe("extracted");
    expect(after.authority).toBe("explicit_schedule_or_specification");
    expect(after.confidence).toBe(0.95);
    expect(after.sourceRefs.map((ref) => ref.id)).toContain(sourceRef.id);
  });

  it("retires the assumption it replaces instead of leaving it stale", async () => {
    const model = await baseline();
    const envelopeFacts = refinableFacts(model, "envelope");
    const outcome = applied(
      commitRefinement(
        model,
        {
          upgrades: envelopeFacts.map((fact) => ({
            targetFactId: fact.id,
            value: fact.key.endsWith(".shgc")
              ? 0.3
              : fact.key.includes("infiltration")
                ? 0.12
                : 0.2,
            provenance: { kind: "stated_by_user" as const },
          })),
          clearedAssumptionIds: [LEDGER_ENVELOPE_ASSUMPTION_ID],
        },
        NOW,
      ),
    );

    const assumption = outcome.model.assumptions.find(
      (record) => record.id === LEDGER_ENVELOPE_ASSUMPTION_ID,
    );
    // Kept for the audit trail, but marked as no longer in force.
    expect(assumption).toBeDefined();
    expect(assumption?.overriddenByFactId).toBeDefined();
  });

  it("leaves the baseline model untouched, so a refinement is reversible", async () => {
    const model = await baseline();
    const before = wallU(model);
    const beforeSnapshot = JSON.stringify(model);

    applied(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: before.id,
              value: 0.19,
              provenance: { kind: "stated_by_user" },
            },
          ],
        },
        NOW,
      ),
    );

    expect(JSON.stringify(model)).toBe(beforeSnapshot);
    expect(wallU(model).value).toBe(before.value);
  });

  it("refuses a value that would make the model unsimulatable", async () => {
    const model = await baseline();
    const before = wallU(model);
    const outcome = commitRefinement(
      model,
      {
        upgrades: [
          {
            targetFactId: before.id,
            value: -5,
            provenance: { kind: "stated_by_user" },
          },
        ],
      },
      NOW,
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.reason).toBe("model_invalid");
    expect(outcome.issues?.length).toBeGreaterThan(0);
  });

  it("refuses a value of the wrong kind, a non-finite number, and an unknown fact", async () => {
    const model = await baseline();
    const before = wallU(model);

    expect(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: before.id,
              value: "0.2",
              provenance: { kind: "stated_by_user" },
            },
          ],
        },
        NOW,
      ),
    ).toMatchObject({ status: "rejected", reason: "type_mismatch" });

    expect(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: before.id,
              value: Number.NaN,
              provenance: { kind: "stated_by_user" },
            },
          ],
        },
        NOW,
      ),
    ).toMatchObject({ status: "rejected", reason: "non_finite_value" });

    expect(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: "fact:does-not-exist",
              value: 0.2,
              provenance: { kind: "stated_by_user" },
            },
          ],
        },
        NOW,
      ),
    ).toMatchObject({ status: "rejected", reason: "unknown_fact" });

    expect(
      commitRefinement(model, { upgrades: [] }, NOW),
    ).toMatchObject({ status: "rejected", reason: "empty_plan" });
  });

  it("applies several refinements at once and keeps the model simulatable", async () => {
    const model = await baseline();
    const beforeKwh = annualKwh(model);
    const heating = refinableFacts(model, "systems").find((f) =>
      f.key.endsWith(".heatingEfficiency"),
    )!;
    const lighting = refinableFacts(model, "usage").find((f) =>
      f.key.endsWith(".lightingPowerDensityWPerSqm"),
    )!;
    const infiltration = refinableFacts(model, "envelope").find(
      (f) => f.key === "envelope.infiltrationAirChangesPerHour",
    )!;

    const outcome = applied(
      commitRefinement(
        model,
        {
          upgrades: [
            {
              targetFactId: heating.id,
              value: 0.96,
              provenance: { kind: "stated_by_user", note: "2022 콘덴싱 보일러" },
            },
            {
              targetFactId: lighting.id,
              value: 5,
              provenance: { kind: "stated_by_user", note: "LED 전면 교체" },
            },
            {
              targetFactId: infiltration.id,
              value: 0.08,
              provenance: { kind: "stated_by_user", note: "기밀시험 n50 1.6" },
            },
          ],
        },
        NOW,
      ),
    );

    expect(outcome.upgrades).toHaveLength(3);
    expect(annualKwh(outcome.model)).toBeLessThan(beforeKwh);
    // A refined model is still a valid, runnable model.
    const run = runSimulation(
      compileCanonicalModelToEngineInput(outcome.model),
    );
    expect(run.status).toBe("succeeded");
  });
});
