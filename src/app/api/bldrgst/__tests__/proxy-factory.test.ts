// src/app/api/bldrgst/__tests__/proxy-factory.test.ts
// P1-06 (c, f) — the shared data.go.kr proxy factory: uniform error contract,
// zod param validation, and numOfRows clamping.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/lib/api-proxy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-proxy")>("@/lib/api-proxy");
  return { ...actual, fetchFromDataGoKr: fetchMock };
});

import { createDataGoKrProxy, MAX_NUM_OF_ROWS } from "../_factory";

function makeReq(query: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/bldrgst/areas?${query}`, { headers });
}

const OK_RESPONSE = {
  data: { response: { body: { items: { item: [{ a: 1 }] }, totalCount: 1 } } },
  error: null,
};

describe("createDataGoKrProxy (P1-06)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("produces a working GET handler for every endpoint key", async () => {
    for (const key of ["areas", "basis", "floors", "jijugu", "recap"] as const) {
      fetchMock.mockResolvedValueOnce(OK_RESPONSE);
      const GET = createDataGoKrProxy(key);
      const res = await GET(makeReq("sigunguCd=11110&bjdongCd=10100", { "x-api-key": "k" }));
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(key, expect.any(Object), "k");
    }
  });

  it("returns 401 without x-api-key", async () => {
    const GET = createDataGoKrProxy("areas");
    const res = await GET(makeReq("sigunguCd=11110"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 on upstream error", async () => {
    fetchMock.mockResolvedValueOnce({ data: null, error: "upstream down" });
    const GET = createDataGoKrProxy("areas");
    const res = await GET(makeReq("sigunguCd=11110", { "x-api-key": "k" }));
    expect(res.status).toBe(502);
  });

  it("clamps numOfRows above the maximum and echoes the clamped value", async () => {
    fetchMock.mockResolvedValueOnce(OK_RESPONSE);
    const GET = createDataGoKrProxy("areas");
    const res = await GET(makeReq("sigunguCd=11110&numOfRows=99999", { "x-api-key": "k" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.numOfRows).toBe(MAX_NUM_OF_ROWS);
    // The clamped value must reach the upstream fetcher, not the raw 99999.
    const [, params] = fetchMock.mock.calls[0];
    expect(Number(params.numOfRows)).toBe(MAX_NUM_OF_ROWS);
  });

  it("returns 400 with a zod issue list for a malformed param", async () => {
    const GET = createDataGoKrProxy("areas");
    // numOfRows must be a positive integer.
    const res = await GET(makeReq("sigunguCd=11110&numOfRows=abc", { "x-api-key": "k" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    // No secret / key echoed.
    expect(JSON.stringify(body)).not.toContain("x-api-key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
