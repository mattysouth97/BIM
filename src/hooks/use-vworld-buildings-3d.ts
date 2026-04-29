"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  VWorldBuilding3D,
  VWorldBuildings3DResponse,
} from "@/app/api/vworld/buildings-3d/route";

export interface VWorldBuildings3DParams {
  lat: number | null | undefined;
  lng: number | null | undefined;
  radiusM?: number;
  size?: number;
}

async function fetchBuildings3D(
  params: VWorldBuildings3DParams
): Promise<VWorldBuildings3DResponse> {
  const { lat, lng, radiusM = 120, size = 20 } = params;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return {
      buildings: [],
      error: null,
      dataset: "LT_C_SPBD",
      fetchedAt: new Date().toISOString(),
    };
  }

  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radiusM: String(radiusM),
    size: String(size),
  });

  const res = await fetch(`/api/vworld/buildings-3d?${qs.toString()}`);
  if (!res.ok) {
    return {
      buildings: [],
      error: `HTTP ${res.status}`,
      dataset: "LT_C_SPBD",
      fetchedAt: new Date().toISOString(),
    };
  }
  return (await res.json()) as VWorldBuildings3DResponse;
}

/**
 * Fetches VWorld's LT_C_SPBD simple building polygons within the given radius.
 * Result is cached for 30 minutes. Buildings return their real footprint
 * polygon and inferred height so the viewer can extrude them at the highest
 * level of detail available in Korean public data.
 */
export function useVWorldBuildings3D(params: VWorldBuildings3DParams) {
  const { lat, lng, radiusM = 120, size = 20 } = params;

  return useQuery<VWorldBuildings3DResponse>({
    queryKey: ["vworld-buildings-3d", lat, lng, radiusM, size],
    queryFn: () => fetchBuildings3D(params),
    enabled:
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng),
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });
}

export type { VWorldBuilding3D, VWorldBuildings3DResponse };
