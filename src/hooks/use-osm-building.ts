"use client";

// src/hooks/use-osm-building.ts
//
// The OpenStreetMap outline for one building, as reconstruction evidence.
//
// Deliberately a SECOND opinion rather than a fallback: it is fetched even when
// VWorld answered, because two independently digitised outlines that agree are
// stronger evidence than either alone, and two that disagree are a finding the
// user should see. `reconcileOutlines` decides which one becomes the footprint.

import { useQuery } from "@tanstack/react-query";

import type { OsmBuildingInput } from "@/lib/cad-reconstruction/types";

const EMPTY: OsmBuildingInput = {
  polygon: null,
  osmType: null,
  osmId: null,
  tags: {},
  error: null,
};

export interface OsmBuildingQuery {
  /** Preferred: a point already resolved from the government layer. */
  lat?: number | null;
  lng?: number | null;
  /** Used when no coordinates are known — geocoded through Nominatim. */
  address?: string | null;
}

async function fetchOsmBuilding(query: OsmBuildingQuery): Promise<OsmBuildingInput> {
  const params = new URLSearchParams();
  if (typeof query.lat === "number" && typeof query.lng === "number") {
    params.set("lat", String(query.lat));
    params.set("lng", String(query.lng));
  } else if (query.address) {
    params.set("address", query.address);
  } else {
    return EMPTY;
  }

  const res = await fetch(`/api/osm/building?${params.toString()}`);
  if (!res.ok) {
    // An outage is ABSENCE of evidence, never evidence of absence — the caller
    // grades a source with an error as unavailable rather than as "no building".
    return { ...EMPTY, error: `HTTP ${res.status}` };
  }
  return res.json();
}

/**
 * The centroid of a WGS84 ring, for turning a GIS outline into a query point.
 * Vertex mean is enough here: it only has to land inside the building.
 */
export function ringCentroidLngLat(
  polygon: number[][][] | null | undefined,
): { lat: number; lng: number } | null {
  const ring = polygon?.[0];
  if (!ring || ring.length === 0) return null;
  const valid = ring.filter(
    (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  // GeoJSON repeats the first vertex to close the ring; counting it twice pulls
  // the mean toward that corner and can drag the query point off the building.
  if (
    valid.length > 2 &&
    valid[0][0] === valid[valid.length - 1][0] &&
    valid[0][1] === valid[valid.length - 1][1]
  ) {
    valid.pop();
  }
  if (valid.length === 0) return null;
  return {
    lng: valid.reduce((s, p) => s + p[0], 0) / valid.length,
    lat: valid.reduce((s, p) => s + p[1], 0) / valid.length,
  };
}

export function useOsmBuilding(query: OsmBuildingQuery, enabled = true) {
  const hasPoint = typeof query.lat === "number" && typeof query.lng === "number";
  const hasTarget = hasPoint || !!query.address;

  const result = useQuery({
    queryKey: [
      "osm-building",
      hasPoint ? `${query.lat},${query.lng}` : (query.address ?? ""),
    ],
    queryFn: () => fetchOsmBuilding(query),
    enabled: enabled && hasTarget,
    // Both upstreams are rate-limited and the answer changes on the order of
    // months, so this is cached hard on the client as well as on the server.
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return {
    osm: result.data ?? null,
    isLoading: result.isLoading && hasTarget,
    hasOutline: !!result.data?.polygon && !result.data.error,
  };
}
