// src/store/__tests__/blueprint-store-fidelity.test.ts
//
// The retention rule for the measured fidelity report.
//
// A report describes ONE pairing: this blueprint, that building. The store
// keeps it beside the blueprint it measured, and `fidelityForDesign` is the
// only thing allowed to hand it out — bound to the generation id of the design
// actually on screen. Every way the design can move to a different generation
// (edit, undo to another branch, a fresh prompt generation, "New building")
// must therefore take the report off screen rather than let a stale number be
// re-attributed to geometry it never saw.
//
// The fixture is a REAL run of the generation server, so the shape of the
// report cannot drift away from what the UI will actually be handed.

import { beforeAll, describe, expect, it } from "vitest";

import {
  addBoundary,
  addVoid,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintFidelityReport,
  type BlueprintSpec,
  type BlueprintValidationReport,
} from "@/lib/generative/blueprint";
import { runBlueprintGeneration } from "@/lib/generative/server/generate-from-blueprint";
import {
  fidelityForDesign,
  useBlueprintStore,
  type GeneratedFromBlueprint,
} from "@/store/blueprint-store";

const SEED = 20260817;

function courtyardBlock(): BlueprintSpec {
  let spec = emptyBlueprint("Fidelity retention fixture");
  spec = addBoundary(spec, {
    loop: makeRectLoop("outline", {
      xMm: 0,
      zMm: 0,
      widthMm: 36_000,
      depthMm: 24_000,
    }),
    floorNos: [1, 2],
  });
  spec = addVoid(spec, {
    id: "court",
    kind: "courtyard",
    region: {
      kind: "loop",
      loop: makeRectLoop("court-loop", {
        xMm: 14_000,
        zMm: 9_000,
        widthMm: 8_000,
        depthMm: 6_000,
      }),
    },
    floorNos: [1, 2],
  });
  return spec;
}

let report: BlueprintFidelityReport;
let blueprint: BlueprintSpec;
let validation: BlueprintValidationReport;

beforeAll(() => {
  const outcome = runBlueprintGeneration({ blueprint: courtyardBlock(), seed: SEED });
  if (!outcome.ok) throw new Error("fixture generation failed");
  report = outcome.payload.fidelity;
  blueprint = outcome.payload.blueprint;
  validation = outcome.payload.blueprintValidation;
});

const generated = (generationId: string): GeneratedFromBlueprint => ({
  generationId,
  blueprint,
  blueprintValidation: validation,
  compiledLocks: [],
  fidelity: report,
});

describe("fidelityForDesign", () => {
  it("hands over the report when the design is the one it measured", () => {
    expect(fidelityForDesign(generated("GEN-0001"), "GEN-0001")).toBe(report);
  });

  it("withholds it once the design moved to another generation", () => {
    // What an accepted edit or an undo to a sibling branch looks like.
    expect(fidelityForDesign(generated("GEN-0001"), "GEN-0001.1")).toBeNull();
    expect(fidelityForDesign(generated("GEN-0001"), "GEN-0002")).toBeNull();
  });

  it("withholds it when there is no generation, or nothing was generated", () => {
    expect(fidelityForDesign(generated("GEN-0001"), null)).toBeNull();
    expect(fidelityForDesign(generated("GEN-0001"), undefined)).toBeNull();
    expect(fidelityForDesign(null, "GEN-0001")).toBeNull();
    expect(fidelityForDesign(null, null)).toBeNull();
  });

  it("never invents a report from an empty-string id on either side", () => {
    // Two absent ids must not compare equal into a match.
    expect(fidelityForDesign(generated(""), "")).toBeNull();
  });
});

describe("blueprint store retention", () => {
  it("keeps the report beside the blueprint it was measured against", () => {
    const store = useBlueprintStore.getState();
    store.reset("retention");
    store.noteGenerated(generated("GEN-0001"));

    const kept = useBlueprintStore.getState().lastGenerated;
    expect(kept).not.toBeNull();
    expect(kept!.fidelity).toBe(report);
    expect(kept!.fidelity.blueprintId).toBe(kept!.blueprint.id);
  });

  it("a later generation replaces the report rather than accumulating one", () => {
    const store = useBlueprintStore.getState();
    store.reset("retention");
    store.noteGenerated(generated("GEN-0001"));
    store.noteGenerated(generated("GEN-0002"));

    const kept = useBlueprintStore.getState().lastGenerated;
    expect(kept!.generationId).toBe("GEN-0002");
    expect(fidelityForDesign(kept, "GEN-0001")).toBeNull();
    expect(fidelityForDesign(kept, "GEN-0002")).toBe(report);
  });

  it("drops it entirely when the schematic is reset", () => {
    const store = useBlueprintStore.getState();
    store.noteGenerated(generated("GEN-0001"));
    useBlueprintStore.getState().reset("fresh");

    expect(useBlueprintStore.getState().lastGenerated).toBeNull();
    expect(
      fidelityForDesign(useBlueprintStore.getState().lastGenerated, "GEN-0001"),
    ).toBeNull();
  });

  it("survives editing the working blueprint — the report describes the SUBMITTED drawing", () => {
    const store = useBlueprintStore.getState();
    store.reset("retention");
    store.noteGenerated(generated("GEN-0001"));

    // Drawing on after generating does not un-measure the building that exists.
    useBlueprintStore.getState().setFidelityMode("exploratory");

    const kept = useBlueprintStore.getState().lastGenerated;
    expect(fidelityForDesign(kept, "GEN-0001")).toBe(report);
    expect(kept!.blueprint).toBe(blueprint);
  });
});
