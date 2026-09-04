"use client";

/**
 * 용도지역 lookup for the reconstruction (P2-31).
 *
 * The register states no zoning, and 정북방향 일조권 사선제한 only applies in
 * 전용/일반주거지역 — so without this the setback direction can be guessed from
 * lot geometry but never attributed to the rule that causes it.
 *
 * Failure is expected and cheap: an absent district degrades the setback to
 * geometry-only, and then to "undetermined". Nothing here throws, and nothing
 * downstream treats silence as 주거지역.
 */

import { useQuery } from "@tanstack/react-query";

export interface ZoningResult {
  district: string | null;
  candidates: string[];
  source: string;
  error: string | null;
}

async function fetchZoning(lat: number, lng: number): Promise<ZoningResult> {
  const res = await fetch(
    `/api/vworld/zoning?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
  );
  if (!res.ok) {
    // A 502 still carries a body with the reason; a hard failure does not.
    try {
      return (await res.json()) as ZoningResult;
    } catch {
      return {
        district: null,
        candidates: [],
        source: "LT_C_UQ111",
        error: `HTTP ${res.status}`,
      };
    }
  }
  return res.json();
}

/**
 * `center` is the WGS84 centroid of the building outline. Disabled until one
 * exists — there is nowhere to ask about before the footprint resolves.
 */
export function useBuildingZoning(center: [number, number] | null | undefined) {
  return useQuery({
    queryKey: ["zoning", center?.[0], center?.[1]],
    queryFn: () => fetchZoning(center![1], center![0]),
    enabled: Array.isArray(center) && Number.isFinite(center[0]) && Number.isFinite(center[1]),
    staleTime: 1000 * 60 * 60 * 24, // zoning changes on the order of years
    retry: 1,
  });
}
