"use client";

import { useQueries } from "@tanstack/react-query";
import {
  searchBuildings,
  getRecapInfo,
  getFloorInfo,
  getAreaInfo,
  type BuildingDetailParams,
  type ApiListResponse,
} from "@/lib/api-client";
import type {
  BrTitleInfo,
  BrRecapTitleInfo,
  BrFloorInfo,
  BrAreaInfo,
} from "@/lib/types";

interface FootprintResult {
  polygon: number[][][] | null;
  /** Which VWorld layer produced the polygon (P2-25): building outline or parcel fallback. */
  source?: "building" | "parcel" | null;
  /** Measured attributes from GIS건물통합정보 — null per field when unavailable. */
  attributes?: {
    height: number | null;
    groundFloors: number | null;
    undergroundFloors: number | null;
  } | null;
  error: string | null;
}

async function fetchFootprint(address: string): Promise<FootprintResult> {
  if (!address || address.trim() === "") return { polygon: null, error: null };
  const res = await fetch(
    `/api/vworld/footprint?address=${encodeURIComponent(address)}`
  );
  if (!res.ok) return { polygon: null, error: `HTTP ${res.status}` };
  return res.json();
}

export interface CompositeBuildingResult {
  title: ApiListResponse<BrTitleInfo> | undefined;
  recap: ApiListResponse<BrRecapTitleInfo> | undefined;
  floors: ApiListResponse<BrFloorInfo> | undefined;
  areas: ApiListResponse<BrAreaInfo> | undefined;
  footprintData: FootprintResult | undefined;
  isLoading: boolean;
  isFootprintLoading: boolean;
  isError: boolean;
  errors: (Error | null)[];
}

/**
 * Parallel fetch hook that fires all 5 queries simultaneously:
 * 4 ledger queries (title, recap, floors, areas) + 1 VWorld footprint query.
 *
 * When `address` is provided, the footprint query fires at the same time as
 * the ledger queries — both registered in the same useQueries call so React
 * Query dispatches them all on mount.
 *
 * When `address` is undefined or empty, isFootprintLoading is false immediately
 * and footprintData is undefined.
 */
export function useCompositeBuilding(
  params: BuildingDetailParams,
  address?: string
): CompositeBuildingResult {
  const enabled = !!params.sigunguCd && !!params.bjdongCd;
  const footprintEnabled = !!address && address.trim().length > 0;

  // The upstream proxy already allows 15 s per call, so the default three
  // retries turn a failing lookup into more than a minute of spinner before
  // the user is told anything. One retry covers a transient blip and still
  // fails fast enough to be honest about it.
  const retry = 1;

  const results = useQueries({
    queries: [
      {
        queryKey: ["buildings", "title", params],
        queryFn: () => searchBuildings(params),
        enabled,
        retry,
      },
      {
        queryKey: ["buildings", "recap", params],
        queryFn: () => getRecapInfo(params),
        enabled,
        retry,
      },
      {
        queryKey: ["buildings", "floors", params],
        queryFn: () => getFloorInfo({ ...params, numOfRows: 500 }),
        enabled,
        retry,
      },
      {
        queryKey: ["buildings", "areas", params],
        queryFn: () => getAreaInfo(params),
        enabled,
        retry,
      },
      {
        queryKey: ["footprint", address],
        queryFn: () => fetchFootprint(address!),
        enabled: footprintEnabled,
        staleTime: 1000 * 60 * 30, // cache for 30 min
        retry: 1,
      },
    ],
  });

  const isLoading = results.some((r) => r.isLoading);
  const isFootprintLoading = results[4].isLoading;
  // Footprint errors are soft — do not set isError for the footprint query
  const isError = results.slice(0, 4).some((r) => r.isError);
  const errors = results.slice(0, 4).map((r) => (r.error as Error) ?? null);

  return {
    title: results[0].data,
    recap: results[1].data,
    floors: results[2].data,
    areas: results[3].data,
    footprintData: results[4].data,
    isLoading,
    isFootprintLoading,
    isError,
    errors,
  };
}
