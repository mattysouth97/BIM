// src/app/api/vworld/footprint/__tests__/route-bbox-building-layer.test.ts
// P2-28 — bboxMode with layer=building: queries LT_C_SPBD (not LP_PA_CBND_BUBUN),
// returns per-item attributes; default (no layer / layer=parcel) is byte-identical
// to today — LP_PA_CBND_BUBUN dataset, same response envelope.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

function makeReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/vworld/footprint?${query}`);
}

async function importRoute() {
  vi.resetModules();
  return import("../route");
}

function squareRing(originLng: number, originLat: number, side: number): number[][] {
  return [
    [originLng, originLat],
    [originLng + side, originLat],
    [originLng + side, originLat + side],
    [originLng, originLat + side],
  ];
}

function okBody(features: unknown[]) {
  return { response: { status: "OK", result: { featureCollection: { features } } } };
}

describe("GET /api/vworld/footprint?bboxMode=true&layer=building (P2-28)", () => {
  beforeEach(() => {
    vi.stubEnv("VWORLD_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // ── Default (no layer param) must still query LP_PA_CBND_BUBUN ─────────────
  it("default bboxMode (no layer) queries the PARCEL dataset LP_PA_CBND_BUBUN", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => okBody([]),
        };
      })
    );

    const { GET } = await importRoute();
    await GET(makeReq("bboxMode=true&minLng=127&minLat=37&maxLng=128&maxLat=38"));

    const decoded = decodeURIComponent(capturedUrl);
    expect(decoded).toContain("LP_PA_CBND_BUBUN");
    expect(decoded).not.toContain("LT_C_SPBD");
  });

  // ── layer=parcel explicit must also query LP_PA_CBND_BUBUN ─────────────────
  it("bboxMode with layer=parcel queries LP_PA_CBND_BUBUN (explicit parcel)", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => okBody([]),
        };
      })
    );

    const { GET } = await importRoute();
    await GET(makeReq("bboxMode=true&layer=parcel&minLng=127&minLat=37&maxLng=128&maxLat=38"));

    const decoded = decodeURIComponent(capturedUrl);
    expect(decoded).toContain("LP_PA_CBND_BUBUN");
    expect(decoded).not.toContain("LT_C_SPBD");
  });

  // ── layer=building must query LT_C_SPBD with size=30 ──────────────────────
  it("layer=building queries LT_C_SPBD with size=30", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => okBody([]),
        };
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&layer=building&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(200);

    const decoded = decodeURIComponent(capturedUrl);
    expect(decoded).toContain("LT_C_SPBD");
    expect(decoded).not.toContain("LP_PA_CBND_BUBUN");
    expect(decoded).toContain("size=30");
  });

  // ── layer=building returns per-item attributes ─────────────────────────────
  it("layer=building returns footprints with pnu + polygon + height + groundFloors", async () => {
    const features = [
      {
        properties: { pnu: "1111010100100010000", buld_hg: "43.5", gro_flo_co: "12" },
        geometry: { type: "MultiPolygon", coordinates: [[squareRing(127, 37, 0.001)]] },
      },
      {
        properties: { pnu: "2222020200200020000", buld_hg: "0", gro_flo_co: "3" },
        geometry: { type: "Polygon", coordinates: [squareRing(127.01, 37.01, 0.001)] },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => okBody(features),
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&layer=building&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.footprints)).toBe(true);
    expect(body.footprints).toHaveLength(2);

    const [f0, f1] = body.footprints;

    // First footprint — valid height
    expect(f0.pnu).toBe("1111010100100010000");
    expect(Array.isArray(f0.polygon)).toBe(true);
    expect(f0.height).toBe(43.5);
    expect(f0.groundFloors).toBe(12);

    // Second footprint — buld_hg=0 → height null (AFF-6)
    expect(f1.pnu).toBe("2222020200200020000");
    expect(f1.height).toBeNull();
    expect(f1.groundFloors).toBe(3);
  });

  // ── layer=building truncated flag at 30 ───────────────────────────────────
  it("layer=building: truncated=true when 30 features returned", async () => {
    const features = Array.from({ length: 30 }, (_, i) => ({
      properties: { pnu: `pnu${i}`, buld_hg: "10" },
      geometry: { type: "MultiPolygon", coordinates: [[squareRing(127 + i * 0.001, 37, 0.001)]] },
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => okBody(features),
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&layer=building&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.footprints).toHaveLength(30);
    expect(body.error).toBeNull();
  });

  // ── layer=building: 502 on upstream failure ────────────────────────────────
  it("layer=building: 502 when upstream fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&layer=building&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  // ── layer=building: multiple buildings per PNU — all returned ─────────────
  it("layer=building: multiple features with the same PNU are all returned", async () => {
    const sharedPnu = "1111010100100010000";
    const features = [
      {
        properties: { pnu: sharedPnu, buld_hg: "20" },
        geometry: { type: "MultiPolygon", coordinates: [[squareRing(127, 37, 0.001)]] },
      },
      {
        properties: { pnu: sharedPnu, buld_hg: "15" },
        geometry: { type: "MultiPolygon", coordinates: [[squareRing(127.005, 37, 0.0005)]] },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => okBody(features),
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&layer=building&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Both buildings with the same PNU must be returned — client picks
    expect(body.footprints).toHaveLength(2);
    expect(body.footprints[0].pnu).toBe(sharedPnu);
    expect(body.footprints[1].pnu).toBe(sharedPnu);
  });

  // ── Default parcel response envelope is byte-identical ────────────────────
  it("default bboxMode response envelope is unchanged: { footprints, truncated, error }", async () => {
    const features = Array.from({ length: 5 }, (_, i) => ({
      properties: { pnu: `pnu${i}` },
      geometry: { type: "MultiPolygon", coordinates: [[squareRing(127 + i * 0.001, 37, 0.001)]] },
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => okBody(features),
      })
    );

    const { GET } = await importRoute();
    const res = await GET(makeReq("bboxMode=true&minLng=127&minLat=37&maxLng=128&maxLat=38"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.truncated).toBe(false);
    expect(Array.isArray(body.footprints)).toBe(true);
    expect(body.footprints).toHaveLength(5);
    // Parcel mode footprints have pnu + polygon only (no height/groundFloors)
    expect(body.footprints[0].pnu).toBeDefined();
    expect(body.footprints[0].polygon).toBeDefined();
  });
});
