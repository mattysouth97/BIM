// src/lib/generative/__tests__/blueprint-generate-fidelity.test.ts
//
// The generation payload must CARRY the measured fidelity report — the §55
// proof step. `measureBlueprintFidelity` has its own suite
// (blueprint-metrics.test.ts); this file only pins the integration contract:
// every successful `runBlueprintGeneration` ships a report measured against
// the building it just produced, so no caller can display a building without
// also having the arithmetic that says how faithful it is.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addVoid,
  emptyBlueprint,
  makePolyLoop,
  makeRectLoop,
} from "../blueprint/builders";
import { runBlueprintGeneration } from "../server/generate-from-blueprint";

const SEED = 20260817;

/** L-shaped plate (40 × 30 m minus a 15 × 12 m corner) with a courtyard. */
function lWithCourtyard() {
  let spec = emptyBlueprint("Fidelity payload test");
  spec = addBoundary(spec, {
    loop: makePolyLoop("outline", [
      { xMm: 0, zMm: 0 },
      { xMm: 40_000, zMm: 0 },
      { xMm: 40_000, zMm: 18_000 },
      { xMm: 25_000, zMm: 18_000 },
      { xMm: 25_000, zMm: 30_000 },
      { xMm: 0, zMm: 30_000 },
    ]),
    floorNos: [1, 2],
  });
  spec = addVoid(spec, {
    id: "court",
    kind: "courtyard",
    region: {
      kind: "loop",
      loop: makeRectLoop("court-loop", {
        xMm: 6_000,
        zMm: 6_000,
        widthMm: 8_000,
        depthMm: 8_000,
      }),
    },
    floorNos: [1, 2],
  });
  return spec;
}

describe("runBlueprintGeneration carries measured fidelity", () => {
  it("ships a report measured against the generated building", () => {
    const outcome = runBlueprintGeneration({
      blueprint: lWithCourtyard(),
      seed: SEED,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { fidelity, blueprint } = outcome.payload;
    expect(fidelity.blueprintId).toBe(blueprint.id);

    // Both drawn levels were comparable — the report measured what was built.
    expect(fidelity.measuredFloorNos).toEqual([1, 2]);
    expect(fidelity.boundary.levels).toHaveLength(2);

    // The custom-plate path copies the drawn outline verbatim, so a faithful
    // build measures (near-)zero deviation. Observed 0 exactly; the bound
    // guards against a regression that re-approximates the plate.
    expect(fidelity.boundary.worstSymmetricDifferenceRatio).not.toBeNull();
    expect(fidelity.boundary.worstSymmetricDifferenceRatio!).toBeLessThan(0.001);

    // The courtyard survived as a real hole on both levels it spans.
    expect(fidelity.voids).toHaveLength(2);
    for (const entry of fidelity.voids) {
      expect(entry.kind).toBe("courtyard");
      expect(entry.retainedRatio).toBeGreaterThan(0.9);
    }
  });

  it("is deterministic: the same input yields the same report", () => {
    const run = () =>
      runBlueprintGeneration({ blueprint: lWithCourtyard(), seed: SEED });
    const first = run();
    const second = run();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.payload.fidelity).toEqual(first.payload.fidelity);
  });
});
