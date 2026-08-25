// src/lib/__tests__/building-metadata-title.test.ts
// P2-14 — unit tests for the pure buildingMetadataTitle helper that derives
// the <title> string from a raw /building/[id] url segment.

import { describe, it, expect } from "vitest";
import {
  buildingMetadataTitle,
  isRoutableBuildingId,
} from "@/app/building/[id]/page";
import { parseBuildingId } from "@/lib/constants";

describe("buildingMetadataTitle (P2-14)", () => {
  it("produces a title containing sigunguCd and bjdongCd for a valid id", () => {
    const title = buildingMetadataTitle("11110-10100-0-0001-0000");
    expect(title).toContain("11110");
    expect(title).toContain("10100");
    expect(title).toContain("BIMFIT");
  });

  it("returns a safe fallback for a malformed id (too few segments)", () => {
    expect(buildingMetadataTitle("bad-id")).toBe(
      "건물 정보 | BIMFIT"
    );
  });

  it("returns a safe fallback for an empty string", () => {
    expect(buildingMetadataTitle("")).toBe(
      "건물 정보 | BIMFIT"
    );
  });

  it("returns a safe fallback for extra segments", () => {
    expect(buildingMetadataTitle("11110-10100-0-0001-0000-extra")).toBe(
      "건물 정보 | BIMFIT"
    );
  });

  it("never leaks raw env vars or secrets into the title", () => {
    const title = buildingMetadataTitle("41135-11000-0-0123-0045");
    expect(title).not.toMatch(/process\.env/);
    expect(title).not.toMatch(/API_KEY/i);
  });

  // ─── P2-24 — cad-first drafts route through /building/[id] ────────────────

  it("reframes the reserved legacy slugs as diagnostic entry methods", () => {
    expect(buildingMetadataTitle("demo")).toBe("Sample Energy Diagnostic | BIMFIT");
    expect(buildingMetadataTitle("drawing")).toBe("Create Energy Diagnostic | BIMFIT");
  });

  it("gives retired cad-draft ids only the fallback title (surface removed)", () => {
    // The CAD drafting surface was cut from the product; a stale cad- URL is
    // just a malformed id now, never a fabricated ledger title.
    const title = buildingMetadataTitle("cad-c8a95604-8b0d-4cbc-8044-d6683475a1d4");
    expect(title).toBe("건물 정보 | BIMFIT");
  });

  // ─── Generated designs route through /building/[id] too ───────────────────

  it("titles a generated design by its id — the only fact the server has", () => {
    // The design's name lives in the browser's IndexedDB, which generateMetadata
    // runs too early (and on the wrong machine) to read.
    expect(buildingMetadataTitle("GEN-0042")).toBe("생성 설계 GEN-0042 | BIMFIT");
    expect(buildingMetadataTitle("GEN-0042.3")).toBe("생성 설계 GEN-0042.3 | BIMFIT");
  });
});

describe("isRoutableBuildingId (P2-24)", () => {
  it("accepts a valid 5-segment ledger id", () => {
    expect(isRoutableBuildingId("11110-10100-0-0001-0000")).toBe(true);
  });

  it("404s a cad-first draft id (the drafting surface was retired)", () => {
    expect(isRoutableBuildingId("cad-c8a95604-8b0d-4cbc-8044-d6683475a1d4")).toBe(false);
  });

  it("accepts the reserved demo and drawing slugs", () => {
    expect(isRoutableBuildingId("demo")).toBe(true);
    expect(isRoutableBuildingId("drawing")).toBe(true);
  });

  it("accepts a generated design id (the studio's 'Open in workspace' target)", () => {
    expect(isRoutableBuildingId("GEN-0042")).toBe(true);
    expect(isRoutableBuildingId("GEN-0042.3")).toBe(true);
  });

  it("rejects malformed ids", () => {
    expect(isRoutableBuildingId("bad-id")).toBe(false);
    expect(isRoutableBuildingId("")).toBe(false);
    expect(isRoutableBuildingId("11110-10100-0-0001-0000-extra")).toBe(false);
    // Near-misses of the generated shape are not routable either.
    expect(isRoutableBuildingId("GEN-42")).toBe(false);
    expect(isRoutableBuildingId("GEN-0042.")).toBe(false);
  });
});

describe("parseBuildingId stays a ledger parser", () => {
  it("does not invent ledger coordinates for a generated design", () => {
    // A design has no 시군구/법정동/번지. Returning sentinel codes here would
    // hand the ledger hooks a location nobody surveyed — the workspace branches
    // on isGeneratedPk before any of this runs.
    expect(parseBuildingId("GEN-0042")).toBeNull();
  });
});
