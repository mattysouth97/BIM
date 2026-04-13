// src/lib/campus/portfolio-aggregator.ts
// Pure functions for aggregating energy metrics across multiple buildings in a campus or complex.

export interface BuildingMetrics {
  buildingId: string;
  name: string;
  area: number; // m2
  energyDemand: number; // kWh/year
  energyPerArea: number; // kWh/m2/year
  co2Emissions: number; // tCO2/year
  co2PerArea: number; // tCO2/m2/year
  energyGrade: string;
  useType: string;
  era: string;
}

export interface PortfolioSummary {
  totalArea: number;
  totalEnergyDemand: number;
  totalCO2: number;
  avgEnergyPerArea: number;
  avgCO2PerArea: number;
  buildingCount: number;
  worstPerformers: BuildingMetrics[]; // bottom 3 by energyPerArea (highest values)
  bestPerformers: BuildingMetrics[]; // top 3 by energyPerArea (lowest values)
  gradeDistribution: Record<string, number>; // e.g., { 'A': 2, 'B': 5, 'C': 3 }
}

/** Grade ordering for sort purposes — lower index = better grade */
const GRADE_ORDER: string[] = [
  "1+++",
  "1++",
  "1+",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
];

/** Returns a numeric rank for a grade string (lower = better). Unknown grades sort last. */
function gradeRank(grade: string): number {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx === -1 ? GRADE_ORDER.length : idx;
}

/**
 * Aggregates an array of building metrics into a portfolio-level summary.
 * Returns zero-valued summary for empty input.
 */
export function aggregatePortfolio(buildings: BuildingMetrics[]): PortfolioSummary {
  if (buildings.length === 0) {
    return {
      totalArea: 0,
      totalEnergyDemand: 0,
      totalCO2: 0,
      avgEnergyPerArea: 0,
      avgCO2PerArea: 0,
      buildingCount: 0,
      worstPerformers: [],
      bestPerformers: [],
      gradeDistribution: {},
    };
  }

  const totalArea = buildings.reduce((sum, b) => sum + b.area, 0);
  const totalEnergyDemand = buildings.reduce((sum, b) => sum + b.energyDemand, 0);
  const totalCO2 = buildings.reduce((sum, b) => sum + b.co2Emissions, 0);

  // Area-weighted averages
  const avgEnergyPerArea = totalArea > 0 ? totalEnergyDemand / totalArea : 0;
  const avgCO2PerArea =
    totalArea > 0
      ? buildings.reduce((sum, b) => sum + b.co2Emissions, 0) / totalArea
      : 0;

  // Sort by energyPerArea ascending to get best (low) and worst (high)
  const sortedAsc = [...buildings].sort(
    (a, b) => a.energyPerArea - b.energyPerArea
  );
  const bestPerformers = sortedAsc.slice(0, 3);
  const worstPerformers = sortedAsc.slice(-3).reverse();

  // Grade distribution count
  const gradeDistribution: Record<string, number> = {};
  for (const b of buildings) {
    gradeDistribution[b.energyGrade] =
      (gradeDistribution[b.energyGrade] ?? 0) + 1;
  }

  return {
    totalArea,
    totalEnergyDemand,
    totalCO2,
    avgEnergyPerArea,
    avgCO2PerArea,
    buildingCount: buildings.length,
    worstPerformers,
    bestPerformers,
    gradeDistribution,
  };
}

export type SortKey = "energyPerArea" | "co2PerArea" | "area" | "grade";

/**
 * Returns a new sorted array of buildings.
 * Default direction is ascending for numeric keys, ascending grade rank for 'grade'.
 */
export function sortBuildings(
  buildings: BuildingMetrics[],
  by: SortKey,
  direction: "asc" | "desc" = "asc"
): BuildingMetrics[] {
  const sorted = [...buildings].sort((a, b) => {
    let delta: number;
    if (by === "grade") {
      delta = gradeRank(a.energyGrade) - gradeRank(b.energyGrade);
    } else {
      delta = a[by] - b[by];
    }
    return direction === "desc" ? -delta : delta;
  });
  return sorted;
}
