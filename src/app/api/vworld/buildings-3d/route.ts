// src/app/api/vworld/buildings-3d/route.ts
// Server-side proxy for VWorld building-outline datasets. Tries a fallback
// chain of likely dataset IDs (the precise one available depends on the
// API key's permissions) and returns the first non-empty result. Returns
// per-building footprint rings plus floor-count attributes so the viewer
// can extrude real geometry at the highest level of detail available in
// the public dataset.
//
// Override the dataset list at runtime with `?dataset=ID` (single) or
// `VWORLD_3D_DATASETS=ID1,ID2,...` env var (chain).
//
// Cadastral parcels (LP_PA_CBND_BUBUN) give us site boundaries — this route
// provides building geometry itself, with height inferred from floor counts.

import { NextRequest, NextResponse } from "next/server";

const VWORLD_DATA_URL = "https://api.vworld.kr/req/data";
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN ?? "localhost";

// Fallback chain — first match wins. Order verified empirically against this
// repo's API key (deep-dive trace 2026-04-29):
//   LT_C_SPBD          → confirmed working, returns real building polygons
//   LT_C_USABDLT_PG    → returns "ERROR" (likely not in our key tier)
//   LT_C_AISBLDG       → returns "ERROR" (likely not in our key tier)
// LT_C_SPBD is therefore primary. The other two stay in the chain only as
// future-proofing in case VWorld changes tier coverage.
const DEFAULT_DATASETS = [
  "LT_C_SPBD",       // 건물통합정보 간략화 폴리곤 — verified working
  "LT_C_USABDLT_PG", // 건물통합정보 폴리곤 (fallback)
  "LT_C_AISBLDG",    // 건물 물리적 정보 (fallback)
] as const;

const ENV_DATASETS = (process.env.VWORLD_3D_DATASETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const STOREY_HEIGHT_M = 3.3;

export interface VWorldBuilding3D {
  /** Stable VWorld identifier when present; otherwise a synthesised index key. */
  id: string;
  /** Building name if published, empty string otherwise. */
  name: string;
  /** Polygon rings as [lng, lat] pairs in WGS-84 (outer ring first). */
  polygon: number[][][];
  /** Floors above grade reported by VWorld, NaN if missing. */
  floorsAbove: number;
  /** Floors below grade reported by VWorld, NaN if missing. */
  floorsBelow: number;
  /** Inferred height in metres (floorsAbove × 3.3m). */
  heightM: number;
  /** Loose roof typology string when published. */
  roofType: string;
  /** Use code (mainPurpsCd) when published. */
  useCode: string;
}

export interface VWorldBuildings3DResponse {
  buildings: VWorldBuilding3D[];
  error: string | null;
  dataset: string;
  fetchedAt: string;
}

function resolveDatasets(searchParams: URLSearchParams): readonly string[] {
  const explicit = searchParams.get("dataset");
  if (explicit && explicit.trim().length > 0) return [explicit.trim()];
  if (ENV_DATASETS.length > 0) return ENV_DATASETS;
  return DEFAULT_DATASETS;
}

async function fetchDataset(opts: {
  apiKey: string;
  dataset: string;
  bbox: string;
  size: number;
}): Promise<{ buildings: VWorldBuilding3D[]; error: string | null }> {
  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", opts.dataset);
  url.searchParams.set("key", opts.apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("geomFilter", opts.bbox);
  url.searchParams.set("size", String(opts.size));
  url.searchParams.set("format", "json");
  url.searchParams.set("geometry", "true");
  url.searchParams.set("attribute", "true");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { buildings: [], error: `${opts.dataset}: HTTP ${res.status}` };
    }
    const data = await res.json();
    // Surface VWorld's own status text when present (e.g. NOT_FOUND / KEY_INVALID).
    const status = (data as { response?: { status?: string } })?.response?.status;
    if (status && status !== "OK") {
      return { buildings: [], error: `${opts.dataset}: ${status}` };
    }
    const buildings = extractBuildings(data);
    return { buildings, error: null };
  } catch (err) {
    return {
      buildings: [],
      error: `${opts.dataset}: ${err instanceof Error ? err.message : "request failed"}`,
    };
  }
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.VWORLD_API_KEY;
  const { searchParams } = request.nextUrl;
  const datasets = resolveDatasets(searchParams);
  const debug = searchParams.get("debug") === "true";

  const baseResp = (
    overrides: Partial<VWorldBuildings3DResponse>,
  ): VWorldBuildings3DResponse => ({
    buildings: [],
    error: null,
    dataset: datasets[0] ?? "",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  });

  if (!apiKey) {
    return NextResponse.json<VWorldBuildings3DResponse>(
      baseResp({ error: "VWORLD_API_KEY environment variable is not set" }),
      { status: 500 },
    );
  }

  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radiusM = parseFloat(searchParams.get("radiusM") ?? "120");
  const size = Math.max(1, Math.min(50, parseInt(searchParams.get("size") ?? "20", 10)));

  if (!lat || !lng) {
    return NextResponse.json<VWorldBuildings3DResponse>(
      baseResp({ error: "lat and lng are required query parameters" }),
      { status: 400 },
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const latDelta = radiusM / 111_000;
  const lngDelta = radiusM / (111_000 * Math.cos((latNum * Math.PI) / 180));
  const bbox = `BOX(${lngNum - lngDelta},${latNum - latDelta},${lngNum + lngDelta},${latNum + latDelta})`;

  const attempts: Array<{ dataset: string; error: string | null; count: number }> = [];

  for (const dataset of datasets) {
    const r = await fetchDataset({ apiKey, dataset, bbox, size });
    attempts.push({ dataset, error: r.error, count: r.buildings.length });
    if (r.buildings.length > 0) {
      return NextResponse.json<VWorldBuildings3DResponse>({
        buildings: r.buildings,
        error: null,
        dataset,
        fetchedAt: new Date().toISOString(),
        ...(debug ? { _attempts: attempts } as Record<string, unknown> : {}),
      } as VWorldBuildings3DResponse);
    }
  }

  // None of the datasets returned features. Surface the chain of attempts so
  // the user sees which datasets were tried and why each failed/was empty.
  const errorSummary = attempts
    .map((a) => `${a.dataset}: ${a.error ?? "0 features"}`)
    .join(" | ");

  return NextResponse.json<VWorldBuildings3DResponse>({
    buildings: [],
    error: `No buildings from any dataset · ${errorSummary}`,
    dataset: datasets[datasets.length - 1] ?? "",
    fetchedAt: new Date().toISOString(),
    ...(debug ? { _attempts: attempts } as Record<string, unknown> : {}),
  } as VWorldBuildings3DResponse);
}

function extractBuildings(raw: unknown): VWorldBuilding3D[] {
  try {
    const response = raw as {
      response?: {
        status?: string;
        result?: {
          featureCollection?: {
            features?: Array<{
              properties?: Record<string, unknown>;
              geometry?: {
                type?: string;
                coordinates?: number[][][] | number[][][][];
              };
            }>;
          };
        };
      };
    };

    if (response?.response?.status !== "OK") return [];
    const features = response.response?.result?.featureCollection?.features;
    if (!features || features.length === 0) return [];

    const results: VWorldBuilding3D[] = [];

    features.forEach((feature, idx) => {
      const geometry = feature.geometry;
      if (!geometry?.coordinates) return;

      let rings: number[][][];
      if (geometry.type === "MultiPolygon") {
        // Use the first polygon part (largest portion of the building).
        rings = ((geometry.coordinates as number[][][][])[0] ?? []) as number[][][];
      } else if (geometry.type === "Polygon") {
        rings = geometry.coordinates as number[][][];
      } else {
        return;
      }

      rings = rings.filter((ring) => ring.length >= 3);
      if (rings.length === 0) return;

      const props = feature.properties ?? {};
      const floorsAbove = readNumber(props, [
        "gro_flo_co", // ground-floor count (common VWorld field)
        "grnd_flr_co",
        "GRO_FLO_CO",
        "agFlrCo",
      ]);
      const floorsBelow = readNumber(props, [
        "und_flo_co",
        "ugrnd_flr_co",
        "UND_FLO_CO",
        "ugFlrCo",
      ]);
      const reportedHeight = readNumber(props, [
        "heit",
        "height",
        "BDTYP_CD",
      ]);
      const heightM = Number.isFinite(reportedHeight) && reportedHeight > 0
        ? reportedHeight
        : Number.isFinite(floorsAbove) && floorsAbove > 0
          ? floorsAbove * STOREY_HEIGHT_M
          : 0;

      const id = readString(props, ["bdmgt_sn", "bld_id", "pnu", "ufid"]) ||
        `bld-${idx}`;

      results.push({
        id,
        name: readString(props, ["bld_nm", "bldNm", "BLD_NM"]) ?? "",
        polygon: rings,
        floorsAbove: Number.isFinite(floorsAbove) ? floorsAbove : NaN,
        floorsBelow: Number.isFinite(floorsBelow) ? floorsBelow : NaN,
        heightM,
        roofType: readString(props, ["bld_rf_cd_nm", "roofCdNm"]) ?? "",
        useCode: readString(props, ["mainPurpsCd", "main_purps_cd"]) ?? "",
      });
    });

    return results;
  } catch {
    return [];
  }
}

function readNumber(props: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const raw = props[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function readString(
  props: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const raw = props[key];
    if (raw === undefined || raw === null) continue;
    const str = String(raw).trim();
    if (str.length > 0) return str;
  }
  return null;
}
