// src/store/__tests__/generative-session-energy.test.ts
//
// The generative session's energy publication (mission item 1 + 2).
//
// Two things are load-bearing here and both were broken before:
//   1. Every design used to be keyed "generated", so a modified design
//      overwrote its predecessor's energy record and two studio tabs would
//      fight over one entry. Designs now key on their generationId.
//   2. Exactly one generated design may hold energy records at a time. The
//      material store is PERSISTED, so a session that regenerates fifty times
//      would otherwise write fifty buildings into localStorage.
//
// Everything is built offline by the deterministic heuristic provider — no
// network, no model, and the same buildDesign the routes run.

import { describe, it, expect, beforeEach, beforeAll } from "vitest";

import { buildDesign, generationIdFor } from "@/lib/generative/build";
import { applySpecPatch } from "@/lib/generative/patch/apply";
import { diffMetrics, diffSpecs } from "@/lib/generative/patch/diff";
import { seedBuildingFromGeneratedDesign } from "@/lib/generative/energy/seed-from-design";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import type { AppliedEdit, GenerationResult } from "@/lib/generative/client";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useGenerativeSession } from "@/store/generative-session-store";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";

const PROMPT =
  "Create a five-story office building, approximately 6,000 m2, with a central core.";

const PROVIDER_SUMMARY = {
  name: "heuristic",
  model: "deterministic",
  latencyMs: 1,
  inputTokens: 0,
  outputTokens: 0,
  retries: 0,
};

const provider = new HeuristicReasoningProvider();

async function makeGeneration(seed: number, generationId: string): Promise<GenerationResult> {
  const { data: spec } = await provider.generateBuilding({ prompt: PROMPT, seed });
  const built = buildDesign({ spec, buildingPk: "generated", generationId });
  return {
    success: true,
    spec,
    recipe: built.recipe,
    snapshot: built.snapshot,
    metrics: built.metrics,
    validation: built.validation,
    status: built.status,
    approximations: built.approximations,
    generationId,
    revision: 0,
    seed,
    provider: PROVIDER_SUMMARY,
  };
}

/** The modify route's edit loop, inlined offline. */
async function makeAppliedEdit(
  base: GenerationResult,
  instruction: string,
): Promise<AppliedEdit> {
  const built = buildDesign({
    spec: base.spec,
    buildingPk: "generated",
    generationId: base.generationId,
  });
  const { data: patch } = await provider.modifyBuilding({
    spec: base.spec,
    summary: built.summary,
    instruction,
    scope: { kind: "building", label: "Whole building" },
    locked: [],
  });

  const application = applySpecPatch({ spec: base.spec, patch, locks: [] });
  if (!application.ok) throw new Error("expected the patch to apply");

  const revision = base.revision + 1;
  const generationId = generationIdFor(application.spec.generationSeed, revision);
  const next = buildDesign({
    spec: application.spec,
    buildingPk: "generated",
    generationId,
  });

  return {
    kind: "applied",
    success: true,
    generationId,
    revision,
    patch,
    applied: application.applied,
    rejected: application.rejected.map((r) => ({
      path: r.op.path,
      reason: r.reason,
      kind: r.kind,
    })),
    diff: diffSpecs(base.spec, application.spec),
    metricDeltas: diffMetrics(base.metrics, next.metrics),
    spec: application.spec,
    recipe: next.recipe,
    snapshot: next.snapshot,
    metrics: next.metrics,
    validation: next.validation,
    status: next.status,
    approximations: next.approximations,
    provider: PROVIDER_SUMMARY,
  };
}

const session = () => useGenerativeSession.getState();
const materialPks = () => Object.keys(useMaterialStore.getState().properties);
const recipePks = () => Object.keys(useRecipeStore.getState().baseRecipes);

let first: GenerationResult;
let second: GenerationResult;
let edit: AppliedEdit;

beforeAll(async () => {
  first = await makeGeneration(4242, "GEN-4242");
  second = await makeGeneration(1717, "GEN-1717");
  edit = await makeAppliedEdit(first, "Add two more floors.");
}, 120_000);

beforeEach(() => {
  session().reset();
  useMaterialStore.setState({ properties: {}, activePk: "" });
  useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  useActiveBuildingStore.getState().clearActiveBuilding();
});

describe("generative session — energy publication", () => {
  it("publishes a generated design under its own generationId, not 'generated'", () => {
    session().startFrom(first, PROMPT);

    expect(session().energyPk).toBe("GEN-4242");
    expect(materialPks()).toEqual(["GEN-4242"]);
    expect(recipePks()).toEqual(["GEN-4242"]);
    // The request-time pk the API routes expect is untouched.
    expect(session().buildingPk).toBe("generated");
    expect(useMaterialStore.getState().properties["generated"]).toBeUndefined();
  });

  it("publishes the design's own recipe and materials, and scopes the active building", () => {
    session().startFrom(first, PROMPT);

    const recipe = useRecipeStore.getState().baseRecipes["GEN-4242"];
    expect(recipe.floors).toHaveLength(first.recipe.floors.length);
    expect(recipe.totalHeight).toBeCloseTo(first.recipe.totalHeight, 6);

    const materials = useMaterialStore.getState().properties["GEN-4242"];
    expect(materials.envelope.walls.length).toBeGreaterThan(0);

    expect(useActiveBuildingStore.getState().buildingPk).toBe("GEN-4242");
    expect(useMaterialStore.getState().activePk).toBe("GEN-4242");
  });

  it("prunes the predecessor when a modification is accepted", () => {
    session().startFrom(first, PROMPT);
    session().proposeEdit(edit, "modify");
    session().acceptPending();

    expect(session().energyPk).toBe(edit.generationId);
    expect(edit.generationId).not.toBe("GEN-4242");
    expect(materialPks()).toEqual([edit.generationId]);
    expect(recipePks()).toEqual([edit.generationId]);
  });

  it("keeps exactly one design published across repeated regeneration", () => {
    session().startFrom(first, PROMPT);
    session().startFrom(second, PROMPT);
    session().startFrom(first, PROMPT);

    expect(materialPks()).toEqual(["GEN-4242"]);
    expect(recipePks()).toEqual(["GEN-4242"]);
  });

  it("republishes the design history navigation lands on", () => {
    session().startFrom(first, PROMPT);
    session().proposeEdit(edit, "modify");
    session().acceptPending();

    session().undo();
    expect(session().energyPk).toBe("GEN-4242");
    expect(materialPks()).toEqual(["GEN-4242"]);

    session().redo();
    expect(session().energyPk).toBe(edit.generationId);
    expect(materialPks()).toEqual([edit.generationId]);
  });

  it("adopts an option under the option's own generationId", () => {
    session().startFrom(first, PROMPT);
    session().beginOptions(PROMPT, [
      { id: "opt-1", label: "Option A", seed: second.seed, state: "ready", result: second },
    ]);
    session().adoptOption("opt-1");

    expect(session().energyPk).toBe("GEN-1717");
    expect(materialPks()).toEqual(["GEN-1717"]);
  });

  it("sweeps a generated design left behind by a previous session, but never a ledger one", () => {
    // The material store is persisted; the session is not. A design stranded by
    // a reload has no in-session predecessor pointer to prune it by.
    const stale = seedBuildingFromGeneratedDesign({
      spec: first.spec,
      recipe: first.recipe,
      metrics: first.metrics,
      generationId: "GEN-9999",
    });
    useMaterialStore.getState().setProperties(stale.pk, stale.materials);
    // A 건축물대장 관리번호 — must survive untouched.
    useMaterialStore.getState().setProperties("11110-100123456", stale.materials);

    session().startFrom(first, PROMPT);

    expect(materialPks().sort()).toEqual(["11110-100123456", "GEN-4242"]);
  });

  it("takes the energy records with it when the session is reset", () => {
    session().startFrom(first, PROMPT);
    session().reset();

    expect(session().energyPk).toBeNull();
    expect(materialPks()).toEqual([]);
    expect(recipePks()).toEqual([]);
    expect(useActiveBuildingStore.getState().buildingPk).toBeNull();
  });

  it("drops user recipe overrides with the design that owned them", () => {
    session().startFrom(first, PROMPT);
    useRecipeStore.getState().setOverride("GEN-4242", "facade.mullionSpacing", 2.4);
    session().startFrom(second, PROMPT);

    expect(useRecipeStore.getState().overrides["GEN-4242"]).toBeUndefined();
  });
});
