// src/lib/generative/__tests__/patch-security.test.ts
//
// Patch paths are chosen by a language model and arrive over the wire. They are
// therefore hostile input, and these are the cases that treat them that way.
//
// The prototype-pollution case is not hypothetical: before `FORBIDDEN_SEGMENTS`
// and the own-property checks in `patch/paths.ts`, the path "/__proto__/toString"
// resolved its parent to `Object.prototype` — shared by every object in the Node
// process — and the `set` branch wrote to it, because `"toString" in obj` is true
// for inherited keys. One patch operation could have corrupted the whole server.

import { describe, expect, it } from "vitest";

import { applySpecPatch } from "../patch/apply";
import { applyOp, getAtPath, parsePath } from "../patch/paths";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { systemLock } from "../session/locks";
import type { BuildingSpec } from "../spec/building-spec";

async function makeSpec(): Promise<BuildingSpec> {
  const provider = new HeuristicReasoningProvider();
  const { data } = await provider.generateBuilding({
    prompt: "A four-storey office building with a central core.",
    seed: 4242,
  });
  return data;
}

function isPathError(value: unknown): value is { failure: string; message: string } {
  return typeof value === "object" && value !== null && "failure" in value;
}

describe("patch path hardening", () => {
  it("refuses every segment that would leave the specification", () => {
    for (const path of [
      "/__proto__/toString",
      "/constructor/prototype/polluted",
      "/levels/0/__proto__/x",
      "/core/constructor",
      "/prototype",
    ]) {
      const parsed = parsePath(path);
      expect(isPathError(parsed), `${path} should not parse`).toBe(true);
      if (isPathError(parsed)) expect(parsed.failure).toBe("FORBIDDEN_SEGMENT");
    }
  });

  it("cannot be smuggled past by RFC-6901 escapes", () => {
    // "~0" decodes to "~", so this is only dangerous if the check runs before
    // unescaping. It runs after.
    const parsed = parsePath("/__proto__/constructor");
    expect(isPathError(parsed)).toBe(true);
  });

  it("does not write to Object.prototype", () => {
    const target: Record<string, unknown> = { real: 1 };
    const result = applyOp(target, {
      op: "set",
      path: "/__proto__/toString",
      value: "owned",
    });

    expect(result).not.toBe(true);
    expect(Object.prototype).not.toHaveProperty("polluted");
    // The canary: `toString` must still be the function every object inherits.
    expect(typeof ({}).toString).toBe("function");
    expect(({} as Record<string, unknown>).toString).not.toBe("owned");
  });

  it("treats inherited keys as absent rather than writable", () => {
    const target: Record<string, unknown> = { core: { offsetXMm: 0 } };

    // `"hasOwnProperty" in target.core` is true via the prototype chain, but it
    // is not a field of the specification and must not be settable.
    const written = applyOp(target, {
      op: "set",
      path: "/core/hasOwnProperty",
      value: 1,
    });
    expect(written).not.toBe(true);
    if (isPathError(written)) expect(written.failure).toBe("MISSING_KEY");

    const read = getAtPath(target, "/core/hasOwnProperty");
    expect(isPathError(read)).toBe(true);
  });

  it("rejects a hostile path through the full apply pipeline without touching the spec", async () => {
    const spec = await makeSpec();
    const before = JSON.stringify(spec);

    const result = applySpecPatch({
      spec,
      patch: {
        summary: "hostile",
        rationale: "attempts to escape the specification tree",
        scope: "building",
        affectedFloorNos: [],
        operations: [
          { op: "set", path: "/__proto__/isAdmin", value: true },
          { op: "set", path: "/constructor/prototype/isAdmin", value: true },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.applied).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.every((r) => r.kind === "path")).toBe(true);
    expect(result.spec).toBe(spec);
    expect(JSON.stringify(spec)).toBe(before);
    expect(Object.prototype).not.toHaveProperty("isAdmin");
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it("strips unknown fields a patch tries to smuggle in as a value", async () => {
    const spec = await makeSpec();

    // The schema is closed, so even a value object carrying extra keys must not
    // survive into the design the rest of the system trusts.
    const result = applySpecPatch({
      spec,
      patch: {
        summary: "extra keys",
        rationale: "a value object with fields the schema does not declare",
        scope: "core",
        affectedFloorNos: [],
        operations: [
          {
            op: "set",
            path: "/core/offsetXMm",
            value: 1_000,
          },
          {
            op: "set",
            path: "/roof/parapetMm",
            value: 900,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.spec.core.offsetXMm).toBe(1_000);
    expect(result.spec.roof.parapetMm).toBe(900);
    // Zod rebuilds the object, so nothing outside the schema can ride along.
    expect(Object.keys(result.spec.roof).sort()).toEqual(
      ["parapetMm", "pitchDeg", "type"].sort(),
    );
  });
});

describe("locks cannot be walked around", () => {
  it("blocks a write to the PARENT of a protected leaf", async () => {
    const spec = await makeSpec();
    const locks = [systemLock("openings")];

    // `openings` protects "/facade/sides/*/glazingRatio" and friends. Replacing
    // the whole side object rewrites every one of them, and a prefix test that
    // only ran pattern-against-path missed it entirely: the path is SHORTER
    // than the pattern, so nothing matched and the lock silently did nothing.
    const result = applySpecPatch({
      spec,
      locks,
      patch: {
        summary: "replace the north elevation",
        rationale: "writes an ancestor of a locked leaf",
        scope: "facade",
        affectedFloorNos: [],
        operations: [
          {
            op: "set",
            path: "/facade/sides/0",
            value: { ...spec.facade.sides[0], glazingRatio: 0.9 },
          },
          // Same shape one level higher, against the door dimensions.
          { op: "set", path: "/dimensions", value: spec.dimensions },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.every((r) => r.kind === "locked")).toBe(true);
    expect(result.spec.facade.sides[0].glazingRatio).toBe(
      spec.facade.sides[0].glazingRatio,
    );
  });

  it("still allows a sibling the lock does not cover", async () => {
    const spec = await makeSpec();

    // Overlap must be segment-aligned in both directions, not merely "shares a
    // prefix string" — locking openings must not freeze the whole facade.
    const result = applySpecPatch({
      spec,
      locks: [systemLock("openings")],
      patch: {
        summary: "raise the spandrel",
        rationale: "a facade field openings does not protect",
        scope: "facade",
        affectedFloorNos: [],
        operations: [{ op: "set", path: "/facade/spandrelMm", value: 1_100 }],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.spec.facade.spandrelMm).toBe(1_100);
  });
});

describe("coherence gate", () => {
  it("refuses a patch that would give two levels the same storey number", async () => {
    const spec = await makeSpec();
    expect(spec.levels.length).toBeGreaterThan(1);
    const collidingFloorNo = spec.levels[1].floorNo;

    // Every field validates: LevelSchema only forbids storey 0. What it cannot
    // say is that storeys must be unique — and without that, the emitter mints
    // two elements called SLAB-L<n>, the navigation tree shows two nodes with
    // one lock token, and mergeGenerated silently collapses the pair.
    const result = applySpecPatch({
      spec,
      patch: {
        summary: "renumber a level",
        rationale: "collides with an existing storey",
        scope: "levels",
        affectedFloorNos: [collidingFloorNo],
        operations: [
          { op: "set", path: "/levels/0/floorNo", value: collidingFloorNo },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INCOHERENT");
    expect(result.error?.detail).toMatch(/unique/i);
    expect(result.spec).toBe(spec);
    expect(result.applied).toHaveLength(0);
  });

  it("refuses a patch that strands program on a storey that does not exist", async () => {
    const spec = await makeSpec();

    const result = applySpecPatch({
      spec,
      patch: {
        summary: "program a storey that is not there",
        rationale: "the program would be silently dropped by the solver",
        scope: "program",
        affectedFloorNos: [],
        operations: [{ op: "insert", path: "/program/0/levels/-", value: 99 }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INCOHERENT");
    expect(result.spec).toBe(spec);
  });
});
