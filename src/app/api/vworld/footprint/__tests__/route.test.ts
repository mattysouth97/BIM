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

// ---------------------------------------------------------------------------
// P2-11 — MultiPolygon largest-area parcel selection + parcelCount metadata
// ---------------------------------------------------------------------------

describe("GET /api/vworld/footprint — MultiPolygon largest-area selection (P2-11)", () => {
  beforeEach(() => {
    vi.stubEnv("VWORLD_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /**
   * Build a square ring [lng, lat] with the given side length (degrees).
   * The ring has 4 distinct vertices (degenerate ≥3 requirement satisfied).
   */
  function squareRing(originLng: number, originLat: number, side: number): number[][] {
    return [
      [originLng,        originLat],
      [originLng + side, originLat],
      [originLng + side, originLat + side],
      [originLng,        originLat + side],
    ];
  }

  it("picks the largest-area polygon from a 3-part MultiPolygon", async () => {
    // Three polygons: small (0.01²), medium (0.05²), large (0.1²).
    // The third polygon should be selected.
    const smallRing  = squareRing(127, 37, 0.01);
    const mediumRing = squareRing(127, 37, 0.05);
    const largeRing  = squareRing(127, 37, 0.1);

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
                  {
                    geometry: {
                      type: "MultiPolygon",
                      // coordinates: array of polygons, each polygon is [outerRing, ...holes]
                      coordinates: [
                        [smallRing],   // polygon 0 — smallest
                        [mediumRing],  // polygon 1 — medium
                        [largeRing],   // polygon 2 — largest
                      ],
                    },
                  },
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

    // The returned ring's bounding box should match the large ring (side=0.1)
    const ring = body.polygon[0] as number[][];
    const lngs = ring.map((p: number[]) => p[0]);
    const lats = ring.map((p: number[]) => p[1]);
    const width  = Math.max(...lngs) - Math.min(...lngs);
    const height = Math.max(...lats) - Math.min(...lats);
    // The large ring has side=0.1; allow ±0.001 tolerance
    expect(width).toBeCloseTo(0.1, 2);
    expect(height).toBeCloseTo(0.1, 2);
  });

  it("response includes parcelCount equal to the number of MultiPolygon parts", async () => {
    const ring = squareRing(127, 37, 0.05);
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
                  {
                    geometry: {
                      type: "MultiPolygon",
                      coordinates: [[ring], [squareRing(127.2, 37.2, 0.03)]],
                    },
                  },
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
    expect(body.parcelCount).toBe(2);
  });

  it("single-Polygon response is byte-identical (parcelCount absent or 1, polygon unchanged)", async () => {
    const ring = squareRing(127, 37, 0.05);
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
                  {
                    geometry: {
                      type: "Polygon",
                      coordinates: [ring],
                    },
                  },
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
    // parcelCount should be 1 for a single Polygon (not undefined)
    expect(body.parcelCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// P2-25 — Building-layer (LT_C_SPBD) outline preferred over parcel, with
// measured attributes; parcel (LP_PA_CBND_BUBUN) is the named fallback.
// ---------------------------------------------------------------------------

describe("GET /api/vworld/footprint — building layer preference (P2-25)", () => {
  beforeEach(() => {
    vi.stubEnv("VWORLD_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function squareRing(originLng: number, originLat: number, side: number): number[][] {
    return [
      [originLng,        originLat],
      [originLng + side, originLat],
      [originLng + side, originLat + side],
      [originLng,        originLat + side],
    ];
  }

  function vwFeature(ring: number[][], properties: Record<string, unknown> = {}) {
    return { properties, geometry: { type: "MultiPolygon", coordinates: [[ring]] } };
  }

  function okBody(features: unknown[]) {
    return { response: { status: "OK", result: { featureCollection: { features } } } };
  }

  /** Stub fetch, dispatching on the VWorld dataset named in the request URL. */
  function stubVworld(handlers: {
    building?: () => { ok: boolean; status?: number; body?: unknown };
    parcel?: () => { ok: boolean; status?: number; body?: unknown };
  }) {
    const calls = { building: 0, parcel: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        const handler = url.includes("LT_C_SPBD")
          ? (calls.building++, handlers.building)
          : url.includes("LP_PA_CBND_BUBUN")
            ? (calls.parcel++, handlers.parcel)
            : undefined;
        const result = handler?.() ?? { ok: true, body: okBody([]) };
        return {
          ok: result.ok,
          status: result.status ?? (result.ok ? 200 : 500),
          json: async () => result.body ?? {},
        };
      })
    );
    return calls;
  }

  it("prefers the building layer: source 'building' + parsed attributes, parcel not queried", async () => {
    const calls = stubVworld({
      building: () => ({
        ok: true,
        body: okBody([
          vwFeature(squareRing(127, 37, 0.001), {
            buld_hg: "43.5",
            gro_flo_co: "12",
            und_flo_co: "3",
          }),
        ]),
      }),
    });

    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.source).toBe("building");
    expect(Array.isArray(body.polygon)).toBe(true);
    expect(body.attributes).toEqual({ height: 43.5, groundFloors: 12, undergroundFloors: 3 });
    expect(calls.parcel).toBe(0);
  });

  it("falls back to the parcel layer when the building layer has no features", async () => {
    stubVworld({
      building: () => ({ ok: true, body: okBody([]) }),
      parcel: () => ({ ok: true, body: okBody([vwFeature(squareRing(127, 37, 0.01))]) }),
    });

    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.source).toBe("parcel");
    expect(body.attributes).toBeNull();
    expect(Array.isArray(body.polygon)).toBe(true);
    expect(body.parcelCount).toBe(1);
  });

  it("falls back to the parcel layer when the building layer responds non-OK (resilient, still 200)", async () => {
    stubVworld({
      building: () => ({ ok: false, status: 500 }),
      parcel: () => ({ ok: true, body: okBody([vwFeature(squareRing(127, 37, 0.01))]) }),
    });

    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("parcel");
    expect(Array.isArray(body.polygon)).toBe(true);
  });

  it("never fabricates attributes: zero/absent values become null, valid ones parse", async () => {
    stubVworld({
      building: () => ({
        ok: true,
        body: okBody([
          vwFeature(squareRing(127, 37, 0.001), { buld_hg: "0", gro_flo_co: "5" }),
        ]),
      }),
    });

    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    const body = await res.json();
    expect(body.source).toBe("building");
    expect(body.attributes).toEqual({ height: null, groundFloors: 5, undergroundFloors: null });
  });

  it("tolerates the alternate VWorld field spellings (height/grnd_flr/ugrnd_flr)", async () => {
    stubVworld({
      building: () => ({
        ok: true,
        body: okBody([
          vwFeature(squareRing(127, 37, 0.001), { height: "20", grnd_flr: "4", ugrnd_flr: "1" }),
        ]),
      }),
    });

    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    const body = await res.json();
    expect(body.attributes).toEqual({ height: 20, groundFloors: 4, undergroundFloors: 1 });
  });

  it("PNU mode picks the largest-area building feature", async () => {
    stubVworld({
      building: () => ({
        ok: true,
        body: okBody([
          vwFeature(squareRing(127, 37, 0.0002), { buld_hg: "10" }),
          vwFeature(squareRing(127.001, 37.001, 0.001), { buld_hg: "50" }),
        ]),
      }),
    });

    const { GET } = await importRoute();
    const res = await GET(makeReq("pnu=1111010100100010000"));
    const body = await res.json();
    const ring = body.polygon[0] as number[][];
    const lngs = ring.map((p: number[]) => p[0]);
    const width = Math.max(...lngs) - Math.min(...lngs);
    expect(width).toBeCloseTo(0.001, 4);
    expect(body.attributes.height).toBe(50);
  });

  it("point mode picks the building nearest the query point, not the largest", async () => {
    stubVworld({
      building: () => ({
        ok: true,
        body: okBody([
          // Near, small building right at the query point
          vwFeature(squareRing(127.0004, 37.0004, 0.0002), { buld_hg: "10" }),
          // Far, much larger building at the box edge
          vwFeature(squareRing(127.004, 37.004, 0.002), { buld_hg: "80" }),
        ]),
      }),
    });

    const { GET } = await importRoute();
    const res = await GET(makeReq("lat=37.0005&lng=127.0005"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("building");
    const ring = body.polygon[0] as number[][];
    const lngs = ring.map((p: number[]) => p[0]);
    const width = Math.max(...lngs) - Math.min(...lngs);
    expect(width).toBeCloseTo(0.0002, 4);
    expect(body.attributes.height).toBe(10);
  });
});
