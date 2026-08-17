// End-to-end proof of the EDIT loop, offline.
//
// pipeline-e2e.test.ts proves a prompt becomes a building. This file proves the
// second half: that an existing building can be CHANGED and the change reviewed
// before it is accepted — patch → apply (locks + schema) → rebuild → diff.
//
// Everything here runs on the heuristic provider, so there is no network call
// and no randomness. That is not a convenience: the review UI shows the user two
// deterministic builds side by side, and if a rebuild of the same spec could
// drift, every delta the user reads would be partly noise.

import { describe, expect, it } from "vitest";

import { buildDesign, generationIdFor, type BuiltDesign } from "../build";
import { applySpecPatch } from "../patch/apply";
import { diffMetrics, diffSpecs } from "../patch/diff";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import { applyLocksToElements, levelLock, systemLock } from "../session/locks";
import { statusRank } from "../spec/status";
import type { BuildingPatch, BuildingSpec } from "../spec/building-spec";
import type { BimElement } from "@/lib/bim/model/types";

const provider = new HeuristicReasoningProvider();

// Shared with pipeline-e2e: a plain office block that validates cleanly, so any
// critical violation seen here was caused by the edit under test.
const PROMPT = "Create a five-story office building.";

async function specFor(prompt = PROMPT): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

function build(
  spec: BuildingSpec,
  options: {
    revision?: number;
    locks?: string[];
    authoredElements?: BimElement[];
  } = {},
): BuiltDesign {
  return buildDesign({
    spec,
    buildingPk: "edit-loop",
    generationId: generationIdFor(spec.generationSeed, options.revision ?? 0),
    locks: options.locks,
    authoredElements: options.authoredElements,
  });
}

/** How a route asks for a patch: grounded in the digest of what was built. */
async function propose(
  design: BuiltDesign,
  spec: BuildingSpec,
  instruction: string,
  locked: string[] = [],
): Promise<BuildingPatch> {
  const { data } = await provider.modifyBuilding({
    spec,
    summary: design.summary,
    instruction,
    scope: { kind: "building", label: "Whole building" },
    locked,
  });
  return data;
}

describe("edit loop — generate, modify, rebuild", () => {
  it("builds a spec into a design that is labelled with what it has actually earned", async () => {
    const spec = await specFor();
    const design = build(spec);

    expect(design.snapshot.elements.length).toBeGreaterThan(20);
    expect(design.metrics.floorCount).toBe(5);
    expect(design.recipe.floors).toHaveLength(spec.levels.length);
    // The digest handed back to the reasoning layer must describe the same
    // building the geometry does, or the next instruction is advice about a
    // model that does not exist.
    expect(design.summary.floors).toBe(design.metrics.floorCount);
    expect(design.validation.counts.critical).toBe(0);

    // Every element names the build that produced it, which is what makes the
    // lineage in `generationIdFor` mean anything once revisions accumulate.
    expect(design.generationId).toBe(generationIdFor(spec.generationSeed, 0));
    for (const element of design.snapshot.elements) {
      expect(element.generationSource?.generationId).toBe(design.generationId);
    }

    // buildDesign hard-codes `jurisdictionRulesetId: null`, so no build coming
    // out of it can ever be promoted past our own geometry checks (§10). This
    // is the assertion that stops the badge from ever implying approval.
    expect(statusRank(design.status.level)).toBeLessThanOrEqual(
      statusRank("GEOMETRICALLY_VALIDATED"),
    );
    expect(design.status.level).toBe("GEOMETRICALLY_VALIDATED");
    expect(design.status.blockers.join(" ")).toMatch(/jurisdictional ruleset/i);
  });

  it('applies "add a floor" and measures the delta off the rebuilt geometry', async () => {
    const spec = await specFor();
    const before = build(spec);

    const patch = await propose(before, spec, "add a floor");
    expect(patch.scope).toBe("levels");
    expect(patch.operations[0]).toMatchObject({ op: "insert", path: "/levels/-" });
    // The level is appended AND the program of the storey below is extended onto
    // it. Without that, the rebuild gains area, windows and columns while net
    // area, room count and door count stay put — an empty glazed shell.
    expect(patch.operations.length).toBeGreaterThan(1);
    expect(
      patch.operations.slice(1).every((op) => /^\/program\/\d+\/levels\/-$/.test(op.path)),
    ).toBe(true);

    const application = applySpecPatch({ spec, patch });
    expect(application.ok).toBe(true);
    expect(application.rejected).toEqual([]);
    expect(application.spec.levels).toHaveLength(spec.levels.length + 1);
    // The caller's spec is cloned, never mutated — the "before" half of the
    // review has to survive the patch that produced the "after" half.
    expect(spec.levels).toHaveLength(5);

    const after = build(application.spec, { revision: 1 });

    expect(after.metrics.floorCount).toBe(before.metrics.floorCount + 1);
    expect(after.metrics.grossAreaSqm).toBeGreaterThan(before.metrics.grossAreaSqm);
    expect(after.metrics.buildingHeightM).toBeGreaterThan(before.metrics.buildingHeightM);
    // The new storey is really occupied, not a shell.
    expect(after.metrics.roomCount).toBeGreaterThan(before.metrics.roomCount);
    expect(after.metrics.netAreaSqm).toBeGreaterThan(before.metrics.netAreaSqm);
    expect(
      after.validation.violations.some((v) => v.code === "UNPROGRAMMED_LEVEL"),
    ).toBe(false);

    const floors = diffMetrics(before.metrics, after.metrics).find(
      (delta) => delta.key === "floorCount",
    );
    expect(floors).toBeDefined();
    expect(floors!.delta).toBe(1);
    expect(floors!.unit).toBe("count");
    // A whole extra storey is never noise, whatever the building's size.
    expect(floors!.significant).toBe(true);

    // The spec diff addresses the appended level by its real index, which is
    // what lets the review panel point at the row that appeared.
    const added = diffSpecs(spec, application.spec).filter((e) => e.kind === "added");
    expect(added.map((e) => e.path)).toContain(`/levels/${spec.levels.length}`);
  });

  it("rebuilds the same spec into an identical model twice", async () => {
    const spec = await specFor();
    const a = build(spec);
    const b = build(spec);

    // diffMetrics returning nothing is the property the review rests on: two
    // builds of one spec must produce zero deltas to report.
    expect(diffMetrics(a.metrics, b.metrics)).toEqual([]);
    expect(JSON.stringify(b.metrics)).toBe(JSON.stringify(a.metrics));
    expect(JSON.stringify(b.snapshot.elements)).toBe(JSON.stringify(a.snapshot.elements));
    expect(b.status).toEqual(a.status);
  });
});

describe("edit loop — locks", () => {
  it("blocks every operation against a locked system and returns the spec untouched", async () => {
    const spec = await specFor();
    const before = build(spec);
    const locks = [systemLock("structure")];

    // The offline provider has no rule for this instruction and says so rather
    // than inventing a change — which is exactly why the patch below is written
    // by hand. What is under test is the lock, not the provider's vocabulary.
    const noop = await propose(before, spec, "widen the structural grid", locks);
    expect(noop.operations).toEqual([
      { op: "set", path: "/generationSeed", value: spec.generationSeed },
    ]);

    const patch: BuildingPatch = {
      summary: "Widen the structural grid",
      rationale: "A larger bay for column-free space.",
      scope: "structure",
      affectedFloorNos: [],
      operations: [
        {
          op: "set",
          path: "/structure/gridXMm/value",
          value: spec.structure.gridXMm.value + 1_200,
        },
        {
          op: "set",
          path: "/structure/columnMm/value",
          value: spec.structure.columnMm.value + 100,
        },
      ],
    };

    const application = applySpecPatch({ spec, patch, locks });

    expect(application.ok).toBe(false);
    expect(application.applied).toEqual([]);
    expect(application.rejected).toHaveLength(patch.operations.length);
    // "locked" is a user decision, "path" is a bad proposal. Conflating them
    // would tell the user their instruction was malformed when in fact they
    // themselves forbade it.
    expect(application.rejected.every((r) => r.kind === "locked")).toBe(true);
    expect(application.rejected.every((r) => /Structure is locked/.test(r.reason))).toBe(true);
    expect(application.error?.code).toBe("ALL_REJECTED");
    expect(application.error?.message).toMatch(/blocked by a lock/i);

    // Identity, not equality: a rejected patch must leave the caller holding
    // the very object it passed in, with no half-applied first operation.
    expect(application.spec).toBe(spec);
    expect(diffSpecs(spec, application.spec)).toEqual([]);
    expect(spec.structure.gridXMm.value).toBe(before.summary.gridXMm);
  });

  it("lets the unlocked half of a patch land and shows the hole in the rebuild", async () => {
    const spec = await specFor();
    const before = build(spec);
    const locks = [levelLock(3)];

    // "Raise every storey" against a locked level 3: the interesting case is
    // not all-or-nothing. A partial application has to leave a spec that is
    // still coherent, and the rebuild has to show the storey that did not move.
    const patch = await propose(before, spec, "taller floors", locks);
    expect(patch.operations).toHaveLength(spec.levels.length);

    const application = applySpecPatch({ spec, patch, locks });

    expect(application.ok).toBe(true);
    expect(application.applied).toHaveLength(spec.levels.length - 1);
    expect(application.rejected).toHaveLength(1);
    expect(application.rejected[0].kind).toBe("locked");
    expect(application.rejected[0].reason).toMatch(/Level 3 \(.+\) is locked/);

    const lockedIndex = spec.levels.findIndex((l) => l.floorNo === 3);
    for (const [index, level] of application.spec.levels.entries()) {
      expect(level.floorToFloorMm).toBe(
        spec.levels[index].floorToFloorMm + (index === lockedIndex ? 0 : 300),
      );
    }

    const after = build(application.spec, { revision: 1, locks });
    expect(after.metrics.floorCount).toBe(before.metrics.floorCount);
    expect(after.metrics.buildingHeightM).toBeCloseTo(
      before.metrics.buildingHeightM + 0.3 * (spec.levels.length - 1),
      3,
    );
  });

  it("carries locked elements through a rebuild instead of regenerating them", async () => {
    const spec = await specFor();
    const first = build(spec);

    const stamped = applyLocksToElements(first.snapshot.elements, [
      systemLock("core"),
    ]).map((element) => ({
      ...element,
      instanceParameters: {
        ...element.instanceParameters,
        // A fingerprint the generator would never produce. If it comes back,
        // this is the same instance surviving — not a lookalike regenerated
        // under the same deterministic id.
        humanNote: "keep",
      },
    }));

    const lockedIds = stamped.filter((e) => e.locked === true).map((e) => e.id);
    expect(lockedIds.length).toBeGreaterThan(0);

    // The lock rides on the element — that is what mergeGenerated reads when the
    // next generation lands — and the session's token set is passed through, as
    // the real edit path does, so the stamp is renewed rather than cleared.
    const rebuilt = build(spec, {
      revision: 1,
      authoredElements: stamped,
      locks: [systemLock("core")],
    });
    const byId = new Map(rebuilt.snapshot.elements.map((e) => [e.id, e]));

    for (const id of lockedIds) {
      const kept = byId.get(id);
      expect(kept, `${id} vanished on rebuild`).toBeDefined();
      expect(kept!.locked).toBe(true);
      expect(kept!.instanceParameters.humanNote).toBe("keep");
      // A preserved element was NOT produced by this generation, and its
      // provenance still says so — the revision suffix is the tell.
      expect(kept!.generationSource?.generationId).toBe(first.generationId);
    }

    // The unlocked elements were handed over carrying the same fingerprint and
    // were still replaced: the merge preserves locks, not its whole input.
    const unlocked = stamped.find((e) => e.locked !== true)!;
    const replaced = byId.get(unlocked.id);
    expect(replaced, "an unlocked element disappeared instead of being replaced").toBeDefined();
    expect(replaced!.instanceParameters.humanNote).toBeUndefined();
    expect(replaced!.generationSource?.generationId).toBe(rebuilt.generationId);
    expect(rebuilt.generationId).not.toBe(first.generationId);

    // Preserved elements replace their regenerated twins rather than joining
    // them — a duplicated id would double-count in every metric downstream.
    expect(rebuilt.snapshot.elements).toHaveLength(first.snapshot.elements.length);
    expect(new Set(rebuilt.snapshot.elements.map((e) => e.id)).size).toBe(
      rebuilt.snapshot.elements.length,
    );
  });

  it("releases the stamp when the lock is dropped, while still preserving the instance", async () => {
    const spec = await specFor();
    const first = build(spec);

    const stamped = applyLocksToElements(first.snapshot.elements, [
      systemLock("core"),
    ]).map((element) => ({
      ...element,
      instanceParameters: { ...element.instanceParameters, humanNote: "keep" },
    }));
    const lockedIds = stamped.filter((e) => e.locked === true).map((e) => e.id);
    expect(lockedIds.length).toBeGreaterThan(0);

    // Rebuild with the core lock RELEASED. The token set is the source of truth,
    // so `locked` must come back false — the bug this guards is an element that
    // stays frozen forever because releasing the last lock never un-stamped it.
    const rebuilt = build(spec, {
      revision: 1,
      authoredElements: stamped,
      locks: [],
    });
    const byId = new Map(rebuilt.snapshot.elements.map((e) => [e.id, e]));

    for (const id of lockedIds) {
      const kept = byId.get(id);
      expect(kept, `${id} vanished on rebuild`).toBeDefined();
      expect(kept!.locked).toBe(false);
      // Preservation is decided by mergeGenerated BEFORE the stamp is refreshed,
      // so this pass still keeps the human's instance — it simply stops
      // advertising a protection the session no longer holds.
      expect(kept!.instanceParameters.humanNote).toBe("keep");
    }
  });
});

describe("generationIdFor", () => {
  it("suffixes revisions so an element's provenance names the edit that made it", () => {
    expect(generationIdFor(42, 0)).toBe("GEN-0042");
    expect(generationIdFor(42, 1)).toBe("GEN-0042.1");
    expect(generationIdFor(42, 3)).toBe("GEN-0042.3");
  });

  it("keeps the label four digits wide by wrapping large seeds", async () => {
    // Real seeds come from seedFromPrompt and run to ten digits. The id is a
    // readable lineage label, not a key, so it wraps rather than growing —
    // worth pinning, because it means ids are stable but not globally unique.
    expect(generationIdFor(1_234_567, 0)).toBe("GEN-4567");

    const spec = await specFor();
    expect(spec.generationSeed).toBeGreaterThan(9_999);
    expect(generationIdFor(spec.generationSeed, 2)).toMatch(/^GEN-\d{4}\.2$/);
  });
});
