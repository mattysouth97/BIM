"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  CalibrationReport,
  ReleaseManifest,
} from "@/lib/twin/release-types";

const DEFAULT_RELEASE = "v0.1.0";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Release asset not available: ${url} (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export interface PredictionReleaseBundle {
  manifest: ReleaseManifest;
  calibration: CalibrationReport;
}

/**
 * Loads the published prediction release (manifest + calibration) from the
 * static `/releases/<version>/` directory. Versioned assets are immutable —
 * once a release is shipped, the files never mutate; therefore the hook uses
 * an aggressive cache strategy.
 */
export function usePredictionRelease(version: string = DEFAULT_RELEASE) {
  return useQuery<PredictionReleaseBundle>({
    queryKey: ["prediction-release", version],
    queryFn: async () => {
      const [manifest, calibration] = await Promise.all([
        fetchJson<ReleaseManifest>(`/releases/${version}/manifest.json`),
        fetchJson<CalibrationReport>(`/releases/${version}/calibration.json`),
      ]);
      return { manifest, calibration };
    },
    staleTime: Infinity,
    retry: 0,
  });
}
