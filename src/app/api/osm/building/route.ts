// src/app/api/osm/building/route.ts
//
// GET /api/osm/building — the building outline OpenStreetMap holds, if any.
//
// This is the second independent shape source. It matters for two reasons:
// VWorld and OSM are digitised by different people from different imagery, so
// where they agree the outline is genuinely corroborated, and where they
// disagree the user is looking at a real disagreement worth showing. It also
// needs no API key, so it answers for buildings and deployments where the
// government layer does not.
//
// Proxied rather than called from the browser for three reasons: the OSM
// services require an identifying User-Agent that a browser will not let us
// set, their usage policy expects a single identified caller rather than every
// visitor's IP, and the responses are cacheable across users.
//
// Nothing here interprets the building. Tag reading and grading live in
// src/lib/cad-reconstruction/osm-source.ts, which is pure and tested.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** OSM's usage policy requires a real application identity, not a browser UA. */
const CONTACT = process.env.OSM_CONTACT_EMAIL?.trim() || "namseunghun97@gmail.com";
const USER_AGENT = `BIMFIT/1.0 (Korean building-energy diagnostics; ${CONTACT})`;

const SEARCH_RADIUS_DEFAULT_M = 60;
const SEARCH_RADIUS_MIN_M = 20;
const SEARCH_RADIUS_MAX_M = 250;

/** Both upstreams are rate-limited and slow; a day of reuse is generous. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

export const dynamic = "force-dynamic";
export const maxDuration = 40;

const finiteCoord = z
  .string()
  .refine((s) => s.trim() !== "" && Number.isFinite(Number(s)), "must be a finite number")
  .transform((s) => Number(s));

interface OsmBuildingResponse {
  polygon: number[][][] | null;
  osmType: "way" | "relation" | null;
  osmId: number | null;
  tags: Record<string, string>;
  /** Where the point came from, so the caller can grade the match. */
  resolvedBy: "coordinates" | "address" | null;
  error: string | null;
}

const cache = new Map<string, { at: number; body: OsmBuildingResponse }>();

function cacheGet(key: string): OsmBuildingResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.body;
}

function cacheSet(key: string, body: OsmBuildingResponse): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), body });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const address = searchParams.get("address")?.trim() || null;

  let point: { lat: number; lng: number } | null = null;
  let resolvedBy: "coordinates" | "address" | null = null;

  if (latRaw !== null && lngRaw !== null) {
    const parsed = z
      .object({ lat: finiteCoord, lng: finiteCoord })
      .safeParse({ lat: latRaw, lng: lngRaw });
    if (!parsed.success) {
      return NextResponse.json(
        {
          polygon: null,
          osmType: null,
          osmId: null,
          tags: {},
          resolvedBy: null,
          error: "lat and lng must be finite numbers",
        },
        { status: 400 },
      );
    }
    point = parsed.data;
    resolvedBy = "coordinates";
  } else if (!address) {
    return NextResponse.json(
      {
        polygon: null,
        osmType: null,
        osmId: null,
        tags: {},
        resolvedBy: null,
        error: "either lat+lng or address is required",
      },
      { status: 400 },
    );
  }

  const rawRadius = Number(searchParams.get("radius") ?? SEARCH_RADIUS_DEFAULT_M);
  const radiusM = Number.isFinite(rawRadius)
    ? Math.max(SEARCH_RADIUS_MIN_M, Math.min(SEARCH_RADIUS_MAX_M, rawRadius))
    : SEARCH_RADIUS_DEFAULT_M;

  const cacheKey = point
    ? `p:${point.lat.toFixed(6)},${point.lng.toFixed(6)}:${radiusM}`
    : `a:${address}:${radiusM}`;
  const cached = cacheGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // Nominatim often returns the building's own way id for a street address,
    // which is a far tighter match than a radius search around a rooftop point.
    let directId: { type: "way" | "relation"; id: number } | null = null;
    if (!point && address) {
      const geocoded = await geocode(address);
      if (!geocoded) {
        const body: OsmBuildingResponse = {
          polygon: null,
          osmType: null,
          osmId: null,
          tags: {},
          resolvedBy: null,
          error: null,
        };
        cacheSet(cacheKey, body);
        return NextResponse.json(body);
      }
      point = { lat: geocoded.lat, lng: geocoded.lng };
      resolvedBy = "address";
      directId = geocoded.osm;
    }

    if (!point) {
      return NextResponse.json(
        {
          polygon: null,
          osmType: null,
          osmId: null,
          tags: {},
          resolvedBy: null,
          error: "could not resolve a point to search",
        },
        { status: 400 },
      );
    }

    const elements = await overpass(buildQuery(point, radiusM, directId));
    const feature = pickFeature(elements, point, directId);

    const body: OsmBuildingResponse = {
      polygon: feature?.polygon ?? null,
      osmType: feature?.osmType ?? null,
      osmId: feature?.osmId ?? null,
      tags: feature?.tags ?? {},
      resolvedBy: feature ? resolvedBy : null,
      error: null,
    };
    cacheSet(cacheKey, body);
    return NextResponse.json(body);
  } catch {
    // Upstream failure is a 502, never a 200 that reads as "no building here".
    // Fixed message — upstream content is never echoed back.
    return NextResponse.json(
      {
        polygon: null,
        osmType: null,
        osmId: null,
        tags: {},
        resolvedBy: null,
        error: "OpenStreetMap upstream error",
      },
      { status: 502 },
    );
  }
}

async function geocode(
  address: string,
): Promise<{ lat: number; lng: number; osm: { type: "way" | "relation"; id: number } | null } | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "kr");
  url.searchParams.set("q", address);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ko,en" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);

  const data = (await res.json()) as Array<{
    lat?: string;
    lon?: string;
    osm_type?: string;
    osm_id?: number;
  }>;
  const first = Array.isArray(data) ? data[0] : undefined;
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = first.osm_type === "way" || first.osm_type === "relation" ? first.osm_type : null;
  return {
    lat,
    lng,
    osm: type && typeof first.osm_id === "number" ? { type, id: first.osm_id } : null,
  };
}

function buildQuery(
  point: { lat: number; lng: number },
  radiusM: number,
  directId: { type: "way" | "relation"; id: number } | null,
): string {
  const around = `${radiusM},${point.lat},${point.lng}`;
  const parts = [
    `way(around:${around})["building"];`,
    `relation(around:${around})["building"];`,
  ];
  // Ask for the geocoder's own object too: it may be tagged as a building even
  // when it sits just outside the radius (a large complex, an offset centroid).
  if (directId) parts.push(`${directId.type}(${directId.id});`);
  return `[out:json][timeout:25];(${parts.join("")});out geom tags;`;
}

interface OverpassElement {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ role?: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

async function overpass(query: string): Promise<OverpassElement[]> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const data = (await res.json()) as { elements?: OverpassElement[] };
  return Array.isArray(data.elements) ? data.elements : [];
}

interface PickedFeature {
  osmType: "way" | "relation";
  osmId: number;
  polygon: number[][][];
  tags: Record<string, string>;
}

/** Closed [lng, lat] ring from an Overpass geometry list, or null. */
function toRing(geometry: Array<{ lat: number; lon: number }> | undefined): number[][] | null {
  if (!geometry || geometry.length < 4) return null;
  const ring = geometry
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => [p.lon, p.lat]);
  return ring.length >= 4 ? ring : null;
}

function ringOf(element: OverpassElement): number[][] | null {
  if (element.type === "way") return toRing(element.geometry);
  if (element.type === "relation") {
    // Only the outer ring is used; an inner courtyard is not the footprint the
    // envelope is measured from, and stitching multipolygons is out of scope.
    const outer = element.members?.find((m) => m.role === "outer" && m.geometry);
    return toRing(outer?.geometry);
  }
  return null;
}

function ringArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function containsPoint(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The building the query was actually about.
 *
 * A radius search around a rooftop point routinely catches a neighbour, so
 * preference runs: the geocoder's own object, then any outline containing the
 * point, then the outline whose centroid is nearest. Largest-wins would hand
 * back the biggest neighbour on a dense block.
 */
function pickFeature(
  elements: OverpassElement[],
  point: { lat: number; lng: number },
  directId: { type: "way" | "relation"; id: number } | null,
): PickedFeature | null {
  const candidates: PickedFeature[] = [];
  for (const element of elements) {
    if (element.type !== "way" && element.type !== "relation") continue;
    if (typeof element.id !== "number") continue;
    const tags = element.tags ?? {};
    if (!tags.building) continue;
    // A rooftop annex or a bridged structure is tagged building=yes but starts
    // above ground; it is not this building's footprint. `min_height` and a
    // positive `layer` are how OSM says "this does not touch the ground".
    if (tags.min_height !== undefined) continue;
    if (Number(tags.layer ?? "0") > 0) continue;
    const ring = ringOf(element);
    if (!ring) continue;
    candidates.push({
      osmType: element.type,
      osmId: element.id,
      polygon: [ring],
      tags,
    });
  }
  if (candidates.length === 0) return null;

  if (directId) {
    const exact = candidates.find(
      (c) => c.osmType === directId.type && c.osmId === directId.id,
    );
    if (exact) return exact;
  }

  const containing = candidates.filter((c) => containsPoint(c.polygon[0], point.lng, point.lat));
  const pool = containing.length > 0 ? containing : candidates;

  // Among several containing outlines (a building inside a complex), the
  // tightest one is the building; otherwise fall back to nearest centroid.
  if (containing.length > 0) {
    return pool.reduce((best, c) => (ringArea(c.polygon[0]) < ringArea(best.polygon[0]) ? c : best));
  }

  let best = pool[0];
  let bestDist = Infinity;
  for (const c of pool) {
    const ring = c.polygon[0];
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const d = (cx - point.lng) ** 2 + (cy - point.lat) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
