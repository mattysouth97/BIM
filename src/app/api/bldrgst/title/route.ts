import { NextRequest, NextResponse } from "next/server";
import { fetchFromDataGoKr, extractItems, extractTotalCount } from "@/lib/api-proxy";

const PARAMS = [
  "sigunguCd",
  "bjdongCd",
  "platGbCd",
  "bun",
  "ji",
  "mainPurpsCd",
  "numOfRows",
  "pageNo",
] as const;

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const batchMode = searchParams.get("batchMode") === "true";

  // ── Batch mode: query multiple 법정동 codes in one request ──────────────────
  if (batchMode) {
    const sigunguCd = searchParams.get("sigunguCd");
    if (!sigunguCd) {
      return NextResponse.json({ error: "sigunguCd is required for batchMode" }, { status: 400 });
    }

    // Accept comma-separated bjdongCd values
    const bjdongCdsRaw = searchParams.get("bjdongCd");
    const bjdongCds = bjdongCdsRaw
      ? bjdongCdsRaw.split(",").map((c) => c.trim()).filter(Boolean)
      : [""];

    const allItems: unknown[] = [];
    let totalCount = 0;

    for (const bjdongCd of bjdongCds) {
      const params: Record<string, string | number> = {
        sigunguCd,
        numOfRows: 100,
        pageNo: 1,
      };
      if (bjdongCd) params.bjdongCd = bjdongCd;

      const { data, error } = await fetchFromDataGoKr("title", params, apiKey);
      if (error || !data) continue;

      const items = extractItems(data);
      allItems.push(...items);
      totalCount += extractTotalCount(data);

      // Cap at 20 buildings total
      if (allItems.length >= 20) break;
    }

    const capped = allItems.slice(0, 20);

    return NextResponse.json({
      items: capped,
      totalCount,
      pageNo: 1,
      numOfRows: 100,
    });
  }

  // ── Normal single-query mode ────────────────────────────────────────────────
  const params: Record<string, string | number> = {};

  for (const key of PARAMS) {
    const value = searchParams.get(key);
    if (value != null) params[key] = value;
  }

  const { data, error } = await fetchFromDataGoKr("title", params, apiKey);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "No data returned" }, { status: 502 });
  }

  const items = extractItems(data);
  const totalCount = extractTotalCount(data);

  return NextResponse.json({
    items,
    totalCount,
    pageNo: Number(params.pageNo) || 1,
    numOfRows: Number(params.numOfRows) || 20,
  });
}
