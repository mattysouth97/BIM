"use client";

// src/hooks/use-active-building-pk.ts
// Returns the first buildingPk registered in the material store.
// All workspace panels (PropertiesPanel, StatusBar, SceneOutliner, ReportStage)
// use this to scope their data to the active building.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";

/**
 * Returns the active buildingPk from the material store.
 * When `override` is provided (non-empty), it is returned as-is.
 * Otherwise, returns the first key registered in the material store, or "" if none.
 */
export function useActiveBuildingPk(override?: string): string {
  const activePk = useMaterialStore((s) => s.activePk);
  const properties = useMaterialStore((s) => s.properties);
  return useMemo(() => {
    if (override) return override;
    if (activePk) return activePk;
    const keys = Object.keys(properties);
    return keys.length > 0 ? keys[0] : "";
  }, [override, activePk, properties]);
}
