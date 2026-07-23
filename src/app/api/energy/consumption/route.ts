import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveDataGoKrKey } from "@/lib/api-shared-key";

/**
 * Proxy to data.go.kr Building Energy Hub API (건물에너지정보).
 * P1-06 (e): doc corrected to the service actually called (BldEngyHubService)
 * and the leading TAB stripped from the BASE_URL literal.
 */

const BASE_URL = "https://apis.data.go.kr/1613000/BldEngyHubService";

/** P1-06 (f): validated query params; numOfRows clamped to [1, 100]. */
const MAX_NUM_OF_ROWS = 100;
const positiveInt = z.string().regex(/^\d+$/, "must be a positive integer");
const consumptionParamsSchema = z.object({
  mgmBldrgstPk: z.string().optional(),
  year: z.string().optional(),
  numOfRows: positiveInt.optional(),
  pageNo: positiveInt.optional(),
});

export async function GET(request: NextRequest) {
  const keyResult = resolveDataGoKrKey(request);
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.error }, { status: keyResult.status });
  }
  const apiKey = keyResult.apiKey;

  const { searchParams } = request.nextUrl;
  const raw: Record<string, string> = {};
  for (const key of ["mgmBldrgstPk", "year", "numOfRows", "pageNo"]) {
    const value = searchParams.get(key);
    if (value != null) raw[key] = value;
  }
  const parsed = consumptionParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("_type", "json");

  if (parsed.data.mgmBldrgstPk) url.searchParams.set("mgmBldrgstPk", parsed.data.mgmBldrgstPk);
  if (parsed.data.year) url.searchParams.set("year", parsed.data.year);
  const numOfRows = Math.min(Number(parsed.data.numOfRows ?? 12), MAX_NUM_OF_ROWS);
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", String(Number(parsed.data.pageNo ?? 1)));

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
            : "API returned XML instead of JSON. Check your API key.",
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

    // Extract items
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
