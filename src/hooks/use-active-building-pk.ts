"use client";

// src/hooks/use-active-building-pk.ts
// P1-08 (c) — resolves the active building from the active-building store
// (set on building-page resolution), no longer from material-store insertion
// order. All workspace panels (PropertiesPanel, StatusBar, SceneOutliner,
// ReportStage) use this to scope their data.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingStore } from "@/store/active-building-store";

/**
 * Returns the active buildingPk.
 * Priority: explicit `override` argument → active-building store →
 * material-store activePk (local twin-authoring seed) → first-material-store-key
 * fallback → "".
 *
 * TODO(P1-08): remove the legacy first-key fallback once every entry flow
 * sets the active-building store (kept for back-compat with flows that
 * populate materials without visiting the building page).
 */
export function useActiveBuildingPk(override?: string): string {
  const activePk = useMaterialStore((s) => s.activePk);
  const storePk = useActiveBuildingStore((s) => s.buildingPk);
  const properties = useMaterialStore((s) => s.properties);

  return useMemo(() => {
    if (override) return override;
    if (storePk) return storePk;
    if (activePk) return activePk;
    const keys = Object.keys(properties);
    return keys.length > 0 ? keys[0] : "";
  }, [override, storePk, activePk, properties]);
}

/** sigunguCd of the active building (regional climate), or undefined. */
export function useActiveSigunguCd(): string | undefined {
  const sigunguCd = useActiveBuildingStore((s) => s.sigunguCd);
  return sigunguCd ?? undefined;
}
