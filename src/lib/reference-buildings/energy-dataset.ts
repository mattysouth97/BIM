// Versioned exports of the published baseline, independent of browser stores.
// An IFC quantity is measured from a model, never a building survey or meter.
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateCO2 } from "@/lib/energy/co2-emissions";
import { buildingTypeForGrade, deliveredFromDemand, gradeTableIsFromOccupancy } from "@/lib/energy/delivered-from-demand";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, isVentilationElement } from "@/lib/energy/heat-loss";
import { calculateSystemBreakdown } from "@/lib/energy/system-breakdown";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import type { ReferenceBuildingEnergyInputs } from "./energy-inputs";
import type { ReferenceBuildingManifest } from "./manifest";

export const ENERGY_DATASET_SCHEMA_VERSION = "1.0.0";

type ModelContext = {
  classification: "real_building_model" | "synthetic_example" | "real_world_status_unverified";
  basis: string;
  sourceUrl: string;
};

const MODEL_CONTEXT: Readonly<Record<string, ModelContext>> = {
  "bs-medical-dental-clinic": {
    classification: "real_world_status_unverified",
    basis: "The published model describes a US GSA outpatient clinic, but no independently verified constructed counterpart or actual location is supplied with this dataset.",
    sourceUrl: "https://github.com/buildingsmart-community/Community-Sample-Test-Files",
  },
  schependomlaan: {
    classification: "real_building_model",
    basis: "The project archive contains coordination, planned/as-built comparison, and construction imagery for the Nijmegen apartment building.",
    sourceUrl: "https://github.com/openBIMstandards/Archive-DataSetSchependomlaan",
  },
  "duplex-apartment": {
    classification: "real_world_status_unverified",
    basis: "Published as a sample/test model; the IFC address and coordinates are authoring defaults. A constructed counterpart has not been established.",
    sourceUrl: "https://github.com/buildingsmart-community/Community-Sample-Test-Files",
  },
  "fzk-haus": {
    classification: "synthetic_example",
    basis: "The publisher describes FZK Haus as a Simple Phantasy Building. Its declared IFC coordinates do not establish a real house at that location.",
    sourceUrl: "https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples",
  },
  "kit-office": {
    classification: "synthetic_example",
    basis: "The publisher describes the Office Building as a Phantasy Office Building; this is a validation example, not an occupied building record.",
    sourceUrl: "https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples",
  },
};

export const ENERGY_DATASET_LIMITATIONS = [
  { id: "L-MODEL-NOT-SURVEY", text: "Geometric measurements come from IFC quantities and solids. They are not a field survey, and omitted or misclassified model elements can bias the envelope." },
  { id: "L-NO-METER", text: "No metered energy series or calibration is supplied. Every energy output is modeled, not observed consumption." },
  { id: "L-BASELINE", text: "This export uses the published baseline recipe and material inputs. It excludes browser edits, proposed retrofits, and financing selections." },
  { id: "L-CLIMATE", text: "The climate is the explicitly assumed engine climate, not a weather series for the IFC's declared site. Read the climate assumption before comparing sites." },
  { id: "L-SCREENING", text: "The annual degree-day engine is a screening model, not the unwired ISO 13790 monthly kernel, a dynamic hourly simulation, or a certified assessment." },
  { id: "L-GRADE-SHARES", text: "The grade's fuel split adds 15% of HVAC total to electricity and 10% to gas, assigns heating to gas, and sets district energy and renewable contribution to zero. It does not read lighting power density or PV capacity. The grade is a comparison on Korean thresholds, not an official certificate." },
  { id: "L-SITE-TOTAL", text: "The estimated whole-building total uses end-use ratios to expand HVAC demand. It differs from the simplified fuel shares behind the grade; these totals must not be interchanged." },
] as const;

function quantity(value: number | undefined, unit: string, sourceField: string, scope = "Extracted model elements; completeness and physical as-built accuracy are not certified.") {
  return {
    value: value !== undefined && Number.isFinite(value) ? value : null,
    unit,
    status: value !== undefined && Number.isFinite(value) ? "measured_from_model" as const : "missing" as const,
    sourceField,
    scope,
  };
}

/** Same calculations as useEnergyMetrics, using the immutable published inputs. */
export function modeledReferenceEnergy(inputs: ReferenceBuildingEnergyInputs | null) {
  if (!inputs) return null;
  const envelope = envelopeQuantities(inputs.recipe);
  if (envelope.intensityFloorAreaSqm <= 0) return null;
  const climate = getClimateData(inputs.climate.sigunguCd);
  const heatLoss = calculateHeatLoss(inputs.materials, inputs.recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, inputs.materials, inputs.recipe, climate);
  const breakdown = calculateSystemBreakdown(inputs.materials, inputs.recipe, climate);
  const delivered = deliveredFromDemand(demand);
  const table = buildingTypeForGrade(inputs.materials, inputs.recipe.mainPurpsCd);
  const rating = calculateEfficiencyRating(delivered, envelope.intensityFloorAreaSqm, table);
  const co2 = calculateCO2(demand, envelope.intensityFloorAreaSqm, inputs.materials.hvac.heating.fuelType);
  return {
    status: "modeled_not_metered" as const,
    method: {
      id: "bimfit-annual-degree-day-screening",
      codePath: "src/lib/energy/annual-demand.ts",
      scope: "Heating and cooling delivered energy after system efficiencies; auxiliary loads estimated separately.",
    },
    climate: {
      ...inputs.climate,
      status: "assumed" as const,
      hddBase18KDay: climate.hdd,
      cddBase24KDay: climate.cdd,
      winterDesignTemperatureC: climate.winterDesignTemp,
      summerDesignTemperatureC: climate.summerDesignTemp,
      indoorHeatingSetpointC: climate.indoorTemp,
      indoorCoolingSetpointC: climate.indoorCoolTemp,
      coolingSeasonSolarKWhPerM2: climate.coolingSeasonSolar,
    },
    hvac: {
      heatingDeliveredKWhPerYear: demand.heatingDemand,
      coolingDeliveredKWhPerYear: demand.coolingDemand,
      totalDeliveredKWhPerYear: demand.totalDemand,
      deliveredKWhPerM2Year: demand.demandPerSqm,
      fuelDemandKWhPerYear: demand.fuelDemand ?? null,
    },
    comparisonRating: {
      grade: rating.grade,
      table,
      tableSelection: gradeTableIsFromOccupancy(inputs.recipe.mainPurpsCd) ? "occupancy_assumption" : "adapted_use_code",
      officialCertificate: false,
      primaryKWhPerM2Year: rating.primaryEnergyPerArea,
      deliveredFuelInputsKWhPerYear: delivered,
      primaryEnergyKWhPerYear: rating.breakdown.primaryEnergy,
      conversionFactorsPrimaryPerDeliveredKWh: rating.breakdown.conversionFactorsUsed,
      limitationIds: ["L-GRADE-SHARES", "L-SCREENING"],
    },
    estimatedWholeBuilding: {
      hvacKWhPerYear: breakdown.hvac,
      lightingKWhPerYear: breakdown.lighting,
      dhwKWhPerYear: breakdown.dhw,
      plugLoadsKWhPerYear: breakdown.plugLoads,
      totalKWhPerYear: breakdown.total,
      ratioProvenance: breakdown.ratioProvenance,
      limitationIds: ["L-SITE-TOTAL"],
    },
    hvacEmissions: {
      totalTonnesCO2PerYear: co2.totalCO2,
      kgCO2PerM2Year: co2.co2PerSqm,
      electricTonnesCO2PerYear: co2.electricCO2,
      nonElectricTonnesCO2PerYear: co2.fossilCO2,
    },
    designHeatLoss: {
      totalW: heatLoss.totalHeatLoss,
      elements: heatLoss.elements.map((element) => ({
        name: element.element,
        quantity: element.area,
        quantityUnit: isVentilationElement(element.element) ? "m3" : "m2",
        coefficient: element.uValue,
        coefficientUnit: isVentilationElement(element.element) ? "1/h" : "W/(m2.K)",
        heatLossCoefficientWPerK: element.hCoefficient,
        temperatureDifferenceK: element.deltaT,
        designHeatLossW: element.heatLoss,
      })),
    },
  };
}

export function buildReferenceEnergyDataset(
  manifest: ReferenceBuildingManifest,
  inputs: ReferenceBuildingEnergyInputs | null,
) {
  const areas = manifest.areas;
  const context = MODEL_CONTEXT[manifest.id] ?? {
    classification: "real_world_status_unverified" as const,
    basis: "No classification evidence is registered for this model.",
    sourceUrl: manifest.sourceUrl,
  };
  const pendingReconciliation = (inputs?.pendingMeasurements ?? []).map((pending) => {
    const field = pending.manifestField.startsWith("areas.") ? pending.manifestField.slice(6) : "";
    const extracted = Object.hasOwn(areas, field) ? areas[field as keyof typeof areas] : undefined;
    return {
      manifestField: pending.manifestField,
      currentExtractedValue: extracted ?? null,
      placeholderValueUsedByModel: pending.placeholderValue,
      status: extracted !== undefined ? "extracted_value_available_requires_scope_review" : "not_extracted",
      note: "An extracted figure is not automatically a complete envelope measurement. Resolve extraction exclusions and scope before replacing the model input.",
    };
  });
  const openingCoverage = inputs?.pendingMeasurements?.some((pending) =>
    ["areas.glazingApertureSqm", "areas.glazingByOrientationSqm", "areas.exteriorDoorSqm"].includes(pending.manifestField))
    ? "partial_scope_requires_review" : "selected_opening_scope_not_certified_complete";
  return {
    kind: "bimfit_building_energy_dataset" as const,
    schemaVersion: ENERGY_DATASET_SCHEMA_VERSION,
    id: manifest.id,
    scope: "published_baseline" as const,
    isMetered: false,
    meteredEnergy: null,
    calibration: { status: "not_calibrated", observations: null },
    building: {
      name: manifest.name,
      summary: manifest.summary,
      useType: manifest.useType,
      modelContext: context,
      location: {
        verifiedCoordinates: null,
        ifcDeclaredLatitudeDeg: manifest.site.declaredLatitudeDeg,
        ifcDeclaredLongitudeDeg: manifest.site.declaredLongitudeDeg,
        locationIsAuthoringDefault: manifest.site.locationIsAuthoringDefault,
        note: manifest.site.locationNote,
      },
      modelCounts: manifest.counts,
    },
    source: {
      sourceUrl: manifest.sourceUrl,
      licenceAsDeclared: manifest.licence,
      attribution: manifest.attribution,
      attributionStatus: manifest.attribution ? "stated" : "rights_holder_not_established",
      files: manifest.sourceFiles,
      extractedAt: manifest.generatedAt,
      manifestUrl: `/reference-buildings/${manifest.id}/manifest.json`,
      transformations: "IFC quantities/solids extracted by build-reference-building; baseline inputs adapted by reference-buildings/energy-inputs; screening outputs computed at export.",
    },
    measuredEnvelope: {
      basis: "Measurements of model geometry and quantities; not on-site measurements.",
      floorArea: quantity(areas.totalFloorAreaSqm, "m2", "areas.totalFloorAreaSqm"),
      opaqueWallNetArea: quantity(areas.exteriorWallNetSqm, "m2", "areas.exteriorWallNetSqm"),
      glazingApertureArea: { ...quantity(areas.glazingApertureSqm, "m2", "areas.glazingApertureSqm", "Counted openings selected by the extractor's host-wall and envelope rules; excluded and unresolved openings are not in this sum."), coverage: openingCoverage },
      exteriorDoorArea: { ...quantity(areas.exteriorDoorSqm, "m2", "areas.exteriorDoorSqm", "Counted exterior door leaves selected by the extractor; not every IfcDoor or IsExternal flag."), coverage: openingCoverage },
      roofElementSurfaceSum: quantity(areas.roofSurfaceSqm, "m2", "areas.roofSurfaceSqm", "Sum of each roof element's one-sheet surface; different roof layers/elements may overlap. Not the selected outer-envelope roof area used by the energy model."),
      roofFamilyProjectedSum: quantity(areas.roofProjectedSqm, "m2", "areas.roofProjectedSqm", "Sum of plan unions by roof family; different families may overlap. Not a single union across the building."),
      roofPlanUnion: quantity(areas.roofUnionSqm, "m2", "areas.roofUnionSqm", "One plan union across all counted roof elements, irrespective of family."),
      groundContactArea: quantity(areas.groundSlabSqm, "m2", "areas.groundSlabSqm"),
      groundExposedPerimeter: quantity(areas.groundPerimeterM, "m", "areas.groundPerimeterM"),
      conditionedGrossVolume: quantity(areas.conditionedVolumeGrossM3, "m3", "areas.conditionedVolumeGrossM3"),
      netRoomVolume: quantity(areas.roomVolumeNetM3, "m3", "areas.roomVolumeNetM3"),
      wallByOrientationSqm: areas.exteriorWallByOrientationSqm ?? null,
      glazingByOrientationSqm: areas.glazingByOrientationSqm ?? null,
      doorsByOrientationSqm: areas.exteriorDoorByOrientationSqm ?? null,
      orientation: manifest.orientation ?? null,
      openingRecordsUrl: manifest.openingsFile ? `/reference-buildings/${manifest.id}/${manifest.openingsFile}` : null,
      extractionNotes: {
        openings: areas.openingsNote ?? null,
        roof: areas.roofNote ?? null,
        ground: areas.groundNote ?? null,
        volume: areas.volumeNote ?? null,
      },
    },
    modelInputs: inputs ? {
      provenance: "mixed_model_measurements_and_named_assumptions",
      measurementState: inputs.measurementState ?? "not_assessed",
      scopeNotice: inputs.scopeNotice ?? null,
      pendingMeasurements: inputs.pendingMeasurements ?? [],
      pendingMeasurementReconciliation: pendingReconciliation,
      // These exact objects reproduce the calculations. Their legacy source /
      // confidence labels do NOT establish provenance for each parameter.
      recipe: inputs.recipe,
      materials: inputs.materials,
      metadataScope: "Legacy source/confidence fields describe the adapter as a whole. They do not mean that every thermal, system, occupancy or geometry input is measured. Read the assumption and pending-measurement records.",
      engineEnvelope: envelopeQuantities(inputs.recipe),
      engineEnvelopeProvenance: inputs.pendingMeasurements?.length
        ? "includes_placeholders_see_pendingMeasurements" : "derived_from_model_with_scope_assumptions",
      energyInputRoofCategory: inputs.roof ?? null,
      exteriorDoorAreaSqm: inputs.exteriorDoorSqm ?? null,
    } : null,
    assumptions: inputs?.assumptions ?? [],
    modeledEnergy: modeledReferenceEnergy(inputs),
    limitations: ENERGY_DATASET_LIMITATIONS,
    links: {
      model: `/models/${manifest.id}`,
      dataset: `/api/reference-buildings/${manifest.id}/dataset`,
      catalogueJson: "/api/reference-buildings/datasets",
      catalogueCsv: "/api/reference-buildings/datasets?format=csv",
    },
  };
}

export type ReferenceEnergyDataset = ReturnType<typeof buildReferenceEnergyDataset>;

export function referenceDatasetCatalogueRow(dataset: ReferenceEnergyDataset) {
  const envelope = dataset.measuredEnvelope;
  const energy = dataset.modeledEnergy;
  return {
    schemaVersion: dataset.schemaVersion,
    scope: dataset.scope,
    id: dataset.id,
    name: dataset.building.name.en,
    modelContext: dataset.building.modelContext.classification,
    useType: dataset.building.useType,
    modelInputMeasurementState: dataset.modelInputs?.measurementState ?? "no_energy_inputs",
    pendingModelInputCount: dataset.modelInputs?.pendingMeasurements.length ?? null,
    isMetered: false,
    measuredFloorAreaM2: envelope.floorArea.value,
    measuredOpaqueWallNetM2: envelope.opaqueWallNetArea.value,
    measuredGlazingM2: envelope.glazingApertureArea.value,
    measuredExteriorDoorM2: envelope.exteriorDoorArea.value,
    openingCoverage: envelope.glazingApertureArea.coverage,
    measuredRoofElementSurfaceSumM2: envelope.roofElementSurfaceSum.value,
    modeledEnvelopeRoofSurfaceM2: dataset.modelInputs?.engineEnvelope.roofAreaSqm ?? null,
    measuredGroundContactM2: envelope.groundContactArea.value,
    assumedClimate: energy?.climate.labelEn ?? null,
    modelHeatingDeliveredKWhPerYear: energy?.hvac.heatingDeliveredKWhPerYear ?? null,
    modelCoolingDeliveredKWhPerYear: energy?.hvac.coolingDeliveredKWhPerYear ?? null,
    modelPrimaryKWhPerM2Year: energy?.comparisonRating.primaryKWhPerM2Year ?? null,
    modelComparisonGrade: energy?.comparisonRating.grade ?? null,
    gradeTable: energy?.comparisonRating.table ?? null,
    officialCertificate: false,
    assumptionIds: dataset.assumptions.map((a) => a.id).join(" | "),
    licenceAsDeclared: dataset.source.licenceAsDeclared,
    attribution: dataset.source.attribution,
    attributionStatus: dataset.source.attributionStatus,
    sourceUrl: dataset.source.sourceUrl,
    sourceFileSha256: dataset.source.files.map((f) => `${f.fileName}:${f.sha256}`).join(" | "),
    datasetUrl: dataset.links.dataset,
  };
}

/** RFC 4180 quoting; null is blank, while a documented numeric zero stays 0. */
export function referenceDatasetCatalogueCsv(datasets: readonly ReferenceEnergyDataset[]): string {
  const rows = datasets.map(referenceDatasetCatalogueRow);
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    // Titles and attributions are external text; prevent spreadsheet formula
    // execution while retaining their exact unmodified values in the JSON.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\r\n") + "\r\n";
}
