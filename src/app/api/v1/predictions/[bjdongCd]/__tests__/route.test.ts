// src/app/api/v1/predictions/[bjdongCd]/__tests__/route.test.ts
// API contract tests for GET /api/v1/predictions/{bjdongCd} — Phase 35 Task 9.
// 4 cases: valid, unknown bjdongCd, no release (data-unavailable), rate-limit.

import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, __setReleaseStoreForTests, __resetReleaseStoreForTests } from "../route";
import type { ReleaseStore } from "@/lib/portfolio/release-store";
import type { PredictionsResult } from "@/lib/portfolio/types";

function makeRequest(bjdongCd: string, ip = "203.0.113.1"): NextRequest {
  const req = new Request(`http://localhost/api/v1/predictions/${bjdongCd}`, {
    headers: { "x-vercel-forwarded-for": ip },
  });
  return req as unknown as NextRequest;
}

function makeFakeStore(result: PredictionsResult): ReleaseStore {
  return {
    getManifest: async () => null,
    listReleases: async () => [],
    getCalibration: async () => null,
    getPredictions: async () => result,
  };
}

describe("GET /api/v1/predictions/[bjdongCd]", () => {
  afterEach(() => {
    __resetReleaseStoreForTests();
  });

  it("returns 400 for a malformed bjdongCd", async () => {
    const res = await GET(makeRequest("abc"), { params: Promise.resolve({ bjdongCd: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 with rows for a valid bjdongCd", async () => {
    const row = {
      bjdongCd: "1111010100",
      buildingPk: "pk-1",
      predictedEuiKwhPerSqmYr: 120,
      predictedGrade: "3",
      modelVersion: "xgb-1.3.2",
      generatedAt: "2026-04-22T00:00:00Z",
    };
    __setReleaseStoreForTests(
      makeFakeStore({
        status: "ok",
        rows: [row],
        releaseVersion: "v0.1.0",
        schemaVersion: "1.0.0",
        generatedAt: "2026-04-22T00:00:00Z",
      })
    );

    const res = await GET(makeRequest("1111010100", "203.0.113.10"), {
      params: Promise.resolve({ bjdongCd: "1111010100" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([row]);
    expect(body.releaseVersion).toBe("v0.1.0");
    expect(body.schemaVersion).toBe("1.0.0");
  });

  it("returns 404 for an unknown bjdongCd", async () => {
    __setReleaseStoreForTests(makeFakeStore({ status: "unknown-region" }));

    const res = await GET(makeRequest("9999999999", "203.0.113.11"), {
      params: Promise.resolve({ bjdongCd: "9999999999" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 503 when no release is published, without leaking internal detail", async () => {
    __setReleaseStoreForTests(
      makeFakeStore({ status: "data-unavailable", reason: "No release has been published yet" })
    );

    const res = await GET(makeRequest("1111010100", "203.0.113.12"), {
      params: Promise.resolve({ bjdongCd: "1111010100" }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "release-data-unavailable" });
    expect(body.detail).toBeUndefined();
    expect(body.reason).toBeUndefined();
  });

  it("returns 429 after exceeding 60 requests/min from the same IP", async () => {
    __setReleaseStoreForTests(makeFakeStore({ status: "unknown-region" }));
    const ip = "203.0.113.99";

    let lastRes;
    for (let i = 0; i < 61; i++) {
      lastRes = await GET(makeRequest("1111010100", ip), {
        params: Promise.resolve({ bjdongCd: "1111010100" }),
      });
    }
    expect(lastRes!.status).toBe(429);
  });

  it("prefers x-vercel-forwarded-for over x-real-ip for client IP derivation", async () => {
    __setReleaseStoreForTests(makeFakeStore({ status: "unknown-region" }));

    const req = new Request("http://localhost/api/v1/predictions/1111010100", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.20",
        "x-real-ip": "198.51.100.20",
      },
    }) as unknown as NextRequest;

    const res = await GET(req, { params: Promise.resolve({ bjdongCd: "1111010100" }) });
    expect(res.status).toBe(404);
  });

  it("falls back to x-real-ip when x-vercel-forwarded-for is absent", async () => {
    __setReleaseStoreForTests(makeFakeStore({ status: "unknown-region" }));

    const req = new Request("http://localhost/api/v1/predictions/1111010100", {
      headers: { "x-real-ip": "198.51.100.21" },
    }) as unknown as NextRequest;

    const res = await GET(req, { params: Promise.resolve({ bjdongCd: "1111010100" }) });
    expect(res.status).toBe(404);
  });

  it("ignores raw x-forwarded-for and falls back to 'unknown' bucket when no trusted IP header is present", async () => {
    __setReleaseStoreForTests(makeFakeStore({ status: "unknown-region" }));

    const req = new Request("http://localhost/api/v1/predictions/1111010100", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    }) as unknown as NextRequest;

    const res = await GET(req, { params: Promise.resolve({ bjdongCd: "1111010100" }) });
    expect(res.status).toBe(404);
  });
});
