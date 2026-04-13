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

interface VWorldFootprintItem {
  pnu: string;
  polygon: number[][][];
}

interface VWorldBBoxResponse {
  footprints: VWorldFootprintItem[];
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

  const res = await fetch(`/api/bldrgst/title?${params.toString()}`, {
    headers: { "x-api-key": apiKey },
  });

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

  // Fetch buildings and footprints in parallel
  const [rawBuildings, rawFootprints] = await Promise.all([
    fetchBatchBuildings(sigunguCd, bjdongCd, apiKey),
    fetchBBoxFootprints(bounds),
  ]);

  // Build a PNU → footprint map for O(1) lookup
  const footprintByPnu = new Map<string, VWorldFootprintItem>();
  for (const fp of rawFootprints) {
    if (fp.pnu) footprintByPnu.set(fp.pnu, fp);
  }

  // Cap at MAX_BUILDINGS
  const buildings = rawBuildings.slice(0, MAX_BUILDINGS);

  const campusBuildings: CampusBuilding[] = buildings.map((b) => {
    const pnu = buildingPnu(b);
    const fpItem = footprintByPnu.get(pnu);

    let footprint: GeoJsonPolygon | undefined;
    let position: { x: number; y: number } | undefined;

    if (fpItem) {
      footprint = { type: "Polygon", coordinates: fpItem.polygon };

      const centroid = polygonCentroid(fpItem.polygon);
      if (centroid) {
        position = lngLatToMeters(centroid.lng, centroid.lat, center.lng, center.lat);
      }
    }

    return { building: b, footprint, position };
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
 * - Requires a valid API key in the app store.
 * - Caps at 20 buildings per campus.
 * - 5 minute stale time.
 */
export function useCampusBuildings(params: UseCampusBuildingsParams | null) {
  const apiKey = useAppStore((s) => s.apiKey);

  return useQuery({
    queryKey: ["campus", params],
    queryFn: () =>
      fetchCampusData(params!.bounds, params!.sigunguCd, params!.bjdongCd, apiKey),
    enabled: params !== null && !!apiKey,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
}
