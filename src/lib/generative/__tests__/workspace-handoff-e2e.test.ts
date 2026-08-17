// src/lib/generative/__tests__/workspace-handoff-e2e.test.ts
//
// The whole road from the studio to the twin workspace, walked once at
// node level.
//
// Each lane in this wave has its own unit tests, and each of them passes while
// mocking the lane on the other side of the seam. That is exactly the shape of
// a break that ships: storage round-trips a spec, the store ingests a snapshot,
// the blueprint seeder converts a footprint — and nothing proves the snapshot
// storage rebuilds is the snapshot the store is handed, under the pk the route
// actually mints. So this file mocks NOTHING except IndexedDB itself, and
// carries one heuristic design through:
//
//   generate → saveDesign → getOrBuildDesign → hydrateFromSnapshot
//                                            → footprintToBlueprint
//
// The claims are the three the wave rests on:
//   1. Reopening is byte-identical, not merely similar (§ determinism).
//   2. The model the workspace shows is the design's own elements — the
//      engine's columns/cores/provenance — not a recipe-derived stand-in.
//   3. The design's plate can seed a new schematic, and that seed validates.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const db = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: async (key: string) => db.get(key),
  set: async (key: string, value: unknown) => {
    db.set(key, value);
  },
  keys: async () => [...db.keys()],
}));

import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import {
  __clearDesignMemo,
  getOrBuildDesign,
  isGeneratedPk,
  saveDesign,
  type LoadedDesign,
} from "@/lib/generative/design-storage";
import {
  footprintRingsOfRecipe,
  footprintToBlueprint,
} from "@/lib/generative/blueprint/from-footprint";
import { validateBlueprint } from "@/lib/generative/blueprint/validate-blueprint";
import { useBimModelStore } from "@/store/bim-model-store";
import type { BuildingSpec } from "@/lib/generative/spec/building-spec";

/** The id shape `generationIdFor` mints and the building route accepts. */
const GENERATION_ID = "GEN-0042";
const PROMPT =
  "Create a five-story office building, approximately 6,000 m2, with a central core.";
const SEED = 4242;

let spec: BuildingSpec;

beforeAll(async () => {
  const provider = new HeuristicReasoningProvider();
  spec = (await provider.generateBuilding({ prompt: PROMPT, seed: SEED })).data;
}, 120_000);

beforeEach(() => {
  db.clear();
  __clearDesignMemo();
  useBimModelStore.setState({ snapshot: null, byBuilding: {}, activeLevelId: null });
});

/** The studio's half of "Open in workspace", minus the router push. */
async function openInWorkspace(): Promise<LoadedDesign> {
  await saveDesign({
    generationId: GENERATION_ID,
    spec,
    seed: SEED,
    revision: 0,
    savedAtIso: "2026-08-17T09:00:00.000Z",
    name: spec.project.name,
  });
  const reopened = await getOrBuildDesign(GENERATION_ID);
  if (!reopened) throw new Error("the design just saved did not reopen");
  return reopened;
}

describe("studio → /building/GEN-… handoff", () => {
  it("routes the id the studio mints", () => {
    // The seam that would silently 404 the whole feature.
    expect(isGeneratedPk(GENERATION_ID)).toBe(true);
  });

  it("reopens a saved design byte-identically", async () => {
    const reopened = await openInWorkspace();

    // What the studio had on screen, built the same way the workspace does.
    // Equality of the SNAPSHOT is the strong claim: element ids, provenance
    // stamps and placements all have to land in the same places, which only
    // holds if the rebuild consumed the same seed and the same pk.
    const { buildDesign } = await import("@/lib/generative/build");
    const inStudio = buildDesign({
      spec,
      buildingPk: "generated",
      generationId: GENERATION_ID,
    });

    expect(JSON.stringify(reopened.snapshot)).toBe(JSON.stringify(inStudio.snapshot));
    expect(reopened.spec).toEqual(spec);
    expect(reopened.seed).toBe(SEED);
    expect(reopened.revision).toBe(0);
    expect(reopened.snapshot.elements.length).toBeGreaterThan(0);
  });

  it("rebuilds identically twice, from a cold memo", async () => {
    const first = await openInWorkspace();
    __clearDesignMemo();
    const second = await getOrBuildDesign(GENERATION_ID);
    expect(JSON.stringify(second?.snapshot)).toBe(JSON.stringify(first.snapshot));
  });
});

describe("the workspace's model is the design's own", () => {
  it("hydrates every generated element under the route's pk", async () => {
    const design = await openInWorkspace();

    // What `useBimModel` does on the generated branch.
    useBimModelStore
      .getState()
      .hydrateFromSnapshot({ buildingPk: GENERATION_ID, snapshot: design.snapshot });

    const model = useBimModelStore.getState().snapshot;
    expect(model).not.toBeNull();
    expect(model!.buildingPk).toBe(GENERATION_ID);

    const fromDesign = design.snapshot.elements.filter((el) => el.origin !== "authored");
    const hydrated = model!.elements.filter((el) => el.origin !== "authored");
    expect(hydrated.length).toBe(fromDesign.length);

    // Ids and provenance survive verbatim — the store re-stamps the owning pk
    // and nothing else.
    expect(hydrated.map((el) => el.id).sort()).toEqual(
      fromDesign.map((el) => el.id).sort(),
    );
    expect(hydrated.every((el) => el.buildingPk === GENERATION_ID)).toBe(true);

    const byId = new Map(hydrated.map((el) => [el.id, el]));
    for (const source of fromDesign) {
      const landed = byId.get(source.id)!;
      expect(landed.generationSource).toEqual(source.generationSource);
      expect(landed.placement).toEqual(source.placement);
      expect(landed.kind).toBe(source.kind);
    }

    // Levels come across whole: a storey the design solved that the workspace
    // cannot show is a building the two halves disagree about.
    expect(model!.levels).toEqual(design.snapshot.levels);
  });

  it("carries the structural elements the recipe path cannot re-derive", async () => {
    const design = await openInWorkspace();
    useBimModelStore
      .getState()
      .hydrateFromSnapshot({ buildingPk: GENERATION_ID, snapshot: design.snapshot });

    const model = useBimModelStore.getState().snapshot!;
    const kinds = new Set(model.elements.map((el) => el.kind));
    // The engine emits structure; hydrateBimModel(recipe, derived) does not.
    // If this ever empties, the generated twin has silently become generic.
    expect(kinds.size).toBeGreaterThan(1);
    expect(model.elements.some((el) => el.generationSource != null)).toBe(true);
  });
});

describe("the design can seed a new schematic", () => {
  it("converts its footprint into a blueprint that validates", async () => {
    const design = await openInWorkspace();

    const rings = footprintRingsOfRecipe(design.recipe);
    expect(rings).not.toBeNull();

    const floors = Math.max(
      1,
      design.recipe.floors.filter((f) => f.type === "above").length,
    );
    const seedSpec = footprintToBlueprint({
      name: design.spec.project.name,
      footprintPolygonM: rings!,
      floors,
    });

    // "Generate alternative" drops the user into the schematic editor on this
    // drawing. A seed that opens with critical violations would be handing
    // them a plan the engine has already refused.
    const report = validateBlueprint(seedSpec);
    expect(report.counts.critical).toBe(0);
    expect(report.blueprintValid).toBe(true);
    expect(seedSpec.boundaries.length).toBeGreaterThan(0);
  });

  it("seeds deterministically from the same design", async () => {
    const design = await openInWorkspace();
    const rings = footprintRingsOfRecipe(design.recipe)!;
    const build = () =>
      footprintToBlueprint({
        name: design.spec.project.name,
        footprintPolygonM: rings,
        floors: 3,
      });
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});
