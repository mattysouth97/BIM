// src/lib/energy/delivered-from-demand.ts
// P1-05 — the single shared fuel-split and building-type derivations.
// Previously report-stage, properties-panel, and (implicitly) the grade path
// each derived these independently; this module is now the only source.
// Pure functions — no React, no stores.

import type { MaterialProperties } from "@/lib/material-types";
import type { DeliveredEnergy } from "@/lib/energy/primary-energy";

export interface DemandLike {
  heatingDemand: number; // kWh/yr delivered
  coolingDemand: number; // kWh/yr delivered
  totalDemand: number; // kWh/yr delivered
}

/**
 * Split modeled delivered demand into fuels for primary-energy conversion.
 * Convention (inherited from the report stage, kept verbatim):
 *   electric = cooling + 15% of total (lighting/equipment share)
 *   gas      = heating + 10% of total (DHW share)
 * District heat/cool and renewables are 0 until modeled explicitly.
 */
export function deliveredFromDemand(demand: DemandLike): DeliveredEnergy {
  return {
    electric: demand.coolingDemand + demand.totalDemand * 0.15,
    gas: demand.heatingDemand + demand.totalDemand * 0.1,
    districtHeating: 0,
    districtCooling: 0,
    renewable: 0,
  };
}

/**
 * Residential detection used across all panels: occupancy density above
 * 0.1 persons/m² reads as residential. One implementation — the three
 * divergent copies were removed by P1-05.
 */
export function isResidentialOccupancy(
  materials: MaterialProperties | undefined
): boolean {
  const density = materials?.occupancy?.occupancyDensity;
  return density !== undefined && density > 0.1;
}

/** Map materials to the official efficiency-rating threshold-table key. */
export function buildingTypeFromMaterials(
  materials: MaterialProperties | undefined
): "residential" | "non-residential" {
  return isResidentialOccupancy(materials) ? "residential" : "non-residential";
}
