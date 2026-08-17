// Durable storage for generated designs.
//
// The promise this module makes is narrow and load-bearing: a design that was
// saved and reopened is the SAME building, not a copy of it. That holds only
// because the record stores the spec and nothing derived, and because
// `buildDesign` is pure — so these tests pin the round trip, the rebuild's
// determinism, and the failure modes that must never be silent.
//
// IndexedDB is replaced by an in-memory map. What is being tested is this
// module's contract with the store, not the browser's implementation of it.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const db = new Map<string, unknown>();
/** Set to make the next store operation fail, the way a blocked origin does. */
let storageFailure: Error | null = null;

vi.mock("idb-keyval", () => ({
  get: async (key: string) => {
    if (storageFailure) throw storageFailure;
    return db.get(key);
  },
  set: async (key: string, value: unknown) => {
    if (storageFailure) throw storageFailure;
    db.set(key, value);
  },
  keys: async () => {
    if (storageFailure) throw storageFailure;
    return [...db.keys()];
  },
}));

import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { buildDesign } from "@/lib/generative/build";
import {
  DesignStorageError,
  __clearDesignMemo,
  getOrBuildDesign,
  isGeneratedPk,
  listDesigns,
  loadDesignRecord,
  saveDesign,
  workspaceBuildingPk,
  type StoredDesignRecord,
} from "@/lib/generative/design-storage";
import type { BuildingSpec } from "@/lib/generative/spec/building-spec";

const PROMPT = "Create a five-story office building, approximately 6,000 m2, with a central core.";

let spec: BuildingSpec;
let otherSpec: BuildingSpec;

beforeAll(async () => {
  const provider = new HeuristicReasoningProvider();
  spec = (await provider.generateBuilding({ prompt: PROMPT, seed: 4242 })).data;
  otherSpec = (
    await provider.generateBuilding({
      prompt: "Create a two-story warehouse, approximately 1,200 m2.",
      seed: 77,
    })
  ).data;
}, 120_000);

beforeEach(() => {
  db.clear();
  storageFailure = null;
  __clearDesignMemo();
});

function record(overrides: Partial<StoredDesignRecord> = {}): StoredDesignRecord {
  return {
    generationId: "GEN-4242",
    spec,
    seed: 4242,
    revision: 0,
    savedAtIso: "2026-08-17T09:00:00.000Z",
    name: "Test tower",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */

describe("isGeneratedPk", () => {
  it("accepts the ids generationIdFor mints", () => {
    expect(isGeneratedPk("GEN-0042")).toBe(true);
    expect(isGeneratedPk("GEN-0042.3")).toBe(true);
    expect(isGeneratedPk("GEN-0000")).toBe(true);
  });

  it("rejects every other kind of building id", () => {
    // A 건축물대장 관리번호 is numeric — it can never take the GEN- shape, which
    // is what makes this predicate safe to sweep persisted stores with.
    expect(isGeneratedPk("11110-10100-0-0001-0000")).toBe(false);
    expect(isGeneratedPk("41135-3-0000000000-1-0000000")).toBe(false);
    expect(isGeneratedPk("cad-c8a95604-8b0d-4cbc-8044-d6683475a1d4")).toBe(false);
    expect(isGeneratedPk("demo")).toBe(false);
    expect(isGeneratedPk("GEN-42")).toBe(false);
    expect(isGeneratedPk("GEN-00420")).toBe(false);
    expect(isGeneratedPk("gen-0042")).toBe(false);
    expect(isGeneratedPk("")).toBe(false);
  });
});

describe("workspaceBuildingPk", () => {
  it("prefers the generation id over an empty synthetic title pk", () => {
    expect(
      workspaceBuildingPk({
        generationId: "GEN-0042",
        titlePk: "",
        activePk: "GEN-0042",
      }),
    ).toBe("GEN-0042");
  });

  it("falls back to the published active pk when the scene forgot to pass the id", () => {
    expect(
      workspaceBuildingPk({
        generationId: null,
        titlePk: "",
        activePk: "GEN-0007.2",
      }),
    ).toBe("GEN-0007.2");
  });

  it("keeps a ledger title pk for a 건축물대장 building", () => {
    expect(
      workspaceBuildingPk({
        titlePk: "11680-12345678",
        activePk: "11680-12345678",
      }),
    ).toBe("11680-12345678");
  });
});

describe("saveDesign / loadDesignRecord", () => {
  it("round-trips a record under the contracted key", async () => {
    await saveDesign(record());

    expect([...db.keys()]).toEqual(["gen-design:GEN-4242"]);

    const loaded = await loadDesignRecord("GEN-4242");
    expect(loaded).not.toBeNull();
    expect(loaded!.generationId).toBe("GEN-4242");
    expect(loaded!.seed).toBe(4242);
    expect(loaded!.revision).toBe(0);
    expect(loaded!.name).toBe("Test tower");
    expect(loaded!.spec).toEqual(spec);
  });

  it("returns null for an id nobody saved", async () => {
    expect(await loadDesignRecord("GEN-9999")).toBeNull();
  });

  it("refuses an id the building route could never reach", async () => {
    // Saving under a non-GEN id would file the design where nothing looks for
    // it — a silent loss dressed up as a successful save.
    await expect(saveDesign(record({ generationId: "11110-10100-0-0001-0000" })))
      .rejects.toMatchObject({ name: "DesignStorageError", code: "INVALID_ID" });
    expect(db.size).toBe(0);
  });

  it("surfaces a storage failure as a typed error rather than a no-op", async () => {
    storageFailure = new Error("QuotaExceededError");

    const caught = await saveDesign(record()).catch((error) => error);
    expect(caught).toBeInstanceOf(DesignStorageError);
    expect((caught as DesignStorageError).code).toBe("SAVE_FAILED");
    expect((caught as DesignStorageError).cause).toBe(storageFailure);
  });

  it("surfaces an unreadable store as a typed error rather than a missing design", async () => {
    // "Cannot read storage" and "no such design" call for different responses;
    // collapsing the first into a null would send the user hunting for a design
    // that is sitting right there.
    storageFailure = new Error("InvalidStateError");
    await expect(loadDesignRecord("GEN-4242")).rejects.toMatchObject({
      code: "LOAD_FAILED",
    });
  });

  it("refuses to guess at a record this version cannot rebuild", async () => {
    db.set("gen-design:GEN-4242", { generationId: "GEN-4242", savedAtIso: "x" });
    await expect(loadDesignRecord("GEN-4242")).rejects.toMatchObject({
      code: "CORRUPT_RECORD",
    });
  });
});

describe("getOrBuildDesign", () => {
  it("returns null when the design was never saved in this browser", async () => {
    expect(await getOrBuildDesign("GEN-9999")).toBeNull();
  });

  it("rebuilds the exact design the spec describes", async () => {
    await saveDesign(record());
    const design = await getOrBuildDesign("GEN-4242");
    expect(design).not.toBeNull();

    // The reference build: same spec, same buildingPk, same generationId.
    const reference = buildDesign({
      spec,
      buildingPk: "generated",
      generationId: "GEN-4242",
    });

    expect(design!.snapshot).toEqual(reference.snapshot);
    expect(design!.recipe).toEqual(reference.recipe);
    expect(design!.metrics).toEqual(reference.metrics);
    expect(design!.validation).toEqual(reference.validation);
    expect(design!.status).toEqual(reference.status);
    expect(design!.approximations).toEqual(reference.approximations);
    expect(design!.spec).toEqual(spec);
    expect(design!.seed).toBe(4242);
    expect(design!.revision).toBe(0);
    expect(design!.generationId).toBe("GEN-4242");
  });

  it("produces an identical snapshot on a cold second load", async () => {
    await saveDesign(record());
    const first = await getOrBuildDesign("GEN-4242");

    // Clear the memo so the second call genuinely re-solves rather than
    // handing back the object the first call cached.
    __clearDesignMemo();
    const second = await getOrBuildDesign("GEN-4242");

    expect(second).not.toBe(first);
    expect(second!.snapshot).toEqual(first!.snapshot);
    expect(second!.metrics).toEqual(first!.metrics);
    expect(second!.recipe).toEqual(first!.recipe);
  });

  it("memoises the rebuild so two panels do not solve the same design twice", async () => {
    await saveDesign(record());
    const first = await getOrBuildDesign("GEN-4242");
    const second = await getOrBuildDesign("GEN-4242");
    expect(second).toBe(first);
  });

  it("re-solves when the id is saved again with a different design", async () => {
    // Two sessions whose seeds land on the same four digits share an id. The
    // memo must follow the record, not the id, or the second design would show
    // the first one's geometry.
    await saveDesign(record());
    const before = await getOrBuildDesign("GEN-4242");

    await saveDesign(
      record({ spec: otherSpec, savedAtIso: "2026-08-17T10:00:00.000Z" }),
    );
    const after = await getOrBuildDesign("GEN-4242");

    expect(after).not.toBe(before);
    expect(after!.spec).toEqual(otherSpec);
    expect(after!.metrics).not.toEqual(before!.metrics);
  });
});

describe("listDesigns", () => {
  it("lists saved designs newest first, and nothing else in the store", async () => {
    db.set("bim-model-11110-10100-0-0001-0000", { fileName: "not a design" });
    await saveDesign(record({ generationId: "GEN-0001", savedAtIso: "2026-08-01T00:00:00.000Z", name: "First" }));
    await saveDesign(record({ generationId: "GEN-0002", savedAtIso: "2026-08-09T00:00:00.000Z", name: "Second" }));

    expect(await listDesigns()).toEqual([
      { generationId: "GEN-0002", name: "Second", savedAtIso: "2026-08-09T00:00:00.000Z" },
      { generationId: "GEN-0001", name: "First", savedAtIso: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("omits a record it cannot rebuild rather than offering a link that fails", async () => {
    await saveDesign(record({ generationId: "GEN-0001" }));
    db.set("gen-design:GEN-0002", { generationId: "GEN-0002" });

    const listed = await listDesigns();
    expect(listed.map((entry) => entry.generationId)).toEqual(["GEN-0001"]);
  });

  it("surfaces an unreadable store instead of reporting an empty shelf", async () => {
    storageFailure = new Error("InvalidStateError");
    await expect(listDesigns()).rejects.toMatchObject({ code: "LIST_FAILED" });
  });
});
