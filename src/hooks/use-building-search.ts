"use client";

import { useQuery } from "@tanstack/react-query";
import {
  searchAllBuildings,
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

/**
 * Every row of a 법정동, for filters the upstream API cannot apply itself.
 *
 * `mainPurpsCd` is ignored by the register, so it has to be matched
 * client-side — and a client-side match over one 20-row page answers "none"
 * for a district whose matches sit on page 4. Only enable this when such a
 * filter is actually active: it costs one request per 100 rows.
 */
export function useAllBuildingSearch(
  params: SearchBuildingsParams,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["buildings", "search-all", params.sigunguCd, params.bjdongCd],
    queryFn: () => searchAllBuildings(params),
    enabled: enabled && !!params.sigunguCd,
  });
}
