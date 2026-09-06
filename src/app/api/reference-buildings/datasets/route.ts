import { referenceDatasetCatalogueCsv } from "@/lib/reference-buildings/energy-dataset";
import { datasetFormatSchema, energyDatasetDownloadResponse, loadReferenceEnergyCatalogue } from "@/lib/reference-buildings/energy-dataset-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const format = datasetFormatSchema.safeParse(new URL(request.url).searchParams.get("format") ?? "json");
  if (!format.success) return Response.json({ error: "format must be json or csv" }, { status: 400 });
  try {
    const catalogue = await loadReferenceEnergyCatalogue();
    const body = format.data === "csv"
      ? referenceDatasetCatalogueCsv(catalogue.datasets)
      : JSON.stringify(catalogue, null, 2) + "\n";
    return energyDatasetDownloadResponse(request, body,
      `bimfit-energy-catalogue-v${catalogue.schemaVersion}.${format.data}`,
      format.data === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
  } catch {
    return Response.json({ error: "Reference building catalogue is unavailable" }, { status: 503 });
  }
}
