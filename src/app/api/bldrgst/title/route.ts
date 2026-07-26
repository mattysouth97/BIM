import { NextRequest, NextResponse } from "next/server";
import { fetchFromDataGoKr, extractItems, extractTotalCount } from "@/lib/api-proxy";
import { parseBldrgstParams, toUpstreamParams } from "../_factory";
import { resolveDataGoKrKey } from "@/lib/api-shared-key";

/**
 * P1-06 (d) — hard cap on the number of 법정동 codes queried per batch
 * request. Previously an unbounded comma list ran sequentially (each up to
 * 15 s), so 50 codes could hold the function open for minutes.
 */
export const MAX_BATCH_CODES = 10;

/** Total buildings returned from a batch is capped at this. */
const MAX_BATCH_ITEMS = 20;

export async function GET(request: NextRequest) {
  const keyResult = resolveDataGoKrKey(request);
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.error }, { status: keyResult.status });
  }
  const apiKey = keyResult.apiKey;

  const { searchParams } = request.nextUrl;
  const batchMode = searchParams.get("batchMode") === "true";

  // ── Batch mode: bounded, parallel fan-out over 법정동 codes ──────────────────
  if (batchMode) {
    const sigunguCd = searchParams.get("sigunguCd");
    if (!sigunguCd) {
      return NextResponse.json({ error: "sigunguCd is required for batchMode" }, { status: 400 });
    }

    const bjdongCdsRaw = searchParams.get("bjdongCd");
    const allCodes = bjdongCdsRaw
      ? bjdongCdsRaw.split(",").map((c) => c.trim()).filter(Boolean)
      : [""];

    // P1-06: cap the fan-out; report whether codes were dropped.
    const codes = allCodes.slice(0, MAX_BATCH_CODES);
    const truncated = allCodes.length > MAX_BATCH_CODES;

    // Parallel dispatch — worst-case latency is ONE upstream timeout, not N×.
    const results = await Promise.all(
      codes.map(async (bjdongCd) => {
        const params: Record<string, string | number> = { sigunguCd, numOfRows: 100, pageNo: 1 };
        if (bjdongCd) params.bjdongCd = bjdongCd;
        const { data, error } = await fetchFromDataGoKr("title", params, apiKey);
        return { bjdongCd, data, error };
      })
    );

    const allItems: unknown[] = [];
    const failedCodes: string[] = [];
    let totalCount = 0;
    for (const r of results) {
      if (r.error || !r.data) {
        failedCodes.push(r.bjdongCd);
        continue;
      }
      allItems.push(...extractItems(r.data));
      totalCount += extractTotalCount(r.data);
    }

    return NextResponse.json({
      items: allItems.slice(0, MAX_BATCH_ITEMS),
      totalCount,
      pageNo: 1,
      numOfRows: 100,
      truncated,
      failedCodes,
    });
  }

  // ── Normal single-query mode ────────────────────────────────────────────────
  const parsed = parseBldrgstParams(searchParams);
  if (!parsed.ok) return parsed.response;

  const upstream = toUpstreamParams(parsed.params);
  const { data, error } = await fetchFromDataGoKr("title", upstream, apiKey);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "No data returned" }, { status: 502 });
  }

  return NextResponse.json({
    items: extractItems(data),
    totalCount: extractTotalCount(data),
    pageNo: Number(upstream.pageNo) || 1,
    numOfRows: Number(upstream.numOfRows) || 20,
  });
}
