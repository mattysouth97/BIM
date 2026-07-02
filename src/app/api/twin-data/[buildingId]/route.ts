import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type DataType = "energy-bills" | "floor-plans" | "equipment";

const DATA_TYPES: DataType[] = ["energy-bills", "floor-plans", "equipment"];

function getTwinDataPath(buildingId: string, dataType: DataType): string {
  return path.join(process.cwd(), ".twin-data", buildingId, `${dataType}.json`);
}

async function readDataFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { data: unknown };
    return parsed.data;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;

  if (!buildingId || buildingId.trim() === "") {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
  }

  const results = await Promise.all(
    DATA_TYPES.map(async (dataType) => {
      const filePath = getTwinDataPath(buildingId, dataType);
      const data = await readDataFile(filePath);
      return { dataType, data };
    })
  );

  const hasAnyData = results.some((r) => r.data !== null);

  if (!hasAnyData) {
    return NextResponse.json(
      { error: `No data found for buildingId: ${buildingId}` },
      { status: 404 }
    );
  }

  const response: Record<string, unknown> = {
    lastUpdated: new Date().toISOString(),
  };

  for (const { dataType, data } of results) {
    if (data !== null) {
      // Map dataType keys to camelCase response fields
      const key =
        dataType === "energy-bills"
          ? "energyBills"
          : dataType === "floor-plans"
          ? "floorPlans"
          : "equipment";
      response[key] = data;
    }
  }

  return NextResponse.json(response);
}
