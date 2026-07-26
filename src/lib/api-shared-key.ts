import type { NextRequest } from "next/server";

/**
 * Resolves the data.go.kr service key for a proxy route.
 *
 * Priority:
 *  1. The caller's own `x-api-key` header always works (their own quota).
 *  2. Otherwise fall back to the shared server-side key
 *     (`process.env.DATA_GO_KR_API_KEY`) so outside viewers can use the public
 *     demo — but ONLY for **same-origin** requests (the app's own client) and
 *     **rate-limited per IP**, so the shared credential is not usable by
 *     arbitrary external scripts. The secret never leaves the server.
 *
 * Returns either the resolved key or an HTTP status + message to reject with.
 */
export type KeyResolution =
  | { ok: true; apiKey: string }
  | { ok: false; status: number; error: string };

// Fixed-window per-IP limiter for the SHARED-key fallback only (a caller using
// their own key is never rate-limited here). In-memory + per-instance — a
// best-effort deterrent on serverless, not a hard global cap; a durable limit
// would need a shared store (KV/Redis).
const FALLBACK_WINDOW_MS = 60_000;
const FALLBACK_MAX_PER_WINDOW = 30;
const fallbackBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Same-origin means the request's Origin/Referer host matches the app's host. */
function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get("host");
  if (!host) return false;
  const candidate = request.headers.get("origin") ?? request.headers.get("referer");
  if (!candidate) return false; // no Origin/Referer (e.g. curl) → not same-origin
  try {
    return new URL(candidate).host === host;
  } catch {
    return false;
  }
}

/** True if this IP is within the shared-key rate budget (and consumes a token). */
function takeFallbackToken(ip: string): boolean {
  const now = Date.now();
  const bucket = fallbackBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    fallbackBuckets.set(ip, { count: 1, resetAt: now + FALLBACK_WINDOW_MS });
    return true;
  }
  if (bucket.count >= FALLBACK_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

export function resolveDataGoKrKey(request: NextRequest): KeyResolution {
  const clientKey = request.headers.get("x-api-key");
  if (clientKey) return { ok: true, apiKey: clientKey };

  const shared = process.env.DATA_GO_KR_API_KEY;
  // No caller key and no shared key configured → same 401 as before.
  if (!shared) return { ok: false, status: 401, error: "Missing x-api-key header" };

  // Shared fallback: same-origin only, so external scripts can't use the key.
  if (!isSameOrigin(request)) {
    return { ok: false, status: 401, error: "Missing x-api-key header" };
  }
  // Rate-limit the shared key per IP.
  if (!takeFallbackToken(clientIp(request))) {
    return {
      ok: false,
      status: 429,
      error: "Rate limit exceeded for the shared demo key — provide your own API key.",
    };
  }
  return { ok: true, apiKey: shared };
}
