// POST /api/twin-data/upload — store user-supplied twin data on local disk.
//
//   413 — declared content-length exceeds 64 KB (checked before body parsing)
//   401 — missing/invalid x-twin-data-key header (must match TWIN_DATA_API_KEY
//         env; FAILS CLOSED with 401 when the env var is unset)
//   400 — malformed JSON, non-slug buildingId, unknown dataType, empty data,
//         or a path that would escape the .twin-data root
//   200 — stored; response is { success, storedAt: <ISO timestamp> } and never
//         contains a filesystem path

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  exceedsBodyCap,
  isValidBuildingId,
  isValidDataType,
  resolveTwinDataPath,
  safeKeyEquals,
  TWIN_DATA_TYPES,
} from "@/lib/twin-data/guards";

export async function POST(request: NextRequest) {
  if (exceedsBodyCap(request.headers.get("content-length"))) {
    return NextResponse.json({ error: "Request body exceeds 64 KB limit" }, { status: 413 });
  }

  const providedKey = request.headers.get("x-twin-data-key");
  const expectedKey = process.env.TWIN_DATA_API_KEY;
  if (!expectedKey || !providedKey || !safeKeyEquals(providedKey, expectedKey)) {
    return NextResponse.json({ error: "Invalid or missing x-twin-data-key" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const { buildingId, dataType, data } = body as Record<string, unknown>;

  if (!isValidBuildingId(buildingId)) {
    return NextResponse.json(
      { error: "buildingId must match [A-Za-z0-9_-]{1,64}" },
      { status: 400 }
    );
  }

  if (!isValidDataType(dataType)) {
    return NextResponse.json(
      { error: `dataType must be one of: ${TWIN_DATA_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (data === undefined || data === null) {
    return NextResponse.json({ error: "data must not be empty" }, { status: 400 });
  }

  const filePath = resolveTwinDataPath(buildingId, dataType);
  if (filePath === null) {
    return NextResponse.json({ error: "buildingId resolves outside storage root" }, { status: 400 });
  }

  const storedAt = new Date().toISOString();

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const payload = { buildingId, dataType, data, storedAt };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.error("[twin-data/upload] write error:", err);
    return NextResponse.json({ error: "Failed to store data" }, { status: 500 });
  }

  return NextResponse.json({ success: true, storedAt });
}
