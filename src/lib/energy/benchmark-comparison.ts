// src/lib/energy/benchmark-comparison.ts
// Compare a building's energy demand against KEMCO peer benchmarks.

import { BENCHMARK_DATA } from "./benchmark-database";
import type { BenchmarkEntry } from "./benchmark-database";

export interface BenchmarkResult {
  buildingDemand: number; // kWh/m²/year
  percentile: number;     // 0–100, where this building sits in the peer distribution
  peerGroup: { useType: string; era: string; region: string };
  p25: number;
  p50: number;
  p75: number;
  performance: "excellent" | "good" | "average" | "below-average" | "poor";
  insight: string;
}

/** Default fallback use type when the supplied value is unknown. */
const DEFAULT_USE_TYPE = "office";

/**
 * Map a demand value to a 0–100 percentile using linear interpolation
 * across the three known percentile anchors: p25, p50, p75.
 *
 * Extrapolation beyond the anchors is clamped to [0, 100].
 */
function interpolatePercentile(
  demand: number,
  p25: number,
  p50: number,
  p75: number,
): number {
  if (demand <= p25) {
    // Linear extrapolation below p25, anchored at (0 → 0th pct, p25 → 25th pct)
    // Assume a reasonable lower bound of 0 kWh/m² = 0th percentile.
    const lowerBound = 0;
    if (p25 <= lowerBound) return 0;
    const t = (demand - lowerBound) / (p25 - lowerBound);
    return Math.max(0, t * 25);
  }

  if (demand <= p50) {
    const t = (demand - p25) / (p50 - p25);
    return 25 + t * 25; // 25th → 50th
  }

  if (demand <= p75) {
    const t = (demand - p50) / (p75 - p50);
    return 50 + t * 25; // 50th → 75th
  }

  // Above p75 — extrapolate toward 100th percentile.
  // Use the IQR width (p75–p25) as a proxy for the remaining spread.
  const iqr = p75 - p25;
  const upperBound = p75 + iqr; // rough 100th-pct proxy
  if (upperBound <= p75) return 100;
  const t = (demand - p75) / (upperBound - p75);
  return Math.min(100, 75 + t * 25);
}

function classifyPerformance(
  demand: number,
  p25: number,
  p50: number,
  p75: number,
): BenchmarkResult["performance"] {
  if (demand < p25) return "excellent";
  if (demand < p50) return "good";
  if (demand === p50) return "average";
  if (demand < p75) return "below-average";
  return "poor";
}

/**
 * Build a human-readable insight sentence describing the building's position
 * relative to its peer group.
 */
function buildInsight(
  _demand: number,
  percentile: number,
  performance: BenchmarkResult["performance"],
  peerGroup: { useType: string; era: string; region: string },
): string {
  const roundedPct = Math.round(percentile);
  const betterThan = 100 - roundedPct;
  const eraLabel = peerGroup.era;
  const useLabel = peerGroup.useType;

  const performancePhrase: Record<BenchmarkResult["performance"], string> = {
    excellent: "significantly more efficient",
    good: "more efficient",
    average: "about average",
    "below-average": "less efficient",
    poor: "significantly less efficient",
  };

  return (
    `This building is in the ${roundedPct}th percentile — ` +
    `${performancePhrase[performance]} than ${betterThan}% of similar ` +
    `${eraLabel} ${useLabel} buildings nationwide.`
  );
}

/**
 * Find the best matching benchmark entry for the given use type, era, and region.
 * Falls back: regional → national → different era → default use type.
 */
function findBenchmark(
  useType: string,
  era: string,
  region: string,
): BenchmarkEntry {
  // 1. Exact match (useType + era + region)
  const exact = BENCHMARK_DATA.find(
    (e) => e.useType === useType && e.era === era && e.region === region,
  );
  if (exact) return exact;

  // 2. National fallback for same useType + era
  const national = BENCHMARK_DATA.find(
    (e) => e.useType === useType && e.era === era && e.region === "national",
  );
  if (national) return national;

  // 3. Any era for same useType (pick latest available)
  const sameType = BENCHMARK_DATA
    .filter((e) => e.useType === useType)
    .sort((a, b) => b.era.localeCompare(a.era)); // latest era first
  if (sameType.length > 0) return sameType[0];

  // 4. Default use type with same era
  const defaultType = BENCHMARK_DATA.find(
    (e) =>
      e.useType === DEFAULT_USE_TYPE &&
      e.era === era &&
      e.region === "national",
  );
  if (defaultType) return defaultType;

  // 5. Absolute fallback — latest office entry
  const fallback = BENCHMARK_DATA
    .filter((e) => e.useType === DEFAULT_USE_TYPE)
    .sort((a, b) => b.era.localeCompare(a.era))[0];

  return fallback;
}

/**
 * Compare a building's energy demand against KEMCO peer benchmarks.
 *
 * @param demand  Annual primary energy demand in kWh/m²/year
 * @param useType Building use type (e.g. 'office', 'residential')
 * @param era     Building era band (e.g. '2000s', '2010s', '2020+')
 * @param region  Optional region code; defaults to 'national'
 */
export function compareToBenchmark(
  demand: number,
  useType: string,
  era: string,
  region: string = "national",
): BenchmarkResult {
  const entry = findBenchmark(useType, era, region);

  const percentile = interpolatePercentile(
    demand,
    entry.p25,
    entry.p50,
    entry.p75,
  );

  const performance = classifyPerformance(
    demand,
    entry.p25,
    entry.p50,
    entry.p75,
  );

  const peerGroup = {
    useType: entry.useType,
    era: entry.era,
    region: entry.region,
  };

  const insight = buildInsight(demand, percentile, performance, peerGroup);

  return {
    buildingDemand: demand,
    percentile,
    peerGroup,
    p25: entry.p25,
    p50: entry.p50,
    p75: entry.p75,
    performance,
    insight,
  };
}
