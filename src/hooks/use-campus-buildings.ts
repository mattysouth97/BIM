"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import type { BrTitleInfo } from "@/lib/types";
import type { CampusBounds, CampusBuilding, CampusData, GeoJsonPolygon } from "@/lib/campus/campus-types";

// ─── Equirectangular projection constants for Korean latitudes ───────────────
const METERS_PER_DEGREE_LAT = 111_320;
const METERS_PER_DEGREE_LNG_AT_37N = 88_800; // 111320 * cos(37° * π/180)

const MAX_BUILDINGS = 20;

// ─── Internal response shapes ────────────────────────────────────────────────

interface TitleApiResponse {
  items: BrTitleInfo[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
}

export interface VWorldFootprintItem {
  pnu: string;
  polygon: number[][][];
}

/** Building-layer footprint item returned by bboxMode + layer=building (P2-28). */
export interface VWorldBuildingFootprintItem {
  pnu: string;
  polygon: number[][][];
  height: number | null;
  groundFloors: number | null;
}

interface VWorldBBoxResponse {
  footprints: VWorldFootprintItem[];
  error: string | null;
}

interface VWorldBuildingBBoxResponse {
  footprints: VWorldBuildingFootprintItem[];
  error: string | null;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchBatchBuildings(
  sigunguCd: string,
  bjdongCd: string | undefined,
  apiKey: string
): Promise<BrTitleInfo[]> {
  const params = new URLSearchParams({ batchMode: "true", sigunguCd });
  if (bjdongCd) params.set("bjdongCd", bjdongCd);

  // Send the visitor's own key when set; otherwise send no header so the
  // same-origin route uses the embedded shared demo key (see api-shared-key.ts).
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`/api/bldrgst/title?${params.toString()}`, { headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Title API failed (${res.status})`);
  }

  const data = await res.json() as TitleApiResponse;
  return data.items ?? [];
}

async function fetchBBoxFootprints(bounds: CampusBounds): Promise<VWorldFootprintItem[]> {
  const params = new URLSearchParams({
    bboxMode: "true",
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
  });

  const res = await fetch(`/api/vworld/footprint?${params.toString()}`);
  if (!res.ok) return [];

  const data = await res.json() as VWorldBBoxResponse;
  return data.footprints ?? [];
}

/**
 * Fetch building-layer footprints for a bbox (LT_C_SPBD via layer=building).
 * P2-28: building fetch failure ALWAYS degrades to [] — never rejects the campus query.
 * Exported for testability (degradation contract verified in unit tests).
 */
export async function fetchBBoxBuildingFootprints(bounds: CampusBounds): Promise<VWorldBuildingFootprintItem[]> {
  try {
    const params = new URLSearchParams({
      bboxMode: "true",
      layer: "building",
      minLng: String(bounds.minLng),
      minLat: String(bounds.minLat),
      maxLng: String(bounds.maxLng),
      maxLat: String(bounds.maxLat),
    });

    const res = await fetch(`/api/vworld/footprint?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];

    const data = await res.json() as VWorldBuildingBBoxResponse;
    return data.footprints ?? [];
  } catch {
    // Network error or timeout — degrade to [] (never reject the campus query).
    return [];
  }
}

// ─── Position computation ─────────────────────────────────────────────────────

/**
 * Derive an approximate lat/lng from a building record.
 * BrTitleInfo has no coordinate fields — we use the bun/ji parcel numbers
 * to construct a PNU and match against footprint centroids when available.
 * As a fallback, positions are left undefined.
 */
function buildingPnu(b: BrTitleInfo): string {
  const platGb = b.platGbCd || "0";
  const bun = (b.bun || "0").padStart(4, "0");
  const ji = (b.ji || "0").padStart(4, "0");
  return b.sigunguCd + b.bjdongCd + platGb + bun + ji;
}

function polygonCentroid(rings: number[][][]): { lng: number; lat: number } | null {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  const lng = outer.reduce((s, p) => s + p[0], 0) / outer.length;
  const lat = outer.reduce((s, p) => s + p[1], 0) / outer.length;
  return { lng, lat };
}

function lngLatToMeters(
  lng: number,
  lat: number,
  centerLng: number,
  centerLat: number
): { x: number; y: number } {
  // Simple equirectangular projection
  const metersPerLng = METERS_PER_DEGREE_LNG_AT_37N * Math.cos(((centerLat + lat) / 2) * (Math.PI / 180));
  return {
    x: (lng - centerLng) * metersPerLng,
    y: (lat - centerLat) * METERS_PER_DEGREE_LAT,
  };
}

/**
 * Compute the unsigned shoelace area of a 2D ring (coordinates as [lng, lat] pairs).
 * Used only for comparing relative building footprint sizes — absolute value not needed.
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

/**
 * From all building-layer features sharing a PNU, pick the one with the largest
 * outer-ring area. Multiple buildings can occupy a single cadastral parcel —
 * "largest outline" is the most prominent structure (P2-28 match semantics).
 */
export function selectLargestBuildingFootprintsByPnu(
  footprints: VWorldBuildingFootprintItem[],
): Map<string, VWorldBuildingFootprintItem> {
  const selected = new Map<string, VWorldBuildingFootprintItem>();
  const selectedArea = new Map<string, number>();

  for (const footprint of footprints) {
    if (!footprint.pnu) continue;
    const outer = footprint.polygon[0];
    if (!outer) continue;
    const area = ringArea(outer);
    if (area > (selectedArea.get(footprint.pnu) ?? -1)) {
      selected.set(footprint.pnu, footprint);
      selectedArea.set(footprint.pnu, area);
    }
  }

  return selected;
}

export interface ResolvedFootprint {
  polygon: number[][][];
  measuredHeightM: number | null;
}

export function resolveFootprintForPnu(
  pnu: string,
  buildingByPnu: Map<string, VWorldBuildingFootprintItem>,
  parcelByPnu: Map<string, VWorldFootprintItem>,
): ResolvedFootprint | null {
  const building = buildingByPnu.get(pnu);
  if (building) {
    return {
      polygon: building.polygon,
      measuredHeightM: building.height,
    };
  }

  const parcel = parcelByPnu.get(pnu);
  if (parcel) {
    return {
      polygon: parcel.polygon,
      measuredHeightM: null,
    };
  }

  return null;
}

// ─── Main query function ──────────────────────────────────────────────────────

async function fetchCampusData(
  bounds: CampusBounds,
  sigunguCd: string,
  bjdongCd: string | undefined,
  apiKey: string
): Promise<CampusData> {
  const center = {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };

  // P2-28: fetch buildings, parcel footprints, AND building footprints in parallel.
  // Building fetch failure degrades to [] — never rejects the campus query.
  const [rawBuildings, rawParcelFootprints, rawBuildingFootprints] = await Promise.all([
    fetchBatchBuildings(sigunguCd, bjdongCd, apiKey),
    fetchBBoxFootprints(bounds),
    fetchBBoxBuildingFootprints(bounds),
  ]);

  // Build a PNU → parcel footprint map for O(1) lookup (fallback)
  const parcelByPnu = new Map<string, VWorldFootprintItem>();
  for (const fp of rawParcelFootprints) {
    if (fp.pnu) parcelByPnu.set(fp.pnu, fp);
  }
  const buildingByPnu =
    selectLargestBuildingFootprintsByPnu(rawBuildingFootprints);

  // Cap at MAX_BUILDINGS
  const buildings = rawBuildings.slice(0, MAX_BUILDINGS);

  const campusBuildings: CampusBuilding[] = buildings.map((b) => {
    const pnu = buildingPnu(b);

    // P2-28: prefer building-layer footprint (largest-area per PNU); fall back to parcel.
    const resolved = resolveFootprintForPnu(pnu, buildingByPnu, parcelByPnu);
    const resolvedPolygon = resolved?.polygon ?? null;
    const measuredHeightM = resolved?.measuredHeightM ?? null;

    let footprint: GeoJsonPolygon | undefined;
    let position: { x: number; y: number } | undefined;

    if (resolvedPolygon) {
      footprint = { type: "Polygon", coordinates: resolvedPolygon };

      const centroid = polygonCentroid(resolvedPolygon);
      if (centroid) {
        position = lngLatToMeters(centroid.lng, centroid.lat, center.lng, center.lat);
      }
    }

    return { building: b, footprint, position, measuredHeightM };
  });

  return { bounds, buildings: campusBuildings, center };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCampusBuildingsParams {
  bounds: CampusBounds;
  /** 시군구코드 (5-digit district code) — required to query the building ledger API */
  sigunguCd: string;
  /** Optional 법정동코드 to narrow results to a specific 법정동 */
  bjdongCd?: string;
}

/**
 * Fetches all buildings within a campus bounding area and correlates them
 * with VWorld footprint polygons.
 *
 * Same key path as individual search: a visitor key if they set one,
 * otherwise the same-origin shared-key fallback on the proxy. Never treat
 * "query not run" as "zero buildings."
 * - Works with no API key: falls back to the embedded shared demo key
 *   (same-origin, rate-limited). A visitor's own key is used when set.
 * - Caps at 20 buildings per campus.
 * - 5 minute stale time.
 */
export function useCampusBuildings(params: UseCampusBuildingsParams | null) {
  const apiKey = useAppStore((s) => s.apiKey);

  return useQuery({
    queryKey: ["campus", params, apiKey || ""],
    queryFn: () =>
      fetchCampusData(params!.bounds, params!.sigunguCd, params!.bjdongCd, apiKey),
    enabled: params !== null,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
}
