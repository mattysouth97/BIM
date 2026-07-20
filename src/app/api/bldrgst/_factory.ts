// src/app/api/bldrgst/_factory.ts
// P1-06 (c, f) — one factory for the five copy-paste data.go.kr proxy routes
// (areas, basis, floors, jijugu, recap). Provides a uniform error contract,
// zod-validated params, and numOfRows clamping so a contract fix lands once.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchFromDataGoKr, extractItems, extractTotalCount } from "@/lib/api-proxy";
import type { EndpointKey } from "@/lib/constants";

/** data.go.kr caps page size at 100; clamp caller-supplied values into [1, 100]. */
export const MAX_NUM_OF_ROWS = 100;

/**
 * Shared query-param schema. Ledger codes are free-form strings passed through
 * to the upstream API; the numeric paging params are validated + clamped here
 * so a hostile `numOfRows=99999` can't request an unbounded page.
 */
const positiveIntFromQuery = z
  .string()
  .regex(/^\d+$/, "must be a positive integer")
  .transform((s) => Number(s));

export const bldrgstParamsSchema = z.object({
  sigunguCd: z.string().optional(),
  bjdongCd: z.string().optional(),
  platGbCd: z.string().optional(),
  bun: z.string().optional(),
  ji: z.string().optional(),
  mainPurpsCd: z.string().optional(),
  numOfRows: positiveIntFromQuery.optional(),
  pageNo: positiveIntFromQuery.optional(),
});

export type BldrgstParams = z.infer<typeof bldrgstParamsSchema>;

/** Parse + clamp query params; returns either the params or a 400 response. */
export function parseBldrgstParams(
  searchParams: URLSearchParams
): { ok: true; params: BldrgstParams } | { ok: false; response: NextResponse } {
  const raw: Record<string, string> = {};
  for (const key of ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji", "mainPurpsCd", "numOfRows", "pageNo"]) {
    const value = searchParams.get(key);
    if (value != null) raw[key] = value;
  }

  const result = bldrgstParamsSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid query parameters", issues: result.error.issues.map((i) => ({ path: i.path, message: i.message })) },
        { status: 400 }
      ),
    };
  }
  return { ok: true, params: result.data };
}

/** Build the upstream param record with numOfRows clamped and defaults applied. */
export function toUpstreamParams(params: BldrgstParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = value;
  }
  const numOfRows = Math.min(params.numOfRows ?? 20, MAX_NUM_OF_ROWS);
  out.numOfRows = numOfRows;
  out.pageNo = params.pageNo ?? 1;
  return out;
}

/**
 * Create a GET handler for a data.go.kr building-ledger endpoint.
 * Error contract: 401 (no key) · 400 (bad params) · 502 (upstream failure).
 */
export function createDataGoKrProxy(endpoint: EndpointKey) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
    }

    const parsed = parseBldrgstParams(request.nextUrl.searchParams);
    if (!parsed.ok) return parsed.response;

    const upstream = toUpstreamParams(parsed.params);
    const { data, error } = await fetchFromDataGoKr(endpoint, upstream, apiKey);
    if (error || !data) {
      return NextResponse.json({ error: error ?? "No data returned" }, { status: 502 });
    }

    return NextResponse.json({
      items: extractItems(data),
      totalCount: extractTotalCount(data),
      pageNo: Number(upstream.pageNo) || 1,
      numOfRows: Number(upstream.numOfRows) || 20,
    });
  };
}
