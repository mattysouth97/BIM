// The native schematic generation path, end to end and without a model.
//
// This is the contract the SSE route is a thin wrapper over: a blueprint goes
// in, either a full building comes out or a structured, honest refusal does.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addCore,
  addVoid,
  addZone,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
} from "../blueprint";
import {
  BLUEPRINT_TOTAL_STAGES,
  runBlueprintGeneration,
} from "../server/generate-from-blueprint";

const FLOORS = [1, 2, 3];

/** 30 × 20 m plate on three levels, with a core and an office zone. */
function validBlueprint(): BlueprintSpec {
  let spec = emptyBlueprint("Test schematic");
  spec = addBoundary(spec, {
    loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 20_000 }),
    floorNos: FLOORS,
  });
  spec = addCore(spec, {
    id: "core-1",
    region: {
      kind: "rect",
      originMm: { xMm: 15_000, zMm: 10_000 },
      widthMm: 8_000,
      depthMm: 6_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
    contents: ["stair", "elevator"],
  });
  spec = addZone(spec, {
    id: "zone-office",
    program: "office-open",
    region: {
      kind: "rect",
      originMm: { xMm: 8_000, zMm: 6_000 },
      widthMm: 12_000,
      depthMm: 8_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
  });
  return spec;
}

describe("runBlueprintGeneration", () => {
  it("builds a validated building from a well-formed schematic", () => {
    const stages: string[] = [];
    const outcome = runBlueprintGeneration(
      { blueprint: validBlueprint(), seed: 4242 },
      (event) => {
        expect(event.total).toBe(BLUEPRINT_TOTAL_STAGES);
        stages.push(event.stage);
      },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { payload } = outcome;
    expect(payload.success).toBe(true);
    expect(payload.seed).toBe(4242);
    expect(payload.spec.massing.strategy.value).toBe("custom");
    expect(payload.recipe.floors.length).toBeGreaterThan(0);
    expect(payload.snapshot.elements.length).toBeGreaterThan(0);
    expect(payload.metrics.floorCount).toBe(FLOORS.length);
    expect(payload.blueprintValidation.blueprintValid).toBe(true);

    // Rooms are what makes the plan view possible at all.
    const rooms = payload.snapshot.elements.filter((e) => e.kind === "room");
    expect(rooms.length).toBeGreaterThan(0);

    // No reasoning provider was involved, and the payload says so plainly.
    expect(payload.provider.name).toBe("native-schematic");
    expect(payload.provider.inputTokens).toBe(0);

    // Stage reporting: schematic lead-in, then the deterministic pipeline.
    expect(stages[0]).toBe("reading");
    expect(stages[1]).toBe("compiling");
    expect(stages).toContain("spaces");
    expect(stages[stages.length - 1]).toBe("validating");
  });

  it("carries the blueprint and its report back with the building", () => {
    const outcome = runBlueprintGeneration({ blueprint: validBlueprint(), seed: 7 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.payload.blueprint.boundaries).toHaveLength(1);
    expect(outcome.payload.blueprint.source).toBe("native-editor");
    expect(outcome.payload.blueprintValidation.counts.critical).toBe(0);
  });

  it("is deterministic: the same schematic and seed build the same building", () => {
    const a = runBlueprintGeneration({ blueprint: validBlueprint(), seed: 99 });
    const b = runBlueprintGeneration({ blueprint: validBlueprint(), seed: 99 });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(b.payload.generationId).toBe(a.payload.generationId);
    expect(b.payload.metrics).toEqual(a.payload.metrics);
    expect(b.payload.snapshot.elements.map((e) => e.id)).toEqual(
      a.payload.snapshot.elements.map((e) => e.id),
    );
  });

  it("merges the compiler's fidelity locks with the session's", () => {
    const exact: BlueprintSpec = { ...validBlueprint(), fidelityMode: "exact" };
    const outcome = runBlueprintGeneration({
      blueprint: exact,
      seed: 1,
      locks: ["level:2"],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // "exact" boundary ⇒ massing is locked; "exact" core ⇒ core is locked.
    expect(outcome.payload.compiledLocks).toContain("system:massing");
    expect(outcome.payload.compiledLocks).toContain("system:core");
    expect(outcome.payload.compiledLocks).toContain("level:2");
    // Locks reach the snapshot, so a regeneration cannot quietly move them.
    expect(
      outcome.payload.snapshot.elements.some((element) => element.locked === true),
    ).toBe(true);
  });

  it("refuses an unclosed boundary and says exactly what is wrong", () => {
    const broken = validBlueprint();
    // Pull one endpoint away: the loop no longer chains, which is P0.
    const segments = broken.boundaries[0].loop.segments.map((segment, index) =>
      index === 0 && segment.kind === "line"
        ? { ...segment, endMm: { xMm: 29_000, zMm: 500 } }
        : segment,
    );
    const openLoop: BlueprintSpec = {
      ...broken,
      boundaries: [
        {
          ...broken.boundaries[0],
          loop: { ...broken.boundaries[0].loop, segments },
        },
      ],
    };

    const outcome = runBlueprintGeneration({ blueprint: openLoop, seed: 1 });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.code).toBe("BLUEPRINT_INVALID");
    expect(outcome.blueprintValidation?.violations.some(
      (v) => v.code === "BOUNDARY_NOT_CLOSED",
    )).toBe(true);
    expect(outcome.blueprintValidation?.blueprintValid).toBe(false);
    expect(outcome.detail).toContain("BOUNDARY_NOT_CLOSED");
  });

  it("refuses a schematic with no boundary rather than inventing a footprint", () => {
    const outcome = runBlueprintGeneration({
      blueprint: emptyBlueprint("Nothing drawn"),
      seed: 1,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("BLUEPRINT_NOT_BUILDABLE");
    // Well-formed, just empty: the report is clean and the refusal is honest.
    expect(outcome.blueprintValidation?.counts.critical).toBe(0);
  });

  it("rejects anything that is not a blueprint", () => {
    const outcome = runBlueprintGeneration({ blueprint: { hello: "world" } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("INVALID_BLUEPRINT");
    expect(outcome.detail).toBeTruthy();
  });

  it("keeps a courtyard as a real hole in the generated plate", () => {
    let spec = validBlueprint();
    spec = addVoid(spec, {
      id: "court",
      kind: "courtyard",
      region: {
        kind: "rect",
        originMm: { xMm: 22_000, zMm: 10_000 },
        widthMm: 6_000,
        depthMm: 6_000,
        rotationRad: 0,
      },
      floorNos: FLOORS,
    });

    const outcome = runBlueprintGeneration({ blueprint: spec, seed: 5 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const plates = outcome.payload.spec.massing.customPlates?.value ?? [];
    expect(plates.length).toBeGreaterThan(0);
    // outer ring + one hole
    expect(plates[0].polygonMm.length).toBe(2);
  });
});
