import { describe, expect, it } from "vitest";

import { applySpecPatch } from "../patch/apply";
import { levelLock, systemLock } from "../session/locks";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import type { BuildingPatch, BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

/** A realistic, schema-valid spec with a basement — so level indices ≠ floorNos. */
async function specFor(
  prompt = "A 9 storey office building of 18,000 m² with one basement.",
): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({ prompt, seed: 42 });
  return data;
}

/** Only `operations` matters here; the rest is patch envelope the UI reads. */
function patchOf(operations: BuildingPatch["operations"]): BuildingPatch {
  return {
    summary: "Test patch",
    rationale: "",
    scope: "building",
    affectedFloorNos: [],
    operations,
  };
}

const snapshot = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const levelIndex = (spec: BuildingSpec, floorNo: number) =>
  spec.levels.findIndex((level) => level.floorNo === floorNo);

/** A structurally valid level, used when the point of a case is elsewhere. */
const NEW_LEVEL = { floorNo: 10, name: "L10", floorToFloorMm: 3900, usage: "occupied" };

describe("applySpecPatch — a patch that lands", () => {
  it("applies every operation and returns the re-parsed spec", async () => {
    const spec = await specFor();
    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/core/offsetXMm", value: 2400 },
        { op: "set", path: "/structure/gridXMm/value", value: 8400 },
        { op: "insert", path: "/core/shafts/-", value: "telecom" },
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(3);
    expect(result.spec.core.offsetXMm).toBe(2400);
    expect(result.spec.structure.gridXMm.value).toBe(8400);
    expect(result.spec.core.shafts).toEqual([...spec.core.shafts, "telecom"]);
  });

  it("never mutates the caller's spec, not even nested containers", async () => {
    const spec = await specFor();
    const before = snapshot(spec);

    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/levels/0/name", value: "Basement" },
        { op: "insert", path: "/core/shafts/-", value: "refuse" },
        { op: "remove", path: "/core/shafts/0" },
      ]),
    });

    expect(result.ok).toBe(true);
    // The whole point of the deep clone: the caller's tree is byte-identical.
    expect(spec).toEqual(before);
    expect(result.spec).not.toBe(spec);
    // Nested arrays must be copies too — a shallow clone would alias these and
    // the caller would watch their spec change under them.
    expect(result.spec.core.shafts).not.toBe(spec.core.shafts);
    expect(result.spec.levels[0].name).toBe("Basement");
  });
});

describe("applySpecPatch — locks", () => {
  it("refuses a wholly locked patch and hands back the original spec object", async () => {
    const spec = await specFor();
    const before = snapshot(spec);

    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/core/offsetXMm", value: 5000 },
        { op: "set", path: "/core/strategy/value", value: "offset" },
        { op: "insert", path: "/core/shafts/-", value: "telecom" },
      ]),
      locks: [systemLock("core")],
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ALL_REJECTED");
    // The user needs to be told a LOCK stopped this, not "something went wrong".
    expect(result.error?.message).toMatch(/lock/i);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(3);
    expect(result.rejected.every((r) => r.kind === "locked")).toBe(true);
    expect(result.rejected[0].reason).toBe("Core is locked.");
    // Identity, not just equality: nothing was rebuilt, nothing was touched.
    expect(result.spec).toBe(spec);
    expect(spec).toEqual(before);
  });

  it("applies the unlocked operations and lists the blocked ones", async () => {
    const spec = await specFor();
    const glazingBefore = spec.facade.sides[0].glazingRatio;

    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/facade/sides/0/glazingRatio", value: 0.3 },
        { op: "set", path: "/core/offsetXMm", value: 1500 },
      ]),
      locks: [systemLock("envelope")],
    });

    // A partially locked patch is a success — the free half still lands.
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.applied).toEqual([{ op: "set", path: "/core/offsetXMm", value: 1500 }]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].kind).toBe("locked");
    expect(result.rejected[0].reason).toBe("Envelope is locked.");
    expect(result.spec.core.offsetXMm).toBe(1500);
    expect(result.spec.facade.sides[0].glazingRatio).toBe(glazingBefore);
  });

  it("blocks edits to a locked level and any renumbering of the level array", async () => {
    const spec = await specFor();
    const locked = levelIndex(spec, 2);
    const free = levelIndex(spec, 3);

    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: `/levels/${locked}/floorToFloorMm`, value: 4200 },
        { op: "set", path: `/levels/${free}/floorToFloorMm`, value: 4200 },
        { op: "insert", path: "/levels/-", value: NEW_LEVEL },
        { op: "remove", path: "/levels/0" },
      ]),
      locks: [levelLock(2)],
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toHaveLength(3);
    expect(result.rejected.every((r) => r.kind === "locked")).toBe(true);
    expect(result.rejected[0].reason).toBe("Level 2 (L02) is locked.");
    // Insert/remove are vetoed wholesale: either would slide the locked level to
    // a different index, renumbering it behind the user's back.
    expect(result.rejected.slice(1).every((r) => /added or removed/.test(r.reason))).toBe(true);
    expect(result.spec.levels).toHaveLength(spec.levels.length);
    expect(result.spec.levels[locked].floorToFloorMm).toBe(spec.levels[locked].floorToFloorMm);
    expect(result.spec.levels[free].floorToFloorMm).toBe(4200);
  });

  it("does not blame locks when they were not the only reason", async () => {
    const spec = await specFor();
    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/core/offsetXMm", value: 900 },
        { op: "set", path: "/massing/widthMm/valuz", value: 30_000 },
      ]),
      locks: [systemLock("core")],
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ALL_REJECTED");
    // Mixed causes: telling the user "a lock blocked this" would send them to
    // unlock something that was never the problem.
    expect(result.error?.message).toBe(
      "No proposed change could be applied to the specification.",
    );
    expect(result.rejected.map((r) => r.kind)).toEqual(["locked", "path"]);
    expect(result.error?.detail).toContain("/massing/widthMm/valuz");
    expect(result.spec).toBe(spec);
  });

  it("treats a patch with no operations as rejected rather than a no-op success", async () => {
    const spec = await specFor();
    const result = applySpecPatch({ spec, patch: patchOf([]) });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ALL_REJECTED");
    expect(result.error?.message).not.toMatch(/lock/i);
    expect(result.spec).toBe(spec);
  });
});

describe("applySpecPatch — whole-spec re-validation", () => {
  it("rolls back a path-legal operation whose value breaks the schema", async () => {
    const spec = await specFor();
    const before = snapshot(spec);

    const result = applySpecPatch({
      spec,
      patch: patchOf([{ op: "set", path: "/facade/sides/0/glazingRatio", value: 5 }]),
    });

    // The path resolves and the write succeeds; only the re-parse catches it.
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SCHEMA_INVALID");
    expect(result.error?.detail).toContain("facade/sides/0/glazingRatio");
    expect(result.spec).toBe(spec);
    expect(spec).toEqual(before);
    // A rolled-back op must not be reported as applied, or an undo entry would
    // be written for a change that never happened.
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].kind).toBe("path");
    expect(result.rejected[0].reason).toMatch(/Rolled back/);
  });

  it("rejects an inserted storey 0 and drags the otherwise-valid ops back with it", async () => {
    const spec = await specFor();
    const before = snapshot(spec);

    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/core/offsetXMm", value: 1000 },
        { op: "insert", path: "/levels/-", value: { ...NEW_LEVEL, floorNo: 0 } },
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SCHEMA_INVALID");
    expect(result.error?.detail).toMatch(/storey 0/);
    // All-or-nothing: the valid sibling op is rolled back too, so the caller is
    // never left holding a half-applied patch.
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(2);
    expect(result.spec).toBe(spec);
    expect(spec).toEqual(before);
    expect(result.spec.core.offsetXMm).toBe(before.core.offsetXMm);
  });

  it("catches the removal of a required field", async () => {
    const spec = await specFor();
    const result = applySpecPatch({
      spec,
      patch: patchOf([{ op: "remove", path: "/structure/columnMm" }]),
    });

    // `remove` happily deletes any existing key — only the re-parse knows which
    // keys the building cannot exist without.
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SCHEMA_INVALID");
    expect(result.spec).toBe(spec);
    expect(result.spec.structure.columnMm).toBeDefined();
  });
});

describe("applySpecPatch — untrusted paths", () => {
  it("applies the good operations and reports each bad path", async () => {
    const spec = await specFor();
    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/core/offsetZMm", value: -3000 },
        // A misspelt field must surface, not vanish into a stray sibling key.
        { op: "set", path: "/core/glazingRation", value: 0.4 },
        { op: "set", path: "core/offsetXMm", value: 100 },
        { op: "set", path: "/levels/99/floorToFloorMm", value: 3000 },
        { op: "remove", path: "/facade/sides/-" },
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toHaveLength(4);
    expect(result.rejected.every((r) => r.kind === "path")).toBe(true);
    expect(result.spec.core.offsetZMm).toBe(-3000);
    expect("glazingRation" in result.spec.core).toBe(false);
    expect(result.spec.facade.sides).toHaveLength(4);
  });

  it("refuses to invent a new field anywhere in the tree", async () => {
    const spec = await specFor();
    const result = applySpecPatch({
      spec,
      patch: patchOf([
        { op: "set", path: "/core/newField", value: 1 },
        { op: "insert", path: "/core/newField", value: 1 },
        { op: "set", path: "/__proto__/polluted", value: true },
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ALL_REJECTED");
    expect(result.rejected.map((r) => r.kind)).toEqual(["path", "path", "path"]);
    // The schema strips unknown keys rather than failing on them, so refusing
    // the write here is the only thing that turns a smuggled field into an error
    // the user actually sees.
    expect(result.rejected[1].reason).toMatch(/closed/);
    expect(result.spec).toBe(spec);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
