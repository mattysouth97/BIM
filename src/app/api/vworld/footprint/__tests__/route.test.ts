// src/app/api/vworld/footprint/__tests__/route.test.ts
// P1-06 (b) — HTTP-honest error contract for the VWorld footprint proxy:
// 503 (server misconfig), 502 (upstream failure), 400 (bad params), and the
// campus truncated flag. Never HTTP 200 with error set.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

function makeReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/vworld/footprint?${query}`);
}

async function importRoute() {
  vi.resetModules();
  return import("../route");
}

describe("GET /api/vworld/footprint (P1-06 b)", () => {
  beforeEach(() => {
    vi.stubEnv("VWORLD_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns 503 (not 500) when VWORLD_API_KEY is unset", async () => {
    vi.stubEnv("VWORLD_API_KEY", "");
    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.polygon).toBeNull();
    expect(body.error).toBeTruthy();
  });

  it("returns 502 (never 200) when the upstream fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 for a NaN bbox param", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&minLng=abc&minLat=37&maxLng=127&maxLat=38"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when bbox params are missing", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&minLng=127"));
    expect(res.status).toBe(400);
  });

  it("returns 502 (never 200) when campus upstream throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(502);
  });

  it("campus success carries a truncated flag", async () => {
    // 20 features returned at size=20 ⇒ truncated=true (more may exist).
    const features = Array.from({ length: 20 }, (_, i) => ({
      properties: { pnu: `pnu${i}` },
      geometry: { type: "MultiPolygon", coordinates: [[[[127, 37], [127.1, 37], [127.1, 37.1]]]] },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { status: "OK", result: { featureCollection: { features } } } }),
      })
    );
    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.truncated).toBe(true);
    expect(body.footprints.length).toBe(20);
  });

  it("single-footprint success keeps { polygon, error: null }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            status: "OK",
            result: {
              featureCollection: {
                features: [
                  { geometry: { type: "MultiPolygon", coordinates: [[[[127, 37], [127.1, 37], [127.1, 37.1]]]] } },
                ],
              },
            },
          },
        }),
      })
    );
    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.polygon)).toBe(true);
  });
});
