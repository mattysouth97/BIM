import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildReferenceEnergyDataset, referenceDatasetCatalogueCsv } from "../energy-dataset";
import { loadReferenceEnergyCatalogue, loadReferenceEnergyDataset } from "../energy-dataset-server";
import { referenceBuildingEnergyInputs } from "../energy-inputs";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingManifest } from "../manifest";
import { GET as getDataset } from "@/app/api/reference-buildings/[id]/dataset/route";
import { GET as getCatalogue } from "@/app/api/reference-buildings/datasets/route";

function manifest(id: string) {
  return JSON.parse(readFileSync(`public/reference-buildings/${id}/manifest.json`, "utf8")) as ReferenceBuildingManifest;
}

describe("published baseline datasets preserve provenance", () => {
  it.each(REFERENCE_BUILDING_IDS)("%s is reproducible and hashes the exact source artifact", async (id) => {
    const dataset = await loadReferenceEnergyDataset(id);
    expect(dataset).not.toBeNull();
    const file = readFileSync(`public/reference-buildings/${id}/manifest.json`);
    expect(dataset!.integrity.manifestSha256).toBe(createHash("sha256").update(file).digest("hex"));
    const { integrity, ...payload } = dataset!;
    expect(integrity.datasetPayloadSha256).toBe(createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
    expect(await loadReferenceEnergyDataset(id)).toEqual(dataset);
    expect(dataset!.source.files.every((source) => /^[a-f\d]{64}$/.test(source.sha256))).toBe(true);
    expect(dataset!.isMetered).toBe(false);
    expect(dataset!.meteredEnergy).toBeNull();
    expect(dataset!.calibration.observations).toBeNull();
    expect(dataset!.modeledEnergy!.comparisonRating.officialCertificate).toBe(false);
    expect(dataset!.assumptions).toEqual(referenceBuildingEnergyInputs(id)!.assumptions);
    expect(dataset!.modeledEnergy!.climate.assumptionId).toBe("A-CLIMATE");
    expect(dataset!.assumptions.some((a) => a.id === dataset!.modeledEnergy!.climate.assumptionId)).toBe(true);
  });

  it("Schependomlaan distinguishes extracted apertures from the stand-ins still used by the engine", async () => {
    const dataset = (await loadReferenceEnergyDataset("schependomlaan"))!;
    expect(dataset.measuredEnvelope.glazingApertureArea.value).toBe(106.06);
    expect(dataset.measuredEnvelope.glazingApertureArea.status).toBe("measured_from_model");
    expect(dataset.measuredEnvelope.exteriorDoorArea.value).toBe(81.03);
    expect(dataset.measuredEnvelope.glazingApertureArea.coverage).toBe("partial_scope_requires_review");
    expect(dataset.measuredEnvelope.exteriorDoorArea.coverage).toBe("partial_scope_requires_review");
    expect(dataset.measuredEnvelope.roofElementSurfaceSum.value).toBe(692.04);
    expect(dataset.modelInputs!.engineEnvelope.roofAreaSqm).toBe(542.96);
    expect(dataset.modelInputs!.energyInputRoofCategory?.type).toBe("gable");
    expect(dataset.modelInputs!.pendingMeasurements).toHaveLength(3);
    expect(dataset.modelInputs!.pendingMeasurements.find((p) => p.manifestField === "areas.glazingApertureSqm")!.placeholderValue).toBeGreaterThan(0);
    expect(dataset.modelInputs!.engineEnvelopeProvenance).toBe("includes_placeholders_see_pendingMeasurements");
    const glazing = dataset.modelInputs!.pendingMeasurementReconciliation.find((p) => p.manifestField === "areas.glazingApertureSqm")!;
    expect(glazing.currentExtractedValue).toBe(106.06);
    expect(glazing.placeholderValueUsedByModel).toBe(115.5);
    expect(glazing.status).toBe("extracted_value_available_requires_scope_review");
    expect(dataset.source.attribution).toBeNull();
    expect(dataset.source.attributionStatus).toBe("rights_holder_not_established");
  });

  it("does not promote IFC site coordinates into a verified real location", async () => {
    const fzk = (await loadReferenceEnergyDataset("fzk-haus"))!;
    expect(fzk.building.modelContext.classification).toBe("synthetic_example");
    expect(fzk.building.location.ifcDeclaredLatitudeDeg).not.toBeNull();
    expect(fzk.building.location.verifiedCoordinates).toBeNull();
    const duplex = (await loadReferenceEnergyDataset("duplex-apartment"))!;
    expect(duplex.building.modelContext.classification).toBe("real_world_status_unverified");
    expect(duplex.building.location.locationIsAuthoringDefault).toBe(true);
  });

  it("keeps unavailable energy null instead of inventing a zero-grade model", () => {
    const dataset = buildReferenceEnergyDataset(manifest("fzk-haus"), null);
    expect(dataset.modeledEnergy).toBeNull();
    expect(dataset.modelInputs).toBeNull();
    expect(dataset.measuredEnvelope.floorArea.value).toBeGreaterThan(0);
  });

  it("matches the published screen baselines without reinterpreting HVAC energy as whole-building energy", async () => {
    const published = [
      ["bs-medical-dental-clinic", "1+", "108.8"],
      ["schependomlaan", "1++", "40.5"],
      ["duplex-apartment", "4", "142.6"],
      ["fzk-haus", "2", "92.6"],
    ] as const;
    for (const [id, grade, hvacPerArea] of published) {
      const dataset = (await loadReferenceEnergyDataset(id))!;
      const energy = dataset.modeledEnergy!;
      expect(energy.hvac.deliveredKWhPerM2Year.toFixed(1)).toBe(hvacPerArea);
      expect(energy.comparisonRating.grade).toBe(grade);
      expect(energy.hvac.heatingDeliveredKWhPerYear + energy.hvac.coolingDeliveredKWhPerYear).toBeCloseTo(energy.hvac.totalDeliveredKWhPerYear, 8);
      expect(energy.estimatedWholeBuilding.totalKWhPerYear).toBeGreaterThan(energy.hvac.totalDeliveredKWhPerYear);
      expect(energy.hvac.totalDeliveredKWhPerYear / dataset.measuredEnvelope.floorArea.value!).toBeCloseTo(energy.hvac.deliveredKWhPerM2Year, 8);
      const ventilation = energy.designHeatLoss.elements.find((e) => e.name === "Infiltration/Ventilation")!;
      expect(ventilation.quantityUnit).toBe("m3");
      expect(ventilation.coefficientUnit).toBe("1/h");
    }
  });
});

describe("JSON and CSV download routes", () => {
  it("the catalogue includes every published ID, with no hard-coded building count", async () => {
    const catalogue = await loadReferenceEnergyCatalogue();
    expect(catalogue.datasetCount).toBe(REFERENCE_BUILDING_IDS.length);
    expect(catalogue.datasets.map((d) => d.id)).toEqual(REFERENCE_BUILDING_IDS);
    const response = await getCatalogue(new Request("https://example.test/api/reference-buildings/datasets"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect((await response.json()).datasets).toHaveLength(REFERENCE_BUILDING_IDS.length);
  });

  it("unknown and traversal IDs never become filesystem reads", async () => {
    for (const id of ["unknown", "../../package.json", "..\\..\\package.json"]) {
      expect(await loadReferenceEnergyDataset(id)).toBeNull();
      const response = await getDataset(new Request("https://example.test/"), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(404);
    }
  });

  it("a stable download can be revalidated by its content hash", async () => {
    const request = new Request("https://example.test/api/reference-buildings/fzk-haus/dataset");
    const context = { params: Promise.resolve({ id: "fzk-haus" }) };
    const response = await getDataset(request, context);
    const body = await response.text();
    const hash = createHash("sha256").update(body).digest("hex");
    expect(response.headers.get("etag")).toBe(`"${hash}"`);
    const cached = await getDataset(new Request(request.url, { headers: { "if-none-match": `"${hash}"` } }), context);
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
  });

  it("CSV preserves missing values, real zeros, Unicode, quotes and multiline attribution", async () => {
    const fzk = manifest("fzk-haus");
    const data = buildReferenceEnergyDataset({
      ...fzk, name: { ko: "시험", en: '=HYPERLINK("bad")' },
      attribution: 'Author, "시험"\nSecond line',
      areas: { ...fzk.areas, glazingApertureSqm: undefined, exteriorDoorSqm: 0 },
    }, referenceBuildingEnergyInputs("fzk-haus"));
    const csv = referenceDatasetCatalogueCsv([data]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data[0].measuredGlazingM2).toBe("");
    expect(parsed.data[0].measuredExteriorDoorM2).toBe("0");
    expect(parsed.data[0].attribution).toBe('Author, "시험"\nSecond line');
    expect(parsed.data[0].name).toBe('\'=HYPERLINK("bad")');
    expect(parsed.data[0].isMetered).toBe("false");
    const response = await getCatalogue(new Request("https://example.test/api/reference-buildings/datasets?format=csv"));
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(Papa.parse(await response.text(), { header: true, skipEmptyLines: true }).data).toHaveLength(REFERENCE_BUILDING_IDS.length);
  });

  it("rejects an unsupported format with an explicit response", async () => {
    const response = await getCatalogue(new Request("https://example.test/api/reference-buildings/datasets?format=xml"));
    expect(response.status).toBe(400);
  });
});
