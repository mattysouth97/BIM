// src/lib/campus/campus-scene.ts
// Orchestration layer: converts a SiteLayout into per-building render configs.

import * as THREE from "three";
import { generateBuildingGeometry, toRecipe } from "@/lib/building-geometry";
import type { BuildingGeometry } from "@/lib/building-geometry";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { SiteLayout, SiteBuildingEntry } from "./site-layout";

/**
 * All parameters needed to render one building inside a campus scene.
 * The caller iterates this array and places a ProceduralBuildingModel at `worldPosition`.
 */
export interface CampusBuildingConfig {
  /** Stable key derived from the building's ledger PK (or array index fallback) */
  key: string;
  /** BuildingGeometry produced from the title record (floors default to empty) */
  geometry: BuildingGeometry;
  /** Pre-computed BuildingRecipe so the renderer does not recompute each frame */
  recipe: BuildingRecipe;
  /** World-space position — set as the Three.js group position */
  worldPosition: THREE.Vector3;
  /** Optional footprint vertices (XZ plane, world-space) for ground-plane outlines */
  footprintVertices?: THREE.Vector2[];
}

/**
 * Convert a SiteLayout into an array of per-building render configs.
 *
 * Each building is processed independently; failures on individual buildings
 * are caught and skipped so one bad record cannot break the whole campus view.
 */
export function getCampusBuildingConfigs(siteLayout: SiteLayout): CampusBuildingConfig[] {
  const configs: CampusBuildingConfig[] = [];

  siteLayout.buildings.forEach((entry: SiteBuildingEntry, index: number) => {
    try {
      const { building, position, footprintVertices } = entry;
      const key = building.building.mgmBldrgstPk || String(index);

      // Generate geometry without per-floor data (campus view uses title-level info only).
      // P2-28: pass measuredHeightM so campus uses ledger → measured → era height chain.
      const geometry = generateBuildingGeometry(building.building, [], {
        measuredHeightM: building.measuredHeightM ?? undefined,
      });
      const recipe = toRecipe(geometry);

      configs.push({
        key,
        geometry,
        recipe,
        worldPosition: position,
        footprintVertices,
      });
    } catch {
      // Skip this building silently — a missing or malformed record should not
      // prevent the rest of the campus from rendering
    }
  });

  return configs;
}
