// src/app/api/v1/eco2-imports/__tests__/route.test.ts
// Tests for POST /api/v1/eco2-imports — Phase 35 Task 10.
// 3 cases: 503 in production, 401 without key, 200 happy-path in dev.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const ORIGINAL_CWD = process.cwd();

function makeFeatureVector() {
  return {
    gfaSqm: 1200, floorCountAbove: 5, floorCountBelow: 1, buildingHeightM: 15,
    constructionYear: 2005, structureTypeCode: 1, useTypeCode: 1, mainPurpsCode: 14000,
    bcRat: 0.5, vlRat: 2.4, platAreaSqm: 400,
    footprintAreaSqm: 200, aspectRatio: 1.4, perimeterM: 62, compactness: 0.65,
    wallUValuePrior: 0.4, windowUValuePrior: 2.0, windowShgcPrior: 0.5,
    lightingPowerDensityPrior: 8,
    climateZoneCode: 0,
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const req = new Request("http://localhost/api/v1/eco2-imports", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
  return req as unknown as NextRequest;
}

describe("POST /api/v1/eco2-imports", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eco2-imports-test-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(ORIGINAL_CWD);
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns 503 outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest({ buildingPk: "pk-1", featureVector: makeFeatureVector(), eco2Result: { grade: "3", demand: 100, co2: 10 } })
    );
    expect(res.status).toBe(503);
  });

  it("returns 401 in development without a matching x-corpus-key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CORPUS_API_KEY", "secret-key");
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest(
        { buildingPk: "pk-1", featureVector: makeFeatureVector(), eco2Result: { grade: "3", demand: 100, co2: 10 } },
        { "x-corpus-key": "wrong-key" }
      )
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 in development when x-corpus-key header is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CORPUS_API_KEY", "secret-key");
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest({ buildingPk: "pk-1", featureVector: makeFeatureVector(), eco2Result: { grade: "3", demand: 100, co2: 10 } })
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 and appends a corpus row in development with a valid key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CORPUS_API_KEY", "secret-key");
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest(
        { buildingPk: "pk-1", featureVector: makeFeatureVector(), eco2Result: { grade: "3", demand: 100, co2: 10 } },
        { "x-corpus-key": "secret-key" }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(true);

    const corpusPath = path.join(tempDir, "ml", "portfolio", "corpus", "predictions.jsonl");
    const raw = await fs.readFile(corpusPath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row.source).toBe("eco2_labeled");
    expect(row.buildingPk).toBe("pk-1");
    expect(row.prediction).toEqual({ grade: "3", demand: 100, co2: 10 });
  });

  it("returns 400 for a malformed body in development with valid key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CORPUS_API_KEY", "secret-key");
    const { POST } = await import("../route");

    const res = await POST(makeRequest({ buildingPk: "pk-1" }, { "x-corpus-key": "secret-key" }));
    expect(res.status).toBe(400);
  });
});
