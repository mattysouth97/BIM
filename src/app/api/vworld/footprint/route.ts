import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const VWORLD_DATA_URL = "https://api.vworld.kr/req/data";
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN ?? "localhost";

/** GIS건물통합정보 — actual building outline + measured attributes (P2-25, preferred). */
const BUILDING_DATASET = "LT_C_SPBD";
/** 연속지적도 필지 — cadastral parcel boundary (named fallback when no building feature). */
const PARCEL_DATASET = "LP_PA_CBND_BUBUN";

/** Campus mode requests this many parcels; used to derive the truncated flag. */
const CAMPUS_BBOX_SIZE = 20;

/** Context mode requests this many neighboring buildings; used to derive truncated flag. */
const CONTEXT_BBOX_SIZE = 30;

/** Default search radius in meters for contextMode. Clamped to [50, 500]. */
const CONTEXT_RADIUS_DEFAULT_M = 150;
const CONTEXT_RADIUS_MIN_M = 50;
const CONTEXT_RADIUS_MAX_M = 500;

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

const contextModeSchema = z.object({
  lat: finiteCoord,
  lng: finiteCoord,
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
  const contextMode = searchParams.get("contextMode") === "true";

  // ── Context mode: return neighbor buildings around a point ──────────────────
  if (contextMode) {
    const parsed = contextModeSchema.safeParse({
      lat: searchParams.get("lat") ?? "",
      lng: searchParams.get("lng") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          neighbors: [],
          truncated: false,
          error: "contextMode requires finite lat and lng",
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        },
        { status: 400 }
      );
    }

    const { lat, lng } = parsed.data;

    // Clamp radius to [50, 500] — never a validation error, silently clamped.
    const rawRadius = Number(searchParams.get("radius") ?? CONTEXT_RADIUS_DEFAULT_M);
    const radiusM = Number.isFinite(rawRadius)
      ? Math.max(CONTEXT_RADIUS_MIN_M, Math.min(CONTEXT_RADIUS_MAX_M, rawRadius))
      : CONTEXT_RADIUS_DEFAULT_M;

    // Convert meters → approximate degrees.
    const deltaLat = radiusM / 111320;
    const deltaLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
    const bbox = `BOX(${lng - deltaLng},${lat - deltaLat},${lng + deltaLng},${lat + deltaLat})`;

    try {
      const neighbors = await fetchNeighborBuildings(bbox, apiKey);
      const truncated = neighbors.length >= CONTEXT_BBOX_SIZE;
      return NextResponse.json({ neighbors, truncated, error: null });
    } catch (err) {
      // P2-26: upstream failure → 502 (AFF-2, no parcel fallback for contextMode).
      return NextResponse.json(
        { neighbors: [], truncated: false, error: err instanceof Error ? err.message : "VWorld API error" },
        { status: 502 }
      );
    }
  }

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
    // P2-25: prefer the actual building outline (GIS건물통합정보, LT_C_SPBD) over
    // the cadastral parcel. Parcel is the NAMED fallback when the building layer
    // has no usable feature; `source` reports which layer won.
    let polygonData: ExtractedPolygon | null = null;
    let source: "building" | "parcel" | null = null;
    let attributes: BuildingAttributes | null = null;

    // Resolve the query to a PNU (Methods 1-2) or a point (Methods 3-4).
    // PNU format: 시군구코드(5) + 법정동코드(5) + 대지구분(1) + 본번(4) + 부번(4) = 19 digits
    const resolvedPnu =
      pnu ??
      (sigunguCd && bjdongCd && bun
        ? sigunguCd + bjdongCd + platGbCd + (bun || "0000").padStart(4, "0") + (ji || "0000").padStart(4, "0")
        : null);

    let point: { lat: number; lng: number } | null = null;
    if (!resolvedPnu) {
      if (lat && lng) point = { lat: parseFloat(lat), lng: parseFloat(lng) };
      else if (address) point = await geocodeAddress(address, apiKey);
    }

    if (resolvedPnu) {
      // Several buildings can share one parcel PNU — take the largest outline.
      const building = pickLargest(await fetchBuildingCandidates({ attrFilter: `pnu:=:${resolvedPnu}` }, apiKey));
      if (building) {
        polygonData = { rings: building.rings, parcelCount: building.parcelCount };
        source = "building";
        attributes = parseBuildingAttributes(building.properties);
      } else {
        polygonData = await fetchByPNU(resolvedPnu, apiKey);
        if (polygonData) source = "parcel";
      }
    } else if (point) {
      // A ~50m search box can straddle a neighbor's larger building — take the
      // outline nearest the query point, not the largest.
      const delta = 0.0005; // ~50m
      const bbox = `BOX(${point.lng - delta},${point.lat - delta},${point.lng + delta},${point.lat + delta})`;
      const building = pickNearest(await fetchBuildingCandidates({ geomFilter: bbox }, apiKey), point.lng, point.lat);
      if (building) {
        polygonData = { rings: building.rings, parcelCount: building.parcelCount };
        source = "building";
        attributes = parseBuildingAttributes(building.properties);
      } else {
        polygonData = await fetchByBBox(point.lat, point.lng, apiKey);
        if (polygonData) source = "parcel";
      }
    }

    // No feature found on either layer is a legitimate 200 with polygon: null.
    return NextResponse.json({
      polygon: polygonData?.rings ?? null,
      parcelCount: polygonData?.parcelCount ?? null,
      source,
      attributes,
      error: null,
    });
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
  url.searchParams.set("data", PARCEL_DATASET);
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
  url.searchParams.set("data", PARCEL_DATASET);
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
  url.searchParams.set("data", PARCEL_DATASET);
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
  // First feature wins (parcel queries use size=1); P2-11 largest-part selection
  // and degenerate-ring filtering live in extractFeatureCandidates.
  const candidate = extractFeatureCandidates(data)[0];
  return candidate ? { rings: candidate.rings, parcelCount: candidate.parcelCount } : null;
}

// ---------------------------------------------------------------------------
// P2-25 — building layer (LT_C_SPBD) candidates, selection, and attributes
// ---------------------------------------------------------------------------

/** Measured building attributes from GIS건물통합정보 feature properties. */
interface BuildingAttributes {
  /** Building height in meters (buld_hg) — null when absent or non-positive. */
  height: number | null;
  /** Ground floor count (gro_flo_co) — null when absent or non-positive. */
  groundFloors: number | null;
  /** Underground floor count (und_flo_co) — null when absent or non-positive. */
  undergroundFloors: number | null;
}

/** One parsed feature from a VWorld GetFeature response, ready for selection. */
interface FeatureCandidate {
  rings: number[][][];
  /** Number of polygon parts in the source MultiPolygon (1 for Polygon type). */
  parcelCount: number;
  /** Unsigned shoelace area of the outer ring (relative comparison only). */
  area: number;
  /** Outer-ring vertex centroid as [lng, lat]. */
  centroid: [number, number];
  properties: Record<string, unknown>;
}

/**
 * Parse every feature of a VWorld GetFeature response into candidates.
 * For MultiPolygon features the largest-area part is kept (P2-11 rule);
 * degenerate rings (< 3 points) are dropped. Returns raw WGS84 [lng, lat]
 * rings — projection is handled client-side via gis-transform.ts (proj4).
 */
function extractFeatureCandidates(data: unknown): FeatureCandidate[] {
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

    const candidates: FeatureCandidate[] = [];

    for (const feature of features) {
      const geometry = feature.geometry;
      if (!geometry?.coordinates) continue;

      let rings: number[][][];
      let parcelCount: number;

      if (geometry.type === "MultiPolygon") {
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

      rings = rings.filter((ring) => ring.length >= 3);
      const outer = rings[0];
      if (!outer) continue;

      const centroid: [number, number] = [
        outer.reduce((s, p) => s + p[0], 0) / outer.length,
        outer.reduce((s, p) => s + p[1], 0) / outer.length,
      ];

      candidates.push({
        rings,
        parcelCount,
        area: ringArea(outer),
        centroid,
        properties: feature.properties ?? {},
      });
    }

    return candidates;
  } catch {
    return [];
  }
}

/**
 * Query the building layer (LT_C_SPBD). Failure here is NOT fatal — the caller
 * falls back to the cadastral parcel, so upstream errors return [] rather than
 * throwing. Only a parcel-layer failure surfaces the 502 contract.
 */
async function fetchBuildingCandidates(
  filter: { attrFilter?: string; geomFilter?: string },
  apiKey: string
): Promise<FeatureCandidate[]> {
  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", BUILDING_DATASET);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  if (filter.attrFilter) url.searchParams.set("attrFilter", filter.attrFilter);
  if (filter.geomFilter) url.searchParams.set("geomFilter", filter.geomFilter);
  url.searchParams.set("size", "10");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    return extractFeatureCandidates(await res.json());
  } catch {
    return [];
  }
}

function pickLargest(candidates: FeatureCandidate[]): FeatureCandidate | null {
  let best: FeatureCandidate | null = null;
  for (const c of candidates) {
    if (!best || c.area > best.area) best = c;
  }
  return best;
}

function pickNearest(candidates: FeatureCandidate[], lng: number, lat: number): FeatureCandidate | null {
  let best: FeatureCandidate | null = null;
  let bestDistSq = Infinity;
  for (const c of candidates) {
    const distSq = (c.centroid[0] - lng) ** 2 + (c.centroid[1] - lat) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = c;
    }
  }
  return best;
}

/** Positive finite number or null — absent/zero/junk is NEVER fabricated (AFF-6). */
function toPositiveNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse measured attributes from GIS건물통합정보 properties. Tolerates both
 * documented VWorld field spellings (WFS lowercase vs shapefile-derived).
 */
function parseBuildingAttributes(props: Record<string, unknown>): BuildingAttributes {
  return {
    height: toPositiveNumber(props.buld_hg ?? props.height),
    groundFloors: toPositiveNumber(props.gro_flo_co ?? props.grnd_flr),
    undergroundFloors: toPositiveNumber(props.und_flo_co ?? props.ugrnd_flr),
  };
}

// ---------------------------------------------------------------------------
// P2-26 — context mode: neighbor buildings from a bbox query on LT_C_SPBD
// ---------------------------------------------------------------------------

/** One neighbor building returned by the contextMode response. */
interface NeighborBuilding {
  pnu: string;
  polygon: number[][][];
  height: number | null;
  groundFloors: number | null;
}

/**
 * Fetch all building outlines within a bounding box for context (neighbor) mode.
 * Uses LT_C_SPBD (GIS건물통합정보) — same dataset as the single-building path.
 * Upstream non-OK or throw → caller surfaces as 502 (no parcel fallback: AFF-2).
 */
async function fetchNeighborBuildings(bbox: string, apiKey: string): Promise<NeighborBuilding[]> {
  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", BUILDING_DATASET);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("geomFilter", bbox);
  url.searchParams.set("size", String(CONTEXT_BBOX_SIZE));
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`VWorld responded ${res.status}`);

  return extractNeighborList(await res.json());
}

/**
 * Extract neighbor building records from a VWorld GetFeature response.
 * Returns pnu, outer-ring polygon, and parsed height/floor attributes.
 * Degenerate rings (< 3 points) are skipped. Never fabricates attribute values (AFF-6).
 */
function extractNeighborList(data: unknown): NeighborBuilding[] {
  try {
    const candidates = extractFeatureCandidates(data);
    const results: NeighborBuilding[] = [];

    for (const candidate of candidates) {
      const pnu = String(candidate.properties.pnu ?? "");
      const attrs = parseBuildingAttributes(candidate.properties);
      results.push({
        pnu,
        polygon: candidate.rings,
        height: attrs.height,
        groundFloors: attrs.groundFloors,
      });
    }

    return results;
  } catch {
    return [];
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
