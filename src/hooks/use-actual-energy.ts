"use client";

// src/hooks/use-actual-energy.ts
// Hook for fetching actual energy data from Korean energy APIs.
// Uses useEffect + useState (no SWR/react-query) per project convention.
// Returns graceful fallback when APIs have no data for a building.

import { useState, useEffect, useRef } from "react";
import {
  fetchEnergyConsumption,
  fetchEnergyGrade,
  computeAnnualKwh,
  type MonthlyConsumption,
  type EnergyGradeResult,
} from "@/lib/energy-api-client";

export interface ActualEnergy {
  /** Certified energy grade (e.g. "1+", "2") or null */
  grade: string | null;
  /** Certified primary energy demand in kWh/m2yr or null */
  certifiedDemand: number | null;
  /** Monthly electricity (kWh) + gas (MJ) consumption or null */
  monthlyConsumption: MonthlyConsumption[] | null;
  /** Sum of annual electricity + gas (converted to kWh) or null */
  totalAnnualKwh: number | null;
  /** true only if at least one API returned usable data */
  dataAvailable: boolean;
  /** true while fetching */
  isLoading: boolean;
}

const EMPTY: ActualEnergy = {
  grade: null,
  certifiedDemand: null,
  monthlyConsumption: null,
  totalAnnualKwh: null,
  dataAvailable: false,
  isLoading: false,
};

// Simple in-memory cache to avoid refetching on re-renders
const cache = new Map<string, ActualEnergy>();

/**
 * Fetch actual energy data for a building from Korean energy APIs.
 * Returns dataAvailable: false when building has no energy data (common).
 */
export function useActualEnergy(buildingPk: string): ActualEnergy {
  const [state, setState] = useState<ActualEnergy>(() => {
    const cached = cache.get(buildingPk);
    if (cached) return cached;
    return { ...EMPTY, isLoading: true };
  });

  // Track current pk to avoid stale updates
  const pkRef = useRef(buildingPk);
  pkRef.current = buildingPk;

  useEffect(() => {
    // If cached, skip fetch
    if (cache.has(buildingPk)) {
      setState(cache.get(buildingPk)!);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, isLoading: true });

    async function load() {
      // Fetch grade and consumption in parallel
      const [gradeResult, consumptionResult] = await Promise.all([
        fetchEnergyGrade(buildingPk).catch((): EnergyGradeResult | null => null),
        fetchEnergyConsumption(buildingPk).catch(() => null),
      ]);

      if (cancelled || pkRef.current !== buildingPk) return;

      const hasGrade = gradeResult !== null;
      const hasConsumption =
        consumptionResult !== null &&
        consumptionResult.monthly.length > 0;

      const result: ActualEnergy = {
        grade: gradeResult?.grade ?? null,
        certifiedDemand: gradeResult?.demand ?? null,
        monthlyConsumption: hasConsumption
          ? consumptionResult!.monthly
          : null,
        totalAnnualKwh: hasConsumption
          ? computeAnnualKwh(consumptionResult!.monthly)
          : null,
        dataAvailable: hasGrade || hasConsumption,
        isLoading: false,
      };

      cache.set(buildingPk, result);
      setState(result);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [buildingPk]);

  return state;
}
