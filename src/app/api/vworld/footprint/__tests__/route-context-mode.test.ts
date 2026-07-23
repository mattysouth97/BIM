// src/app/api/vworld/footprint/__tests__/route-context-mode.test.ts
// P2-26 — contextMode tests: 400 bad params, 503 no key, 502 upstream,
// 200 parses neighbors + truncated flag, attributes null-not-fabricated.
// All pre-existing route tests (route.test.ts) must remain unmodified and green.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

function makeReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/vworld/footprint?${query}`);
}

async function importRoute() {
  vi.resetModules();
  return import("../route");
}

describe("GET /api/vworld/footprint?contextMode=true (P2-26)", () => {
  beforeEach(() => {
    vi.stubEnv("VWORLD_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // ── 503 — no API key ────────────────────────────────────────────────────────
  it("returns 503 when VWORLD_API_KEY is unset", async () => {
    vi.stubEnv("VWORLD_API_KEY", "");
    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5&lng=127.0"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.neighbors).toBeUndefined(); // 503 body uses polygon: null contract
    expect(body.error).toBeTruthy();
  });

  // ── 400 — NaN lat ───────────────────────────────────────────────────────────
  it("returns 400 when lat is NaN", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=abc&lng=127.0"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.neighbors).toBeDefined();
    expect(body.neighbors).toEqual([]);
    expect(body.error).toBeTruthy();
  });

  // ── 400 — missing lng ───────────────────────────────────────────────────────
  it("returns 400 when lng is missing", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5"));
    expect(res.status).toBe(400);
  });

  // ── 400 — radius out of range (> 500) ───────────────────────────────────────
  it("clamps radius to [50, 500] — does NOT return 400 for out-of-range, clamps silently", async () => {
    // Per brief: clamped to [50, 500], not a validation error
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { status: "OK", result: { featureCollection: { features: [] } } } }),
      })
    );
    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5&lng=127.0&radius=9999"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.neighbors).toEqual([]);
    expect(body.truncated).toBe(false);
    expect(body.error).toBeNull();
  });

  // ── 502 — upstream throws ───────────────────────────────────────────────────
  it("returns 502 when upstream fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5&lng=127.0"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.neighbors).toEqual([]);
    expect(body.error).toBeTruthy();
  });

  // ── 502 — upstream non-OK HTTP status ──────────────────────────────────────
  it("returns 502 when upstream returns non-OK HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5&lng=127.0"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  // ── 200 — parses neighbors, not truncated ──────────────────────────────────
  it("200 with parsed neighbors array and truncated=false when < 30 features", async () => {
    function squareRing(lng: number, lat: number, side: number): number[][] {
      return [
        [lng, lat],
        [lng + side, lat],
        [lng + side, lat + side],
        [lng, lat + side],
      ];
    }
    const features = [
      {
        properties: { pnu: "1234567890100010000", buld_hg: "12.5", gro_flo_co: "4" },
        geometry: { type: "MultiPolygon", coordinates: [[squareRing(127.01, 37.51, 0.001)]] },
      },
      {
        properties: { pnu: "9876543210100010000", buld_hg: null, gro_flo_co: "2" },
        geometry: { type: "Polygon", coordinates: [squareRing(127.02, 37.52, 0.001)] },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: { status: "OK", result: { featureCollection: { features } } },
        }),
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5&lng=127.0"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.truncated).toBe(false);
    expect(Array.isArray(body.neighbors)).toBe(true);
    expect(body.neighbors).toHaveLength(2);

    const [n0, n1] = body.neighbors;

    // First neighbor: pnu + polygon + attributes
    expect(n0.pnu).toBe("1234567890100010000");
    expect(Array.isArray(n0.polygon)).toBe(true);
    expect(n0.polygon.length).toBeGreaterThanOrEqual(1);
    expect(n0.height).toBe(12.5);
    expect(n0.groundFloors).toBe(4);

    // Second neighbor: null height (null buld_hg — never fabricated AFF-6)
    expect(n1.pnu).toBe("9876543210100010000");
    expect(n1.height).toBeNull();
    expect(n1.groundFloors).toBe(2);
  });

  // ── 200 — truncated=true when exactly 30 features returned ─────────────────
  it("truncated=true when 30 features returned (size=30 full page)", async () => {
    function squareRing(lng: number, lat: number, side: number): number[][] {
      return [
        [lng, lat],
        [lng + side, lat],
        [lng + side, lat + side],
        [lng, lat + side],
      ];
    }
    const features = Array.from({ length: 30 }, (_, i) => ({
      properties: { pnu: `pnu${i}` },
      geometry: { type: "MultiPolygon", coordinates: [[squareRing(127 + i * 0.001, 37, 0.001)]] },
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: { status: "OK", result: { featureCollection: { features } } },
        }),
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5&lng=127.0"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.neighbors).toHaveLength(30);
    expect(body.error).toBeNull();
  });

  // ── 200 — attributes null-not-fabricated (AFF-6) ────────────────────────────
  it("attributes are null when absent or zero, never fabricated", async () => {
    const features = [
      {
        // buld_hg=0 → height null; no gro_flo_co → groundFloors null
        properties: { pnu: "aaa", buld_hg: "0" },
        geometry: {
          type: "Polygon",
          coordinates: [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37.001]]],
        },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: { status: "OK", result: { featureCollection: { features } } },
        }),
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("contextMode=true&lat=37.5&lng=127.0"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.neighbors[0].height).toBeNull();
    expect(body.neighbors[0].groundFloors).toBeNull();
  });

  // ── 200 — default radius used when radius param omitted ────────────────────
  it("uses default radius 150m when radius param is not provided", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => ({
            response: { status: "OK", result: { featureCollection: { features: [] } } },
          }),
        };
      })
    );

    const { GET } = await importRoute();
    await GET(makeReq("contextMode=true&lat=37.5&lng=127.0"));

    // The URL may be percent-encoded; decode before asserting on BOX(...) content
    const decoded = decodeURIComponent(capturedUrl);
    // The BOX should encode a radius of ~150m → ~0.00135 degrees lat
    expect(decoded).toContain("BOX(");
    // data param must be LT_C_SPBD
    expect(decoded).toContain("LT_C_SPBD");
    // size=30
    expect(decoded).toContain("size=30");
  });
});
