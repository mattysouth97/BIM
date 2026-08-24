/* @vitest-environment happy-dom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { representativeOfficeDrawingSetInputs } from "@/lib/energy-diagnostics/reference-office-sources";
import { ingestDrawingSet } from "@/lib/energy-diagnostics/ingestion";
import {
  acceptTierOneScreeningAssumption,
  buildTierOneCanonicalModel,
  TIER_ONE_SCREENING_ASSUMPTION_ID,
} from "@/lib/energy-diagnostics/tier-one-model";
import type {
  CanonicalEnergyModel,
  EnergyFact,
} from "@/lib/energy-diagnostics/types";

import { EvidenceInspector } from "../evidence-inspector";

const NOW = "2026-08-24T00:00:00.000Z";

async function tierOneMixedFact(): Promise<{
  model: CanonicalEnergyModel;
  fact: EnergyFact<unknown>;
  sourceFileName: string;
}> {
  const source = representativeOfficeDrawingSetInputs()[0];
  const ingestion = await ingestDrawingSet([source], {
    setName: "Tier-1 inspector test",
    ingestedAt: NOW,
  });
  const outcome = buildTierOneCanonicalModel(ingestion, "en", NOW);
  if (outcome.status !== "created") throw new Error(outcome.message);

  const fact = outcome.model.geometry.surfaces[0]?.areaSqm;
  if (
    !fact ||
    fact.sourceRefs.length === 0 ||
    fact.assumptionId !== TIER_ONE_SCREENING_ASSUMPTION_ID
  ) {
    throw new Error("Tier-1 surface area is not a mixed-provenance fact");
  }

  return { model: outcome.model, fact, sourceFileName: source.fileName };
}

function renderInspector(
  model: CanonicalEnergyModel,
  fact: EnergyFact<unknown>,
) {
  return render(
    <EvidenceInspector
      model={model}
      fact={fact}
      locale="en"
      onSelectDocument={vi.fn()}
      onSelectSourceReference={vi.fn()}
      onResolveConflict={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe("EvidenceInspector mixed provenance", () => {
  it("shows source evidence and the linked Tier-1 assumption details together", async () => {
    const { model, fact, sourceFileName } = await tierOneMixedFact();
    const assumption = model.assumptions.find(
      (candidate) => candidate.id === TIER_ONE_SCREENING_ASSUMPTION_ID,
    );
    if (!assumption) throw new Error("Tier-1 assumption record is missing");

    renderInspector(model, fact);

    expect(screen.getByText(sourceFileName)).toBeTruthy();
    const panel = within(screen.getByTestId("linked-assumption"));
    expect(panel.getByText("Linked assumption")).toBeTruthy();
    expect(panel.getByText("Review required")).toBeTruthy();
    expect(panel.getByText(assumption.title)).toBeTruthy();
    expect(panel.getByText(assumption.id)).toBeTruthy();
    expect(panel.getByText(assumption.explanation)).toBeTruthy();
    expect(panel.getByText(assumption.simulationImpact)).toBeTruthy();
  });

  it("keeps both origins visible and marks the linked assumption accepted after acceptance", async () => {
    const { model, fact, sourceFileName } = await tierOneMixedFact();
    const accepted = acceptTierOneScreeningAssumption(
      model,
      "2026-08-24T00:01:00.000Z",
    );
    const acceptedFact = accepted.facts.find(
      (candidate) => candidate.id === fact.id,
    );
    if (!acceptedFact) throw new Error("Accepted Tier-1 fact is missing");

    renderInspector(accepted, acceptedFact);

    expect(screen.getByText(sourceFileName)).toBeTruthy();
    const panel = within(screen.getByTestId("linked-assumption"));
    expect(panel.getByText(TIER_ONE_SCREENING_ASSUMPTION_ID)).toBeTruthy();
    expect(panel.getByTestId("linked-assumption-status").textContent).toBe(
      "Accepted",
    );
  });
});
