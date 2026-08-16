// src/lib/__tests__/building-metadata-title.test.ts
// P2-14 — unit tests for the pure buildingMetadataTitle helper that derives
// the <title> string from a raw /building/[id] url segment.

import { describe, it, expect } from "vitest";
import {
  buildingMetadataTitle,
  isRoutableBuildingId,
} from "@/app/building/[id]/page";

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

  // ─── P2-24 — cad-first drafts route through /building/[id] ────────────────

  it("gives cad drafts a distinct draft title (no fabricated ledger codes)", () => {
    const title = buildingMetadataTitle("cad-c8a95604-8b0d-4cbc-8044-d6683475a1d4");
    expect(title).toBe("CAD 트윈 드래프트 | GreenRetrofit Simulator");
  });
});

describe("isRoutableBuildingId (P2-24)", () => {
  it("accepts a valid 5-segment ledger id", () => {
    expect(isRoutableBuildingId("11110-10100-0-0001-0000")).toBe(true);
  });

  it("accepts a cad-first draft id (server must not 404 it)", () => {
    expect(isRoutableBuildingId("cad-c8a95604-8b0d-4cbc-8044-d6683475a1d4")).toBe(true);
  });

  it("rejects malformed ids", () => {
    expect(isRoutableBuildingId("bad-id")).toBe(false);
    expect(isRoutableBuildingId("")).toBe(false);
    expect(isRoutableBuildingId("11110-10100-0-0001-0000-extra")).toBe(false);
  });
});
