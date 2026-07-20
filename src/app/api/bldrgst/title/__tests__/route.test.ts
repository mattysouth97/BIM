// src/app/api/bldrgst/title/__tests__/route.test.ts
// P1-06 (d) — bounded batch fan-out: cap at 10 codes, parallel dispatch,
// per-code failure tolerance, 20-item cap preserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/lib/api-proxy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-proxy")>("@/lib/api-proxy");
  return { ...actual, fetchFromDataGoKr: fetchMock };
});

import { GET } from "../route";
import { MAX_BATCH_CODES } from "../route";

function makeReq(query: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/bldrgst/title?${query}`, { headers });
}

function itemsResponse(n: number) {
  return {
    data: { response: { body: { items: { item: Array.from({ length: n }, (_, i) => ({ i })) }, totalCount: n } } },
    error: null,
  };
}

describe("GET /api/bldrgst/title batch mode (P1-06 d)", () => {
  beforeEach(() => fetchMock.mockReset());

  it("caps upstream calls at MAX_BATCH_CODES and reports truncation", async () => {
    fetchMock.mockResolvedValue(itemsResponse(1));
    const codes = Array.from({ length: 25 }, (_, i) => `code${i}`).join(",");
    const res = await GET(makeReq(`batchMode=true&sigunguCd=11110&bjdongCd=${codes}`, { "x-api-key": "k" }));

    expect(res.status).toBe(200);
    // Exactly MAX_BATCH_CODES upstream calls, not 25.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_BATCH_CODES);
    const body = await res.json();
    expect(body.truncated).toBe(true);
  });

  it("dispatches codes in parallel (all calls fire before any resolves)", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    fetchMock.mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return itemsResponse(1);
    });
    const codes = ["a", "b", "c", "d"].join(",");
    await GET(makeReq(`batchMode=true&sigunguCd=11110&bjdongCd=${codes}`, { "x-api-key": "k" }));
    expect(maxConcurrent).toBeGreaterThan(1); // parallel, not sequential
  });

  it("tolerates per-code failures and surfaces them in failedCodes", async () => {
    fetchMock.mockImplementation(async (_endpoint: unknown, params: { bjdongCd?: string }) => {
      if (params?.bjdongCd === "bad") return { data: null, error: "boom" };
      return itemsResponse(1);
    });
    const res = await GET(makeReq(`batchMode=true&sigunguCd=11110&bjdongCd=good,bad`, { "x-api-key": "k" }));
    const body = await res.json();
    expect(body.failedCodes).toContain("bad");
    expect(body.items.length).toBeGreaterThan(0); // good code still returned
  });

  it("preserves the 20-item cap", async () => {
    fetchMock.mockResolvedValue(itemsResponse(15));
    const codes = ["a", "b", "c"].join(",");
    const res = await GET(makeReq(`batchMode=true&sigunguCd=11110&bjdongCd=${codes}`, { "x-api-key": "k" }));
    const body = await res.json();
    expect(body.items.length).toBe(20);
  });

  it("returns 401 without x-api-key", async () => {
    const res = await GET(makeReq("batchMode=true&sigunguCd=11110"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when sigunguCd is missing in batch mode", async () => {
    const res = await GET(makeReq("batchMode=true&bjdongCd=a,b", { "x-api-key": "k" }));
    expect(res.status).toBe(400);
  });
});
