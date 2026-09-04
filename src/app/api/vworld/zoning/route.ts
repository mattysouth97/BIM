import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * 용도지역 lookup (P2-31).
 *
 * The 건축물대장 states no 용도지역, and 정북방향 일조권 사선제한 (건축법
 * 시행령 제86조) only applies in 전용주거지역 and 일반주거지역 — so without
 * this the reconstruction can recognise the stepped-north pattern but cannot
 * say the rule is why. VWorld's `LT_C_UQ111` returns the district verbatim in
 * `uname`, which turns the rationale from a guess into a citation.
 *
 * This route decides nothing. It reports the district or reports that it could
 * not, and `chooseSetbackFace` treats an absent district as unknown — never as
 * residential.
 */

const VWORLD_DATA_URL = "https://api.vworld.kr/req/data";
const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN ?? "localhost";

/** 용도지역 (도시지역·관리지역 등의 지정) — the layer carrying `uname`. */
const ZONING_DATASET = "LT_C_UQ111";

/** A point query returns every district polygon overlapping a small box. */
const ZONING_SIZE = 10;
/** Half-width of the probe box around the point, in metres. */
const PROBE_HALF_M = 20;

const finiteCoord = z
  .string()
  .refine((s) => s.trim() !== "" && Number.isFinite(Number(s)), "must be a finite number")
  .transform((s) => Number(s));

const pointSchema = z.object({ lat: finiteCoord, lng: finiteCoord });

interface ZoningResponse {
  /** `uname` verbatim, or null when the layer did not answer. */
  district: string | null;
  /** Every district found in the probe box, most-overlapping first. */
  candidates: string[];
  source: string;
  error: string | null;
}

function empty(error: string | null): ZoningResponse {
  return { district: null, candidates: [], source: ZONING_DATASET, error };
}

/**
 * Read district names out of a VWorld GetFeature body.
 *
 * A district is only reported when `uname` is a non-empty string. AFF-6: an
 * absent value is absent, never a fabricated default.
 */
function extractDistricts(data: unknown): string[] {
  const features = (
    data as {
      response?: {
        result?: { featureCollection?: { features?: unknown[] } };
      };
    }
  )?.response?.result?.featureCollection?.features;
  if (!Array.isArray(features)) return [];

  const names: string[] = [];
  for (const feature of features) {
    const uname = (feature as { properties?: { uname?: unknown } })?.properties?.uname;
    if (typeof uname !== "string") continue;
    const trimmed = uname.trim();
    if (trimmed.length > 0 && !names.includes(trimmed)) names.push(trimmed);
  }
  return names;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    // Server misconfiguration → 503, distinct from an upstream failure.
    return NextResponse.json(
      empty("VWorld API is not configured on this server"),
      { status: 503 },
    );
  }

  const parsed = pointSchema.safeParse({
    lat: request.nextUrl.searchParams.get("lat") ?? "",
    lng: request.nextUrl.searchParams.get("lng") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      empty("zoning lookup requires finite lat and lng"),
      { status: 400 },
    );
  }

  const { lat, lng } = parsed.data;
  const dLat = PROBE_HALF_M / 111_320;
  const dLng = PROBE_HALF_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `BOX(${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat})`;

  const url = new URL(VWORLD_DATA_URL);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", ZONING_DATASET);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", VWORLD_DOMAIN);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("geomFilter", bbox);
  url.searchParams.set("size", String(ZONING_SIZE));
  url.searchParams.set("attribute", "true");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      // Never echo the key or the composed URL (AFF-2) — status only.
      return NextResponse.json(
        empty(`VWorld responded ${res.status}`),
        { status: 502 },
      );
    }
    const candidates = extractDistricts(await res.json());
    return NextResponse.json({
      // The first feature is the closest match for the probe point. When the
      // box straddles a boundary the rest are reported so a caller can see the
      // ambiguity rather than trusting a coin flip.
      district: candidates[0] ?? null,
      candidates,
      source: ZONING_DATASET,
      error: candidates.length > 0 ? null : "no 용도지역 feature at this point",
    } satisfies ZoningResponse);
  } catch (cause) {
    // Surface the transport failure code, not just "fetch failed". A bare
    // message cost two sessions an hour diagnosing a VWorld outage today.
    // The code is a fixed enum from undici (ENOTFOUND, ECONNREFUSED,
    // UND_ERR_CONNECT_TIMEOUT, …) — never a key, a URL or user input (AFF-2).
    const code =
      cause instanceof Error && typeof (cause.cause as { code?: unknown })?.code === "string"
        ? ((cause.cause as { code: string }).code)
        : cause instanceof Error && cause.name === "TimeoutError"
          ? "TIMEOUT"
          : "UNKNOWN";
    console.warn(`[vworld] zoning: upstream request failed (${code})`);
    return NextResponse.json(
      empty(`VWorld zoning lookup failed (${code})`),
      { status: 502 },
    );
  }
}
