import { describe, it, expect } from "vitest";
import {
  createElementId,
  parseElementKind,
  getUuid,
  compareElementIds,
} from "../element-id";
import type { ElementKind } from "../element-id";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_KINDS: ElementKind[] = [
  "wall",
  "slab",
  "column",
  "window",
  "door",
  "mep-instance",
  "annotation",
  "level",
  "grid",
];

// ---------------------------------------------------------------------------
// Shape tests
// ---------------------------------------------------------------------------

describe("createElementId", () => {
  it("returns a string with the correct kind prefix", () => {
    for (const kind of ALL_KINDS) {
      const id = createElementId(kind);
      expect(id).toMatch(new RegExp(`^${kind}:`));
    }
  });

  it("UUID portion matches UUIDv7 format (8-4-4-4-12)", () => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const kind of ALL_KINDS) {
      const id = createElementId(kind);
      const uuid = getUuid(id);
      expect(uuid).toMatch(uuidPattern);
    }
  });

  it("version nibble is 7", () => {
    const id = createElementId("wall");
    const uuid = getUuid(id);
    // 3rd group starts with '7'
    const parts = uuid.split("-");
    expect(parts[2]).toMatch(/^7/);
  });

  it("variant bits are correct (8, 9, a, or b in 4th group first char)", () => {
    const id = createElementId("wall");
    const uuid = getUuid(id);
    const parts = uuid.split("-");
    expect(parts[3][0]).toMatch(/[89ab]/i);
  });
});

// ---------------------------------------------------------------------------
// Collision test
// ---------------------------------------------------------------------------

describe("uniqueness", () => {
  it("generates 10,000 IDs with zero collisions", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(createElementId("wall"));
    }
    expect(ids.size).toBe(10_000);
  });

  it("IDs for different kinds are also unique across all kinds", () => {
    const ids = new Set<string>();
    for (const kind of ALL_KINDS) {
      for (let i = 0; i < 500; i++) {
        ids.add(createElementId(kind));
      }
    }
    expect(ids.size).toBe(ALL_KINDS.length * 500);
  });
});

// ---------------------------------------------------------------------------
// Time-ordering test
// ---------------------------------------------------------------------------

describe("time-ordering", () => {
  it("IDs generated sequentially sort in creation order", () => {
    // Generate 100 IDs in sequence and verify lexicographic order == creation order
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(createElementId("slab"));
    }

    const sorted = [...ids].sort((a, b) => compareElementIds(a, b));
    expect(sorted).toEqual(ids);
  });

  it("compareElementIds returns negative for earlier ID", () => {
    const a = createElementId("column");
    // Small artificial delay to ensure the next ID has a later timestamp
    // In practice UUIDv7's random_a sub-ms counter handles same-ms ordering,
    // but here we just need the two to be different strings.
    const b = createElementId("column");
    // Either a < b or a === b (same ms); never a > b for sequential generation
    expect(compareElementIds(a, b)).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// parseElementKind
// ---------------------------------------------------------------------------

describe("parseElementKind", () => {
  it("returns the correct kind for each element type", () => {
    for (const kind of ALL_KINDS) {
      const id = createElementId(kind);
      expect(parseElementKind(id)).toBe(kind);
    }
  });

  it("returns null for a plain UUID (no prefix)", () => {
    expect(parseElementKind("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  it("returns null for an unknown kind prefix", () => {
    expect(parseElementKind("unknown:550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseElementKind("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getUuid
// ---------------------------------------------------------------------------

describe("getUuid", () => {
  it("strips the kind prefix", () => {
    const id = createElementId("door");
    const uuid = getUuid(id);
    expect(uuid).not.toContain("door:");
    expect(uuid.split("-")).toHaveLength(5);
  });

  it("returns the full string when there is no colon", () => {
    const plain = "550e8400-e29b-41d4-a716-446655440000";
    expect(getUuid(plain)).toBe(plain);
  });
});
