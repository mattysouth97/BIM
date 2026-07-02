"use client";

import { useQuery } from "@tanstack/react-query";
import {
  searchBuildings,
  type SearchBuildingsParams,
} from "@/lib/api-client";

export function useBuildingSearch(params: SearchBuildingsParams) {
  return useQuery({
    queryKey: ["buildings", "search", params],
    queryFn: () => searchBuildings(params),
    enabled: !!params.sigunguCd,
  });
}
