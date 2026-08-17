// src/lib/generative/__tests__/partial-regen-floors.test.ts
//
// FLOOR-SCOPED PARTIAL REGENERATION.
//
// `BuildingPatchSchema` has always declared `scope` and `affectedFloorNos`, and
// for a long while nothing read them: an edit re-solved the whole building and
// the stability of the storeys the user did not touch was EMERGENT — a property
// of the pipeline being deterministic, not a promise anyone had made. That is a
// promise right up until the patch perturbs a global input, at which point the
// solver legitimately re-bands every plate and rooms shuffle on floors the user
// never mentioned.
//
// This file is the proof that the declared scope is now honoured, and — just as
// importantly — the proof that it is honoured HONESTLY:
//
//   • carried floors are the previous ELEMENT RECORDS, provenance and all, not
//     fresh ones that happen to compare equal (§1, §4);
//   • the feature does something determinism alone did not: the same patch moves
//     rooms on untouched floors through the full rebuild and leaves them exactly
//     where they were through the partial one (§2);
//   • a patch that under-declares its blast radius is REFUSED, not trusted, and
//     the refusal is recorded where a human can read it (§3);
//   • locks and human edits still win over everything (§5).
//
// Wing-level (same-floor) regeneration is deliberately NOT implemented; the
// sentinel in acceptance-locks-and-stability.test.ts pins that limitation and
// must keep passing.
//
// Everything runs on the heuristic provider: no network, no key, no randomness
// beyond the seed.

import { describe, expect, it } from "vitest";

import {
  buildDesign,
  buildDesignPartial,
  generationIdFor,
  partialFloorScope,
  type BuiltDesign,
} from "../build";
import { applySpecPatch } from "../patch/apply";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import { completeEdit } from "../server/edit";
import { applyLocksToElements, systemLock } from "../session/locks";
import type { BuildingPatch, BuildingSpec } from "../spec/building-spec";
import type { BimElement } from "@/lib/bim/model/types";
import { levelIdForFloor } from "@/lib/bim/model/types";

const provider = new HeuristicReasoningProvider();
const PROMPT = "Create a five-story office building.";
const BUILDING_PK = "partial-regen";

async function officeSpec(): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt: PROMPT,
    seed: seedFromPrompt(PROMPT),
  });
  return data;
}

function build(spec: BuildingSpec, revision = 0, locks: string[] = []): BuiltDesign {
  return buildDesign({
    spec,
    buildingPk: BUILDING_PK,
    generationId: generationIdFor(spec.generationSeed, revision),
    locks,
  });
}

/** The patched spec, or a loud failure — a rejected patch tests nothing here. */
function patched(spec: BuildingSpec, patch: BuildingPatch): BuildingSpec {
  const application = applySpecPatch({ spec, patch });
  expect(application.error ?? null, patch.summary).toBeNull();
  expect(application.ok, patch.summary).toBe(true);
  return application.spec;
}

const elementsOnFloor = (design: BuiltDesign, floorNo: number): BimElement[] =>
  design.snapshot.elements.filter((element) => element.levelId === levelIdForFloor(floorNo));

const byId = (elements: BimElement[]) => new Map(elements.map((e) => [e.id, e]));

/** A floor's room layout, as the only thing that has to move for a test to bite. */
const roomsOn = (design: BuiltDesign, floorNo: number) =>
  JSON.stringify(
    design.building.spaces
      .filter((space) => space.floorNo === floorNo)
      .map((space) => [space.id, space.type, space.rect]),
  );

/**
 * A program rebalance: the open-plan office target grows by 40%.
 *
 * The item sits on levels 2–5, so a full re-solve genuinely re-bands FOUR
 * storeys — and the patch declares only level 3. That gap is the whole point:
 * levels 2, 4 and 5 are where determinism alone would have let the building
 * move under the user.
 */
function rebalancePatch(spec: BuildingSpec): BuildingPatch {
  const index = spec.program.findIndex((item) => item.id === "open-office");
  expect(index, "the office fixture must have an open-office program item").toBeGreaterThanOrEqual(0);
  return {
    summary: "Enlarge the open-plan office on level 3",
    rationale: "Level 3 becomes the main workfloor, so its open-plan target grows.",
    scope: "program",
    affectedFloorNos: [3],
    operations: [
      {
        op: "set",
        path: `/program/${index}/targetAreaSqmPerLevel`,
        value: Number((spec.program[index].targetAreaSqmPerLevel * 1.4).toFixed(1)),
      },
    ],
  };
}

/* ================================================================== */
/* 1. Undeclared floors are carried, declared ones are rebuilt         */
/* ================================================================== */

describe("partial regeneration: floors the patch did not declare", () => {
  it("carries their element records across byte-identical, and rebuilds only the declared floor", async () => {
    const spec = await officeSpec();
    const before = build(spec);
    expect(before.building.levels.map((l) => l.floorNo)).toEqual([1, 2, 3, 4, 5]);
    // A full build never claims a partial one happened.
    expect(before.partialRegeneration).toBeUndefined();

    const patch = rebalancePatch(spec);
    const nextSpec = patched(spec, patch);
    const partial = buildDesignPartial({
      previous: before,
      patch,
      spec: nextSpec,
      buildingPk: BUILDING_PK,
      generationId: generationIdFor(nextSpec.generationSeed, 1),
    });

    expect(partial.partialRegeneration).toEqual({
      affectedFloorNos: [3],
      carriedFloorNos: [1, 2, 4, 5],
      carriedElementCount: expect.any(Number),
      fallbackReason: null,
    });
    expect(partial.partialRegeneration!.carriedElementCount).toBeGreaterThan(100);

    for (const floorNo of [1, 2, 4, 5]) {
      const kept = elementsOnFloor(partial, floorNo);
      const original = elementsOnFloor(before, floorNo);
      expect(kept.length, `level ${floorNo} lost or gained elements`).toBe(original.length);
      expect(kept.length).toBeGreaterThan(0);

      const originalById = byId(original);
      for (const element of kept) {
        // Deep equality on the whole record, not a count and not a fingerprint:
        // parameters, placement, dependencies and provenance all identical.
        expect(originalById.get(element.id), `${element.id} appeared from nowhere`).toBeDefined();
        expect(element).toEqual(originalById.get(element.id));
        // The tell that these were CARRIED rather than regenerated-and-equal:
        // their provenance still names the build that made them.
        expect(element.generationSource?.generationId).toBe(before.generationId);
      }
    }

    // Non-vacuous: the declared floor really did change, and its elements name
    // the new build.
    const rebuilt = elementsOnFloor(partial, 3);
    expect(roomsOn(partial, 3)).not.toEqual(roomsOn(before, 3));
    expect(rebuilt.length).toBeGreaterThan(0);
    expect(
      rebuilt.every((e) => e.generationSource?.generationId === partial.generationId),
    ).toBe(true);
    expect(partial.generationId).not.toBe(before.generationId);

    // Nothing was duplicated or orphaned on the way through the merge.
    const ids = partial.snapshot.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(partial.validation.counts.critical).toBe(0);
  });
});

/* ================================================================== */
/* 2. The feature does something determinism alone did not             */
/* ================================================================== */

describe("partial regeneration: stability the full rebuild does not provide", () => {
  it("pins floors that a full re-solve genuinely moves", async () => {
    const spec = await officeSpec();
    const before = build(spec);

    const patch = rebalancePatch(spec);
    const nextSpec = patched(spec, patch);
    const generationId = generationIdFor(nextSpec.generationSeed, 1);

    const full = buildDesign({ spec: nextSpec, buildingPk: BUILDING_PK, generationId });
    const partial = buildDesignPartial({
      previous: before,
      patch,
      spec: nextSpec,
      buildingPk: BUILDING_PK,
      generationId,
    });
    expect(partial.partialRegeneration!.fallbackReason).toBeNull();

    // THE PREMISE. Levels 2, 4 and 5 were not mentioned by the patch and the
    // full rebuild re-solves them anyway — this is the drift the feature exists
    // to stop, asserted rather than assumed.
    for (const floorNo of [2, 4, 5]) {
      expect(
        roomsOn(full, floorNo),
        `level ${floorNo} did not move under a full rebuild, so this test proves nothing`,
      ).not.toEqual(roomsOn(before, floorNo));
    }

    // THE PROPERTY. Through the partial path those same floors do not move.
    for (const floorNo of [2, 4, 5]) {
      expect(roomsOn(partial, floorNo), `level ${floorNo} drifted`).toEqual(
        roomsOn(before, floorNo),
      );
    }

    // …and the difference is visible in the BIM graph, not only in the solver
    // output: the full rebuild's records for level 2 differ from the previous
    // design's, the partial rebuild's do not.
    const previousLevel2 = JSON.stringify(elementsOnFloor(before, 2));
    expect(JSON.stringify(elementsOnFloor(full, 2))).not.toEqual(previousLevel2);
    expect(JSON.stringify(elementsOnFloor(partial, 2))).toEqual(previousLevel2);

    // The declared floor is identical to the full rebuild's — nothing on level 3
    // was carried, so the user's actual instruction landed in full.
    expect(roomsOn(partial, 3)).toEqual(roomsOn(full, 3));

    // Metrics describe the model the user is looking at, not the one that was
    // thrown away: the merged building has more office area than the fresh
    // re-solve, because four storeys kept their larger pre-patch rooms.
    expect(partial.metrics.netAreaSqm).not.toBe(full.metrics.netAreaSqm);
    expect(partial.summary.floors).toBe(partial.metrics.floorCount);
  });
});

/* ================================================================== */
/* 3. Trust, but verify: under-declared scope falls back               */
/* ================================================================== */

describe("partial regeneration: an under-declared blast radius is refused", () => {
  /** Every fallback must be indistinguishable from the plain full rebuild. */
  function expectEqualsFullRebuild(partial: BuiltDesign, full: BuiltDesign) {
    expect(partial.partialRegeneration!.fallbackReason).toEqual(expect.any(String));
    expect(partial.partialRegeneration!.carriedFloorNos).toEqual([]);
    expect(partial.partialRegeneration!.carriedElementCount).toBe(0);
    expect({ ...partial, partialRegeneration: undefined }).toEqual({
      ...full,
      partialRegeneration: undefined,
    });
  }

  async function bothWays(patch: BuildingPatch) {
    const spec = await officeSpec();
    const before = build(spec);
    const nextSpec = patched(spec, patch);
    const generationId = generationIdFor(nextSpec.generationSeed, 1);
    return {
      before,
      full: buildDesign({ spec: nextSpec, buildingPk: BUILDING_PK, generationId }),
      partial: buildDesignPartial({
        previous: before,
        patch,
        spec: nextSpec,
        buildingPk: BUILDING_PK,
        generationId,
      }),
    };
  }

  it("refuses to carry anything when the patch added a storey", async () => {
    const { full, partial } = await bothWays({
      summary: "Add a sixth storey",
      rationale: "One more floor of offices.",
      scope: "levels",
      // The lie: a new storey renumbers nothing but re-stacks the whole building.
      affectedFloorNos: [2],
      operations: [
        {
          op: "insert",
          path: "/levels/-",
          value: { floorNo: 6, name: "L06", floorToFloorMm: 3_900, usage: "occupied" },
        },
      ],
    });

    expectEqualsFullRebuild(partial, full);
    expect(partial.partialRegeneration!.fallbackReason).toMatch(/storey set \(5 → 6 levels\)/);
  });

  it("refuses to carry anything when the patch moved the plate", async () => {
    const spec = await officeSpec();
    const { full, partial } = await bothWays({
      summary: "Widen the building",
      rationale: "One more structural bay across.",
      scope: "massing",
      affectedFloorNos: [2],
      operations: [
        {
          op: "set",
          path: "/massing/widthMm/value",
          value: spec.massing.widthMm.value + spec.structure.gridXMm.value,
        },
      ],
    });

    expectEqualsFullRebuild(partial, full);
    // A wider plate re-lays the structural grid, which is building-wide by
    // construction — every floor is affected whatever the patch claimed.
    expect(partial.partialRegeneration!.fallbackReason).toMatch(/grid/);
  });

  it("refuses to carry the storeys a level-height change pushed upward", async () => {
    const { full, partial } = await bothWays({
      summary: "Raise level 3",
      rationale: "A double-height workfloor on level 3.",
      scope: "levels",
      // Honest about level 3 — and blind to the fact that levels 4 and 5 now
      // sit 600 mm higher than they did.
      affectedFloorNos: [3],
      operations: [{ op: "set", path: "/levels/2/floorToFloorMm", value: 4_500 }],
    });

    expectEqualsFullRebuild(partial, full);
    expect(partial.partialRegeneration!.fallbackReason).toMatch(/level [45] moved/);
  });

  it("refuses the carry-over when validating the merged model finds new criticals", async () => {
    // The structural guards all pass here: same storeys, same grid, same core,
    // same types, same plates. Only the VALIDATION pass can catch this one — a
    // P0 program item added to every level, declared as touching level 3 alone,
    // leaves four storeys with nowhere for it to have gone.
    const { full, partial } = await bothWays({
      summary: "Add a wellness room",
      rationale: "A quiet room on every storey.",
      scope: "program",
      affectedFloorNos: [3],
      operations: [
        {
          op: "insert",
          path: "/program/-",
          value: {
            id: "wellness",
            type: "service",
            label: "Wellness room",
            levels: [1, 2, 3, 4, 5],
            targetAreaSqmPerLevel: 40,
            countPerLevel: 1,
            minAreaSqm: 12,
            preferredAspectRatio: 1.4,
            adjacency: [{ kind: "REQUIRES_CORRIDOR" }],
            priority: "P0",
          },
        },
      ],
    });

    expectEqualsFullRebuild(partial, full);
    expect(partial.partialRegeneration!.fallbackReason).toMatch(/PROGRAM_NOT_PLACED/);
    expect(partial.partialRegeneration!.fallbackReason).toMatch(/under-declared/);
    // The design the user gets is the sound one: the fallback is a repair, not
    // an alarm raised over a broken model.
    expect(partial.validation.counts.critical).toBe(0);
  });
});

/* ================================================================== */
/* 4. Patches that never claimed a floor scope                         */
/* ================================================================== */

describe("partial regeneration: patches with no floor scope", () => {
  it("reads scope off the patch the way the schema documents it", () => {
    const of = (scope: BuildingPatch["scope"], affectedFloorNos: number[]) =>
      partialFloorScope({ scope, affectedFloorNos });

    expect(of("building", [3])).toBeNull();
    expect(of("program", [])).toBeNull();
    expect(of("program", [3])).toEqual([3]);
    // Deduplicated and ordered, so the carry set does not depend on how the
    // provider happened to spell the list.
    expect(of("levels", [5, 3, 5])).toEqual([3, 5]);
  });

  it("takes the full-rebuild path, byte for byte, when the patch is global", async () => {
    const spec = await officeSpec();
    const before = build(spec);

    const patch: BuildingPatch = {
      summary: "Increase glazing",
      rationale: "More daylight on every elevation.",
      scope: "facade",
      affectedFloorNos: [],
      operations: spec.facade.sides.map((side, index) => ({
        op: "set" as const,
        path: `/facade/sides/${index}/glazingRatio`,
        value: Math.min(0.9, Number((side.glazingRatio + 0.12).toFixed(2))),
      })),
    };
    const nextSpec = patched(spec, patch);
    const generationId = generationIdFor(nextSpec.generationSeed, 1);

    const full = buildDesign({ spec: nextSpec, buildingPk: BUILDING_PK, generationId });
    const partial = buildDesignPartial({
      previous: before,
      patch,
      spec: nextSpec,
      buildingPk: BUILDING_PK,
      generationId,
    });

    // Not merely equal — there is no note at all, because nothing partial was
    // attempted. A reader of the history must not see a fallback that never was.
    expect(partial.partialRegeneration).toBeUndefined();
    expect(JSON.stringify(partial)).toEqual(JSON.stringify(full));
  });

  it("recomputes the merged model's metrics exactly as the pipeline does", async () => {
    // The merge assembles a building the pipeline never solved, so `build.ts`
    // repeats the pipeline's private metric arithmetic. This is the pin that
    // stops the duplicate drifting: declare EVERY floor affected and nothing is
    // carried, so the merged building is the fresh building — and the merged
    // metrics must therefore be the pipeline's own, to the last decimal.
    const spec = await officeSpec();
    const before = build(spec);

    const patch = { ...rebalancePatch(spec), affectedFloorNos: [1, 2, 3, 4, 5] };
    const nextSpec = patched(spec, patch);
    const generationId = generationIdFor(nextSpec.generationSeed, 1);

    const full = buildDesign({ spec: nextSpec, buildingPk: BUILDING_PK, generationId });
    const partial = buildDesignPartial({
      previous: before,
      patch,
      spec: nextSpec,
      buildingPk: BUILDING_PK,
      generationId,
    });

    expect(partial.partialRegeneration).toEqual({
      affectedFloorNos: [1, 2, 3, 4, 5],
      carriedFloorNos: [],
      carriedElementCount: 0,
      fallbackReason: null,
    });
    expect(partial.metrics).toEqual(full.metrics);
    expect(JSON.stringify(partial.metrics)).toEqual(JSON.stringify(full.metrics));
    // The rest of the design follows from the same geometry, so it matches too.
    expect({ ...partial, partialRegeneration: undefined }).toEqual({
      ...full,
      partialRegeneration: undefined,
    });
  });
});

/* ================================================================== */
/* 5. Locks and human edits still outrank everything                   */
/* ================================================================== */

describe("partial regeneration: locked and human-edited elements", () => {
  it("preserves them on the declared floor and on the carried ones alike", async () => {
    const spec = await officeSpec();
    const first = build(spec);

    // The session's element list after the user locked the core and left a
    // fingerprint no generator would ever produce.
    const locks = [systemLock("core")];
    const stamped = applyLocksToElements(first.snapshot.elements, locks).map((element) => ({
      ...element,
      instanceParameters: { ...element.instanceParameters, humanNote: "keep" },
    }));
    const current: BuiltDesign = {
      ...first,
      snapshot: { ...first.snapshot, elements: stamped },
    };

    const lockedOnRebuiltFloor = stamped.filter(
      (e) => e.locked === true && e.levelId === levelIdForFloor(3),
    );
    const lockedOnCarriedFloor = stamped.filter(
      (e) => e.locked === true && e.levelId === levelIdForFloor(4),
    );
    expect(lockedOnRebuiltFloor.length).toBeGreaterThan(0);
    expect(lockedOnCarriedFloor.length).toBeGreaterThan(0);

    const patch = rebalancePatch(spec);
    const nextSpec = patched(spec, patch);
    const partial = buildDesignPartial({
      previous: current,
      patch,
      spec: nextSpec,
      buildingPk: BUILDING_PK,
      generationId: generationIdFor(nextSpec.generationSeed, 1),
      locks,
      // Exactly what server/edit.ts hands the builder (§42).
      authoredElements: stamped.filter(
        (element) =>
          element.locked === true ||
          element.origin === "authored" ||
          element.generationSource?.type === "MODIFIED" ||
          element.generationSource?.type === "AUTHORED",
      ),
    });

    expect(partial.partialRegeneration!.fallbackReason).toBeNull();
    const merged = byId(partial.snapshot.elements);

    // On the REBUILT floor the lock is what saved them — the surrounding rooms
    // were re-solved around them.
    for (const element of lockedOnRebuiltFloor) {
      const kept = merged.get(element.id);
      expect(kept, `${element.id} vanished from the rebuilt floor`).toBeDefined();
      expect(kept!.locked).toBe(true);
      expect(kept!.instanceParameters.humanNote).toBe("keep");
      expect(kept!.generationSource?.generationId).toBe(first.generationId);
    }

    // On a CARRIED floor everything survives, locked or not, because that floor
    // was never regenerated. That is the difference between the two paths, and
    // it must not quietly become "only locked things survive".
    for (const element of lockedOnCarriedFloor) {
      expect(merged.get(element.id)).toEqual(element);
    }
    const unlockedOnCarriedFloor = stamped.find(
      (e) => e.locked !== true && e.levelId === levelIdForFloor(4),
    )!;
    expect(merged.get(unlockedOnCarriedFloor.id)).toEqual(unlockedOnCarriedFloor);

    // …while an unlocked element on the REBUILT floor really was replaced, so
    // the carry-over is scoped and not a blanket "keep everything". The slab is
    // the honest probe: its id is stable across a re-solve, so a missing entry
    // would mean the element was lost rather than merely renamed.
    const unlockedOnRebuiltFloor = stamped.find(
      (e) => e.locked !== true && e.levelId === levelIdForFloor(3) && e.kind === "slab",
    )!;
    expect(unlockedOnRebuiltFloor).toBeDefined();
    const replaced = merged.get(unlockedOnRebuiltFloor.id);
    expect(replaced, "an unlocked element disappeared instead of being replaced").toBeDefined();
    expect(replaced!.instanceParameters.humanNote).toBeUndefined();
    expect(replaced!.generationSource?.generationId).toBe(partial.generationId);

    const ids = partial.snapshot.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("un-stamps a carried element when its lock is released", async () => {
    const spec = await officeSpec();
    const first = build(spec);

    const stamped = applyLocksToElements(first.snapshot.elements, [systemLock("core")]);
    const current: BuiltDesign = {
      ...first,
      snapshot: { ...first.snapshot, elements: stamped },
    };
    const lockedOnCarriedFloor = stamped
      .filter((e) => e.locked === true && e.levelId === levelIdForFloor(4))
      .map((e) => e.id);
    expect(lockedOnCarriedFloor.length).toBeGreaterThan(0);

    const patch = rebalancePatch(spec);
    const nextSpec = patched(spec, patch);
    // Rebuilt with the core lock RELEASED. The token set is the source of truth,
    // so a carried element must stop advertising a protection nobody holds.
    const partial = buildDesignPartial({
      previous: current,
      patch,
      spec: nextSpec,
      buildingPk: BUILDING_PK,
      generationId: generationIdFor(nextSpec.generationSeed, 1),
      locks: [],
    });

    const merged = byId(partial.snapshot.elements);
    for (const id of lockedOnCarriedFloor) {
      expect(merged.get(id)!.locked).toBe(false);
      // Still the carried instance, not a regenerated one.
      expect(merged.get(id)!.generationSource?.generationId).toBe(first.generationId);
    }
  });
});

/* ================================================================== */
/* 6. The server edit loop actually uses it                            */
/* ================================================================== */

describe("partial regeneration: wired into the edit loop", () => {
  const send = () => {};

  it("honours the patch's floor scope through completeEdit and reports it", async () => {
    const spec = await officeSpec();
    const current = build(spec);
    const patch = rebalancePatch(spec);

    const outcome = completeEdit({
      current,
      spec,
      patch,
      buildingPk: BUILDING_PK,
      revision: 0,
      locks: [],
      send,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;

    expect(outcome.partialRegeneration).toEqual({
      affectedFloorNos: [3],
      carriedFloorNos: [1, 2, 4, 5],
      carriedElementCount: expect.any(Number),
      fallbackReason: null,
    });

    const candidate: BuiltDesign = { ...current, snapshot: outcome.snapshot };
    for (const floorNo of [1, 2, 4, 5]) {
      expect(JSON.stringify(elementsOnFloor(candidate, floorNo))).toEqual(
        JSON.stringify(elementsOnFloor(current, floorNo)),
      );
    }
    // The edit itself still landed, and the review is measured off it.
    expect(outcome.applied).toHaveLength(1);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.validation.counts.critical).toBe(0);
  });

  it("reports the fallback through completeEdit when the patch under-declared", async () => {
    const spec = await officeSpec();
    const current = build(spec);

    const outcome = completeEdit({
      current,
      spec,
      patch: {
        summary: "Add a sixth storey",
        rationale: "One more floor of offices.",
        scope: "levels",
        affectedFloorNos: [2],
        operations: [
          {
            op: "insert",
            path: "/levels/-",
            value: { floorNo: 6, name: "L06", floorToFloorMm: 3_900, usage: "occupied" },
          },
        ],
      },
      buildingPk: BUILDING_PK,
      revision: 0,
      locks: [],
      send,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.partialRegeneration!.fallbackReason).toMatch(/storey set/);
    expect(outcome.metrics.floorCount).toBe(current.metrics.floorCount + 1);
  });

  it("leaves the note off entirely for a patch that claimed no floors", async () => {
    const spec = await officeSpec();
    const current = build(spec);

    const outcome = completeEdit({
      current,
      spec,
      patch: {
        summary: "Move core east",
        rationale: "Clear the lobby.",
        scope: "core",
        affectedFloorNos: [],
        operations: [
          { op: "set", path: "/core/offsetXMm", value: spec.core.offsetXMm + 2_000 },
        ],
      },
      buildingPk: BUILDING_PK,
      revision: 0,
      locks: [],
      send,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.partialRegeneration).toBeUndefined();
    expect("partialRegeneration" in outcome).toBe(false);
  });
});
