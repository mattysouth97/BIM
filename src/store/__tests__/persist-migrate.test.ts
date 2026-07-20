// src/store/__tests__/persist-migrate.test.ts
// P2-07 — the shared persist migrator: v0 payloads are preserved (existing
// users keep their data), newer/unknown versions fall back to defaults.

import { describe, it, expect } from "vitest";
import { versionedMigrate } from "../persist-migrate";

describe("versionedMigrate (P2-07)", () => {
  it("adopts a v0 (unversioned) payload as-is so users don't lose data", () => {
    const legacy = { stage: "twin", completion: { search: true } };
    expect(versionedMigrate(legacy, 0)).toBe(legacy);
  });

  it("falls back to defaults (undefined) for a newer/unknown version", () => {
    // A payload written by a future build (v2) must NOT be trusted at v1.
    expect(versionedMigrate({ some: "future-shape" }, 2)).toBeUndefined();
    expect(versionedMigrate({ x: 1 }, 99)).toBeUndefined();
  });

  it("never fabricates data — it either preserves or drops, never guesses", () => {
    // v0 → preserve; v>=1 → undefined (drop). No transformation invented.
    expect(versionedMigrate({ a: 1 }, 0)).toEqual({ a: 1 });
    expect(versionedMigrate({ a: 1 }, 1)).toBeUndefined();
  });
});
