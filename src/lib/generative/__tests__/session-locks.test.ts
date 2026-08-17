import { describe, expect, it } from "vitest";

import type { BimElement, BimSystem } from "@/lib/bim/model/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import {
  applyLocksToElements,
  elementLock,
  levelLock,
  lockDescriptions,
  lockedElementIds,
  lockedFloorNos,
  lockedSystems,
  lockRejection,
  parseLock,
  systemLock,
  LOCKABLE_SYSTEMS,
  SYSTEM_LABEL,
  SYSTEM_SPEC_PATHS,
  type LockToken,
} from "../session/locks";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

/** A real, schema-valid spec — the lock checks read `spec.levels` for real. */
async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({ prompt, seed: 42 });
  return data;
}

/**
 * The levels array deliberately no longer runs in floorNo order. A lock that
 * resolves by array position instead of by floorNo would protect the wrong
 * storey here, which is exactly the failure the tests below hunt for.
 */
async function shuffledLevelSpec(): Promise<BuildingSpec> {
  const spec = await specFor("A 4 storey office building with one basement.");
  return { ...spec, levels: [...spec.levels].reverse() };
}

function reject(input: {
  path: string;
  op: "set" | "insert" | "remove";
  tokens: LockToken[];
  spec: BuildingSpec;
}): string | null {
  return lockRejection(input);
}

const BASE_ELEMENT: BimElement = {
  id: "PLACEHOLDER",
  origin: "generated",
  kind: "wall",
  category: "Walls",
  family: "generated-wall",
  typeId: "generated-wall-exterior",
  buildingPk: "BLD-1",
  levelId: null,
  hostId: null,
  mark: "",
  instanceParameters: {},
  placement: { x: 0, y: 0, z: 0, rotationY: 0 },
  phaseCreated: "new",
  visible: true,
};

function element(overrides: Partial<BimElement> & { id: string }): BimElement {
  return { ...BASE_ELEMENT, ...overrides };
}

function byId(elements: BimElement[], id: string): BimElement {
  const found = elements.find((e) => e.id === id);
  if (!found) throw new Error(`no element ${id}`);
  return found;
}

/** Walks a SYSTEM_SPEC_PATHS pattern against a real spec; `*` spans an array. */
function resolves(node: unknown, segments: string[]): boolean {
  if (segments.length === 0) return true;
  if (node === null || typeof node !== "object") return false;
  const [head, ...rest] = segments;
  if (head === "*") {
    return Array.isArray(node) && node.length > 0 && node.every((item) => resolves(item, rest));
  }
  if (Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  return head in record && resolves(record[head], rest);
}

describe("lock tokens", () => {
  it("round-trips every token kind back to the lock it names", () => {
    for (const system of LOCKABLE_SYSTEMS) {
      expect(parseLock(systemLock(system))).toEqual({ kind: "system", system });
    }
    // Basements and the ground storey are ordinary floor numbers, not sentinels.
    for (const floorNo of [-2, -1, 0, 1, 47]) {
      expect(parseLock(levelLock(floorNo))).toEqual({ kind: "level", floorNo });
    }
    expect(parseLock(elementLock("WALL-0001"))).toEqual({
      kind: "element",
      elementId: "WALL-0001",
    });
  });

  it("splits on the FIRST colon, so an element id may contain colons itself", () => {
    // Element ids are generated elsewhere and may well be namespaced. Splitting
    // on the last colon (or on every colon) would silently truncate the id and
    // unlock the element the user protected.
    const id = "core:CORE-STAIR-1:level:3";
    expect(parseLock(elementLock(id))).toEqual({ kind: "element", elementId: id });
  });

  it("rejects an unknown system, a non-integer level and a malformed token", () => {
    // Not in LOCKABLE_SYSTEMS: accepting it would produce a lock that reads as
    // real in the UI but matches no spec path and no element.
    expect(parseLock("system:hvac")).toBeNull();
    expect(parseLock("system:Structure")).toBeNull();

    // A fractional or non-numeric floor can never equal a real level.floorNo,
    // so admitting it would freeze /levels insert+remove for nothing.
    expect(parseLock("level:1.5")).toBeNull();
    expect(parseLock("level:ground")).toBeNull();
    expect(parseLock("level:1e400")).toBeNull(); // Infinity

    expect(parseLock("structure")).toBeNull(); // no separator at all
    expect(parseLock("")).toBeNull();
    expect(parseLock("system:")).toBeNull(); // kind with no payload
    expect(parseLock("element:")).toBeNull();
    expect(parseLock(":structure")).toBeNull(); // payload with no kind
    expect(parseLock("zone:1")).toBeNull(); // kind that does not exist
  });

  it("collects each lock kind, de-duplicated, and drops junk tokens", () => {
    const tokens = [
      systemLock("core"),
      systemLock("core"),
      "system:hvac",
      levelLock(3),
      levelLock(-1),
      "level:x",
      elementLock("E2"),
      elementLock("E1"),
      elementLock("E2"),
      "nonsense",
    ];

    expect(lockedSystems(tokens)).toEqual(["core"]);
    expect(lockedFloorNos(tokens)).toEqual([-1, 3]); // numeric order, not lexical
    expect(lockedElementIds(tokens)).toEqual(["E2", "E1"]);
  });
});

describe("lockDescriptions", () => {
  it("tells the provider the spec paths behind a system lock", () => {
    const [line] = lockDescriptions([systemLock("core")]);
    expect(line).toContain("Core system");
    // The paths matter: the provider is being told which addresses to avoid.
    for (const path of SYSTEM_SPEC_PATHS.core) expect(line).toContain(path);
  });

  it("caps the element list at eight but still reports the true count", () => {
    const ids = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9"];
    const lines = lockDescriptions([levelLock(3), ...ids.map(elementLock)]);

    expect(lines[0]).toContain("Level 3");
    const elementLine = lines[1];
    expect(elementLine).toContain("9 individual element(s)");
    expect(elementLine.endsWith("…")).toBe(true);
    // The ninth id is elided, so the count is the only honest total.
    expect(elementLine).not.toContain("E9");
  });

  it("says nothing when nothing is locked", () => {
    expect(lockDescriptions([])).toEqual([]);
    expect(lockDescriptions(["garbage", "level:oops"])).toEqual([]);
  });
});

describe("SYSTEM_SPEC_PATHS catalogue", () => {
  it("keeps the lockable list, the labels and the paths in step", () => {
    // A system present in one map and absent from another is a lock the UI can
    // offer but the enforcement cannot honour.
    const sorted = [...LOCKABLE_SYSTEMS].sort();
    expect(Object.keys(SYSTEM_SPEC_PATHS).sort()).toEqual(sorted);
    expect(Object.keys(SYSTEM_LABEL).sort()).toEqual(sorted);
    for (const system of LOCKABLE_SYSTEMS) {
      expect(SYSTEM_LABEL[system]).toBeTruthy();
      expect(SYSTEM_SPEC_PATHS[system].length).toBeGreaterThan(0);
    }
  });

  it("points every pattern at something that actually exists in a spec", async () => {
    // A misspelt or stale path is the worst kind of failure here: the lock
    // still appears engaged while protecting nothing at all.
    const spec = await specFor("A 6 storey office building of 9,000 m².");
    for (const [system, patterns] of Object.entries(SYSTEM_SPEC_PATHS)) {
      for (const pattern of patterns) {
        expect(
          resolves(spec, pattern.split("/").filter(Boolean)),
          `${system}: ${pattern} does not resolve`,
        ).toBe(true);
      }
    }
  });
});

describe("lockRejection — system locks", () => {
  it("blocks the locked subtree and leaves unrelated paths alone", async () => {
    const spec = await specFor("A 6 storey office building.");
    const tokens = [systemLock("structure")];

    expect(reject({ path: "/structure/gridXMm/value", op: "set", tokens, spec })).toBe(
      "Structure is locked.",
    );
    expect(reject({ path: "/structure", op: "set", tokens, spec })).toBe("Structure is locked.");
    expect(reject({ path: "/massing/widthMm/value", op: "set", tokens, spec })).toBeNull();
    expect(reject({ path: "/facade/spandrelMm", op: "set", tokens, spec })).toBeNull();
  });

  it("matches whole segments, not string prefixes", async () => {
    const spec = await specFor("A 6 storey office building.");
    // "/structure" must not swallow a sibling key that merely starts with it —
    // that would be an over-broad lock nobody asked for.
    expect(
      reject({ path: "/structures/foo", op: "set", tokens: [systemLock("structure")], spec }),
    ).toBeNull();
  });

  it("refuses nothing at spec level for an element lock", async () => {
    const spec = await specFor("A 6 storey office building.");
    // Stated invariant: the spec holds no element ids, so an element lock can
    // only preserve an instance — it must not pretend to block a spec edit.
    const tokens = [elementLock("WALL-0001")];
    expect(reject({ path: "/structure/gridXMm/value", op: "set", tokens, spec })).toBeNull();
    expect(reject({ path: "/levels/-", op: "insert", tokens, spec })).toBeNull();
  });
});

describe("lockRejection — wildcard patterns", () => {
  it("protects every facade side, not just side 0", async () => {
    const spec = await specFor("A 6 storey office building.");
    const tokens = [systemLock("openings")];

    for (let side = 0; side < spec.facade.sides.length; side += 1) {
      expect(
        reject({ path: `/facade/sides/${side}/glazingRatio`, op: "set", tokens, spec }),
      ).toBe("Openings is locked.");
    }
    expect(reject({ path: "/facade/sides/2/moduleMm", op: "set", tokens, spec })).toBe(
      "Openings is locked.",
    );
    expect(reject({ path: "/dimensions/doorWidthMm", op: "set", tokens, spec })).toBe(
      "Openings is locked.",
    );
    // The pattern is a PREFIX, so anything below a protected leaf is protected.
    expect(
      reject({ path: "/facade/sides/2/glazingRatio/value", op: "set", tokens, spec }),
    ).toBe("Openings is locked.");
  });

  it("spends the wildcard on exactly one segment", async () => {
    const spec = await specFor("A 6 storey office building.");
    const tokens = [systemLock("openings")];

    // `*` is one segment: it must not skip over "opening" to reach the leaf.
    expect(
      reject({ path: "/facade/sides/2/opening/glazingRatio", op: "set", tokens, spec }),
    ).toBeNull();
    // Openings owns named leaves, not the whole facade or another system's leaf.
    expect(reject({ path: "/facade/spandrelMm", op: "set", tokens, spec })).toBeNull();
    expect(reject({ path: "/dimensions/corridorWidthMm", op: "set", tokens, spec })).toBeNull();
  });

  it("lets envelope and openings overlap on the same path", async () => {
    const spec = await specFor("A 6 storey office building.");
    // Documented intent: facade side geometry drives both systems, so locking
    // EITHER of them must protect it.
    expect(
      reject({
        path: "/facade/sides/1/glazingRatio",
        op: "set",
        tokens: [systemLock("envelope")],
        spec,
      }),
    ).toBe("Envelope is locked.");
    expect(
      reject({
        path: "/facade/spandrelMm",
        op: "set",
        tokens: [systemLock("envelope")],
        spec,
      }),
    ).toBe("Envelope is locked.");
  });
});

describe("lockRejection — level locks", () => {
  it("resolves the index by floorNo, not by array position", async () => {
    const spec = await shuffledLevelSpec();
    const tokens = [levelLock(1)];
    const positionOfFloor1 = spec.levels.findIndex((l) => l.floorNo === 1);

    // Guard the fixture itself: if the array happened to be in floorNo order
    // this test could pass while the lock was purely positional.
    expect(positionOfFloor1).not.toBe(1);

    const blocked = reject({
      path: `/levels/${positionOfFloor1}/floorToFloorMm`,
      op: "set",
      tokens,
      spec,
    });
    expect(blocked).toContain("Level 1");
    expect(blocked).toContain(spec.levels[positionOfFloor1].name);

    // Index 1 holds a different storey — a positional implementation would have
    // blocked this one instead.
    expect(reject({ path: "/levels/1/floorToFloorMm", op: "set", tokens, spec })).toBeNull();
    expect(reject({ path: "/levels/0/name", op: "set", tokens, spec })).toBeNull();
  });

  it("locks a basement by its negative floorNo", async () => {
    const spec = await shuffledLevelSpec();
    const index = spec.levels.findIndex((l) => l.floorNo === -1);
    expect(index).toBeGreaterThanOrEqual(0);

    expect(
      reject({ path: `/levels/${index}/usage`, op: "set", tokens: [levelLock(-1)], spec }),
    ).toContain("Level -1");
  });

  it("refuses insert and remove on /levels outright while any level is locked", async () => {
    const spec = await shuffledLevelSpec();
    const tokens = [levelLock(1)];

    // Both operations renumber array indices, so the protected level's address
    // would move without anyone saying so.
    for (const op of ["insert", "remove"] as const) {
      for (const path of ["/levels/-", "/levels/0", "/levels/3/floorToFloorMm"]) {
        expect(reject({ path, op, tokens, spec })).toContain(
          "Levels cannot be added or removed",
        );
      }
    }
    // Replacing the whole array is the same hazard by another name.
    expect(reject({ path: "/levels", op: "set", tokens, spec })).toContain(
      "Levels cannot be added or removed",
    );
  });

  it("names the locked floors in the insert/remove refusal", async () => {
    const spec = await shuffledLevelSpec();
    expect(
      reject({
        path: "/levels/-",
        op: "insert",
        tokens: [levelLock(3), levelLock(-1)],
        spec,
      }),
    ).toBe("Levels cannot be added or removed while level -1, 3 is locked.");
  });

  it("leaves the rest of the spec editable, including other arrays", async () => {
    const spec = await shuffledLevelSpec();
    const tokens = [levelLock(1)];

    // A level lock is not a freeze on the whole document.
    expect(reject({ path: "/program/-", op: "insert", tokens, spec })).toBeNull();
    expect(reject({ path: "/program/0", op: "remove", tokens, spec })).toBeNull();
    expect(reject({ path: "/core/offsetXMm", op: "set", tokens, spec })).toBeNull();

    // And with no level locked at all, /levels is free again.
    expect(reject({ path: "/levels/-", op: "insert", tokens: [], spec })).toBeNull();
  });
});

describe("applyLocksToElements", () => {
  const elements: BimElement[] = [
    element({ id: "COL-1", kind: "column", system: "structure", levelId: "level:2" }),
    element({ id: "WALL-1", system: "partitions", levelId: "level:3" }),
    element({ id: "WIN-1", kind: "window", system: "openings", levelId: "level:2" }),
    element({ id: "SLAB-1", kind: "slab", system: "structure", levelId: null }),
    element({ id: "ROOF-1", kind: "roof", system: "roof", levelId: "level:9" }),
  ];

  it("stamps system, level and element locks onto the right elements", () => {
    const result = applyLocksToElements(elements, [
      systemLock("structure"),
      levelLock(3),
      elementLock("WIN-1"),
    ]);

    expect(byId(result, "COL-1").locked).toBe(true); // by system
    expect(byId(result, "SLAB-1").locked).toBe(true); // by system, levelId null
    expect(byId(result, "WALL-1").locked).toBe(true); // by levelId "level:3"
    expect(byId(result, "WIN-1").locked).toBe(true); // by explicit id
    // Untouched elements keep their identity, not just an equal value.
    expect(result[4]).toBe(elements[4]);
    expect(result[4].locked).toBeUndefined();
  });

  it("never mutates the elements it was handed", () => {
    applyLocksToElements(elements, [systemLock("structure")]);
    // The snapshot the caller still holds must be unchanged — regeneration
    // compares against it.
    expect(elements.every((e) => e.locked === undefined)).toBe(true);
  });

  it("returns the same array when the lock set is empty or unparseable", () => {
    expect(applyLocksToElements(elements, [])).toBe(elements);
    // Junk tokens must not be mistaken for locks, and must not force a rebuild.
    expect(applyLocksToElements(elements, ["", "nonsense", "system:hvac", "level:x"])).toBe(
      elements,
    );
  });

  it("copies only the elements whose locked flag actually changes", () => {
    // A lock on a floor no element sits on changes nothing, so the very same
    // array comes back and callers memoising on it do no work.
    const result = applyLocksToElements(elements, [levelLock(42)]);
    expect(result).toBe(elements);

    // A lock that does bite copies only the elements it touches.
    const stamped = applyLocksToElements(elements, [systemLock("structure")]);
    expect(stamped).not.toBe(elements);
    stamped.forEach((e, i) => {
      if (elements[i].system === "structure") expect(e).not.toBe(elements[i]);
      else expect(e).toBe(elements[i]);
    });
  });

  it("un-stamps everything once the last lock is released", () => {
    // The regression this guards: an early return on the empty token set meant
    // releasing the FINAL lock never cleared `locked: true`, so the element
    // stayed protected from regeneration with nothing left to explain why —
    // and the same element WAS cleared as soon as any unrelated lock existed.
    const previously = elements.map((e) => ({ ...e, locked: true }));

    const released = applyLocksToElements(previously, []);
    expect(released.every((e) => e.locked === false)).toBe(true);

    // Junk tokens parse to no locks at all, and must behave identically.
    const junk = applyLocksToElements(previously, ["", "nonsense", "level:x"]);
    expect(junk.every((e) => e.locked === false)).toBe(true);
  });

  it("clears a stamp when its lock is released", () => {
    const previously = elements.map((e) =>
      e.id === "COL-1" ? { ...e, locked: true } : e,
    );
    // The token set is the source of truth: releasing the structure lock must
    // un-stamp the column, or it would stay frozen forever.
    const result = applyLocksToElements(previously, [systemLock("roof")]);
    expect(byId(result, "COL-1").locked).toBe(false);
    expect(byId(result, "ROOF-1").locked).toBe(true);
  });

  it("locks an element whose system is undefined only by id or level", () => {
    const legacy = [
      element({ id: "OLD-1", levelId: "level:5" }),
      element({ id: "OLD-2", levelId: null }),
    ];
    const result = applyLocksToElements(legacy, [levelLock(5), systemLock("structure")]);
    expect(byId(result, "OLD-1").locked).toBe(true);
    // No system and no level: a system lock has nothing to match against.
    expect(result[1]).toBe(legacy[1]);
  });
});

describe("lock model — cross-checks", () => {
  it("keeps every lockable system parseable from its own token", () => {
    // The UI builds tokens with systemLock(); enforcement reads them back with
    // parseLock(). A system missing from LOCKABLE_SYSTEMS breaks that loop.
    const all: BimSystem[] = [...LOCKABLE_SYSTEMS];
    expect(lockedSystems(all.map(systemLock))).toEqual([...all].sort());
  });
});
