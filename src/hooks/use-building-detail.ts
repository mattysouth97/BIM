"use client";

import { useQueries } from "@tanstack/react-query";
import {
  searchBuildings,
  getRecapInfo,
  getFloorInfo,
  getAreaInfo,
  type BuildingDetailParams,
} from "@/lib/api-client";
import type {
  BrTitleInfo,
  BrRecapTitleInfo,
  BrFloorInfo,
  BrAreaInfo,
} from "@/lib/types";
import type { ApiListResponse } from "@/lib/api-client";

export interface BuildingDetailResult {
  title: ApiListResponse<BrTitleInfo> | undefined;
  recap: ApiListResponse<BrRecapTitleInfo> | undefined;
  floors: ApiListResponse<BrFloorInfo> | undefined;
  areas: ApiListResponse<BrAreaInfo> | undefined;
  isLoading: boolean;
  isError: boolean;
  errors: (Error | null)[];
}

export function useBuildingDetail(
  params: BuildingDetailParams,
): BuildingDetailResult {
  const enabled =
    !!params.sigunguCd && !!params.bjdongCd;

  const results = useQueries({
    queries: [
      {
        queryKey: ["buildings", "title", params],
        queryFn: () => searchBuildings(params),
        enabled,
      },
      {
        queryKey: ["buildings", "recap", params],
        queryFn: () => getRecapInfo(params),
        enabled,
      },
      {
        queryKey: ["buildings", "floors", params],
        queryFn: () => getFloorInfo(params),
        enabled,
      },
      {
        queryKey: ["buildings", "areas", params],
        queryFn: () => getAreaInfo(params),
        enabled,
      },
    ],
  });

  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);
  const errors = results.map((r) => (r.error as Error) ?? null);

  return {
    title: results[0].data,
    recap: results[1].data,
    floors: results[2].data,
    areas: results[3].data,
    isLoading,
    isError,
    errors,
  };
}
