// src/lib/energy/heat-loss.ts
// Steady-state heat loss calculation per building envelope element.
// Formula: Q = U × A × ΔT (watts per element)

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ClimateData } from "./climate-data";

export interface ElementHeatLoss {
  /** Element name (e.g. "Wall - North", "Roof", "Floor", "Window") */
  element: string;
  /** Surface area (m²) */
  area: number;
  /** U-value (W/m²·K) */
  uValue: number;
  /** Heat loss (W) */
  heatLoss: number;
  /** Heat loss per m² of total floor area (W/m²) */
  heatLossPerSqm: number;
}

export interface HeatLossResult {
  elements: ElementHeatLoss[];
  /** Total heat loss through envelope (W) */
  totalHeatLoss: number;
  /** Total heat loss per m² of floor area (W/m²) */
  totalHeatLossPerSqm: number;
}

/**
 * Calculate steady-state heat loss for each building envelope element.
 * Uses Q = U × A × ΔT formula per Korean energy assessment methodology.
 */
export function calculateHeatLoss(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): HeatLossResult {
  const { footprintWidth, footprintDepth, totalHeight } = recipe;
  const perimeter = 2 * (footprintWidth + footprintDepth);
  const totalFloorArea = footprintWidth * footprintDepth * recipe.floors.length;
  const roofArea = footprintWidth * footprintDepth;
  const floorArea = roofArea; // ground floor area

  // ΔT for winter heat loss
  const deltaT = climate.indoorTemp - climate.winterDesignTemp; // 20 - (-11.3) = 31.3
  // Ground floor: indoor vs ground (~5°C below indoor)
  const groundDeltaT = climate.indoorTemp - (climate.indoorTemp - 5); // 5°C

  const grossWallArea = perimeter * totalHeight;
  const wwr = materials.envelope.windows.windowToWallRatio;
  const avgWWR = (wwr.N + wwr.S + wwr.E + wwr.W) / 4;
  const totalWindowArea = grossWallArea * avgWWR;
  const netWallArea = grossWallArea - totalWindowArea;

  const elements: ElementHeatLoss[] = [];

  // Wall heat loss — use average U-value across all wall assemblies
  const wallUValues = materials.envelope.walls;
  const avgWallU =
    wallUValues.length > 0
      ? wallUValues.reduce((sum, w) => sum + w.uValue, 0) / wallUValues.length
      : 0.47; // fallback: Korean code default
  const wallHeatLoss = avgWallU * netWallArea * deltaT;
  elements.push({
    element: "Walls",
    area: netWallArea,
    uValue: avgWallU,
    heatLoss: wallHeatLoss,
    heatLossPerSqm: totalFloorArea > 0 ? wallHeatLoss / totalFloorArea : 0,
  });

  // Window heat loss
  const windowU = materials.envelope.windows.uValue;
  const windowHeatLoss = windowU * totalWindowArea * deltaT;
  elements.push({
    element: "Windows",
    area: totalWindowArea,
    uValue: windowU,
    heatLoss: windowHeatLoss,
    heatLossPerSqm: totalFloorArea > 0 ? windowHeatLoss / totalFloorArea : 0,
  });

  // Roof heat loss
  const roofU = materials.envelope.roof.uValue;
  const roofHeatLoss = roofU * roofArea * deltaT;
  elements.push({
    element: "Roof",
    area: roofArea,
    uValue: roofU,
    heatLoss: roofHeatLoss,
    heatLossPerSqm: totalFloorArea > 0 ? roofHeatLoss / totalFloorArea : 0,
  });

  // Ground floor heat loss (reduced ΔT for ground contact)
  const floorU = materials.envelope.groundFloor.uValue;
  const floorHeatLoss = floorU * floorArea * groundDeltaT;
  elements.push({
    element: "Ground Floor",
    area: floorArea,
    uValue: floorU,
    heatLoss: floorHeatLoss,
    heatLossPerSqm: totalFloorArea > 0 ? floorHeatLoss / totalFloorArea : 0,
  });

  const totalHeatLoss = elements.reduce((sum, e) => sum + e.heatLoss, 0);

  return {
    elements,
    totalHeatLoss,
    totalHeatLossPerSqm: totalFloorArea > 0 ? totalHeatLoss / totalFloorArea : 0,
  };
}
