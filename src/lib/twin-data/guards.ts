// src/lib/twin-data/guards.ts
// P0-01 — shared server-only guards for the twin-data API routes:
// slug validation, containment-checked path resolution, constant-time key
// compare, and the request body-size cap. No React, no "use client".
//
// Env: TWIN_DATA_API_KEY — required for POST /api/twin-data/upload. When the
// variable is unset the upload route FAILS CLOSED with 401 (same semantics as
// CORPUS_API_KEY in /api/v1/eco2-imports). Use a placeholder value locally;
// never commit a real key.

import path from "path";
import crypto from "crypto";

export type TwinDataType = "energy-bills" | "floor-plans" | "equipment";

export const TWIN_DATA_TYPES: readonly TwinDataType[] = [
  "energy-bills",
  "floor-plans",
  "equipment",
];

/** Maximum accepted request body size, enforced on content-length pre-parse. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Slug-shaped building ids only: alphanumerics, underscore, hyphen, 1–64 chars. */
export const BUILDING_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidBuildingId(value: unknown): value is string {
  return typeof value === "string" && BUILDING_ID_PATTERN.test(value);
}

export function isValidDataType(value: unknown): value is TwinDataType {
  return (
    typeof value === "string" && (TWIN_DATA_TYPES as readonly string[]).includes(value)
  );
}

/** Absolute path of the .twin-data storage root under the current working dir. */
export function getTwinDataRoot(): string {
  return path.resolve(process.cwd(), ".twin-data");
}

/**
 * Containment-checked path builder: resolves `<root>/<buildingId>/<dataType>.json`
 * and returns null unless the result stays strictly inside the .twin-data root.
 * Defense-in-depth behind BUILDING_ID_PATTERN — callers must validate first.
 */
export function resolveTwinDataPath(
  buildingId: string,
  dataType: TwinDataType
): string | null {
  const root = getTwinDataRoot();
  const resolved = path.resolve(root, buildingId, `${dataType}.json`);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/** Constant-time key comparison — avoids leaking key length/content via timing. */
export function safeKeyEquals(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");
  if (providedBuf.length !== expectedBuf.length) return false;
  if (providedBuf.length === 0) return true;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/** True when a declared content-length exceeds MAX_BODY_BYTES. */
export function exceedsBodyCap(contentLength: string | null): boolean {
  return contentLength !== null && Number(contentLength) > MAX_BODY_BYTES;
}
