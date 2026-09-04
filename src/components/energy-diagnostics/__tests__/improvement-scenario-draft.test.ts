// Unit coverage for the improvement-scenario draft round trip.
//
// This logic was previously reachable only by mounting the whole workspace,
// so its edge cases were asserted through the UI or not at all. It runs
// against a real ledger baseline model and real scenarios — no hand-built
// fixture — so the paths under test are the ones the app actually writes.

import { describe, expect, it } from "vitest";

import { demoFloors, demoTitle } from "@/lib/demo/demo-building";
import { ingestDrawingSet } from "@/lib/energy-diagnostics/ingestion";
import { buildLedgerBaselineModel } from "@/lib/energy-diagnostics/ledger-baseline-model";
import { diagnosticSourceFromLedger } from "@/lib/energy-diagnostics/ledger-source";
import { createEnergyScenario } from "@/lib/energy-diagnostics/scenarios";
import type {
  CanonicalEnergyModel,
  EnergyScenario,
} from "@/lib/energy-diagnostics/types";

import {
  EMPTY_IMPROVEMENT_SCENARIO_DRAFT,
  draftHasAnyValue,
  improvementDraftForScenario,
  initialImprovementScenarioDraft,
  scenarioMatchesImprovementDraft,
  scenarioValuesFromDraft,
} from "../improvement-scenario-draft";

const NOW = "2026-04-02T00:00:00.000Z";

async function ledgerBaseline(): Promise<CanonicalEnergyModel> {
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

function windowIndexOf(model: CanonicalEnergyModel): number {
  const index = model.envelope.constructions.findIndex(
    (construction) => construction.kind === "window",
  );
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

/** A scenario that pins the window U-value and the infiltration rate only. */
function twoFieldScenario(model: CanonicalEnergyModel): EnergyScenario {
  const windowIndex = windowIndexOf(model);
  return createEnergyScenario({
    id: "scenario-two-field",
    name: "Two field",
    baseline: model,
    changes: [
      {
        id: "delta-window-u",
        path: `envelope.constructions.${windowIndex}.uValueWPerM2K`,
        baselineFact:
          model.envelope.constructions[windowIndex].uValueWPerM2K,
        value: 1.2,
        unit: "W/m2K",
      },
      {
        id: "delta-infiltration",
        path: "envelope.infiltrationAirChangesPerHour",
        baselineFact: model.envelope.infiltrationAirChangesPerHour,
        value: 0.12,
      },
    ],
    now: NOW,
  });
}

/** Scales every opening's area by `scaleFor(index)`. */
function openingScenario(
  model: CanonicalEnergyModel,
  scaleFor: (index: number) => number,
): EnergyScenario {
  return createEnergyScenario({
    id: "scenario-openings",
    name: "Openings",
    baseline: model,
    changes: model.geometry.openings.map((opening, index) => ({
      id: `delta-opening-${index}`,
      path: `geometry.openings.${index}.areaSqm`,
      baselineFact: opening.areaSqm,
      value: (opening.areaSqm.value as number) * scaleFor(index),
      unit: "m2",
    })),
    now: NOW,
  });
}

describe("improvement scenario draft", () => {
  it("starts empty when there is no model at all", () => {
    expect(initialImprovementScenarioDraft(null)).toEqual(
      EMPTY_IMPROVEMENT_SCENARIO_DRAFT,
    );
  });

  it("starts empty for a model that has never run an improvement", async () => {
    const model = await ledgerBaseline();
    expect(initialImprovementScenarioDraft(model)).toEqual(
      EMPTY_IMPROVEMENT_SCENARIO_DRAFT,
    );
  });

  it("reads back the values a scenario pins", async () => {
    const model = await ledgerBaseline();
    const draft = improvementDraftForScenario(model, twoFieldScenario(model));
    expect(draft.windowUValueWPerM2K).toBeCloseTo(1.2, 9);
    expect(draft.infiltrationAch).toBeCloseTo(0.12, 9);
  });

  it("clears the fields a scenario does not pin rather than guessing them", async () => {
    const model = await ledgerBaseline();
    const draft = improvementDraftForScenario(model, twoFieldScenario(model));
    // The scenario changed only U-value and ACH. Everything else must read as
    // absent — a stale value here is how one comparison's numbers leak into
    // the next.
    expect(draft.heatingCop).toBe("");
    expect(draft.windowShgc).toBe("");
    expect(draft.openingAreaScale).toBe("");
  });

  it("recovers a single opening-area scale when every opening moved together", async () => {
    const model = await ledgerBaseline();
    expect(model.geometry.openings.length).toBeGreaterThan(1);
    const draft = improvementDraftForScenario(model, openingScenario(model, () => 0.8));
    expect(draft.openingAreaScale).toBeCloseTo(0.8, 9);
  });

  it("reports no opening-area scale when the openings moved unevenly", async () => {
    const model = await ledgerBaseline();
    const uneven = openingScenario(model, (index) => (index === 0 ? 0.5 : 0.8));
    // There is no one scale that describes this scenario, so the field must
    // stay empty instead of showing the first or the majority ratio.
    expect(improvementDraftForScenario(model, uneven).openingAreaScale).toBe("");
  });

  it("matches the draft that produced the scenario", async () => {
    const model = await ledgerBaseline();
    const scenario = twoFieldScenario(model);
    const draft = improvementDraftForScenario(model, scenario);
    expect(scenarioMatchesImprovementDraft(model, scenario, draft)).toBe(true);
  });

  it("stops matching once a pinned value is edited", async () => {
    const model = await ledgerBaseline();
    const scenario = twoFieldScenario(model);
    const draft = improvementDraftForScenario(model, scenario);
    expect(
      scenarioMatchesImprovementDraft(model, scenario, {
        ...draft,
        windowUValueWPerM2K: 1.1,
      }),
    ).toBe(false);
  });

  it("stops matching when a field is added that the scenario never pinned", async () => {
    const model = await ledgerBaseline();
    const scenario = twoFieldScenario(model);
    const draft = improvementDraftForScenario(model, scenario);
    expect(
      scenarioMatchesImprovementDraft(model, scenario, {
        ...draft,
        heatingCop: 3.5,
      }),
    ).toBe(false);
  });
});

describe("draft → scenario values", () => {
  it("omits a blank field entirely rather than sending zero", () => {
    const values = scenarioValuesFromDraft({
      ...EMPTY_IMPROVEMENT_SCENARIO_DRAFT,
      windowUValueWPerM2K: 1.2,
    });
    // The distinction that matters: a blank field means "keep the baseline".
    // Present-as-0 would pin the parameter to zero and silently invent a
    // building with no infiltration and a COP of nothing.
    expect(values).toEqual({ windowUValueWPerM2K: 1.2 });
    expect("infiltrationAch" in values).toBe(false);
    expect("heatingCop" in values).toBe(false);
  });

  it("keeps a legitimate zero that the user actually typed", () => {
    const values = scenarioValuesFromDraft({
      ...EMPTY_IMPROVEMENT_SCENARIO_DRAFT,
      infiltrationAch: 0,
    });
    expect(values).toEqual({ infiltrationAch: 0 });
  });

  it("carries every field when all are filled", () => {
    expect(
      scenarioValuesFromDraft({
        windowUValueWPerM2K: 1.2,
        infiltrationAch: 0.12,
        heatingCop: 3.5,
        windowShgc: 0.4,
        openingAreaScale: 0.8,
      }),
    ).toEqual({
      windowUValueWPerM2K: 1.2,
      infiltrationAch: 0.12,
      heatingCop: 3.5,
      windowShgc: 0.4,
      openingAreaScale: 0.8,
    });
  });

  it("reports an all-blank draft as having nothing to run", () => {
    expect(draftHasAnyValue(EMPTY_IMPROVEMENT_SCENARIO_DRAFT)).toBe(false);
    expect(
      draftHasAnyValue({ ...EMPTY_IMPROVEMENT_SCENARIO_DRAFT, heatingCop: 3.5 }),
    ).toBe(true);
    // A typed zero is a value, not an absence.
    expect(
      draftHasAnyValue({ ...EMPTY_IMPROVEMENT_SCENARIO_DRAFT, infiltrationAch: 0 }),
    ).toBe(true);
  });
});
