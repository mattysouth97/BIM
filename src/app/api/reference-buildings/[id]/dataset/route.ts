import { energyDatasetDownloadResponse, loadReferenceEnergyDataset } from "@/lib/reference-buildings/energy-dataset-server";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const dataset = await loadReferenceEnergyDataset(id);
    if (!dataset) return Response.json({ error: "Reference building dataset not found" }, { status: 404 });
    return energyDatasetDownloadResponse(request, JSON.stringify(dataset, null, 2) + "\n",
      `bimfit-${dataset.id}-energy-v${dataset.schemaVersion}.json`, "application/json; charset=utf-8");
  } catch {
    return Response.json({ error: "Reference building dataset is unavailable" }, { status: 503 });
  }
}
