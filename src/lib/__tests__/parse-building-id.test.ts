// src/lib/__tests__/parse-building-id.test.ts
// P2-03 — parseBuildingId returns null for malformed ids so the building
// route can call notFound() instead of rendering an empty shell.

import { describe, it, expect } from "vitest";
import { parseBuildingId, encodeBuildingId } from "../constants";

describe("parseBuildingId (P2-03)", () => {
  it("parses a well-formed 5-segment id", () => {
    const id = encodeBuildingId("11110", "10100", "0", "0001", "0000");
    expect(parseBuildingId(id)).toEqual({
      sigunguCd: "11110",
      bjdongCd: "10100",
      platGbCd: "0",
      bun: "0001",
      ji: "0000",
    });
  });

  it("returns null for a missing-segment id", () => {
    expect(parseBuildingId("test-id")).toBeNull();
    expect(parseBuildingId("11110-10100")).toBeNull();
    expect(parseBuildingId("11110-10100-0-0001")).toBeNull();
  });

  it("returns null for extra segments", () => {
    expect(parseBuildingId("11110-10100-0-0001-0000-extra")).toBeNull();
  });

  it("returns null for empty segments", () => {
    expect(parseBuildingId("11110--0-0001-0000")).toBeNull();
    expect(parseBuildingId("-----")).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(parseBuildingId("")).toBeNull();
    expect(parseBuildingId(undefined as unknown as string)).toBeNull();
  });

  it("round-trips with encodeBuildingId", () => {
    const id = encodeBuildingId("41135", "11000", "0", "0123", "0045");
    const parsed = parseBuildingId(id)!;
    expect(encodeBuildingId(parsed.sigunguCd, parsed.bjdongCd, parsed.platGbCd, parsed.bun, parsed.ji)).toBe(id);
  });
});
