"use client";

// src/hooks/use-actual-energy.ts
// TanStack Query hook for fetching actual energy consumption data.
// Fetches 3 years of monthly records from /api/energy/consumption,
// normalizes them into annual kWh via consumption-normalizer.
// Returns empty array when building has no energy data (common for older/smaller buildings).

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { DEMO_BUILDING_PK } from "@/lib/constants";
import { getDemoAnnualConsumption } from "@/lib/demo/demo-energy";
import { isCadDraftPk } from "@/lib/workflow/cad-draft";
import {
  normalizeConsumption,
  type MonthlyConsumptionRecord,
  type AnnualConsumption,
} from "@/lib/energy/consumption-normalizer";

export type { AnnualConsumption };

interface ConsumptionApiResponse {
  items: MonthlyConsumptionRecord[];
  totalCount: number;
}

async function fetchConsumptionYears(
  pk: string,
  years: number[]
): Promise<AnnualConsumption[]> {
  const apiKey = useAppStore.getState().apiKey;
  if (!apiKey) return [];

  const requests = years.map(async (year) => {
    const url = new URL("/api/energy/consumption", window.location.origin);
    url.searchParams.set("mgmBldrgstPk", pk);
    url.searchParams.set("year", String(year));
    url.searchParams.set("numOfRows", "36");

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) return [];

    const data: ConsumptionApiResponse = await res.json();
    return data.items ?? [];
  });

  const results = await Promise.all(requests);
  const allRecords = results.flat();

  return normalizeConsumption(allRecords);
}

/**
 * Fetch 3 years of actual energy consumption for a building.
 * Returns AnnualConsumption[] normalized to kWh per year.
 * Returns empty array when building has no energy data.
 */
export function useActualEnergy(mgmBldrgstPk: string) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear - 2, currentYear - 3];

  return useQuery<AnnualConsumption[]>({
    queryKey: ["energy", "consumption", mgmBldrgstPk, years],
    queryFn: () =>
      mgmBldrgstPk === DEMO_BUILDING_PK
        ? Promise.resolve(getDemoAnnualConsumption(currentYear))
        : fetchConsumptionYears(mgmBldrgstPk, years),
    // P2-24: cad-first drafts have no ledger identity — querying the HUB with
    // a synthetic PK would be a fabricated request; skip and stay empty.
    // The demo office carries bundled meter years and does not need a key.
    enabled: !!mgmBldrgstPk && !isCadDraftPk(mgmBldrgstPk),
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: [],
  });
}
