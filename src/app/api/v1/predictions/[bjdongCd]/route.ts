// src/app/api/v1/predictions/[bjdongCd]/route.ts
// GET /api/v1/predictions/{bjdongCd} — Phase 35 Task 9.
//
// Returns latest-release prediction rows for a 법정동 code.
//   200 — rows found
//   404 — bjdongCd not present in the latest release
//   503 — no release published, or release has no readable predictions file
//   429 — rate limit exceeded (60 req/min per IP, in-memory token bucket —
//         Phase 35 stopgap; Phase 37 replaces with proper edge/platform
//         rate limiting per the plan's R11 mitigation)
//   400 — malformed bjdongCd (must be exactly 10 digits)

import { NextRequest, NextResponse } from "next/server";
import { StaticFileReleaseStore, type ReleaseStore } from "@/lib/portfolio/release-store";

const BJDONG_CD_PATTERN = /^\d{10}$/;

// ─── Rate limiting — simple in-memory token bucket, 60 req/min per IP ───────
// Phase 35 stopgap per plan A4/R11. Resets on server restart; not shared
// across serverless instances. Formal rate limiting is Phase 37 scope.

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Injectable for tests — default is the production StaticFileReleaseStore.
let releaseStore: ReleaseStore = new StaticFileReleaseStore();

/** Test-only hook to inject a fake ReleaseStore. */
export function __setReleaseStoreForTests(store: ReleaseStore): void {
  releaseStore = store;
}

export function __resetReleaseStoreForTests(): void {
  releaseStore = new StaticFileReleaseStore();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bjdongCd: string }> }
) {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded (60 req/min per IP)" },
      { status: 429 }
    );
  }

  const { bjdongCd } = await params;

  if (!bjdongCd || !BJDONG_CD_PATTERN.test(bjdongCd)) {
    return NextResponse.json(
      { error: "bjdongCd must be exactly 10 digits" },
      { status: 400 }
    );
  }

  const result = await releaseStore.getPredictions("latest", bjdongCd);

  switch (result.status) {
    case "ok":
      return NextResponse.json({
        rows: result.rows,
        releaseVersion: result.releaseVersion,
        schemaVersion: result.schemaVersion,
        generatedAt: result.generatedAt,
      });
    case "unknown-region":
      return NextResponse.json(
        { error: `No predictions found for bjdongCd: ${bjdongCd}` },
        { status: 404 }
      );
    case "data-unavailable":
      return NextResponse.json(
        { error: "release-data-unavailable", detail: result.reason },
        { status: 503 }
      );
  }
}
