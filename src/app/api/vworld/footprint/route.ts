import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const VWORLD_DATA_URL = "https://api.vworld.kr/req/data";
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN ?? "localhost";

/** Campus mode requests this many parcels; used to derive the truncated flag. */
const CAMPUS_BBOX_SIZE = 20;

/** A finite-number coordinate parsed from a query string (rejects NaN/blank). */
const finiteCoord = z
  .string()
  .refine((s) => s.trim() !== "" && Number.isFinite(Number(s)), "must be a finite number")
  .transform((s) => Number(s));

const bboxSchema = z.object({
  minLng: finiteCoord,
  minLat: finiteCoord,
  maxLng: finiteCoord,
  maxLat: finiteCoord,
});

/**
 * Proxy route to fetch building footprint polygons from VWorld.
 * Uses the 연속지적도 (LP_PA_CBND_BUBUN) dataset.
 *
 * Query params (single footprint):
 *   pnu - 19-digit Parcel Number Unit (시군구코드 + 법정동코드 + 대지구분 + 본번 + 부번)
 *   or
 *   address - Korean address string for geocoding lookup
 *   or
 *   lat, lng - coordinates to search within a bounding box
 *   or
 *   sigunguCd + bjdongCd + bun [+ ji + platGbCd]
 *
 * Query params (campus bbox mode):
 *   bboxMode=true
 *   minLng, minLat, maxLng, maxLat - bounding box in WGS84
 *   Returns: { footprints: Array<{ pnu: string; polygon: number[][][] }>, error: string | null }
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    // P1-06 (b): server misconfiguration → 503, not 500.
    return NextResponse.json(
      { polygon: null, error: "VWorld API is not configured on this server" },
      { status: 503 }
    );
  }

  const { searchParams } = request.nextUrl;
  const bboxMode = searchParams.get("bboxMode") === "true";

  // ── Campus bbox mode: return all footprints within a bounding box ───────────
  if (bboxMode) {
    const parsed = bboxSchema.safeParse({
      minLng: searchParams.get("minLng") ?? "",
      minLat: searchParams.get("minLat") ?? "",
      maxLng: searchParams.get("maxLng") ?? "",
      maxLat: searchParams.get("maxLat") ?? "",
    });
    if (!parsed.success) {
      // P1-06 (b): bad/NaN bbox params → 400, not a BOX(NaN,...) query.
      return NextResponse.json(
        {
          footprints: [],
          error: "bboxMode requires finite minLng, minLat, maxLng, maxLat",
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        },
        { status: 400 }
      );
    }

    try {
      const { minLng, minLat, maxLng, maxLat } = parsed.data;
      const footprints = await fetchByExplicitBBox(minLng, minLat, maxLng, maxLat, apiKey);
      // truncated: we requested CAMPUS_BBOX_SIZE — a full page means more may exist.
      const truncated = footprints.length >= CAMPUS_BBOX_SIZE;
      return NextResponse.json({ footprints, error: null, truncated });
    } catch (err) {
      // P1-06 (b): upstream failure → 502, never HTTP 200 with error set.
      return NextResponse.json(
        { footprints: [], error: err instanceof Error ? err.message : "VWorld API error" },
        { status: 502 }
      );
    }
  }

  // ── Single footprint mode ───────────────────────────────────────────────────
  const pnu = searchParams.get("pnu");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const address = searchParams.get("address");
  const sigunguCd = searchParams.get("sigunguCd");
  const bjdongCd = searchParams.get("bjdongCd");
  const bun = searchParams.get("bun");
  const ji = searchParams.get("ji");
  const platGbCd = searchParams.get("platGbCd") || "0";

  try {
    let polygonData = null;

    // Method 1: Use PNU directly
    if (pnu) {
      polygonData = await fetchByPNU(pnu, apiKey);
    }
    // Method 2: Construct PNU from building ledger codes
    else if (sigunguCd && bjdongCd && bun) {
      // PNU format: 시군구코드(5) + 법정동코드(5) + 대지구분(1) + 본번(4) + 부번(4) = 19 digits
      const constructedPnu = sigunguCd + bjdongCd + platGbCd + (bun || "0000").padStart(4, "0") + (ji || "0000").padStart(4, "0");
      polygonData = await fetchByPNU(constructedPnu, apiKey);
    }
    // Method 3: Search by bounding box around coordinates
    else if (lat && lng) {
      polygonData = await fetchByBBox(parseFloat(lat), parseFloat(lng), apiKey);
    }
    // Method 4: Geocode address first, then search
    else if (address) {
      const coords = await geocodeAddress(address, apiKey);
      if (coords) {
        polygonData = await fetchByBBox(coords.lat, coords.lng, apiKey);
      }
    }

    // No parcel found is a legitimate 200 with polygon: null.
    return NextResponse.json({ polygon: polygonData?.rings ?? null, parcelCount: polygonData?.parcelCount ?? null, error: null });
  } catch (err) {
    // P1-06 (b): upstream failure → 502, never HTTP 200 with error set.
    return NextResponse.json(
      { polygon: null, error: err instanceof Error ? err.message : "VWorld API error" },
      { status: 502 }
    );
  }
}

/** Result of extractPolygon — rings for the chosen parcel plus metadata. */
interface ExtractedPolygon {
  rings: number[][][];
  /** Number of polygon parts in the source MultiPolygon (1 for Polygon type). */
  parcelCount: number;
}

async function fetchByPNU(pnu: string, apiKey: string): Promise<ExtractedPolygon | null> {
  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", "LP_PA_CBND_BUBUN");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("attrFilter", `pnu:=:${pnu}`);
  url.searchParams.set("size", "1");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  // P1-06 (b): upstream non-OK is a FAILURE (→ 502), distinct from "found nothing".
  if (!res.ok) throw new Error(`VWorld responded ${res.status}`);

  const data = await res.json();
  return extractPolygon(data);
}

async function fetchByBBox(lat: number, lng: number, apiKey: string): Promise<ExtractedPolygon | null> {
  // Search in a ~50m bounding box around the point
  const delta = 0.0005; // ~50m
  const bbox = `BOX(${lng - delta},${lat - delta},${lng + delta},${lat + delta})`;

  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", "LP_PA_CBND_BUBUN");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("geomFilter", bbox);
  url.searchParams.set("size", "1");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`VWorld responded ${res.status}`);

  const data = await res.json();
  return extractPolygon(data);
}

/** Fetch all cadastral parcels within an explicit bounding box for campus mode. */
async function fetchByExplicitBBox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  apiKey: string
): Promise<Array<{ pnu: string; polygon: number[][][] }>> {
  const bbox = `BOX(${minLng},${minLat},${maxLng},${maxLat})`;

  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", "LP_PA_CBND_BUBUN");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("geomFilter", bbox);
  url.searchParams.set("size", "20");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`VWorld responded ${res.status}`);

  const data = await res.json();
  return extractFootprintList(data);
}

async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://api.vworld.kr/req/address");
  url.searchParams.set("service", "address");
  url.searchParams.set("request", "getCoord");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("address", address);
  url.searchParams.set("refine", "true");
  url.searchParams.set("simple", "false");
  url.searchParams.set("format", "json");
  url.searchParams.set("type", "PARCEL");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const data = await res.json();
    const point = data?.response?.result?.point;
    if (point) {
      return { lat: parseFloat(point.y), lng: parseFloat(point.x) };
    }
  } catch {
    // Geocoding failed — non-critical
  }
  return null;
}

/**
 * Compute the unsigned shoelace area of a 2D ring (coordinates as [lng, lat] pairs).
 * Used only for comparing relative parcel sizes — absolute value is not important.
 */
function ringArea(ring: number[][]): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function extractPolygon(data: unknown): ExtractedPolygon | null {
  try {
    const response = data as {
      response?: {
        status?: string;
        result?: {
          featureCollection?: {
            features?: Array<{
              geometry?: {
                type?: string;
                coordinates?: number[][][][];
              };
            }>;
          };
        };
      };
    };

    if (response?.response?.status !== "OK") return null;

    const features = response.response?.result?.featureCollection?.features;
    if (!features || features.length === 0) return null;

    const geometry = features[0].geometry;
    if (!geometry?.coordinates) return null;

    // Handle both Polygon and MultiPolygon (VWorld returns MultiPolygon for cadastral parcels)
    let rings: number[][][];
    let parcelCount: number;

    if (geometry.type === "MultiPolygon") {
      // P2-11: pick the polygon part with the largest outer-ring area, not just [0].
      const polygons = geometry.coordinates as number[][][][];
      parcelCount = polygons.length;

      let bestIdx = 0;
      let bestArea = -1;
      for (let i = 0; i < polygons.length; i++) {
        const outerRing = polygons[i]?.[0];
        if (!outerRing || outerRing.length < 3) continue;
        const area = ringArea(outerRing);
        if (area > bestArea) {
          bestArea = area;
          bestIdx = i;
        }
      }
      rings = (polygons[bestIdx] as number[][][]) ?? [];
    } else {
      // Polygon: coordinates is [outerRing, ...holes]
      rings = geometry.coordinates as unknown as number[][][];
      parcelCount = 1;
    }

    // Filter degenerate rings (< 3 points)
    rings = rings.filter((ring) => ring.length >= 3);
    if (rings.length === 0) return null;

    // Return raw WGS84 [lng, lat] rings — NO equirectangular projection here.
    // Projection is handled client-side via gis-transform.ts (proj4).
    return { rings, parcelCount };
  } catch {
    return null;
  }
}

/**
 * Extract multiple footprints from a VWorld GetFeature response.
 * Returns raw outer-ring coordinates as [lng, lat] arrays (GeoJSON order)
 * so the campus hook can project them relative to campus center.
 */
function extractFootprintList(data: unknown): Array<{ pnu: string; polygon: number[][][] }> {
  try {
    const response = data as {
      response?: {
        status?: string;
        result?: {
          featureCollection?: {
            features?: Array<{
              properties?: Record<string, unknown>;
              geometry?: {
                type?: string;
                coordinates?: number[][][][];
              };
            }>;
          };
        };
      };
    };

    if (response?.response?.status !== "OK") return [];

    const features = response.response?.result?.featureCollection?.features;
    if (!features || features.length === 0) return [];

    const results: Array<{ pnu: string; polygon: number[][][] }> = [];

    for (const feature of features) {
      const pnu = String(feature.properties?.pnu ?? "");
      const geometry = feature.geometry;
      if (!geometry?.coordinates) continue;

      // MultiPolygon: coordinates[polygon][ring][point]
      // Return all rings of all polygon parts as a GeoJSON Polygon coordinates array
      const coords = geometry.coordinates[0]; // first polygon part
      if (!coords || coords.length === 0) continue;

      // Filter out degenerate rings
      const rings = coords.filter((ring) => ring.length >= 3);
      if (rings.length === 0) continue;

      results.push({ pnu, polygon: rings });
    }

    return results;
  } catch {
    return [];
  }
}
