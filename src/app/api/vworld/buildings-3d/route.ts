// src/app/api/vworld/buildings-3d/route.ts
// Server-side proxy for VWorld's building-outline dataset (LT_C_SPBD — simple
// building polygons). Returns per-building footprint rings plus floor-count
// attributes so the viewer can extrude real geometry at the highest level of
// detail available in the public dataset.
//
// Cadastral parcels (LP_PA_CBND_BUBUN) give us site boundaries — this route
// provides building geometry itself, with height inferred from floor counts.

import { NextRequest, NextResponse } from "next/server";

const VWORLD_DATA_URL = "https://api.vworld.kr/req/data";
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN ?? "localhost";
const BUILDINGS_DATASET = "LT_C_SPBD"; // 건물통합정보 간략화 폴리곤
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

export async function GET(request: NextRequest) {
  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    return NextResponse.json<VWorldBuildings3DResponse>(
      {
        buildings: [],
        error: "VWORLD_API_KEY environment variable is not set",
        dataset: BUILDINGS_DATASET,
        fetchedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radiusM = parseFloat(searchParams.get("radiusM") ?? "120");
  const size = Math.max(1, Math.min(50, parseInt(searchParams.get("size") ?? "20", 10)));

  if (!lat || !lng) {
    return NextResponse.json<VWorldBuildings3DResponse>(
      {
        buildings: [],
        error: "lat and lng are required query parameters",
        dataset: BUILDINGS_DATASET,
        fetchedAt: new Date().toISOString(),
      },
      { status: 400 }
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  // Approximate degree delta for the requested radius. One degree of latitude
  // ≈ 111 km; longitude compensated by cos(lat).
  const latDelta = radiusM / 111_000;
  const lngDelta = radiusM / (111_000 * Math.cos((latNum * Math.PI) / 180));

  const minLng = lngNum - lngDelta;
  const minLat = latNum - latDelta;
  const maxLng = lngNum + lngDelta;
  const maxLat = latNum + latDelta;
  const bbox = `BOX(${minLng},${minLat},${maxLng},${maxLat})`;

  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", BUILDINGS_DATASET);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("geomFilter", bbox);
  url.searchParams.set("size", String(size));
  url.searchParams.set("format", "json");
  url.searchParams.set("geometry", "true");
  url.searchParams.set("attribute", "true");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json<VWorldBuildings3DResponse>({
        buildings: [],
        error: `VWorld HTTP ${res.status}`,
        dataset: BUILDINGS_DATASET,
        fetchedAt: new Date().toISOString(),
      });
    }

    const data = await res.json();
    const buildings = extractBuildings(data);

    return NextResponse.json<VWorldBuildings3DResponse>({
      buildings,
      error: null,
      dataset: BUILDINGS_DATASET,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json<VWorldBuildings3DResponse>({
      buildings: [],
      error: err instanceof Error ? err.message : "VWorld request failed",
      dataset: BUILDINGS_DATASET,
      fetchedAt: new Date().toISOString(),
    });
  }
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
