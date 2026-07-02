// src/lib/campus/comparison-engine.ts
// Normalize and compare energy/envelope metrics across 2-4 buildings.

export interface ComparisonMetric {
  label: string;
  unit: string;
  values: {
    buildingId: string;
    buildingName: string;
    value: number;
    normalized: number; // 0–1 where 1 = best
  }[];
  best: string;  // buildingId with best (normalized = 1.0) value
  worst: string; // buildingId with worst (normalized = 0.0) value
}

export interface ComparisonResult {
  buildings: { id: string; name: string }[];
  metrics: ComparisonMetric[];
}

export interface BuildingInput {
  id: string;
  name: string;
  energyPerArea: number;   // kWh/m²/yr
  co2PerArea: number;      // kgCO₂/m²/yr
  wallU: number;           // W/m²K
  roofU: number;           // W/m²K
  windowU: number;         // W/m²K
  airtightness: number;    // ACH50
}

/** Metric descriptor: which field to read and whether lower = better */
interface MetricSpec {
  label: string;
  unit: string;
  key: keyof Omit<BuildingInput, "id" | "name">;
  lowerIsBetter: boolean;
}

const METRIC_SPECS: MetricSpec[] = [
  { label: "Energy Demand",  unit: "kWh/m²/yr",  key: "energyPerArea",  lowerIsBetter: true },
  { label: "CO₂ Emissions",  unit: "kgCO₂/m²/yr", key: "co2PerArea",   lowerIsBetter: true },
  { label: "Wall U-value",   unit: "W/m²K",       key: "wallU",         lowerIsBetter: true },
  { label: "Roof U-value",   unit: "W/m²K",       key: "roofU",         lowerIsBetter: true },
  { label: "Window U-value", unit: "W/m²K",       key: "windowU",       lowerIsBetter: true },
  { label: "Airtightness",   unit: "ACH50",       key: "airtightness",  lowerIsBetter: true },
];

/**
 * Normalize raw values to a 0–1 scale where 1 = best.
 *
 * When all values are identical the metric is flat — every building scores 1.0
 * (there is no worst performer).
 */
function normalizeValues(
  values: number[],
  lowerIsBetter: boolean,
): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) {
    // All buildings have the same value — all are equally best
    return values.map(() => 1);
  }

  return values.map((v) => {
    const t = (v - min) / range; // 0 = min, 1 = max
    return lowerIsBetter ? 1 - t : t;
  });
}

/**
 * Compare 2–4 buildings across six energy and envelope metrics.
 *
 * Each metric is independently normalized so that the best-performing
 * building scores 1.0 and the worst scores 0.0.
 */
export function compareBuildings(buildings: BuildingInput[]): ComparisonResult {
  if (buildings.length === 0) {
    return { buildings: [], metrics: [] };
  }

  const buildingList = buildings.map(({ id, name }) => ({ id, name }));

  const metrics: ComparisonMetric[] = METRIC_SPECS.map((spec) => {
    const rawValues = buildings.map((b) => b[spec.key]);
    const normalized = normalizeValues(rawValues, spec.lowerIsBetter);

    const values = buildings.map((b, i) => ({
      buildingId: b.id,
      buildingName: b.name,
      value: b[spec.key],
      normalized: normalized[i],
    }));

    // Best = highest normalized score, worst = lowest
    let bestIdx = 0;
    let worstIdx = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i].normalized > values[bestIdx].normalized) bestIdx = i;
      if (values[i].normalized < values[worstIdx].normalized) worstIdx = i;
    }

    return {
      label: spec.label,
      unit: spec.unit,
      values,
      best: values[bestIdx].buildingId,
      worst: values[worstIdx].buildingId,
    };
  });

  return { buildings: buildingList, metrics };
}
