"use client";

import { useQuery } from "@tanstack/react-query";
import { getDemoFootprintResult } from "@/lib/demo/demo-building";
import type { CampusBounds, GeoJsonPolygon } from "@/lib/campus/campus-types";

interface FootprintResult {
  polygon: number[][][] | null;
  error: string | null;
}

interface CampusFootprintItem {
  pnu: string;
  polygon: number[][][];
}

interface CampusFootprintsResult {
  footprints: Array<{ pnu: string; polygon: GeoJsonPolygon }>;
  error: string | null;
}

async function fetchFootprint(address: string): Promise<FootprintResult> {
  if (!address || address.trim() === "") return { polygon: null, error: null };

  // Demo mode (데모모드): the demo building's footprint is bundled — skip VWorld.
  const demo = getDemoFootprintResult(address);
  if (demo) return demo;

  const res = await fetch(
    `/api/vworld/footprint?address=${encodeURIComponent(address)}`
  );
  if (!res.ok) return { polygon: null, error: `HTTP ${res.status}` };
  return res.json();
}

async function fetchCampusFootprints(bounds: CampusBounds): Promise<CampusFootprintsResult> {
  const params = new URLSearchParams({
    bboxMode: "true",
    minLng: String(bounds.minLng),
    minLat: String(bounds.minLat),
    maxLng: String(bounds.maxLng),
    maxLat: String(bounds.maxLat),
  });

  const res = await fetch(`/api/vworld/footprint?${params.toString()}`);
  if (!res.ok) return { footprints: [], error: `HTTP ${res.status}` };

  const data = await res.json() as { footprints?: CampusFootprintItem[]; error?: string | null };

  const footprints = (data.footprints ?? []).map((item) => ({
    pnu: item.pnu,
    polygon: {
      type: "Polygon" as const,
      coordinates: item.polygon,
    },
  }));

  return { footprints, error: data.error ?? null };
}

/**
 * Fetches real building footprint polygon from VWorld cadastral data.
 * Returns coordinates in meters relative to the polygon centroid.
 */
export function useBuildingFootprint(address: string | undefined) {
  return useQuery({
    queryKey: ["footprint", address],
    queryFn: () => fetchFootprint(address || ""),
    enabled: !!address && address.trim().length > 0,
    staleTime: 1000 * 60 * 30, // cache for 30 min
    retry: 1,
  });
}

/**
 * Fetches all cadastral footprint polygons within a campus bounding box.
 * Returns GeoJSON Polygon coordinates (outer ring + holes) in [lng, lat] order.
 * Use with useCampusBuildings to correlate footprints with building records.
 */
export function useCampusFootprints(bounds: CampusBounds | null) {
  return useQuery({
    queryKey: ["campus-footprints", bounds],
    queryFn: () => fetchCampusFootprints(bounds!),
    enabled: bounds !== null,
    staleTime: 1000 * 60 * 30, // cache for 30 min
    retry: 1,
  });
}
