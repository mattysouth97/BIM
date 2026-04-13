import { NextRequest, NextResponse } from "next/server";
import { fetchFromDataGoKr, extractItems, extractTotalCount } from "@/lib/api-proxy";

const PARAMS = [
  "sigunguCd",
  "bjdongCd",
  "platGbCd",
  "bun",
  "ji",
  "numOfRows",
  "pageNo",
] as const;

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const params: Record<string, string | number> = {};

  for (const key of PARAMS) {
    const value = searchParams.get(key);
    if (value != null) params[key] = value;
  }

  const { data, error } = await fetchFromDataGoKr("recap", params, apiKey);
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
