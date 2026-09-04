"use client";

/**
 * The lot ring, fetched alongside the building outline (P2-31).
 *
 * `/api/vworld/footprint` answers with ONE ring, and when the building layer
 * has a feature that ring is the building — so the buildings with the best
 * outlines are exactly the ones with no lot. The setback direction needs both:
 * the slack between building and lot is what says which face stepped back.
 * Hence a second, explicitly cadastral call.
 *
 * Only worth making when the first call returned a building. If it already
 * fell back to the parcel layer, that ring IS the lot and the reconstruction
 * reads it from `gis` — asking again would fetch the same polygon twice.
 *
 * Failure is cheap and expected: no lot degrades the setback to
 * "undetermined", which is what the reconstruction already does today.
 */

import { useQuery } from "@tanstack/react-query";

import { getDemoFootprintResult } from "@/lib/demo/demo-building";
import { getDrawingFootprintResult } from "@/lib/demo/drawing-building";

export interface ParcelResult {
  polygon: number[][][] | null;
  error: string | null;
}

async function fetchParcel(address: string): Promise<ParcelResult> {
  if (!address || address.trim() === "") return { polygon: null, error: null };

  // Bundled fixtures carry a building outline and no cadastral lot. Returning
  // an empty result keeps 데모모드 off the network, exactly as the footprint
  // hook does.
  if (getDemoFootprintResult(address) || getDrawingFootprintResult(address)) {
    return { polygon: null, error: null };
  }

  const res = await fetch(
    `/api/vworld/footprint?layer=parcel&address=${encodeURIComponent(address)}`,
  );
  if (!res.ok) return { polygon: null, error: `HTTP ${res.status}` };
  const data = (await res.json()) as { polygon?: number[][][] | null; error?: string | null };
  return { polygon: data.polygon ?? null, error: data.error ?? null };
}

/**
 * `enabled` should be true only when the building outline came from the
 * building layer — see the note above.
 */
export function useBuildingParcel(
  address: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["parcel", address],
    queryFn: () => fetchParcel(address!),
    enabled: enabled && !!address && address.trim() !== "",
    staleTime: 1000 * 60 * 60 * 24, // cadastral boundaries move on the order of years
    retry: 1,
  });
}
