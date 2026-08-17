import { describe, expect, it } from "vitest";

import { applyOp, getAtPath, parsePath, type PathError, type PathFailure } from "../patch/paths";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import type { BuildingSpec } from "../spec/building-spec";

const PROMPT = "A 9 storey office building of 18,000 m² with one basement.";

let generated: BuildingSpec | undefined;

/**
 * A private copy of a real, schema-valid spec. `applyOp` mutates in place, so
 * no two cases may share one — every test gets its own clone.
 */
async function spec(): Promise<BuildingSpec> {
  if (!generated) {
    const { data } = await new HeuristicReasoningProvider().generateBuilding({
      prompt: PROMPT,
      seed: 42,
    });
    generated = data;
  }
  return JSON.parse(JSON.stringify(generated)) as BuildingSpec;
}

/**
 * Every rejection is RETURNED, never thrown — patch paths arrive from a language
 * model, and a throw here would take down the whole patch instead of one op.
 */
function expectFailure(result: unknown, failure: PathFailure): void {
  expect(result).not.toBe(true);
  const error = result as PathError;
  expect(error.failure).toBe(failure);
  expect(typeof error.message).toBe("string");
  expect(error.message.length).toBeGreaterThan(0);
}

describe("parsePath", () => {
  it("splits a rooted path into its tokens", () => {
    expect(parsePath("/facade/sides/1/glazingRatio")).toEqual([
      "facade",
      "sides",
      "1",
      "glazingRatio",
    ]);
    // The append token is an ordinary token here; only applyOp gives it meaning.
    expect(parsePath("/levels/-")).toEqual(["levels", "-"]);
  });

  it("decodes RFC-6901 escapes, ~1 before ~0", () => {
    expect(parsePath("/a~1b")).toEqual(["a/b"]);
    expect(parsePath("/m~0n")).toEqual(["m~n"]);
    // "~01" must decode to "~1", not to "~/". Doing ~0 first would produce the
    // latter, which is why RFC 6901 fixes the order.
    expect(parsePath("/~01")).toEqual(["~1"]);
  });

  it("rejects a path that is not rooted, or that holds an empty segment", () => {
    const malformed = [
      "",
      "core/offsetXMm",
      "levels/0",
      " /core",
      "/",
      "//",
      "//a",
      "/a//b",
      "/a/b/",
    ];
    for (const path of malformed) expectFailure(parsePath(path), "MALFORMED");
  });
});

describe("getAtPath", () => {
  it("reads through objects and array indices", async () => {
    const s = await spec();

    expect(getAtPath(s, "/core/offsetXMm")).toEqual({ value: s.core.offsetXMm });
    expect(getAtPath(s, "/facade/sides/1/glazingRatio")).toEqual({
      value: s.facade.sides[1].glazingRatio,
    });
    // Containers come back by reference — the differ walks the returned value.
    expect((getAtPath(s, "/levels") as { value: unknown }).value).toBe(s.levels);
  });

  it("says why a read failed rather than returning undefined", async () => {
    const s = await spec();

    expectFailure(getAtPath(s, "/core/glazingRation"), "MISSING_KEY");
    expectFailure(getAtPath(s, "/levels/999"), "BAD_INDEX");
    expectFailure(getAtPath(s, "/levels/last"), "BAD_INDEX");
    // "-" is a write position, so there is nothing there to read.
    expectFailure(getAtPath(s, "/levels/-"), "BAD_INDEX");
    // offsetXMm is a bare number; unlike the provenanced fields it has no /value.
    expectFailure(getAtPath(s, "/core/offsetXMm/value"), "NOT_A_CONTAINER");
    expectFailure(getAtPath(s, "/core//offsetXMm"), "MALFORMED");
  });
});

describe("escaped keys", () => {
  it("resolves the decoded token, so an escaped key is a different location", () => {
    // Hand-built: no BuildingSpec key contains "/" or "~", which is exactly why
    // the escape handling would otherwise never be exercised.
    const tree: Record<string, unknown> = { "a/b": 1, "m~n": 2, a: { b: 3 } };

    expect(applyOp(tree, { op: "set", path: "/a~1b", value: 9 })).toBe(true);
    expect(tree["a/b"]).toBe(9);
    expect(tree.a).toEqual({ b: 3 });

    expect(applyOp(tree, { op: "set", path: "/m~0n", value: 8 })).toBe(true);
    expect(tree["m~n"]).toBe(8);

    // Unescaped, the same characters address a nested key two levels down.
    expect(applyOp(tree, { op: "set", path: "/a/b", value: 7 })).toBe(true);
    expect(tree.a).toEqual({ b: 7 });
    expect(tree["a/b"]).toBe(9);
    expect(getAtPath(tree, "/a~1b")).toEqual({ value: 9 });
  });
});

describe("applyOp — set", () => {
  it("writes a nested scalar in place and reports success", async () => {
    const s = await spec();
    const untouched = s.core.offsetZMm;

    expect(applyOp(s, { op: "set", path: "/core/offsetXMm", value: 1234 })).toBe(true);

    expect(s.core.offsetXMm).toBe(1234);
    expect(s.core.offsetZMm).toBe(untouched);
    expect(getAtPath(s, "/core/offsetXMm")).toEqual({ value: 1234 });

    // Through a provenance wrapper — the shape a real modification patch uses.
    expect(applyOp(s, { op: "set", path: "/structure/gridXMm/value", value: 9000 })).toBe(true);
    expect(s.structure.gridXMm.value).toBe(9000);
    expect(s.structure.gridXMm.reason).toBeTruthy();
  });

  it("addresses one array element without disturbing its neighbours", async () => {
    const s = await spec();
    const others = [0, 2, 3].map((i) => s.facade.sides[i].glazingRatio);

    expect(applyOp(s, { op: "set", path: "/facade/sides/1/glazingRatio", value: 0.42 })).toBe(true);

    expect(s.facade.sides[1].glazingRatio).toBe(0.42);
    expect([0, 2, 3].map((i) => s.facade.sides[i].glazingRatio)).toEqual(others);
    expect(s.facade.sides).toHaveLength(4);
  });

  it("refuses to invent a key, so a misspelled field surfaces as a rejection", async () => {
    const s = await spec();
    const before = JSON.stringify(s);

    // The precise failure this guard exists for: a mistyped "glazingRatio" must
    // not land as a stray sibling field that nothing downstream ever reads.
    expectFailure(
      applyOp(s, { op: "set", path: "/facade/sides/0/glazingRation", value: 0.4 }),
      "MISSING_KEY",
    );
    expectFailure(applyOp(s, { op: "set", path: "/core/offsetYMm", value: 10 }), "MISSING_KEY");
    // A missing container mid-path is reported against the container, not the leaf.
    expectFailure(applyOp(s, { op: "set", path: "/nope/deeper", value: 1 }), "MISSING_PARENT");

    expect(JSON.stringify(s)).toBe(before);
  });

  it("rejects an out-of-range array index rather than growing the array", async () => {
    const s = await spec();
    const length = s.levels.length;

    expectFailure(applyOp(s, { op: "set", path: `/levels/${length}`, value: {} }), "BAD_INDEX");
    expectFailure(applyOp(s, { op: "set", path: "/levels/-1", value: {} }), "BAD_INDEX");
    expectFailure(applyOp(s, { op: "set", path: "/levels/first", value: {} }), "BAD_INDEX");
    // A bad index part-way along fails at the index, before the leaf is looked up.
    expectFailure(
      applyOp(s, { op: "set", path: "/levels/999/floorToFloorMm", value: 3000 }),
      "BAD_INDEX",
    );

    expect(s.levels).toHaveLength(length);
  });

  it("rejects the append token against an object, whatever the operation", async () => {
    const s = await spec();
    const before = JSON.stringify(s);

    for (const op of ["set", "insert", "remove"] as const) {
      expectFailure(applyOp(s, { op, path: "/core/-", value: 1 }), "APPEND_ON_OBJECT");
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it("does not police the value's type — the re-validation pass owns that", async () => {
    const s = await spec();

    // A glazing ratio of "wide" is nonsense, but this module only promises the
    // write lands where the path said; apply.ts re-parses the whole spec after.
    expect(applyOp(s, { op: "set", path: "/facade/sides/0/glazingRatio", value: "wide" })).toBe(
      true,
    );
    expect(s.facade.sides[0].glazingRatio).toBe("wide" as unknown as number);
  });
});

describe("applyOp — insert", () => {
  const NEW_LEVEL = { floorNo: 99, name: "L99", floorToFloorMm: 4000, usage: "occupied" };

  it("appends with '-' and with an index equal to the length", async () => {
    const s = await spec();
    const length = s.levels.length;

    expect(applyOp(s, { op: "insert", path: "/levels/-", value: NEW_LEVEL })).toBe(true);
    expect(s.levels).toHaveLength(length + 1);
    expect(s.levels[length]).toEqual(NEW_LEVEL);

    // One past the old end is now exactly the end, so it appends too.
    expect(applyOp(s, { op: "insert", path: `/levels/${length + 1}`, value: NEW_LEVEL })).toBe(true);
    expect(s.levels).toHaveLength(length + 2);
  });

  it("inserts at a middle index and shifts the rest along", async () => {
    const s = await spec();
    const before = s.levels.map((level) => level.name);

    expect(applyOp(s, { op: "insert", path: "/levels/1", value: NEW_LEVEL })).toBe(true);

    expect(s.levels.map((level) => level.name)).toEqual([before[0], "L99", ...before.slice(1)]);
    // Indices named later in the same patch really do move under it.
    expect(getAtPath(s, "/levels/2/name")).toEqual({ value: before[1] });
  });

  it("refuses to insert an object key, because the spec schema is closed", async () => {
    const s = await spec();

    // additionalProperties:false is what stops the model inventing a field in
    // its tool call; insert is the obvious way around it, so it is refused here.
    expectFailure(
      applyOp(s, { op: "insert", path: "/core/sprinklerRisers", value: 2 }),
      "APPEND_ON_OBJECT",
    );
    expect("sprinklerRisers" in s.core).toBe(false);

    // Even for a key that exists: insert has no meaning on an unordered object.
    expectFailure(
      applyOp(s, { op: "insert", path: "/core/offsetXMm", value: 5 }),
      "APPEND_ON_OBJECT",
    );
  });

  it("rejects an insert past the end or before the start", async () => {
    const s = await spec();
    const length = s.levels.length;

    expectFailure(
      applyOp(s, { op: "insert", path: `/levels/${length + 1}`, value: NEW_LEVEL }),
      "BAD_INDEX",
    );
    expectFailure(applyOp(s, { op: "insert", path: "/levels/-2", value: NEW_LEVEL }), "BAD_INDEX");
    expect(s.levels).toHaveLength(length);
  });
});

describe("applyOp — remove", () => {
  it("removes an array element and closes the gap", async () => {
    const s = await spec();
    const before = s.levels.map((level) => level.name);

    expect(applyOp(s, { op: "remove", path: "/levels/0" })).toBe(true);

    expect(s.levels.map((level) => level.name)).toEqual(before.slice(1));
    expect(s.levels).toHaveLength(before.length - 1);
  });

  it("removes an object key and then reports it missing", async () => {
    const s = await spec();

    expect(applyOp(s, { op: "remove", path: "/roof/pitchDeg" })).toBe(true);
    expect("pitchDeg" in s.roof).toBe(false);
    expectFailure(getAtPath(s, "/roof/pitchDeg"), "MISSING_KEY");

    // Removing it twice is a rejection, not a silent no-op — the second op in a
    // patch must not report success for work it did not do.
    expectFailure(applyOp(s, { op: "remove", path: "/roof/pitchDeg" }), "MISSING_KEY");
  });

  it("rejects removing the append position or an index past the end", async () => {
    const s = await spec();
    const length = s.levels.length;

    // "-" names the slot after the last element, which holds nothing.
    expectFailure(applyOp(s, { op: "remove", path: "/levels/-" }), "BAD_INDEX");
    expectFailure(applyOp(s, { op: "remove", path: `/levels/${length}` }), "BAD_INDEX");
    expect(s.levels).toHaveLength(length);
  });
});

describe("applyOp — hostile paths", () => {
  it("returns a PathError for each one and leaves the spec byte-identical", async () => {
    const s = await spec();
    const before = JSON.stringify(s);

    const paths = [
      "",
      "/",
      "//",
      "core/offsetXMm",
      "/levels//0",
      "/levels/-/floorToFloorMm",
      "/levels/1e400/name",
      "/levels/999999",
      "/project/name/0",
      "/levels/0/floorToFloorMm/value",
      "/core/offsetXMm/deeper",
      "/absent",
      "/absent/deeper/still",
      "/core/-",
    ];

    for (const path of paths) {
      for (const op of ["set", "insert", "remove"] as const) {
        const result = applyOp(s, { op, path, value: 1 });
        expect(result, `${op} "${path}" was accepted`).not.toBe(true);
        expect(typeof (result as PathError).failure, `${op} "${path}"`).toBe("string");
      }
    }

    expect(JSON.stringify(s)).toBe(before);
  });
});
