import {
  collectEnergyFacts,
  createEnergyFact,
  replaceFact,
} from "./facts";
import {
  calculateZoneVolume,
  orientedEdges,
  polygonArea,
  relativeError,
  validatePolygon,
} from "./geometry";
import { stableId } from "./ids";
import type {
  DrawingSetIngestionResult,
  ExtractedBoundary,
} from "./ingestion";
import {
  CANONICAL_ENERGY_MODEL_VERSION,
  type AssumptionRecord,
  type CanonicalEnergyModel,
  type ConstructionAssembly,
  type EnergyFact,
  type HvacSystem,
  type IsoDateTime,
  type MissingValueRecord,
  type Opening,
  type ScheduleValue,
  type SourceDocument,
  type SourceReference,
  type Surface,
  type UsageProfile,
} from "./types";
import { validateCanonicalEnergyModel } from "./validation";

export const TIER_ONE_SCREENING_ASSUMPTION_ID =
  "assumption.tier1-office-screening-template";
export const TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY =
  "simulation.tier1OfficeScreeningTemplateAccepted";

const occupiedSchedule = Object.freeze(
  Array.from({ length: 24 }, (_, hour) =>
    Object.freeze({ hour, value: hour >= 8 && hour < 18 ? 1 : 0.05 }),
  ),
) as readonly ScheduleValue[];
const hvacSchedule = Object.freeze(
  Array.from({ length: 24 }, (_, hour) =>
    Object.freeze({ hour, value: hour >= 7 && hour < 19 ? 1 : 0 }),
  ),
) as readonly ScheduleValue[];

/**
 * Versioned production defaults for the deliberately narrow Tier-1 path.
 * These values are not sourced from a test fixture and changing any of them
 * requires a template-version bump plus an assumption-catalog update.
 */
export const TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1 = Object.freeze({
  version: "tier1-office-screening-v1",
  modelVersion: "tier1-office-screening-v1-unaccepted",
  acceptedModelVersion: "tier1-office-screening-v1-accepted",
  geometry: Object.freeze({
    storeyCount: 1,
    elevationM: 0,
    floorToFloorHeightM: 3,
    coordinateSystem: "local-meters-x-east-y-north",
    conditioned: true,
    orientationBand: "mixed" as const,
  }),
  site: Object.freeze({
    location: "Seoul, KR",
    latitudeDeg: 37.5665,
    longitudeDeg: 126.978,
    northOrientationDeg: 0,
    weatherSource: "KR-Seoul-TMY",
    groundRelationship: "slab_on_grade",
  }),
  envelope: Object.freeze({
    wallUValueWPerM2K: 0.35,
    roofUValueWPerM2K: 0.2,
    groundUValueWPerM2K: 0.4,
    windowUValueWPerM2K: 1.6,
    windowShgc: 0.35,
    windowVisibleTransmittance: 0.6,
    windowToWallRatio: 0.3,
    windowHeightM: 1.5,
    sillHeightM: 0.9,
    infiltrationAirChangesPerHour: 0.5,
  }),
  usage: Object.freeze({
    useType: "office",
    occupancyDensityPeoplePerSqm: 0.1,
    lightingPowerDensityWPerSqm: 8,
    equipmentPowerDensityWPerSqm: 10,
    ventilationLpsPerPerson: 10,
    heatingSetpointC: 20,
    coolingSetpointC: 26,
    operatingHours: "Mon-Fri 08:00-18:00",
  }),
  hvac: Object.freeze({
    systemType: "packaged_heat_pump",
    heatingSource: "electric_heat_pump",
    coolingSource: "electric_dx",
    distributionSystem: "air",
    capacityKwPerSqm: 0.15,
    heatingEfficiencyCop: 3.2,
    coolingCop: 3.5,
    outdoorAirStrategy: "scheduled_outdoor_air",
    heatRecoveryEfficiency: 0.7,
  }),
});

export const TIER_ONE_SCREENING_ENGINE_PATHS = Object.freeze([
  "recipe.floors",
  "recipe.totalHeight",
  "recipe.facade",
  "materials.envelope",
  "materials.hvac",
  "materials.lighting",
  "materials.occupancy",
  "climate",
]);

export type TierOneExtractionOnlyReason =
  | "rejected_source"
  | "unsupported_source_set"
  | "not_floor_plan"
  | "classification_uncertain"
  | "uncalibrated_units"
  | "no_valid_boundary"
  | "ambiguous_boundary"
  | "invalid_boundary"
  | "geometry_mismatch"
  | "unresolved_conflict"
  | "unsupported_missing_value"
  | "unsupported_extraction_stage";

export type TierOneModelBuildOutcome =
  | Readonly<{
      status: "created";
      model: CanonicalEnergyModel;
      boundaryId: string;
    }>
  | Readonly<{
      status: "extraction_only";
      reason: TierOneExtractionOnlyReason;
      message: string;
    }>;

function extractionOnly(
  reason: TierOneExtractionOnlyReason,
  message: string,
): TierOneModelBuildOutcome {
  return Object.freeze({ status: "extraction_only", reason, message });
}

function templateFact<T>(
  key: string,
  value: T,
  createdAt: IsoDateTime,
  unit?: string,
): EnergyFact<T> {
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "defaulted",
    confidence: null,
    sourceRefs: [],
    extractionMethod: "project_default",
    authority: "project_template",
    assumptionId: TIER_ONE_SCREENING_ASSUMPTION_ID,
    reviewedByUser: false,
    createdAt,
  });
}

function mixedFact<T>(
  key: string,
  value: T,
  sourceRefs: readonly SourceReference[],
  createdAt: IsoDateTime,
  unit?: string,
): EnergyFact<T> {
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "inferred",
    confidence: null,
    sourceRefs,
    extractionMethod: "rule_inference",
    authority: "deterministic_rule_inference",
    assumptionId: TIER_ONE_SCREENING_ASSUMPTION_ID,
    reviewedByUser: false,
    createdAt,
  });
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function calibratedDocument(document: SourceDocument): boolean {
  const facts = [document.units, document.drawingScale];
  return (
    document.validationStatus === "accepted" &&
    facts.every(
      (fact) =>
        fact.value != null &&
        fact.status !== "missing" &&
        fact.status !== "defaulted" &&
        fact.status !== "conflicted" &&
        fact.assumptionId == null,
    ) &&
    typeof document.drawingScale.value === "number" &&
    Number.isFinite(document.drawingScale.value) &&
    document.drawingScale.value > 0
  );
}

function eligibleBoundary(
  ingestion: DrawingSetIngestionResult,
):
  | Readonly<{ document: SourceDocument; boundary: ExtractedBoundary }>
  | TierOneModelBuildOutcome {
  if (ingestion.rejectedFiles.length > 0) {
    return extractionOnly(
      "rejected_source",
      "Tier-1 model generation stopped because at least one uploaded source was rejected.",
    );
  }
  if (ingestion.drawingSet.documents.length !== 1) {
    return extractionOnly(
      "unsupported_source_set",
      "Tier-1 auto-generation supports exactly one accepted floor-plan source; review multi-document sets before model generation.",
    );
  }
  const document = ingestion.drawingSet.documents[0];
  if (document.classification.documentType !== "floor_plan") {
    return extractionOnly(
      "not_floor_plan",
      "The accepted source is not classified as a floor plan, so its geometry remains extraction-only.",
    );
  }
  const strongestAlternative = Math.max(
    0,
    ...document.classification.alternatives.map((candidate) => candidate.confidence),
  );
  if (
    document.classification.method !== "user_assignment" &&
    (document.classification.confidence < 0.72 ||
      strongestAlternative > document.classification.confidence - 0.15)
  ) {
    return extractionOnly(
      "classification_uncertain",
      "Floor-plan classification is not sufficiently distinct from its alternatives; confirm the document type before model generation.",
    );
  }
  if (!calibratedDocument(document)) {
    return extractionOnly(
      "uncalibrated_units",
      "The vector geometry has no confirmed physical-unit calibration; drawing units must be extracted or user-confirmed before model generation.",
    );
  }
  if (
    ingestion.conflicts.some(
      (conflict) => conflict.resolutionStatus !== "user_resolved",
    )
  ) {
    return extractionOnly(
      "unresolved_conflict",
      "The extraction contains an unresolved value conflict; confirm it before model generation.",
    );
  }
  if (ingestion.extractionRun.unsupportedStages.some((stage) => stage.blocking)) {
    return extractionOnly(
      "unsupported_extraction_stage",
      "A required extraction stage is still blocked, so the upload remains evidence-only.",
    );
  }
  const unsupportedBlockingMissing = ingestion.missingValues.filter(
    (missing) => missing.blocking && missing.key !== "site.northOrientationDeg",
  );
  if (unsupportedBlockingMissing.length > 0) {
    return extractionOnly(
      "unsupported_missing_value",
      "A required extracted value is missing and is not covered by the Tier-1 screening template.",
    );
  }
  const candidates = ingestion.extractedBoundaries.filter(
    (boundary) => boundary.documentId === document.id,
  );
  if (candidates.length === 0) {
    return extractionOnly(
      "no_valid_boundary",
      "No valid calibrated closed floor boundary was extracted; no energy model was invented.",
    );
  }
  if (candidates.length > 1) {
    return extractionOnly(
      "ambiguous_boundary",
      "Multiple valid floor boundaries were extracted; select the intended building boundary before model generation.",
    );
  }
  const boundary = candidates[0];
  const polygon = boundary.polygon.value;
  const recordedArea = boundary.areaSqm.value;
  if (
    polygon == null ||
    boundary.polygon.unit !== "m" ||
    boundary.areaSqm.unit !== "m2" ||
    validatePolygon(polygon).length > 0
  ) {
    return extractionOnly(
      "invalid_boundary",
      "The extracted boundary is not a finite, simple metre-coordinate polygon.",
    );
  }
  const calculatedArea = polygonArea(polygon);
  if (
    typeof recordedArea !== "number" ||
    !Number.isFinite(recordedArea) ||
    recordedArea <= 0 ||
    relativeError(calculatedArea, recordedArea) > 0.01
  ) {
    return extractionOnly(
      "geometry_mismatch",
      "The recorded floor area differs from the polygon area by more than 1%; review scale and boundary extraction.",
    );
  }
  return Object.freeze({ document, boundary });
}

function construction(
  id: string,
  name: string,
  kind: ConstructionAssembly["kind"],
  uValueWPerM2K: number,
  shgc: number,
  visibleTransmittance: number,
  now: IsoDateTime,
): ConstructionAssembly {
  return Object.freeze({
    id,
    name: templateFact(`construction.${id}.name`, name, now),
    kind,
    layers:
      kind === "opaque"
        ? Object.freeze([
            Object.freeze({
              id: `${id}-screening-layer`,
              name: templateFact(
                `construction.${id}.layer.name`,
                "Screening insulation layer",
                now,
              ),
              thicknessM: templateFact(
                `construction.${id}.layer.thicknessM`,
                0.1,
                now,
                "m",
              ),
              conductivityWPerMK: templateFact(
                `construction.${id}.layer.conductivityWPerMK`,
                0.035,
                now,
                "W/mK",
              ),
              densityKgPerM3: templateFact(
                `construction.${id}.layer.densityKgPerM3`,
                30,
                now,
                "kg/m3",
              ),
              specificHeatJPerKgK: templateFact(
                `construction.${id}.layer.specificHeatJPerKgK`,
                1_400,
                now,
                "J/kgK",
              ),
            }),
          ])
        : Object.freeze([]),
    uValueWPerM2K: templateFact(
      `construction.${id}.uValueWPerM2K`,
      uValueWPerM2K,
      now,
      "W/m2K",
    ),
    rValueM2KPerW: templateFact(
      `construction.${id}.rValueM2KPerW`,
      1 / uValueWPerM2K,
      now,
      "m2K/W",
    ),
    shgc: templateFact(`construction.${id}.shgc`, shgc, now),
    visibleTransmittance: templateFact(
      `construction.${id}.visibleTransmittance`,
      visibleTransmittance,
      now,
    ),
  });
}

function usageProfile(now: IsoDateTime): UsageProfile {
  const values = TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1.usage;
  return Object.freeze({
    id: "tier1-usage-office",
    name: templateFact("usage.tier1-office.name", "Tier-1 office weekday", now),
    spaceType: templateFact(
      "usage.tier1-office.spaceType",
      values.useType,
      now,
    ),
    occupancyDensityPeoplePerSqm: templateFact(
      "usage.tier1-office.occupancyDensityPeoplePerSqm",
      values.occupancyDensityPeoplePerSqm,
      now,
      "people/m2",
    ),
    occupancySchedule: templateFact(
      "usage.tier1-office.occupancySchedule",
      occupiedSchedule,
      now,
      "fraction",
    ),
    lightingPowerDensityWPerSqm: templateFact(
      "usage.tier1-office.lightingPowerDensityWPerSqm",
      values.lightingPowerDensityWPerSqm,
      now,
      "W/m2",
    ),
    lightingSchedule: templateFact(
      "usage.tier1-office.lightingSchedule",
      occupiedSchedule,
      now,
      "fraction",
    ),
    equipmentPowerDensityWPerSqm: templateFact(
      "usage.tier1-office.equipmentPowerDensityWPerSqm",
      values.equipmentPowerDensityWPerSqm,
      now,
      "W/m2",
    ),
    equipmentSchedule: templateFact(
      "usage.tier1-office.equipmentSchedule",
      occupiedSchedule,
      now,
      "fraction",
    ),
    ventilationLpsPerPerson: templateFact(
      "usage.tier1-office.ventilationLpsPerPerson",
      values.ventilationLpsPerPerson,
      now,
      "L/s-person",
    ),
    heatingSetpointC: templateFact(
      "usage.tier1-office.heatingSetpointC",
      values.heatingSetpointC,
      now,
      "degC",
    ),
    coolingSetpointC: templateFact(
      "usage.tier1-office.coolingSetpointC",
      values.coolingSetpointC,
      now,
      "degC",
    ),
    operatingHours: templateFact(
      "usage.tier1-office.operatingHours",
      values.operatingHours,
      now,
    ),
    holidaySchedule: templateFact(
      "usage.tier1-office.holidaySchedule",
      Object.freeze([]) as readonly string[],
      now,
    ),
  });
}

function hvacSystem(
  zoneId: string,
  floorAreaSqm: number,
  sourceRefs: readonly SourceReference[],
  now: IsoDateTime,
): HvacSystem {
  const values = TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1.hvac;
  const usage = TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1.usage;
  return Object.freeze({
    id: "tier1-hvac-main",
    name: templateFact("system.tier1-hvac-main.name", "Tier-1 air-source heat pump", now),
    systemType: templateFact(
      "system.tier1-hvac-main.systemType",
      values.systemType,
      now,
    ),
    servedZoneIds: templateFact(
      "system.tier1-hvac-main.servedZoneIds",
      Object.freeze([zoneId]),
      now,
    ),
    heatingSource: templateFact(
      "system.tier1-hvac-main.heatingSource",
      values.heatingSource,
      now,
    ),
    coolingSource: templateFact(
      "system.tier1-hvac-main.coolingSource",
      values.coolingSource,
      now,
    ),
    distributionSystem: templateFact(
      "system.tier1-hvac-main.distributionSystem",
      values.distributionSystem,
      now,
    ),
    capacityKw: mixedFact(
      "system.tier1-hvac-main.capacityKw",
      floorAreaSqm * values.capacityKwPerSqm,
      sourceRefs,
      now,
      "kW",
    ),
    heatingEfficiency: templateFact(
      "system.tier1-hvac-main.heatingEfficiency",
      values.heatingEfficiencyCop,
      now,
      "COP",
    ),
    coolingCop: templateFact(
      "system.tier1-hvac-main.coolingCop",
      values.coolingCop,
      now,
      "COP",
    ),
    outdoorAirStrategy: templateFact(
      "system.tier1-hvac-main.outdoorAirStrategy",
      values.outdoorAirStrategy,
      now,
    ),
    heatRecoveryEfficiency: templateFact(
      "system.tier1-hvac-main.heatRecoveryEfficiency",
      values.heatRecoveryEfficiency,
      now,
      "fraction",
    ),
    ventilationLps: mixedFact(
      "system.tier1-hvac-main.ventilationLps",
      floorAreaSqm *
        usage.occupancyDensityPeoplePerSqm *
        usage.ventilationLpsPerPerson,
      sourceRefs,
      now,
      "L/s",
    ),
    controlSchedule: templateFact(
      "system.tier1-hvac-main.controlSchedule",
      hvacSchedule,
      now,
      "fraction",
    ),
    threeObjectIds: Object.freeze([]),
  });
}

function tierOneAssumption(
  scopeObjectIds: readonly string[],
): AssumptionRecord {
  const template = TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1;
  return Object.freeze({
    id: TIER_ONE_SCREENING_ASSUMPTION_ID,
    key: "tier1.office-screening-template.v1",
    title: "Tier-1 office screening template v1",
    explanation:
      `One ${template.geometry.floorToFloorHeightM} m conditioned office storey in ` +
      `${template.site.location}; wall/roof/ground/window U-values ` +
      `${template.envelope.wallUValueWPerM2K}/${template.envelope.roofUValueWPerM2K}/` +
      `${template.envelope.groundUValueWPerM2K}/${template.envelope.windowUValueWPerM2K} W/m2K; ` +
      `${Math.round(template.envelope.windowToWallRatio * 100)}% WWR, SHGC ` +
      `${template.envelope.windowShgc}, ${template.envelope.infiltrationAirChangesPerHour} ACH; ` +
      `${template.usage.heatingSetpointC}/${template.usage.coolingSetpointC} degC setpoints and a packaged heat pump are assumed.`,
    trigger:
      "Exactly one calibrated floor-plan boundary qualified for the narrow Tier-1 path. Project-specific envelope, use, system, and weather values are not consumed by this versioned screening template.",
    scopeObjectIds: Object.freeze([...scopeObjectIds]),
    method: "project_default",
    simulationImpact:
      `Assumption-heavy screening inputs affect ${TIER_ONE_SCREENING_ENGINE_PATHS.join(
        ", ",
      )}; the result is not measured data or a compliance prediction.`,
    reversible: true,
  });
}

function acceptanceRecord(
  drawingSetId: string,
  buildingId: string,
  now: IsoDateTime,
): MissingValueRecord {
  return Object.freeze({
    id: stableId("missing", TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY, drawingSetId),
    key: TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
    affectedObjectIds: Object.freeze([buildingId]),
    requiredFor: "simulation",
    blocking: true,
    allowedAssumptionIds: Object.freeze([
      TIER_ONE_SCREENING_ASSUMPTION_ID,
    ]),
    message:
      "Review and explicitly accept the versioned Tier-1 office screening assumptions before simulation.",
    createdAt: now,
  });
}

function retainedMissingValues(
  ingestion: DrawingSetIngestionResult,
): readonly MissingValueRecord[] {
  return Object.freeze(
    ingestion.missingValues.map((missing) =>
      missing.key === "site.northOrientationDeg"
        ? Object.freeze({
            ...missing,
            blocking: false,
            allowedAssumptionIds: Object.freeze([
              ...new Set([
                ...missing.allowedAssumptionIds,
                TIER_ONE_SCREENING_ASSUMPTION_ID,
              ]),
            ]),
            message:
              `${missing.message} Tier-1 uses the visible 0 deg template orientation.`,
          })
        : missing,
    ),
  );
}

/**
 * Builds only the narrow supported Tier-1 estimate: exactly one confidently
 * classified and calibrated floor plan with exactly one valid boundary.
 * Every other input remains extraction-only with a machine-readable reason.
 */
export function buildTierOneCanonicalModel(
  ingestion: DrawingSetIngestionResult,
  locale: "ko" | "en",
  now = new Date().toISOString(),
): TierOneModelBuildOutcome {
  const eligibility = eligibleBoundary(ingestion);
  if ("status" in eligibility) return eligibility;

  const { document, boundary: extractedBoundary } = eligibility;
  const boundary = extractedBoundary.polygon.value!;
  const boundarySources = extractedBoundary.polygon.sourceRefs;
  const areaSqm = extractedBoundary.areaSqm.value!;
  const template = TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1;
  const heightM = template.geometry.floorToFloorHeightM;
  const northOrientationValue =
    typeof document.northOrientationDeg.value === "number" &&
    Number.isFinite(document.northOrientationDeg.value)
      ? document.northOrientationDeg.value
      : template.site.northOrientationDeg;

  const buildingId = stableId("building-tier1", ingestion.drawingSet.id);
  const storeyId = stableId("storey-tier1", ingestion.drawingSet.id, 1);
  const plateId = stableId("plate-tier1", ingestion.drawingSet.id, 1);
  const spaceId = stableId("space-tier1", ingestion.drawingSet.id, 1);
  const zoneId = stableId("zone-tier1", ingestion.drawingSet.id, 1);

  const storey = Object.freeze({
    id: storeyId,
    name: "Tier-1 Level 1",
    elevationM: templateFact(
      `geometry.storey.${storeyId}.elevationM`,
      template.geometry.elevationM,
      now,
      "m",
    ),
    floorToFloorHeightM: templateFact(
      `geometry.storey.${storeyId}.floorToFloorHeightM`,
      heightM,
      now,
      "m",
    ),
    floorPlateIds: Object.freeze([plateId]),
    spaceIds: Object.freeze([spaceId]),
  });
  const plate = Object.freeze({
    id: plateId,
    storeyId,
    boundary: extractedBoundary.polygon,
    areaSqm: extractedBoundary.areaSqm,
    voidBoundaries: Object.freeze([]),
    sourceEntityIds: Object.freeze([extractedBoundary.id]),
  });
  const space = Object.freeze({
    id: spaceId,
    name: templateFact(`space.${spaceId}.name`, "Tier-1 office", now),
    storeyId,
    boundary: mixedFact(
      `space.${spaceId}.boundary`,
      boundary,
      boundarySources,
      now,
      "m",
    ),
    floorAreaSqm: mixedFact(
      `space.${spaceId}.floorAreaSqm`,
      areaSqm,
      boundarySources,
      now,
      "m2",
    ),
    volumeM3: mixedFact(
      `space.${spaceId}.volumeM3`,
      calculateZoneVolume(areaSqm, heightM),
      boundarySources,
      now,
      "m3",
    ),
    conditioned: templateFact(
      `space.${spaceId}.conditioned`,
      template.geometry.conditioned,
      now,
    ),
    spaceType: templateFact(
      `space.${spaceId}.spaceType`,
      template.usage.useType,
      now,
    ),
    thermalZoneId: zoneId,
    adjacentSpaceIds: Object.freeze([]),
    isCore: false,
    isAtrium: false,
  });
  const zone = Object.freeze({
    id: zoneId,
    name: templateFact(`zone.${zoneId}.name`, "Tier-1 office zone", now),
    sourceSpaceIds: Object.freeze([spaceId]),
    storeyIds: Object.freeze([storeyId]),
    conditioned: templateFact(
      `zone.${zoneId}.conditioned`,
      template.geometry.conditioned,
      now,
    ),
    floorAreaSqm: mixedFact(
      `zone.${zoneId}.floorAreaSqm`,
      areaSqm,
      boundarySources,
      now,
      "m2",
    ),
    volumeM3: mixedFact(
      `zone.${zoneId}.volumeM3`,
      calculateZoneVolume(areaSqm, heightM),
      boundarySources,
      now,
      "m3",
    ),
    orientationBand: templateFact(
      `zone.${zoneId}.orientationBand`,
      template.geometry.orientationBand,
      now,
    ),
    usageProfileId: "tier1-usage-office",
    hvacSystemIds: Object.freeze(["tier1-hvac-main"]),
    stableKey: stableId("tier1-zone-key", ingestion.drawingSet.id),
  });

  const wallDrafts: Surface[] = orientedEdges(boundary).map((edge) => {
    const id = stableId(
      "surface-tier1-wall",
      ingestion.drawingSet.id,
      edge.index,
    );
    return Object.freeze({
      id,
      type: "exterior_wall" as const,
      storeyId,
      spaceId,
      adjacentSpaceId: null,
      boundaryCondition: mixedFact(
        `surface.${id}.boundaryCondition`,
        "outdoors" as const,
        boundarySources,
        now,
      ),
      geometry: mixedFact(
        `surface.${id}.geometry`,
        Object.freeze([edge.start, edge.end]),
        boundarySources,
        now,
        "m",
      ),
      areaSqm: mixedFact(
        `surface.${id}.areaSqm`,
        edge.lengthM * heightM,
        boundarySources,
        now,
        "m2",
      ),
      azimuthDeg: mixedFact(
        `surface.${id}.azimuthDeg`,
        normalizeDegrees(edge.outwardAzimuthDeg + northOrientationValue),
        boundarySources,
        now,
        "deg",
      ),
      tiltDeg: templateFact(`surface.${id}.tiltDeg`, 90, now, "deg"),
      constructionId: templateFact(
        `surface.${id}.constructionId`,
        "tier1-construction-wall",
        now,
      ),
      openingIds: Object.freeze([]),
      threeObjectId: `three-${id}`,
    });
  });

  const openings: readonly Opening[] = Object.freeze(
    wallDrafts.map((wall, index) => {
      const id = stableId(
        "opening-tier1-screening",
        ingestion.drawingSet.id,
        index,
      );
      const wallArea = wall.areaSqm.value!;
      const openingArea = wallArea * template.envelope.windowToWallRatio;
      const openingWidth = openingArea / template.envelope.windowHeightM;
      return Object.freeze({
        id,
        type: "window" as const,
        hostSurfaceId: wall.id,
        areaSqm: mixedFact(
          `opening.${id}.areaSqm`,
          openingArea,
          boundarySources,
          now,
          "m2",
        ),
        widthM: mixedFact(
          `opening.${id}.widthM`,
          openingWidth,
          boundarySources,
          now,
          "m",
        ),
        heightM: templateFact(
          `opening.${id}.heightM`,
          template.envelope.windowHeightM,
          now,
          "m",
        ),
        sillHeightM: templateFact(
          `opening.${id}.sillHeightM`,
          template.envelope.sillHeightM,
          now,
          "m",
        ),
        constructionId: templateFact(
          `opening.${id}.constructionId`,
          "tier1-construction-window",
          now,
        ),
        geometryRef: templateFact(
          `opening.${id}.geometryRef`,
          `tier1-aggregate-glazing:${wall.id}`,
          now,
        ),
      });
    }),
  );
  const walls = wallDrafts.map((wall, index) =>
    Object.freeze({
      ...wall,
      openingIds: Object.freeze([openings[index].id]),
    }),
  );

  const horizontalSpecs = Object.freeze([
    Object.freeze({
      type: "ground_floor" as const,
      boundaryCondition: "ground" as const,
      tiltDeg: 180,
      constructionId: "tier1-construction-ground",
    }),
    Object.freeze({
      type: "roof" as const,
      boundaryCondition: "outdoors" as const,
      tiltDeg: 0,
      constructionId: "tier1-construction-roof",
    }),
  ]);
  const horizontalSurfaces: Surface[] = horizontalSpecs.map((spec) => {
    const id = stableId(
      `surface-tier1-${spec.type}`,
      ingestion.drawingSet.id,
    );
    return Object.freeze({
      id,
      type: spec.type,
      storeyId,
      spaceId,
      adjacentSpaceId: null,
      boundaryCondition: mixedFact(
        `surface.${id}.boundaryCondition`,
        spec.boundaryCondition,
        boundarySources,
        now,
      ),
      geometry: mixedFact(
        `surface.${id}.geometry`,
        boundary,
        boundarySources,
        now,
        "m",
      ),
      areaSqm: mixedFact(
        `surface.${id}.areaSqm`,
        areaSqm,
        boundarySources,
        now,
        "m2",
      ),
      azimuthDeg: templateFact(`surface.${id}.azimuthDeg`, 0, now, "deg"),
      tiltDeg: templateFact(
        `surface.${id}.tiltDeg`,
        spec.tiltDeg,
        now,
        "deg",
      ),
      constructionId: templateFact(
        `surface.${id}.constructionId`,
        spec.constructionId,
        now,
      ),
      openingIds: Object.freeze([]),
      threeObjectId: `three-${id}`,
    });
  });
  const surfaces = Object.freeze([...walls, ...horizontalSurfaces]);

  const constructions = Object.freeze([
    construction(
      "tier1-construction-wall",
      "Tier-1 exterior wall",
      "opaque",
      template.envelope.wallUValueWPerM2K,
      0,
      0,
      now,
    ),
    construction(
      "tier1-construction-roof",
      "Tier-1 roof",
      "opaque",
      template.envelope.roofUValueWPerM2K,
      0,
      0,
      now,
    ),
    construction(
      "tier1-construction-ground",
      "Tier-1 ground slab",
      "opaque",
      template.envelope.groundUValueWPerM2K,
      0,
      0,
      now,
    ),
    construction(
      "tier1-construction-window",
      "Tier-1 double glazing",
      "window",
      template.envelope.windowUValueWPerM2K,
      template.envelope.windowShgc,
      template.envelope.windowVisibleTransmittance,
      now,
    ),
  ]);
  const assumption = tierOneAssumption(
    Object.freeze([
      buildingId,
      storeyId,
      spaceId,
      zoneId,
      ...surfaces.map((surface) => surface.id),
      ...openings.map((opening) => opening.id),
      ...constructions.map((candidate) => candidate.id),
      "tier1-usage-office",
      "tier1-hvac-main",
    ]),
  );
  const northOrientation =
    typeof document.northOrientationDeg.value === "number" &&
    Number.isFinite(document.northOrientationDeg.value)
      ? createEnergyFact({
          key: "site.northOrientationDeg",
          value: northOrientationValue,
          unit: "deg",
          status:
            document.northOrientationDeg.status === "user_confirmed"
              ? "user_confirmed"
              : "inferred",
          confidence: document.northOrientationDeg.confidence,
          sourceRefs: document.northOrientationDeg.sourceRefs,
          extractionMethod:
            document.northOrientationDeg.extractionMethod === "user_input"
              ? "user_input"
              : "rule_inference",
          authority:
            document.northOrientationDeg.extractionMethod === "user_input"
              ? "user_confirmed_project_value"
              : "deterministic_rule_inference",
          reviewedByUser: document.northOrientationDeg.reviewedByUser,
          createdAt: now,
        })
      : templateFact(
          "site.northOrientationDeg",
          template.site.northOrientationDeg,
          now,
          "deg",
        );

  const shell: CanonicalEnergyModel = {
    id: stableId("model-tier1", ingestion.drawingSet.id),
    schemaVersion: CANONICAL_ENERGY_MODEL_VERSION,
    modelVersion: template.modelVersion,
    project: {
      id: stableId("project-tier1", ingestion.drawingSet.id),
      name: ingestion.drawingSet.name,
      locale,
    },
    building: {
      id: buildingId,
      name: templateFact("building.name", ingestion.drawingSet.name, now),
      useType: templateFact("building.useType", template.usage.useType, now),
    },
    site: {
      location: templateFact("site.location", template.site.location, now),
      latitudeDeg: templateFact(
        "site.latitudeDeg",
        template.site.latitudeDeg,
        now,
        "deg",
      ),
      longitudeDeg: templateFact(
        "site.longitudeDeg",
        template.site.longitudeDeg,
        now,
        "deg",
      ),
      northOrientationDeg: northOrientation,
      weatherSource: templateFact(
        "site.weatherSource",
        template.site.weatherSource,
        now,
      ),
      groundRelationship: templateFact(
        "site.groundRelationship",
        template.site.groundRelationship,
        now,
      ),
    },
    drawingSet: Object.freeze({ ...ingestion.drawingSet, tier: 1 as const }),
    extractionRuns: Object.freeze([ingestion.extractionRun]),
    geometry: Object.freeze({
      coordinateSystem: mixedFact(
        "geometry.coordinateSystem",
        template.geometry.coordinateSystem,
        boundarySources,
        now,
      ),
      storeys: Object.freeze([storey]),
      floorPlates: Object.freeze([plate]),
      spaces: Object.freeze([space]),
      thermalZones: Object.freeze([zone]),
      surfaces,
      openings,
      shadingDevices: Object.freeze([]),
    }),
    envelope: Object.freeze({
      constructions,
      infiltrationAirChangesPerHour: templateFact(
        "envelope.infiltration.airChangesPerHour",
        template.envelope.infiltrationAirChangesPerHour,
        now,
        "ACH",
      ),
      airTightnessNotes: templateFact(
        "envelope.airTightnessNotes",
        "Tier-1 natural/design ACH assumption; not an ACH50 test result.",
        now,
      ),
      thermalBridgeNotes: templateFact(
        "envelope.thermalBridgeNotes",
        "No separate thermal-bridge adjustment in the Tier-1 screening template.",
        now,
      ),
    }),
    usageProfiles: Object.freeze([usageProfile(now)]),
    systems: Object.freeze({
      hvac: Object.freeze([
        hvacSystem(zoneId, areaSqm, boundarySources, now),
      ]),
      domesticHotWater: Object.freeze([]),
      renewables: Object.freeze([]),
    }),
    facts: Object.freeze([]),
    conflicts: Object.freeze([...ingestion.conflicts]),
    missingValues: Object.freeze([
      ...retainedMissingValues(ingestion),
      acceptanceRecord(ingestion.drawingSet.id, buildingId, now),
    ]),
    assumptions: Object.freeze([assumption]),
    mappings: Object.freeze([
      Object.freeze({
        canonicalObjectId: zoneId,
        sourceEntityRefs: boundarySources,
        threeObjectIds: Object.freeze([`three-${zoneId}`]),
      }),
      ...surfaces.map((surface) =>
        Object.freeze({
          canonicalObjectId: surface.id,
          sourceEntityRefs: boundarySources,
          threeObjectIds: Object.freeze(
            surface.threeObjectId ? [surface.threeObjectId] : [],
          ),
        }),
      ),
      ...openings.map((opening) =>
        Object.freeze({
          canonicalObjectId: opening.id,
          sourceEntityRefs: boundarySources,
          threeObjectIds: Object.freeze([]),
        }),
      ),
    ]),
    readiness: Object.freeze([]),
    scenarios: Object.freeze([]),
    simulationRuns: Object.freeze([]),
    createdAt: now,
    updatedAt: now,
  };
  const indexed: CanonicalEnergyModel = Object.freeze({
    ...shell,
    facts: collectEnergyFacts(shell),
  });
  const validation = validateCanonicalEnergyModel(indexed);
  return Object.freeze({
    status: "created",
    boundaryId: extractedBoundary.id,
    model: Object.freeze({
      ...indexed,
      readiness: Object.freeze(validation.readiness),
    }),
  });
}

export function isTierOneAssumptionPending(
  model: CanonicalEnergyModel,
): boolean {
  return model.missingValues.some(
    (missing) => missing.key === TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
  );
}

export function acceptTierOneScreeningAssumption(
  model: CanonicalEnergyModel,
  now = new Date().toISOString(),
): CanonicalEnergyModel {
  if (!isTierOneAssumptionPending(model)) return model;
  let accepted = model;
  for (const fact of model.facts) {
    if (fact.assumptionId !== TIER_ONE_SCREENING_ASSUMPTION_ID) continue;
    accepted = replaceFact(
      accepted,
      Object.freeze({
        ...fact,
        reviewedByUser: true,
        updatedAt: now,
      }),
    );
  }
  for (const fact of model.geometry.floorPlates.flatMap((plate) => [
    plate.boundary,
    plate.areaSqm,
  ])) {
    accepted = replaceFact(
      accepted,
      Object.freeze({
        ...fact,
        reviewedByUser: true,
        updatedAt: now,
      }),
    );
  }
  const shell: CanonicalEnergyModel = Object.freeze({
    ...accepted,
    modelVersion:
      TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1.acceptedModelVersion,
    missingValues: Object.freeze(
      accepted.missingValues.filter(
        (missing) => missing.key !== TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
      ),
    ),
    updatedAt: now,
  });
  const indexed: CanonicalEnergyModel = Object.freeze({
    ...shell,
    facts: collectEnergyFacts(shell),
  });
  const validation = validateCanonicalEnergyModel(indexed);
  return Object.freeze({
    ...indexed,
    readiness: Object.freeze(validation.readiness),
  });
}
