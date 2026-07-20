// src/lib/__tests__/building-metadata-title.test.ts
// P2-14 — unit tests for the pure buildingMetadataTitle helper that derives
// the <title> string from a raw /building/[id] url segment.

import { describe, it, expect } from "vitest";
import { buildingMetadataTitle } from "@/app/building/[id]/page";

describe("buildingMetadataTitle (P2-14)", () => {
  it("produces a title containing sigunguCd and bjdongCd for a valid id", () => {
    const title = buildingMetadataTitle("11110-10100-0-0001-0000");
    expect(title).toContain("11110");
    expect(title).toContain("10100");
    expect(title).toContain("GreenRetrofit Simulator");
  });

  it("returns a safe fallback for a malformed id (too few segments)", () => {
    expect(buildingMetadataTitle("bad-id")).toBe(
      "건물 정보 | GreenRetrofit Simulator"
    );
  });

  it("returns a safe fallback for an empty string", () => {
    expect(buildingMetadataTitle("")).toBe(
      "건물 정보 | GreenRetrofit Simulator"
    );
  });

  it("returns a safe fallback for extra segments", () => {
    expect(buildingMetadataTitle("11110-10100-0-0001-0000-extra")).toBe(
      "건물 정보 | GreenRetrofit Simulator"
    );
  });

  it("never leaks raw env vars or secrets into the title", () => {
    const title = buildingMetadataTitle("41135-11000-0-0123-0045");
    expect(title).not.toMatch(/process\.env/);
    expect(title).not.toMatch(/API_KEY/i);
  });
});
