// src/lib/energy/calibration.ts
// Compares predicted energy demand against actual consumption data.
// Maps actual energy carriers (gas, electric) to end-uses via Korean-typical splits.
// Pure functions — no React, no side effects.

export interface EndUseComparison {
  predicted: number;
  actual: number;
  /** Percentage: (predicted - actual) / actual * 100 */
  delta: number;
}

export interface CalibrationResult {
  /** Percentage: (predicted - actual) / actual * 100 */
  overallDelta: number;
  endUseBreakdown: {
    heating: EndUseComparison | null;
    cooling: EndUseComparison | null;
    lighting: EndUseComparison | null;
    dhw: EndUseComparison | null;
  };
  /** Which end-use has the largest absolute discrepancy (by delta percentage) */
  largestDiscrepancy: string;
  /** actual / predicted — values >1 mean building uses more than predicted */
  calibrationRatio: number;
  /** Human-readable summary in English */
  insight: string;
}

/**
 * Korean-typical energy carrier → end-use allocation splits.
 * Gas is predominantly used for space heating and domestic hot water (DHW).
 * Electricity covers cooling and lighting loads.
 */
const GAS_HEATING_FRACTION = 0.8;
const GAS_DHW_FRACTION = 0.2;
const ELECTRIC_COOLING_FRACTION = 0.4;
const ELECTRIC_LIGHTING_FRACTION = 0.6;

function computeDelta(predicted: number, actual: number): number {
  // No recorded consumption: a nonzero prediction is an unbounded mismatch,
  // not a perfect match. Consumers must handle the non-finite flag.
  if (actual === 0) return predicted === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((predicted - actual) / actual) * 100;
}

function endUseComparison(predicted: number, actual: number): EndUseComparison {
  return { predicted, actual, delta: computeDelta(predicted, actual) };
}

/**
 * Calibrate a building's energy model against actual consumption data.
 *
 * @param predicted - Predicted annual demand breakdown (kWh/year)
 * @param actual    - Actual annual consumption by energy carrier (kWh/year)
 */
export function calibrateEnergy(
  predicted: {
    heating: number;
    cooling: number;
    lighting: number;
    dhw: number;
    total: number;
  },
  actual: {
    electric_kwh: number;
    gas_kwh: number;
    total_kwh: number;
  }
): CalibrationResult {
  // Allocate actual consumption to end-uses using Korean-typical splits
  const actualHeating = actual.gas_kwh * GAS_HEATING_FRACTION;
  const actualDhw = actual.gas_kwh * GAS_DHW_FRACTION;
  const actualCooling = actual.electric_kwh * ELECTRIC_COOLING_FRACTION;
  const actualLighting = actual.electric_kwh * ELECTRIC_LIGHTING_FRACTION;

  const heating = endUseComparison(predicted.heating, actualHeating);
  const cooling = endUseComparison(predicted.cooling, actualCooling);
  const lighting = endUseComparison(predicted.lighting, actualLighting);
  const dhw = endUseComparison(predicted.dhw, actualDhw);

  // Overall delta uses total values directly
  const overallDelta = computeDelta(predicted.total, actual.total_kwh);
  // Guard the DENOMINATOR (predicted), not the numerator — a zero prediction
  // must not produce an Infinity scaling ratio.
  const calibrationRatio =
    predicted.total > 0 ? actual.total_kwh / predicted.total : 1;

  // Find the end-use with the largest absolute delta
  const candidates: Array<[string, number]> = [
    ["heating", Math.abs(heating.delta)],
    ["cooling", Math.abs(cooling.delta)],
    ["lighting", Math.abs(lighting.delta)],
    ["dhw", Math.abs(dhw.delta)],
  ];
  const largestDiscrepancy = candidates.reduce((max, cur) =>
    cur[1] > max[1] ? cur : max
  )[0];

  // Generate human-readable insight
  const absOverall = Math.abs(overallDelta);
  let insight: string;
  if (!Number.isFinite(overallDelta)) {
    insight =
      "No actual consumption recorded for this building — calibration unavailable.";
  } else if (absOverall < 5) {
    insight =
      "This building's actual energy use closely matches the predicted demand (within 5%).";
  } else if (overallDelta > 0) {
    // "Uses X% less than predicted" must be expressed on the PREDICTED base:
    // (pred − act)/pred. Expressing it on the actual base can exceed 100%.
    const lessPercent = Math.round((overallDelta / (100 + overallDelta)) * 100);
    insight = `This building uses ${lessPercent}% less energy than predicted — the model may be over-estimating demand.`;
  } else {
    insight = `This building uses ${Math.round(absOverall)}% more energy than predicted — the model may be under-estimating demand.`;
  }

  return {
    overallDelta,
    endUseBreakdown: { heating, cooling, lighting, dhw },
    largestDiscrepancy,
    calibrationRatio,
    insight,
  };
}
