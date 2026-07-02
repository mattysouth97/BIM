"use client";

import { useQuery } from "@tanstack/react-query";
import { getFloorInfo, type BuildingDetailParams } from "@/lib/api-client";

export function useFloorData(params: BuildingDetailParams) {
  return useQuery({
    queryKey: ["buildings", "floors", params],
    queryFn: () => getFloorInfo(params),
    enabled: !!params.sigunguCd && !!params.bjdongCd,
  });
}
