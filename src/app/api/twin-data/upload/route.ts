import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type DataType = "energy-bills" | "floor-plans" | "equipment";

const VALID_DATA_TYPES = new Set<DataType>(["energy-bills", "floor-plans", "equipment"]);

function getTwinDataPath(buildingId: string, dataType: DataType): string {
  return path.join(process.cwd(), ".twin-data", buildingId, `${dataType}.json`);
}

export async function POST(request: NextRequest) {
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

  if (!buildingId || typeof buildingId !== "string" || buildingId.trim() === "") {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
  }

  if (!dataType || !VALID_DATA_TYPES.has(dataType as DataType)) {
    return NextResponse.json(
      { error: `dataType must be one of: ${[...VALID_DATA_TYPES].join(", ")}` },
      { status: 400 }
    );
  }

  if (data === undefined || data === null) {
    return NextResponse.json({ error: "data must not be empty" }, { status: 400 });
  }

  const filePath = getTwinDataPath(buildingId.trim(), dataType as DataType);
  const dir = path.dirname(filePath);

  try {
    await fs.mkdir(dir, { recursive: true });
    const payload = {
      buildingId: buildingId.trim(),
      dataType,
      data,
      storedAt: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.error("[twin-data/upload] write error:", err);
    return NextResponse.json({ error: "Failed to store data" }, { status: 500 });
  }

  return NextResponse.json({ success: true, storedAt: filePath });
}
