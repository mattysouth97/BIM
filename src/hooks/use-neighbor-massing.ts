"use client";

// src/hooks/use-neighbor-massing.ts
// P2-26 — React Query hook to fetch neighbor context buildings from the
// /api/vworld/footprint?contextMode=true endpoint.

import { useQuery } from "@tanstack/react-query";

export interface NeighborMassingItem {
  pnu: string;
  polygon: number[][][];
  height: number | null;
  groundFloors: number | null;
}

export interface NeighborMassingResult {
  neighbors: NeighborMassingItem[];
  truncated: boolean;
  error: string | null;
}

async function fetchNeighborMassing(
  centerLng: number,
  centerLat: number
): Promise<NeighborMassingResult> {
  const params = new URLSearchParams({
    contextMode: "true",
    lat: String(centerLat),
    lng: String(centerLng),
  });

  const res = await fetch(`/api/vworld/footprint?${params.toString()}`);
  if (!res.ok) {
    return { neighbors: [], truncated: false, error: `HTTP ${res.status}` };
  }
  return res.json() as Promise<NeighborMassingResult>;
}

/**
 * Fetch neighbor buildings around a WGS84 center point for context massing.
 *
 * @param centerLngLat - [lng, lat] center; pass null to disable (enabled guard).
 * @returns React Query result with neighbors array, truncated flag, and error.
 */
export function useNeighborMassing(centerLngLat: [number, number] | null) {
  return useQuery({
    queryKey: ["neighbor-massing", centerLngLat],
    queryFn: () => fetchNeighborMassing(centerLngLat![0], centerLngLat![1]),
    enabled: centerLngLat !== null,
    staleTime: 1000 * 60 * 30, // 30 min — matches useBuildingFootprint
    retry: 1,
  });
}
