"use client";

// src/hooks/use-energy-delta.ts
// Wraps useEnergyMetrics to provide snapshot/delta computation for inline
// energy impact annotations in the properties panel.

import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { useEnergyMetrics, type EnergyMetrics } from "@/hooks/use-energy-metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EnergyDelta {
  /** Current metrics (live) */
  current: EnergyMetrics | null;
  /** Delta in kWh/m2 from snapshot (null if no snapshot taken) */
  demandDelta: number | null;
  /** Delta in CO2 kgCO2/m2 */
  co2Delta: number | null;
  /** Whether the delta represents improvement (negative demand = less energy = good) */
  isImprovement: boolean;
  /** Take a snapshot of current metrics (call on slider focus/pointerdown) */
  snapshot: () => void;
  /** Clear the snapshot and delta (call on blur or after timeout) */
  clearSnapshot: () => void;
  /** Whether a snapshot is active */
  hasSnapshot: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps useEnergyMetrics with snapshot and delta capabilities.
 *
 * Usage:
 *   1. Call `energyDelta.snapshot()` on slider focus or pointerdown to record
 *      the baseline metrics.
 *   2. Read `energyDelta.demandDelta` and `energyDelta.co2Delta` to show the
 *      signed change in kWh/m2 and kgCO2/m2.
 *   3. Delta auto-clears after 4 seconds of no change.
 *
 * @param buildingPk - Building primary key passed through to useEnergyMetrics
 * @param sigunguCd  - Optional regional code for climate lookup
 */
export function useEnergyDelta(
  buildingPk: string,
  sigunguCd?: string
): EnergyDelta {
  // Live metrics from the store-reactive hook
  const current = useEnergyMetrics(buildingPk, sigunguCd);

  // Snapshot stored in a ref (no re-render on snapshot, only on delta change)
  const snapshotRef = useRef<EnergyMetrics | null>(null);

  // Separate state to track whether a snapshot is set (for hasSnapshot)
  const [hasSnapshot, setHasSnapshot] = useState(false);

  // Auto-dismiss timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute deltas reactively whenever current changes
  const { demandDelta, co2Delta } = useMemo(() => {
    const snap = snapshotRef.current;
    if (!snap || !current) {
      return { demandDelta: null, co2Delta: null };
    }
    const demandDelta =
      current.demand.demandPerSqm - snap.demand.demandPerSqm;
    const co2Delta =
      current.co2.co2PerSqm - snap.co2.co2PerSqm;
    return { demandDelta, co2Delta };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, hasSnapshot]);

  // isImprovement: negative delta = demand went down = good
  const isImprovement = (demandDelta ?? 0) < 0;

  // Auto-dismiss: 4 seconds after a non-null delta stabilises
  useEffect(() => {
    if (demandDelta === null) return;

    // Clear any pending timer before starting a fresh one
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      snapshotRef.current = null;
      setHasSnapshot(false);
    }, 4000);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [demandDelta]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const snapshot = useCallback(() => {
    if (!current) return;
    snapshotRef.current = current;
    setHasSnapshot(true);
    // Clear any running auto-dismiss timer when user re-snaps
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [current]);

  const clearSnapshot = useCallback(() => {
    snapshotRef.current = null;
    setHasSnapshot(false);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    current,
    demandDelta,
    co2Delta,
    isImprovement,
    snapshot,
    clearSnapshot,
    hasSnapshot,
  };
}
