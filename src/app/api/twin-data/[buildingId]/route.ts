// GET /api/twin-data/[buildingId] — read stored twin data for a building.
//
//   400 — buildingId is not a slug ([A-Za-z0-9_-]{1,64}) or would escape the
//         .twin-data root (rejected before any filesystem access)
//   404 — valid slug with no stored data
//   200 — { lastUpdated, energyBills?, floorPlans?, equipment? } where
//         lastUpdated is the max storedAt across stored files (file mtime as
//         fallback), never the response wall-clock time
//
// GET is intentionally unauthenticated in P0-01; write hardening is the P0.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import {
  isValidBuildingId,
  resolveTwinDataPath,
  TWIN_DATA_TYPES,
  type TwinDataType,
} from "@/lib/twin-data/guards";

interface StoredEntry {
  dataType: TwinDataType;
  data: unknown;
  storedAt: string | null;
}

async function readDataFile(filePath: string): Promise<Omit<StoredEntry, "dataType"> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { data?: unknown; storedAt?: unknown };
    if (parsed.data === undefined || parsed.data === null) return null;
    const storedAt =
      typeof parsed.storedAt === "string" && parsed.storedAt !== ""
        ? parsed.storedAt
        : (await fs.stat(filePath)).mtime.toISOString();
    return { data: parsed.data, storedAt };
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;

  if (!isValidBuildingId(buildingId)) {
    return NextResponse.json(
      { error: "buildingId must match [A-Za-z0-9_-]{1,64}" },
      { status: 400 }
    );
  }

  const results: StoredEntry[] = [];
  for (const dataType of TWIN_DATA_TYPES) {
    const filePath = resolveTwinDataPath(buildingId, dataType);
    if (filePath === null) {
      return NextResponse.json(
        { error: "buildingId resolves outside storage root" },
        { status: 400 }
      );
    }
    const entry = await readDataFile(filePath);
    if (entry !== null) {
      results.push({ dataType, data: entry.data, storedAt: entry.storedAt });
    }
  }

  if (results.length === 0) {
    return NextResponse.json(
      { error: `No data found for buildingId: ${buildingId}` },
      { status: 404 }
    );
  }

  const lastUpdated = results
    .map((r) => r.storedAt)
    .filter((s): s is string => s !== null)
    .reduce((max, s) => (new Date(s).getTime() > new Date(max).getTime() ? s : max));

  const response: Record<string, unknown> = { lastUpdated };

  for (const { dataType, data } of results) {
    // Map dataType keys to camelCase response fields
    const key =
      dataType === "energy-bills"
        ? "energyBills"
        : dataType === "floor-plans"
        ? "floorPlans"
        : "equipment";
    response[key] = data;
  }

  return NextResponse.json(response);
}
