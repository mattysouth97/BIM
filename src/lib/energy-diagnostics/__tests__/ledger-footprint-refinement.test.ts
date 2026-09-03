import { describe, expect, it } from "vitest";

import { demoFloors, demoTitle } from "@/lib/demo/demo-building";

import { compileCanonicalModelToEngineInput, runSimulation } from "../adapter";
import { ingestDrawingSet } from "../ingestion";
import {
  LEDGER_FOOTPRINT_ASSUMPTION_ID,
  buildLedgerBaselineModel,
} from "../ledger-baseline-model";
import {
  diagnosticSourceFromLedger,
  type LedgerFootprint,
} from "../ledger-source";
import {
  capturedRefinements,
  commitRefinement,
  reapplyRefinements,
  refinableFacts,
} from "../refinement";
import type { CanonicalEnergyModel, Polygon2D } from "../types";

const NOW = "2026-04-03T00:00:00.000Z";

/**
 * An L-shaped plan enclosing roughly the demo building's 816 m² 건축면적, but
 * with a much longer perimeter than the 1.5:1 rectangle the register implies.
 */
const MEASURED_L_SHAPE = [
  [0, 0],
  [40, 0],
  [40, 14],
  [22, 14],
  [22, 32],
  [0, 32],
] as unknown as Polygon2D;

async function build(footprint?: LedgerFootprint) {
  const source = diagnosticSourceFromLedger({
    title: demoTitle,
    floors: demoFloors,
    ...(footprint ? { footprint } : {}),
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
  if (run.status !== "succeeded" || !run.result) throw new Error("no result");
  return run.result.annualEnergyKwh;
}

describe("a measured plan replacing the register's invented outline", () => {
  it("is labelled as survey geometry, and drops the invented-outline assumption", async () => {
    const measured = await build({
      kind: "measured_drawing",
      ringM: MEASURED_L_SHAPE,
      label: "2F plan.dxf",
    });

    const boundary = measured.geometry.floorPlates[0].boundary;
    expect(boundary.status).toBe("extracted");
    expect(boundary.authority).toBe("dimensioned_vector_geometry");
    expect(boundary.assumptionId).toBeUndefined();
    // The "we invented a rectangle" assumption is gone entirely.
    expect(measured.assumptions.map((a) => a.id)).not.toContain(
      LEDGER_FOOTPRINT_ASSUMPTION_ID,
    );
  });

  it("changes the envelope, and therefore the answer", async () => {
    const derived = await build();
    const measured = await build({
      kind: "measured_drawing",
      ringM: MEASURED_L_SHAPE,
    });

    // Six walls per storey instead of four.
    const derivedWalls = derived.geometry.surfaces.filter(
      (s) => s.type === "exterior_wall",
    ).length;
    const measuredWalls = measured.geometry.surfaces.filter(
      (s) => s.type === "exterior_wall",
    ).length;
    expect(derivedWalls).toBe(40);
    expect(measuredWalls).toBe(60);

    // The longer perimeter means more exterior wall, so more loss.
    const derivedWallArea = derived.geometry.surfaces
      .filter((s) => s.type === "exterior_wall")
      .reduce((sum, s) => sum + (s.areaSqm.value as number), 0);
    const measuredWallArea = measured.geometry.surfaces
      .filter((s) => s.type === "exterior_wall")
      .reduce((sum, s) => sum + (s.areaSqm.value as number), 0);
    expect(measuredWallArea).toBeGreaterThan(derivedWallArea);

    expect(annualKwh(measured)).not.toBeCloseTo(annualKwh(derived), 0);
  });

  it("carries the user's corrections across the rebuild", async () => {
    const derived = await build();
    const wallU = refinableFacts(derived, "envelope").find((f) =>
      f.key.includes("ledger-construction-wall"),
    )!;
    const corrected = commitRefinement(
      derived,
      {
        upgrades: [
          {
            targetFactId: wallU.id,
            value: 0.17,
            provenance: { kind: "stated_by_user", note: "외단열 상세" },
          },
        ],
      },
      NOW,
    );
    if (corrected.status !== "applied") throw new Error(corrected.message);

    const captured = capturedRefinements(corrected.model);
    expect(captured.map((entry) => entry.key)).toContain(wallU.key);

    // Rebuild around the measured plan, then re-apply what the user set.
    const rebuilt = await build({
      kind: "measured_drawing",
      ringM: MEASURED_L_SHAPE,
    });
    const { outcome, droppedKeys } = reapplyRefinements(rebuilt, captured, NOW);
    expect(droppedKeys).toEqual([]);
    if (outcome.status !== "applied") throw new Error(outcome.message);

    const carried = outcome.model.facts.find((f) => f.key === wallU.key);
    expect(carried?.value).toBe(0.17);
    expect(carried?.status).toBe("user_confirmed");
    // And the correction is still attributed to the user, not to the drawing.
    expect(carried?.authority).toBe("user_confirmed_project_value");
  });

  it("reports a correction that cannot travel rather than losing it silently", async () => {
    const rebuilt = await build();
    const { droppedKeys } = reapplyRefinements(
      rebuilt,
      [
        {
          key: "envelope.construction.does-not-exist.uValueWPerM2K",
          value: 0.2,
          provenance: { kind: "stated_by_user" },
        },
      ],
      NOW,
    );
    expect(droppedKeys).toEqual([
      "envelope.construction.does-not-exist.uValueWPerM2K",
    ]);
  });

  it("does not capture era defaults, so a rebuild re-derives them", async () => {
    const derived = await build();
    const captured = capturedRefinements(derived);
    // A fresh baseline has no user corrections at all.
    expect(captured).toEqual([]);
  });
});

/**
 * P2-29 — the outline the shared reconstruction resolved.
 *
 * The ring travels; the grade does not improve. Whether it is treated as a
 * trace or as an inference follows `observed`, never the fact that a ring
 * arrived at all.
 */
describe("a reconstructed outline from the shared ledger geometry producer", () => {
  it("carries an observed ring as graphical evidence, with no invented-outline assumption", async () => {
    const model = await build({
      kind: "reconstructed",
      ringM: MEASURED_L_SHAPE,
      observed: true,
    });

    const boundary = model.geometry.floorPlates[0].boundary;
    expect(boundary.status).toBe("extracted");
    expect(boundary.authority).toBe("repeated_graphical_evidence");
    expect(boundary.assumptionId).toBeUndefined();
    expect(model.assumptions.map((a) => a.id)).not.toContain(
      LEDGER_FOOTPRINT_ASSUMPTION_ID,
    );
  });

  it("never labels a reconstruction as dimensioned survey geometry", async () => {
    const model = await build({
      kind: "reconstructed",
      ringM: MEASURED_L_SHAPE,
      observed: true,
    });
    expect(model.geometry.floorPlates[0].boundary.authority).not.toBe(
      "dimensioned_vector_geometry",
    );
  });

  it("carries a solved ring as an inference, keeping the invented-outline assumption", async () => {
    const model = await build({
      kind: "reconstructed",
      ringM: MEASURED_L_SHAPE,
      observed: false,
    });

    const boundary = model.geometry.floorPlates[0].boundary;
    expect(boundary.status).toBe("inferred");
    expect(boundary.authority).toBe("deterministic_rule_inference");
    expect(boundary.assumptionId).toBe(LEDGER_FOOTPRINT_ASSUMPTION_ID);
    expect(model.assumptions.map((a) => a.id)).toContain(
      LEDGER_FOOTPRINT_ASSUMPTION_ID,
    );
  });

  it("uses the ring it was handed, not a rectangle re-derived from 건축면적", async () => {
    const reconstructed = await build({
      kind: "reconstructed",
      ringM: MEASURED_L_SHAPE,
      observed: false,
    });
    const rectangle = await build();
    // Same 건축면적, a longer perimeter — so the two disagree about energy.
    expect(annualKwh(reconstructed)).not.toBeCloseTo(annualKwh(rectangle), 0);
  });
});
