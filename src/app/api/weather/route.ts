import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy to KMA ASOS hourly weather data API.
 * Base: https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList
 *
 * Note: This API may require a separate service key from the building APIs.
 * Handle gracefully if unavailable.
 */

const BASE_URL =
  "https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList";

const PARAMS = [
  "stnId",
  "startDt",
  "endDt",
  "startHh",
  "endHh",
  "numOfRows",
  "pageNo",
  "dataCd",
  "dateCd",
] as const;

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-api-key header" },
      { status: 401 },
    );
  }

  const { searchParams } = request.nextUrl;
  const url = new URL(BASE_URL);

  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("_type", "json");
  url.searchParams.set("dataType", "JSON");

  for (const key of PARAMS) {
    const value = searchParams.get(key);
    if (value != null) url.searchParams.set(key, value);
  }

  // Defaults
  if (!searchParams.get("stnId")) url.searchParams.set("stnId", "108"); // Seoul
  if (!searchParams.get("dataCd")) url.searchParams.set("dataCd", "ASOS");
  if (!searchParams.get("dateCd")) url.searchParams.set("dateCd", "DAY");
  if (!searchParams.get("numOfRows")) url.searchParams.set("numOfRows", "365");
  if (!searchParams.get("pageNo")) url.searchParams.set("pageNo", "1");

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `API responded with status ${response.status}` },
        { status: 502 },
      );
    }

    const text = await response.text();

    if (text.startsWith("<?xml") || text.startsWith("<")) {
      const msgMatch = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/);
      return NextResponse.json(
        {
          error: msgMatch
            ? `Auth error: ${msgMatch[1]}`
            : "API returned XML instead of JSON. Check your API key (weather API may need separate registration).",
        },
        { status: 502 },
      );
    }

    const json = JSON.parse(text);
    const resultCode = json?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      const resultMsg =
        json?.response?.header?.resultMsg || "Unknown API error";
      return NextResponse.json(
        { error: `API error [${resultCode}]: ${resultMsg}` },
        { status: 502 },
      );
    }

    const rawItems = json?.response?.body?.items?.item;
    const items = !rawItems ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
    const totalCount = json?.response?.body?.totalCount ?? 0;

    return NextResponse.json({ items, totalCount });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Request timed out (15s)" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown fetch error",
      },
      { status: 502 },
    );
  }
}
