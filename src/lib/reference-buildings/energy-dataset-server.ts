import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { referenceBuildingEnergyInputs } from "./energy-inputs";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingManifest } from "./manifest";
import { buildReferenceEnergyDataset, ENERGY_DATASET_SCHEMA_VERSION } from "./energy-dataset";

const idSchema = z.enum(REFERENCE_BUILDING_IDS);
export const datasetFormatSchema = z.enum(["json", "csv"]);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The allowlist is checked before any filesystem path is constructed. */
export async function loadReferenceEnergyDataset(id: string) {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return null;
  const base = path.resolve(process.cwd(), "public", "reference-buildings");
  const file = path.resolve(base, parsedId.data, "manifest.json");
  if (!file.startsWith(`${base}${path.sep}`)) return null;
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const manifest = JSON.parse(bytes.toString("utf8")) as ReferenceBuildingManifest;
  if (manifest.kind !== "bimfit_reference_building_manifest" || manifest.schemaVersion !== 1 || manifest.id !== parsedId.data) {
    throw new Error("Invalid reference-building manifest");
  }
  const inputs = referenceBuildingEnergyInputs(parsedId.data);
  const dataset = buildReferenceEnergyDataset(manifest, inputs);
  return {
    ...dataset,
    integrity: {
      algorithm: "SHA-256",
      manifestSha256: sha256(bytes),
      modelInputsSha256: inputs ? sha256(JSON.stringify(inputs)) : null,
      datasetPayloadSha256: sha256(JSON.stringify(dataset)),
      payloadHashScope: "UTF-8 JSON.stringify of this object without the integrity property; property order is preserved.",
      codeRevision: process.env.DEPLOY_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      codeRevisionStatus: process.env.DEPLOY_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA ? "deployment_metadata" : "unavailable",
    },
  };
}

export async function loadReferenceEnergyCatalogue() {
  const datasets = await Promise.all(REFERENCE_BUILDING_IDS.map(async (id) => {
    const dataset = await loadReferenceEnergyDataset(id);
    // A registered-but-missing file is an incomplete catalogue, not a row to
    // silently drop and still report success.
    if (!dataset) throw new Error("A registered reference dataset is unavailable");
    return dataset;
  }));
  return {
    kind: "bimfit_building_energy_catalogue",
    schemaVersion: ENERGY_DATASET_SCHEMA_VERSION,
    scope: "published_baselines",
    isMetered: false,
    datasetCount: datasets.length,
    datasets,
  };
}

/** Stable bytes and ETags, with a download filename that only uses allowed IDs. */
export function energyDatasetDownloadResponse(
  request: Request,
  body: string,
  filename: string,
  contentType: string,
) {
  const etag = `"${sha256(body)}"`;
  const headers = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "public, max-age=0, must-revalidate",
    "ETag": etag,
    "X-Content-Type-Options": "nosniff",
  };
  return request.headers.get("if-none-match") === etag
    ? new Response(null, { status: 304, headers })
    : new Response(body, { headers });
}
