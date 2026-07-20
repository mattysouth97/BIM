// src/lib/twin-data/__tests__/guards.test.ts
// P0-01 — unit tests for the shared twin-data route guards:
// slug validation, containment-checked path resolution, constant-time key
// compare, and the content-length body cap.

import { describe, it, expect } from "vitest";
import path from "path";
import {
  BUILDING_ID_PATTERN,
  MAX_BODY_BYTES,
  TWIN_DATA_TYPES,
  exceedsBodyCap,
  getTwinDataRoot,
  isValidBuildingId,
  isValidDataType,
  resolveTwinDataPath,
  safeKeyEquals,
} from "../guards";

describe("isValidBuildingId", () => {
  it("accepts slug-shaped ids", () => {
    expect(isValidBuildingId("bldg_01-A")).toBe(true);
    expect(isValidBuildingId("a")).toBe(true);
    expect(isValidBuildingId("A".repeat(64))).toBe(true);
  });

  it("rejects traversal, separators, whitespace, overlong, empty, and non-strings", () => {
    expect(isValidBuildingId("../../evil")).toBe(false);
    expect(isValidBuildingId("..%2F..%2Fevil")).toBe(false);
    expect(isValidBuildingId("a/b")).toBe(false);
    expect(isValidBuildingId("a\\b")).toBe(false);
    expect(isValidBuildingId("id with space")).toBe(false);
    expect(isValidBuildingId("a".repeat(65))).toBe(false);
    expect(isValidBuildingId("")).toBe(false);
    expect(isValidBuildingId("..")).toBe(false);
    expect(isValidBuildingId(42)).toBe(false);
    expect(isValidBuildingId(null)).toBe(false);
    expect(isValidBuildingId(undefined)).toBe(false);
  });

  it("pattern is anchored to the full string", () => {
    expect(BUILDING_ID_PATTERN.test("ok/../../evil")).toBe(false);
  });
});

describe("isValidDataType", () => {
  it("accepts exactly the three twin data types", () => {
    for (const dataType of TWIN_DATA_TYPES) {
      expect(isValidDataType(dataType)).toBe(true);
    }
    expect(isValidDataType("energy-bills")).toBe(true);
    expect(isValidDataType("secrets")).toBe(false);
    expect(isValidDataType("")).toBe(false);
    expect(isValidDataType(null)).toBe(false);
  });
});

describe("resolveTwinDataPath", () => {
  it("resolves a valid id under the .twin-data root", () => {
    const resolved = resolveTwinDataPath("bldg_01-A", "energy-bills");
    expect(resolved).not.toBeNull();
    expect(resolved!.startsWith(getTwinDataRoot() + path.sep)).toBe(true);
    expect(resolved!.endsWith(path.join("bldg_01-A", "energy-bills.json"))).toBe(true);
  });

  it("returns null for ids that escape the root (defense-in-depth behind the regex)", () => {
    expect(resolveTwinDataPath("../evil", "energy-bills")).toBeNull();
    expect(resolveTwinDataPath("../../evil", "energy-bills")).toBeNull();
    expect(resolveTwinDataPath("..", "energy-bills")).toBeNull();
  });
});

describe("safeKeyEquals", () => {
  it("returns true only for identical keys", () => {
    expect(safeKeyEquals("secret", "secret")).toBe(true);
    expect(safeKeyEquals("secret", "Secret")).toBe(false);
    expect(safeKeyEquals("secret", "secret-longer")).toBe(false);
    expect(safeKeyEquals("", "")).toBe(true);
  });
});

describe("exceedsBodyCap", () => {
  it("is 64 KB", () => {
    expect(MAX_BODY_BYTES).toBe(64 * 1024);
  });

  it("flags only declared lengths above the cap", () => {
    expect(exceedsBodyCap(String(MAX_BODY_BYTES + 1))).toBe(true);
    expect(exceedsBodyCap(String(MAX_BODY_BYTES))).toBe(false);
    expect(exceedsBodyCap("100")).toBe(false);
    expect(exceedsBodyCap(null)).toBe(false);
  });
});
