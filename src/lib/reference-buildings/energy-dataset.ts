import { resolveClimateRegion } from "@/lib/energy/climate-region";
// Versioned exports of the published baseline, independent of browser stores.
// An IFC quantity is measured from a model, never a building survey or meter.
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateCO2, calculateDeliveredCO2 } from "@/lib/energy/co2-emissions";
import { buildingTypeForGrade, deliveredFromDemand, gradeTableIsFromOccupancy } from "@/lib/energy/delivered-from-demand";
import { buildEndUseLoads } from "@/lib/energy/end-uses";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, isVentilationElement } from "@/lib/energy/heat-loss";
import { calculateSystemBreakdown } from "@/lib/energy/system-breakdown";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import type { ReferenceBuildingEnergyInputs } from "./energy-inputs";
import type { ReferenceBuildingManifest } from "./manifest";

export const ENERGY_DATASET_SCHEMA_VERSION = "2.0.0";
export const ENERGY_DATASET_CHANGELOG = "/reference-buildings/CHANGELOG.md";

type ModelContext = {
  classification: "real_building_model" | "synthetic_example" | "real_world_status_unverified";
  basis: string;
  sourceUrl: string;
};

const MODEL_CONTEXT: Readonly<Record<string, ModelContext>> = {
  "tum-fantasy-hotel-1": {
    classification: "synthetic_example",
    basis: "Fictional hotel authored by TUM students for BIM Fundamentals SS2025. Geometry is not evidence of a constructed hotel or measured energy consumption.",
    sourceUrl: "https://huggingface.co/datasets/sylvainHellin/ifc-bench/tree/main/projects/fantasy_hotel_1",
  },
  "tum-fantasy-hotel-2": {
    classification: "synthetic_example",
    basis: "Fictional hotel authored by TUM students for BIM Fundamentals SS2025. Geometry is not evidence of a constructed hotel or measured energy consumption.",
    sourceUrl: "https://huggingface.co/datasets/sylvainHellin/ifc-bench/tree/main/projects/fantasy_hotel_2",
  },
  "klassiqua-office-1970": {
    classification: "synthetic_example",
    basis: "The Klassiqua research project derived office archetypes from German statistics. The 1970 case is a synthetic design variant with assigned simulation inputs, not a constructed office or metered dataset.",
    sourceUrl: "https://zenodo.org/records/21727160",
  },
  "taltech-maemaja": {
    classification: "real_building_model",
    basis: "The SmartLivingEPC source publication identifies Tallinn University of Technology's Ehituse Mäemaja office/laboratory and publishes its IFC with a separate measurement archive. This export does not include or calibrate against that archive.",
    sourceUrl: "https://zenodo.org/records/15782433",
  },
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
  { id: "L-NO-METER", text: "No metered energy series or calibration is included in this export. Linked source archives may contain separate measurements; every energy output here is modeled, not observed consumption." },
  { id: "L-BASELINE", text: "This export uses the published baseline recipe and material inputs. It excludes browser edits, proposed retrofits, and financing selections." },
  { id: "L-CLIMATE", text: "The declared comparison region resolves HDD, CDD, design temperatures and peak sun hours. Supported city summer temperatures cite a historical design table; unsupported regions explicitly use a Seoul fallback. Cooling-season solar is assumed as Seoul 350 times regional peak sun hours divided by Seoul peak sun hours. Indoor heating/cooling setpoints remain national assumptions (20/26 C). These are not a weather series or measurements at the IFC site." },
  { id: "L-SCREENING", text: "The annual degree-day engine is a screening model, not the unwired ISO 13790 monthly kernel, a dynamic hourly simulation, or a certified assessment." },
  { id: "L-GRADE-SHARES", text: "Named HVAC, lighting, domestic hot water and plug loads declare their fuel before primary-energy conversion. Lighting uses power density times conditioned floor area times annual operating hours; domestic hot water and plug loads remain ratio-estimated. Declared PV capacity and regional assumed yield offset annual electricity, capped at annual electric demand; clipped surplus earns no additional grade credit. Unknown capacity and unresolved regions carry explicit assumptions or refusals. The grade compares Korean thresholds and is not an official certificate." },
  { id: "L-SITE-TOTAL", text: "Gross whole-building site energy sums modeled HVAC and lighting (power density times conditioned floor area times annual operating hours), plus ratio-estimated domestic hot water and plug loads. PV does not reduce this gross load total. The grade applies fuel-specific primary factors and capped annual PV netting, so gross site energy and primary energy must not be interchanged." },
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
  // Phase 01 (D-05/D-07): deliveredFromDemand now takes EndUseLoads.
  const region = resolveClimateRegion({ sigunguCd: inputs.climate.sigunguCd });
  const endUses = buildEndUseLoads({ demand, materials: inputs.materials, recipe: inputs.recipe, climateRegion: region });
  const delivered = deliveredFromDemand(endUses);
  const table = buildingTypeForGrade(inputs.materials, inputs.recipe.mainPurpsCd);
  const rating = calculateEfficiencyRating(delivered, envelope.intensityFloorAreaSqm, table);
  const co2 = calculateCO2(demand, envelope.intensityFloorAreaSqm, inputs.materials.hvac.heating.fuelType);
  const wholeBuildingCO2 = calculateDeliveredCO2(delivered, envelope.intensityFloorAreaSqm);
  return {
    status: "modeled_not_metered" as const,
    method: {
      id: "bimfit-annual-degree-day-screening",
      codePath: "src/lib/energy/annual-demand.ts",
      scope: "Annual HVAC demand, lighting from power density and operating hours, ratio-estimated domestic hot water and plug loads, and capped annual PV electricity netting for primary energy.",
    },
    endUses,
    climate: {
      ...inputs.climate,
      resolvedRegion: region,
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
    wholeBuildingEmissions: {
      totalTonnesCO2PerYear: wholeBuildingCO2.totalCO2,
      kgCO2PerM2Year: wholeBuildingCO2.co2PerSqm,
      electricTonnesCO2PerYear: wholeBuildingCO2.electricCO2,
      nonElectricTonnesCO2PerYear: wholeBuildingCO2.fossilCO2,
      basis: "Named end-use fuels with PV offset capped at annual electricity demand. Annual netting is an assumption, not hourly grid matching or measured emissions.",
      assumption: wholeBuildingCO2.assumption ?? null,
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
  const envelopeAvailable = manifest.envelopeStatus !== "unresolved";
  const envelopeValue = (value: number | undefined) => envelopeAvailable ? value : undefined;
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
    changelogUrl: ENERGY_DATASET_CHANGELOG,
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
      ...(manifest.documentation ? { documentation: manifest.documentation } : {}),
      extractedAt: manifest.generatedAt,
      manifestUrl: `/reference-buildings/${manifest.id}/manifest.json`,
      statedPhysics: manifest.sourcePhysics ? {
        ...manifest.sourcePhysics, url: `/reference-buildings/${manifest.id}/${manifest.sourcePhysics.file}`,
      } : null,
      transformations: "IFC quantities/solids extracted by build-reference-building; baseline inputs adapted by reference-buildings/energy-inputs; screening outputs computed at export.",
    },
    modelGeometry: {
      artifactBaseUrl: `/reference-buildings/${manifest.id}/`,
      architecturalDetails: manifest.architecturalDetails ?? null,
      materialFabric: manifest.materialFabric ?? null,
      mepCoverage: manifest.mepCoverage ?? null,
      serviceLayers: manifest.serviceLayers ?? [],
      scope: "Source geometry and occurrence inventory only. Geometry does not establish installed thermal performance, system connectivity or operating efficiency; energy inputs are recorded separately.",
    },
    measuredEnvelope: {
      status: envelopeAvailable ? "extracted_with_scope_limits" : "unresolved",
      basis: "Measurements of model geometry and quantities; not on-site measurements.",
      floorArea: quantity(areas.totalFloorAreaSqm, "m2", "areas.totalFloorAreaSqm", areas.floorAreaNote),
      opaqueWallNetArea: quantity(envelopeValue(areas.exteriorWallNetSqm), "m2", "areas.exteriorWallNetSqm"),
      glazingApertureArea: { ...quantity(envelopeValue(areas.glazingApertureSqm), "m2", "areas.glazingApertureSqm", "Counted openings selected by the extractor's host-wall and envelope rules; excluded and unresolved openings are not in this sum."), coverage: openingCoverage },
      exteriorDoorArea: { ...quantity(envelopeValue(areas.exteriorDoorSqm), "m2", "areas.exteriorDoorSqm", "Counted exterior door leaves selected by the extractor; not every IfcDoor or IsExternal flag."), coverage: openingCoverage },
      roofElementSurfaceSum: quantity(envelopeValue(areas.roofSurfaceSqm), "m2", "areas.roofSurfaceSqm", "Sum of each roof element's one-sheet surface; different roof layers/elements may overlap. Not the selected outer-envelope roof area used by the energy model."),
      roofFamilyProjectedSum: quantity(envelopeValue(areas.roofProjectedSqm), "m2", "areas.roofProjectedSqm", "Sum of plan unions by roof family; different families may overlap. Not a single union across the building."),
      roofPlanUnion: quantity(envelopeValue(areas.roofUnionSqm), "m2", "areas.roofUnionSqm", "One plan union across all counted roof elements, irrespective of family."),
      groundContactArea: quantity(envelopeValue(areas.groundSlabSqm), "m2", "areas.groundSlabSqm"),
      groundExposedPerimeter: quantity(envelopeValue(areas.groundPerimeterM), "m", "areas.groundPerimeterM", "Outer ring length of the selected slab union. Slab gaps/fragmentation can increase it; this is not independently verified thermal exposure. Read the ground-coupling assumption."),
      conditionedGrossVolume: quantity(envelopeValue(areas.conditionedVolumeGrossM3), "m3", "areas.conditionedVolumeGrossM3"),
      netRoomVolume: quantity(areas.roomVolumeNetM3, "m3", "areas.roomVolumeNetM3"),
      wallByOrientationSqm: envelopeAvailable ? areas.exteriorWallByOrientationSqm ?? null : null,
      glazingByOrientationSqm: envelopeAvailable ? areas.glazingByOrientationSqm ?? null : null,
      doorsByOrientationSqm: envelopeAvailable ? areas.exteriorDoorByOrientationSqm ?? null : null,
      orientation: manifest.orientation ?? null,
      openingRecordsUrl: manifest.openingsFile ? `/reference-buildings/${manifest.id}/${manifest.openingsFile}` : null,
      extractionNotes: {
        floor: areas.floorAreaNote ?? null,
        openings: areas.openingsNote ?? null,
        roof: areas.roofNote ?? null,
        ground: areas.groundNote ?? null,
        volume: areas.volumeNote ?? null,
      },
      opaqueFacadeScope: areas.opaqueFacade ?? null,
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
    changelogUrl: dataset.changelogUrl,
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
