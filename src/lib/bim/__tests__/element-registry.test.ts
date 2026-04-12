import { describe, it, expect, beforeEach } from "vitest";
import { ElementRegistry } from "../element-registry";
import { createElementId } from "../element-id";
import type { ElementRecord } from "../element-record";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(
  kind: ElementRecord["kind"],
  buildingPk = "BLD-001",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: Record<string, any> = {}
): ElementRecord {
  return {
    id: createElementId(kind),
    kind,
    buildingPk,
    userData,
  };
}

// ---------------------------------------------------------------------------
// Fresh registry per test
// ---------------------------------------------------------------------------

let registry: ElementRegistry;

beforeEach(() => {
  registry = new ElementRegistry();
});

// ---------------------------------------------------------------------------
// Basic CRUD
// ---------------------------------------------------------------------------

describe("register / get", () => {
  it("registers a record and retrieves it by id", () => {
    const rec = makeRecord("wall");
    registry.register(rec);
    expect(registry.get(rec.id)).toBe(rec);
  });

  it("returns undefined for an unknown id", () => {
    expect(registry.get("wall:unknown-id" as ReturnType<typeof createElementId<"wall">>)).toBeUndefined();
  });

  it("upserts when registering an existing id", () => {
    const rec = makeRecord("wall");
    registry.register(rec);

    const updated: ElementRecord = { ...rec, userData: { thickness: 200 } };
    registry.register(updated);

    expect(registry.size).toBe(1);
    expect(registry.get(rec.id)?.userData.thickness).toBe(200);
  });

  it("increments size on each new registration", () => {
    registry.register(makeRecord("wall"));
    registry.register(makeRecord("slab"));
    registry.register(makeRecord("column"));
    expect(registry.size).toBe(3);
  });
});

describe("unregister", () => {
  it("removes the record and returns true", () => {
    const rec = makeRecord("wall");
    registry.register(rec);
    expect(registry.unregister(rec.id)).toBe(true);
    expect(registry.get(rec.id)).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it("returns false for an unknown id", () => {
    expect(registry.unregister("wall:no-such-id")).toBe(false);
  });

  it("removes the record from kind index on unregister", () => {
    const rec = makeRecord("window");
    registry.register(rec);
    registry.unregister(rec.id);
    expect(registry.getByKind("window")).toHaveLength(0);
  });

  it("removes the record from building index on unregister", () => {
    const rec = makeRecord("door", "BLD-X");
    registry.register(rec);
    registry.unregister(rec.id);
    expect(registry.getByBuildingPk("BLD-X")).toHaveLength(0);
  });
});

describe("clear", () => {
  it("empties the registry entirely", () => {
    registry.register(makeRecord("wall"));
    registry.register(makeRecord("slab"));
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it("also clears secondary indexes", () => {
    registry.register(makeRecord("column", "BLD-A"));
    registry.clear();
    expect(registry.getByKind("column")).toHaveLength(0);
    expect(registry.getByBuildingPk("BLD-A")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Secondary index: getByKind
// ---------------------------------------------------------------------------

describe("getByKind", () => {
  it("returns all records for a given kind", () => {
    registry.register(makeRecord("wall"));
    registry.register(makeRecord("wall"));
    registry.register(makeRecord("slab"));

    expect(registry.getByKind("wall")).toHaveLength(2);
    expect(registry.getByKind("slab")).toHaveLength(1);
  });

  it("returns empty array for a kind with no registrations", () => {
    expect(registry.getByKind("grid")).toHaveLength(0);
  });

  it("handles every supported kind", () => {
    const kinds: ElementRecord["kind"][] = [
      "wall", "slab", "column", "window", "door",
      "mep-instance", "annotation", "level", "grid",
    ];
    for (const kind of kinds) {
      registry.register(makeRecord(kind));
    }
    for (const kind of kinds) {
      expect(registry.getByKind(kind)).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Secondary index: getByBuildingPk
// ---------------------------------------------------------------------------

describe("getByBuildingPk", () => {
  it("returns all elements for a given building", () => {
    registry.register(makeRecord("wall", "BLDG-1"));
    registry.register(makeRecord("slab", "BLDG-1"));
    registry.register(makeRecord("wall", "BLDG-2"));

    expect(registry.getByBuildingPk("BLDG-1")).toHaveLength(2);
    expect(registry.getByBuildingPk("BLDG-2")).toHaveLength(1);
  });

  it("returns empty array for an unknown building", () => {
    expect(registry.getByBuildingPk("NO-SUCH-PK")).toHaveLength(0);
  });

  it("correctly separates elements across multiple buildings", () => {
    const pks = ["A", "B", "C"];
    for (const pk of pks) {
      for (let i = 0; i < 3; i++) {
        registry.register(makeRecord("column", pk));
      }
    }
    for (const pk of pks) {
      expect(registry.getByBuildingPk(pk)).toHaveLength(3);
    }
  });
});

// ---------------------------------------------------------------------------
// values() iterator
// ---------------------------------------------------------------------------

describe("values()", () => {
  it("iterates over all registered records", () => {
    const recs = [makeRecord("wall"), makeRecord("slab"), makeRecord("door")];
    for (const r of recs) registry.register(r);

    const all = Array.from(registry.values());
    expect(all).toHaveLength(3);
    for (const r of recs) {
      expect(all).toContain(r);
    }
  });
});

// ---------------------------------------------------------------------------
// Serialisation round-trip
// ---------------------------------------------------------------------------

describe("serialize / deserialize", () => {
  it("round-trips all records through JSON serialisation", () => {
    const recs = [
      makeRecord("wall", "BLD-01", { thickness: 200 }),
      makeRecord("window", "BLD-01", { uValue: 1.5 }),
      makeRecord("column", "BLD-02", { material: "concrete" }),
    ];
    for (const r of recs) registry.register(r);

    const serialized = registry.serialize();
    const json = JSON.stringify(serialized);

    const freshRegistry = new ElementRegistry();
    freshRegistry.deserialize(JSON.parse(json));

    expect(freshRegistry.size).toBe(3);
    expect(freshRegistry.getByBuildingPk("BLD-01")).toHaveLength(2);
    expect(freshRegistry.getByBuildingPk("BLD-02")).toHaveLength(1);
    expect(freshRegistry.getByKind("wall")).toHaveLength(1);
    expect(freshRegistry.getByKind("window")).toHaveLength(1);
    expect(freshRegistry.getByKind("column")).toHaveLength(1);
  });

  it("preserves userData through serialisation", () => {
    const rec = makeRecord("slab", "BLD-A", { elevation: 3.0, area: 84 });
    registry.register(rec);

    const fresh = new ElementRegistry();
    fresh.deserialize(JSON.parse(JSON.stringify(registry.serialize())));

    const restored = fresh.get(rec.id);
    expect(restored?.userData.elevation).toBe(3.0);
    expect(restored?.userData.area).toBe(84);
  });

  it("skips malformed records during deserialisation", () => {
    const fresh = new ElementRegistry();
    fresh.deserialize([
      { id: "no-colon-prefix", kind: "wall", buildingPk: "B", userData: {} },
      { id: "wall:valid-looking", kind: "wall", buildingPk: "B", userData: {} },
    ]);
    // "no-colon-prefix" has no kind prefix — parseElementKind returns null, skipped
    // "wall:valid-looking" will be accepted even without a UUID7 structure
    expect(fresh.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Upsert secondary-index correctness
// ---------------------------------------------------------------------------

describe("upsert secondary-index correctness", () => {
  it("does not double-count in kind index after upsert", () => {
    const rec = makeRecord("level");
    registry.register(rec);
    registry.register({ ...rec, userData: { elevation: 0 } });
    expect(registry.getByKind("level")).toHaveLength(1);
  });

  it("does not double-count in building index after upsert", () => {
    const rec = makeRecord("grid", "BLD-Z");
    registry.register(rec);
    registry.register({ ...rec, userData: { spacing: 6 } });
    expect(registry.getByBuildingPk("BLD-Z")).toHaveLength(1);
  });
});
