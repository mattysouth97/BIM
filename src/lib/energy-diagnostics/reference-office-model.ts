import { collectEnergyFacts, createEnergyFact } from "./facts";
import { calculateZoneVolume, orientedEdges } from "./geometry";
import { stableId } from "./ids";
import type { DrawingSetIngestionResult } from "./ingestion";
import {
  CANONICAL_ENERGY_MODEL_VERSION,
  type AssumptionRecord,
  type CanonicalEnergyModel,
  type ConstructionAssembly,
  type EnergyFact,
  type IsoDateTime,
  type Opening,
  type Polygon2D,
  type ScheduleValue,
  type SourceReference,
  type Surface,
  type UsageProfile,
} from "./types";
import { validateCanonicalEnergyModel } from "./validation";

export const REFERENCE_OFFICE_MODEL_VERSION = "reference-office-rev-a";
export const REFERENCE_OFFICE_DEFAULTS_ASSUMPTION_ID =
  "assumption.reference-office-design-defaults";
export const REFERENCE_OFFICE_INFILTRATION_ASSUMPTION_ID =
  "assumption.reference-office-natural-infiltration";

const REFERENCE_TEMPLATE = Object.freeze({
  site: Object.freeze({
    location: "Seoul, KR",
    latitudeDeg: 37.5665,
    longitudeDeg: 126.978,
    weatherSource: "KR-Seoul-TMY",
    groundRelationship: "slab_on_grade",
  }),
  envelope: Object.freeze({
    roofUValueWPerM2K: 0.2,
    groundUValueWPerM2K: 0.4,
    windowVisibleTransmittance: 0.6,
  }),
  usage: Object.freeze({
    occupancyDensityPeoplePerSqm: 0.1,
    equipmentPowerDensityWPerSqm: 10,
    ventilationLpsPerPerson: 10,
    heatingSetpointC: 20,
    coolingSetpointC: 26,
    operatingHours: "Mon-Fri 08:00-18:00",
  }),
  hvac: Object.freeze({
    heatingEfficiencyCop: 3.2,
    heatRecoveryEfficiency: 0.7,
  }),
});

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

function assumptionFact<T>(
  key: string,
  value: T,
  now: IsoDateTime,
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
    assumptionId: REFERENCE_OFFICE_DEFAULTS_ASSUMPTION_ID,
    reviewedByUser: false,
    createdAt: now,
  });
}

function uniqueSourceRefs(
  facts: readonly EnergyFact<unknown>[],
): readonly SourceReference[] {
  return Object.freeze([
    ...new Map(
      facts.flatMap((fact) => fact.sourceRefs).map((source) => [source.id, source]),
    ).values(),
  ]);
}

function inferredFact<T>(
  key: string,
  value: T,
  sourceFacts: readonly EnergyFact<unknown>[],
  now: IsoDateTime,
  unit?: string,
): EnergyFact<T> {
  const sourceRefs = uniqueSourceRefs(sourceFacts);
  if (sourceRefs.length === 0) {
    throw new Error(`Reference-office inference ${key} has no source evidence.`);
  }
  const confidences = sourceFacts
    .map((fact) => fact.confidence)
    .filter((value): value is number => value != null);
  const conflictIds = Object.freeze([
    ...new Set(sourceFacts.flatMap((fact) => fact.conflictIds ?? [])),
  ]);
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "inferred",
    confidence: confidences.length > 0 ? Math.min(...confidences) : null,
    sourceRefs,
    extractionMethod: "rule_inference",
    authority: "deterministic_rule_inference",
    ...(conflictIds.length > 0 ? { conflictIds } : {}),
    reviewedByUser: false,
    createdAt: now,
  });
}

function factForKey<T>(
  ingestion: DrawingSetIngestionResult,
  key: string,
): EnergyFact<T> | undefined {
  const conflict = ingestion.conflicts.find((candidate) => candidate.key === key);
  if (conflict?.selectedFactId) {
    return conflict.candidates.find(
      (candidate) => candidate.fact.id === conflict.selectedFactId,
    )?.fact as EnergyFact<T> | undefined;
  }
  return ingestion.extractedFacts.find(
    (fact) => fact.key === key,
  ) as EnergyFact<T> | undefined;
}

function requiredFact<T>(
  ingestion: DrawingSetIngestionResult,
  key: string,
): EnergyFact<T> {
  const fact = factForKey<T>(ingestion, key);
  if (fact?.value == null) {
    throw new Error(`Representative drawing set is missing required fact ${key}.`);
  }
  return fact;
}

function construction(
  id: string,
  name: string,
  kind: ConstructionAssembly["kind"],
  uValue: EnergyFact<number>,
  shgc: EnergyFact<number>,
  visibleTransmittance: EnergyFact<number>,
  now: IsoDateTime,
): ConstructionAssembly {
  const reciprocal = 1 / (uValue.value ?? 1);
  return Object.freeze({
    id,
    name: assumptionFact(`construction.${id}.name`, name, now),
    kind,
    layers: Object.freeze([]),
    uValueWPerM2K: uValue,
    rValueM2KPerW:
      uValue.sourceRefs.length > 0
        ? inferredFact(
            `construction.${id}.rValueM2KPerW`,
            reciprocal,
            [uValue],
            now,
            "m2K/W",
          )
        : assumptionFact(
            `construction.${id}.rValueM2KPerW`,
            reciprocal,
            now,
            "m2K/W",
          ),
    shgc,
    visibleTransmittance,
  });
}

function usageProfile(
  lightingPowerDensity: EnergyFact<number>,
  now: IsoDateTime,
): UsageProfile {
  const values = REFERENCE_TEMPLATE.usage;
  return Object.freeze({
    id: "usage-reference-office",
    name: assumptionFact("usage.reference-office.name", "Reference office weekday", now),
    spaceType: assumptionFact("usage.reference-office.spaceType", "office", now),
    occupancyDensityPeoplePerSqm: assumptionFact(
      "usage.reference-office.occupancyDensityPeoplePerSqm",
      values.occupancyDensityPeoplePerSqm,
      now,
      "people/m2",
    ),
    occupancySchedule: assumptionFact(
      "usage.reference-office.occupancySchedule",
      occupiedSchedule,
      now,
      "fraction",
    ),
    lightingPowerDensityWPerSqm: lightingPowerDensity,
    lightingSchedule: assumptionFact(
      "usage.reference-office.lightingSchedule",
      occupiedSchedule,
      now,
      "fraction",
    ),
    equipmentPowerDensityWPerSqm: assumptionFact(
      "usage.reference-office.equipmentPowerDensityWPerSqm",
      values.equipmentPowerDensityWPerSqm,
      now,
      "W/m2",
    ),
    equipmentSchedule: assumptionFact(
      "usage.reference-office.equipmentSchedule",
      occupiedSchedule,
      now,
      "fraction",
    ),
    ventilationLpsPerPerson: assumptionFact(
      "usage.reference-office.ventilationLpsPerPerson",
      values.ventilationLpsPerPerson,
      now,
      "L/s-person",
    ),
    heatingSetpointC: assumptionFact(
      "usage.reference-office.heatingSetpointC",
      values.heatingSetpointC,
      now,
      "degC",
    ),
    coolingSetpointC: assumptionFact(
      "usage.reference-office.coolingSetpointC",
      values.coolingSetpointC,
      now,
      "degC",
    ),
    operatingHours: assumptionFact(
      "usage.reference-office.operatingHours",
      values.operatingHours,
      now,
    ),
    holidaySchedule: assumptionFact(
      "usage.reference-office.holidaySchedule",
      Object.freeze([]) as readonly string[],
      now,
    ),
  });
}

function defaultAssumption(scopeObjectIds: readonly string[]): AssumptionRecord {
  return Object.freeze({
    id: REFERENCE_OFFICE_DEFAULTS_ASSUMPTION_ID,
    key: "reference-office.design-defaults.v1",
    title: "Reference-office early-design defaults v1",
    explanation:
      "Seoul regional weather; roof/ground U-values 0.20/0.40 W/m2K; office occupancy 0.10 people/m2, plug load 10 W/m2, 20/26 degC setpoints, weekday schedules, heating COP 3.2, 10 L/s-person outdoor air, and 70% heat recovery are explicit screening defaults where the seven drawings are silent.",
    trigger:
      "The bundled seven-document set provides the floor plate, storey geometry, wall/window values, lighting density, and scheduled HVAC fields but not every whole-building degree-day input.",
    scopeObjectIds: Object.freeze([...scopeObjectIds]),
    method: "project_default",
    simulationImpact:
      "Affects regional climate lookup, roof/ground transmission, occupancy metadata, setpoints, ventilation heat loss, and HVAC efficiency; values remain reversible and source schedules always take priority.",
    reversible: true,
  });
}

function infiltrationAssumption(buildingId: string): AssumptionRecord {
  return Object.freeze({
    id: REFERENCE_OFFICE_INFILTRATION_ASSUMPTION_ID,
    key: "envelope.infiltration.airChangesPerHour",
    title: "Early-design natural infiltration",
    explanation:
      "Use 0.5 natural air changes per hour until an airtightness specification is supplied.",
    trigger: "No airtightness or infiltration value is present in the seven-document set.",
    scopeObjectIds: Object.freeze([buildingId]),
    method: "project_default",
    simulationImpact:
      "Changes the ventilation heat-loss component and annual heating/cooling demand.",
    reversible: true,
  });
}

/**
 * Builds the representative model from the seven registered documents only.
 * Geometry comes from the extracted DXF boundary plus the annotated repeated
 * storey count and section height; no canonical fixture geometry is copied.
 */
export function buildRepresentativeOfficeModel(
  ingestion: DrawingSetIngestionResult,
  now: IsoDateTime,
): CanonicalEnergyModel {
  if (ingestion.rejectedFiles.length > 0) {
    throw new Error("Representative drawing set contains a rejected source.");
  }
  if (ingestion.drawingSet.documents.length !== 7) {
    throw new Error("Representative office model requires exactly seven documents.");
  }
  if (ingestion.extractedBoundaries.length !== 1) {
    throw new Error("Representative office model requires one extracted floor boundary.");
  }

  const extractedBoundary = ingestion.extractedBoundaries[0];
  const boundary = extractedBoundary.polygon.value;
  const floorAreaSqm = extractedBoundary.areaSqm.value;
  if (boundary == null || floorAreaSqm == null) {
    throw new Error("Representative floor boundary is incomplete.");
  }
  const storeyCountFact = requiredFact<number>(
    ingestion,
    "geometry.repeatedStoreyCount",
  );
  const storeyHeightFact = requiredFact<number>(
    ingestion,
    "geometry.floorToFloorHeightM",
  );
  const storeyCount = Math.round(storeyCountFact.value!);
  const storeyHeightM = storeyHeightFact.value!;
  if (storeyCount < 1 || storeyHeightM <= 0) {
    throw new Error("Representative storey count and height must be positive.");
  }

  const northOrientationDeg = requiredFact<number>(
    ingestion,
    "site.northOrientationDeg",
  );
  const geometrySources = [
    extractedBoundary.polygon,
    extractedBoundary.areaSqm,
    storeyCountFact,
    storeyHeightFact,
    northOrientationDeg,
  ] as readonly EnergyFact<unknown>[];

  const buildingId = stableId("building-reference-office", ingestion.drawingSet.id);
  const openingId = "opening-reference-W01";
  const storeyIds = Array.from(
    { length: storeyCount },
    (_, index) => `storey-reference-${index + 1}`,
  );
  const plateIds = storeyIds.map((_, index) => `plate-reference-${index + 1}`);
  const spaceIds = storeyIds.map((_, index) => `space-reference-${index + 1}`);
  const zoneIds = storeyIds.map((_, index) => `zone-reference-${index + 1}`);

  const storeys = Object.freeze(
    storeyIds.map((storeyId, index) =>
      Object.freeze({
        id: storeyId,
        name: `Level ${index + 1}`,
        elevationM: inferredFact(
          `geometry.storey.${storeyId}.elevationM`,
          index * storeyHeightM,
          [storeyCountFact, storeyHeightFact],
          now,
          "m",
        ),
        floorToFloorHeightM: inferredFact(
          `geometry.storey.${storeyId}.floorToFloorHeightM`,
          storeyHeightM,
          [storeyHeightFact],
          now,
          "m",
        ),
        floorPlateIds: Object.freeze([plateIds[index]]),
        spaceIds: Object.freeze([spaceIds[index]]),
      }),
    ),
  );
  const floorPlates = Object.freeze(
    plateIds.map((plateId, index) =>
      Object.freeze({
        id: plateId,
        storeyId: storeyIds[index],
        boundary: inferredFact(
          `geometry.plate.${plateId}.boundary`,
          boundary,
          [extractedBoundary.polygon, storeyCountFact],
          now,
          "m",
        ),
        areaSqm: inferredFact(
          `geometry.plate.${plateId}.areaSqm`,
          floorAreaSqm,
          [extractedBoundary.areaSqm, storeyCountFact],
          now,
          "m2",
        ),
        voidBoundaries: Object.freeze([]),
        sourceEntityIds: Object.freeze([extractedBoundary.id]),
      }),
    ),
  );
  const spaces = Object.freeze(
    spaceIds.map((spaceId, index) =>
      Object.freeze({
        id: spaceId,
        name: assumptionFact(`space.${spaceId}.name`, `Level ${index + 1} office`, now),
        storeyId: storeyIds[index],
        boundary: inferredFact(
          `space.${spaceId}.boundary`,
          boundary,
          [extractedBoundary.polygon, storeyCountFact],
          now,
          "m",
        ),
        floorAreaSqm: inferredFact(
          `space.${spaceId}.floorAreaSqm`,
          floorAreaSqm,
          [extractedBoundary.areaSqm, storeyCountFact],
          now,
          "m2",
        ),
        volumeM3: inferredFact(
          `space.${spaceId}.volumeM3`,
          calculateZoneVolume(floorAreaSqm, storeyHeightM),
          [extractedBoundary.areaSqm, storeyHeightFact, storeyCountFact],
          now,
          "m3",
        ),
        conditioned: assumptionFact(`space.${spaceId}.conditioned`, true, now),
        spaceType: assumptionFact(`space.${spaceId}.spaceType`, "office", now),
        thermalZoneId: zoneIds[index],
        adjacentSpaceIds: Object.freeze([]),
        isCore: false,
        isAtrium: false,
      }),
    ),
  );
  const zones = Object.freeze(
    zoneIds.map((zoneId, index) =>
      Object.freeze({
        id: zoneId,
        name: assumptionFact(`zone.${zoneId}.name`, `Level ${index + 1} office zone`, now),
        sourceSpaceIds: Object.freeze([spaceIds[index]]),
        storeyIds: Object.freeze([storeyIds[index]]),
        conditioned: assumptionFact(`zone.${zoneId}.conditioned`, true, now),
        floorAreaSqm: inferredFact(
          `zone.${zoneId}.floorAreaSqm`,
          floorAreaSqm,
          [extractedBoundary.areaSqm, storeyCountFact],
          now,
          "m2",
        ),
        volumeM3: inferredFact(
          `zone.${zoneId}.volumeM3`,
          calculateZoneVolume(floorAreaSqm, storeyHeightM),
          [extractedBoundary.areaSqm, storeyHeightFact, storeyCountFact],
          now,
          "m3",
        ),
        orientationBand: assumptionFact(
          `zone.${zoneId}.orientationBand`,
          "mixed" as const,
          now,
        ),
        usageProfileId: "usage-reference-office",
        hvacSystemIds: Object.freeze(["hvac-reference-main"]),
        stableKey: stableId("zone-key-reference", ingestion.drawingSet.id, index),
      }),
    ),
  );

  const wallUValue = requiredFact<number>(ingestion, "construction.wall.EW01.uValue");
  const wallSurfaces: Surface[] = [];
  for (let storeyIndex = 0; storeyIndex < storeyCount; storeyIndex += 1) {
    for (const edge of orientedEdges(boundary)) {
      const id = `surface-reference-${storeyIndex + 1}-wall-${edge.index + 1}`;
      wallSurfaces.push(
        Object.freeze({
          id,
          type: "exterior_wall",
          storeyId: storeyIds[storeyIndex],
          spaceId: spaceIds[storeyIndex],
          adjacentSpaceId: null,
          boundaryCondition: inferredFact(
            `surface.${id}.boundaryCondition`,
            "outdoors" as const,
            geometrySources,
            now,
          ),
          geometry: inferredFact(
            `surface.${id}.geometry`,
            Object.freeze([edge.start, edge.end]) as Polygon2D,
            geometrySources,
            now,
            "m",
          ),
          areaSqm: inferredFact(
            `surface.${id}.areaSqm`,
            edge.lengthM * storeyHeightM,
            geometrySources,
            now,
            "m2",
          ),
          azimuthDeg: inferredFact(
            `surface.${id}.azimuthDeg`,
            (edge.outwardAzimuthDeg + northOrientationDeg.value!) % 360,
            geometrySources,
            now,
            "deg",
          ),
          tiltDeg: inferredFact(`surface.${id}.tiltDeg`, 90, geometrySources, now, "deg"),
          constructionId: inferredFact(
            `surface.${id}.constructionId`,
            "construction-reference-wall",
            [wallUValue],
            now,
          ),
          openingIds:
            storeyIndex === 0 && edge.orientation === "east"
              ? Object.freeze([openingId])
              : Object.freeze([]),
          threeObjectId: `three-${id}`,
        }),
      );
    }
  }
  const horizontalSurfaces: Surface[] = [
    Object.freeze({
      id: "surface-reference-ground",
      type: "ground_floor" as const,
      storeyId: storeyIds[0],
      spaceId: spaceIds[0],
      adjacentSpaceId: null,
      boundaryCondition: inferredFact(
        "surface.surface-reference-ground.boundaryCondition",
        "ground" as const,
        geometrySources,
        now,
      ),
      geometry: inferredFact(
        "surface.surface-reference-ground.geometry",
        boundary,
        geometrySources,
        now,
        "m",
      ),
      areaSqm: inferredFact(
        "surface.surface-reference-ground.areaSqm",
        floorAreaSqm,
        geometrySources,
        now,
        "m2",
      ),
      azimuthDeg: inferredFact(
        "surface.surface-reference-ground.azimuthDeg",
        0,
        geometrySources,
        now,
        "deg",
      ),
      tiltDeg: inferredFact(
        "surface.surface-reference-ground.tiltDeg",
        180,
        geometrySources,
        now,
        "deg",
      ),
      constructionId: assumptionFact(
        "surface.surface-reference-ground.constructionId",
        "construction-reference-ground",
        now,
      ),
      openingIds: Object.freeze([]),
      threeObjectId: "three-surface-reference-ground",
    }),
    Object.freeze({
      id: "surface-reference-roof",
      type: "roof" as const,
      storeyId: storeyIds[storeyCount - 1],
      spaceId: spaceIds[storeyCount - 1],
      adjacentSpaceId: null,
      boundaryCondition: inferredFact(
        "surface.surface-reference-roof.boundaryCondition",
        "outdoors" as const,
        geometrySources,
        now,
      ),
      geometry: inferredFact(
        "surface.surface-reference-roof.geometry",
        boundary,
        geometrySources,
        now,
        "m",
      ),
      areaSqm: inferredFact(
        "surface.surface-reference-roof.areaSqm",
        floorAreaSqm,
        geometrySources,
        now,
        "m2",
      ),
      azimuthDeg: inferredFact(
        "surface.surface-reference-roof.azimuthDeg",
        0,
        geometrySources,
        now,
        "deg",
      ),
      tiltDeg: inferredFact(
        "surface.surface-reference-roof.tiltDeg",
        0,
        geometrySources,
        now,
        "deg",
      ),
      constructionId: assumptionFact(
        "surface.surface-reference-roof.constructionId",
        "construction-reference-roof",
        now,
      ),
      openingIds: Object.freeze([]),
      threeObjectId: "three-surface-reference-roof",
    }),
  ];
  const surfaces = Object.freeze([...wallSurfaces, ...horizontalSurfaces]);
  const eastHostSurface = wallSurfaces.find(
    (surface) =>
      surface.storeyId === storeyIds[0] && surface.azimuthDeg.value === 90,
  );
  if (!eastHostSurface) {
    throw new Error("Representative W01 requires a level-one east-facing host wall.");
  }

  const openingWidth = requiredFact<number>(ingestion, "opening.W01.widthM");
  const openingHeight = requiredFact<number>(ingestion, "opening.W01.heightM");
  const sillHeight = requiredFact<number>(ingestion, "opening.W01.sillHeightM");
  const windowUValue = requiredFact<number>(ingestion, "construction.window.W01.uValue");
  const windowShgc = requiredFact<number>(ingestion, "construction.window.W01.shgc");
  const opening: Opening = Object.freeze({
    id: openingId,
    type: "window",
    hostSurfaceId: eastHostSurface.id,
    areaSqm: inferredFact(
      "opening.W01.areaSqm",
      openingWidth.value! * openingHeight.value!,
      [openingWidth, openingHeight],
      now,
      "m2",
    ),
    widthM: openingWidth,
    heightM: openingHeight,
    sillHeightM: sillHeight,
    constructionId: inferredFact(
      "opening.W01.constructionId",
      "construction-reference-window",
      [windowUValue, windowShgc],
      now,
    ),
    geometryRef: inferredFact(
      "opening.W01.geometryRef",
      "A201:W01",
      [openingWidth, openingHeight, sillHeight],
      now,
    ),
  });

  const roofUValue = assumptionFact(
    "construction.reference-roof.uValueWPerM2K",
    REFERENCE_TEMPLATE.envelope.roofUValueWPerM2K,
    now,
    "W/m2K",
  );
  const groundUValue = assumptionFact(
    "construction.reference-ground.uValueWPerM2K",
    REFERENCE_TEMPLATE.envelope.groundUValueWPerM2K,
    now,
    "W/m2K",
  );
  const constructions = Object.freeze([
    construction(
      "construction-reference-wall",
      "EW01 exterior wall",
      "opaque",
      wallUValue,
      assumptionFact("construction.reference-wall.shgc", 0, now),
      assumptionFact("construction.reference-wall.visibleTransmittance", 0, now),
      now,
    ),
    construction(
      "construction-reference-roof",
      "Reference roof screening assembly",
      "opaque",
      roofUValue,
      assumptionFact("construction.reference-roof.shgc", 0, now),
      assumptionFact("construction.reference-roof.visibleTransmittance", 0, now),
      now,
    ),
    construction(
      "construction-reference-ground",
      "Reference ground slab screening assembly",
      "opaque",
      groundUValue,
      assumptionFact("construction.reference-ground.shgc", 0, now),
      assumptionFact("construction.reference-ground.visibleTransmittance", 0, now),
      now,
    ),
    construction(
      "construction-reference-window",
      "W01 glazing",
      "window",
      windowUValue,
      windowShgc,
      assumptionFact(
        "construction.reference-window.visibleTransmittance",
        REFERENCE_TEMPLATE.envelope.windowVisibleTransmittance,
        now,
      ),
      now,
    ),
  ]);

  const lightingPowerDensity = requiredFact<number>(
    ingestion,
    "usage.office.lightingPowerDensity",
  );
  const usage = usageProfile(lightingPowerDensity, now);
  const systemType = requiredFact<string>(ingestion, "system.HP01.systemType");
  const capacityKw = requiredFact<number>(ingestion, "system.HP01.capacityKw");
  const coolingCop = requiredFact<number>(ingestion, "system.HP01.coolingCop");
  const servedStoreyCount = requiredFact<number>(
    ingestion,
    "system.HP01.servedStoreyCount",
  );
  if (Math.round(servedStoreyCount.value!) !== storeyCount) {
    throw new Error(
      "Representative HP01 service scope must match the extracted storey count.",
    );
  }
  const totalFloorAreaSqm = floorAreaSqm * storeyCount;
  const hvac = Object.freeze({
    id: "hvac-reference-main",
    name: assumptionFact("system.hvac-reference-main.name", "HP01 air-source heat pump", now),
    systemType,
    servedZoneIds: inferredFact(
      "system.hvac-reference-main.servedZoneIds",
      Object.freeze([...zoneIds]),
      [servedStoreyCount, storeyCountFact],
      now,
    ),
    heatingSource: inferredFact(
      "system.hvac-reference-main.heatingSource",
      "electric_heat_pump",
      [systemType],
      now,
    ),
    coolingSource: inferredFact(
      "system.hvac-reference-main.coolingSource",
      "electric_dx",
      [systemType],
      now,
    ),
    distributionSystem: assumptionFact(
      "system.hvac-reference-main.distributionSystem",
      "air",
      now,
    ),
    capacityKw,
    heatingEfficiency: assumptionFact(
      "system.hvac-reference-main.heatingEfficiency",
      REFERENCE_TEMPLATE.hvac.heatingEfficiencyCop,
      now,
      "COP",
    ),
    coolingCop,
    outdoorAirStrategy: assumptionFact(
      "system.hvac-reference-main.outdoorAirStrategy",
      "scheduled_outdoor_air",
      now,
    ),
    heatRecoveryEfficiency: assumptionFact(
      "system.hvac-reference-main.heatRecoveryEfficiency",
      REFERENCE_TEMPLATE.hvac.heatRecoveryEfficiency,
      now,
      "fraction",
    ),
    ventilationLps: assumptionFact(
      "system.hvac-reference-main.ventilationLps",
      totalFloorAreaSqm *
        REFERENCE_TEMPLATE.usage.occupancyDensityPeoplePerSqm *
        REFERENCE_TEMPLATE.usage.ventilationLpsPerPerson,
      now,
      "L/s",
    ),
    controlSchedule: assumptionFact(
      "system.hvac-reference-main.controlSchedule",
      hvacSchedule,
      now,
      "fraction",
    ),
    threeObjectIds: Object.freeze([]),
  });

  const missingInfiltration = createEnergyFact<number>({
    key: "envelope.infiltration.airChangesPerHour",
    value: null,
    unit: "ACH",
    status: "missing",
    confidence: null,
    sourceRefs: [],
    extractionMethod: "project_default",
    authority: "project_template",
    assumptionId: REFERENCE_OFFICE_INFILTRATION_ASSUMPTION_ID,
    reviewedByUser: false,
    createdAt: now,
  });
  const assumptions = Object.freeze([
    defaultAssumption(
      Object.freeze([
        buildingId,
        ...storeyIds,
        ...spaceIds,
        ...zoneIds,
        ...constructions.map((item) => item.id),
        hvac.id,
      ]),
    ),
    infiltrationAssumption(buildingId),
  ]);

  const shell: CanonicalEnergyModel = {
    id: stableId("model-reference-office", ingestion.drawingSet.id),
    schemaVersion: CANONICAL_ENERGY_MODEL_VERSION,
    modelVersion: REFERENCE_OFFICE_MODEL_VERSION,
    project: {
      id: stableId("project-reference-office", ingestion.drawingSet.id),
      name: "BIMFIT 대표 오피스 에너지 진단",
      locale: "ko",
    },
    building: {
      id: buildingId,
      name: inferredFact(
        "building.name",
        "BIMFIT representative office",
        [extractedBoundary.polygon],
        now,
      ),
      useType: assumptionFact("building.useType", "office", now),
    },
    site: {
      location: assumptionFact("site.location", REFERENCE_TEMPLATE.site.location, now),
      latitudeDeg: assumptionFact(
        "site.latitudeDeg",
        REFERENCE_TEMPLATE.site.latitudeDeg,
        now,
        "deg",
      ),
      longitudeDeg: assumptionFact(
        "site.longitudeDeg",
        REFERENCE_TEMPLATE.site.longitudeDeg,
        now,
        "deg",
      ),
      northOrientationDeg,
      weatherSource: assumptionFact(
        "site.weatherSource",
        REFERENCE_TEMPLATE.site.weatherSource,
        now,
      ),
      groundRelationship: assumptionFact(
        "site.groundRelationship",
        REFERENCE_TEMPLATE.site.groundRelationship,
        now,
      ),
    },
    drawingSet: Object.freeze({
      ...ingestion.drawingSet,
      name: "BIMFIT 대표 오피스 · Rev A",
      tier: 2,
    }),
    extractionRuns: Object.freeze([ingestion.extractionRun]),
    geometry: Object.freeze({
      coordinateSystem: inferredFact(
        "geometry.coordinateSystem",
        "local-meters-x-east-y-north",
        [extractedBoundary.polygon],
        now,
      ),
      storeys,
      floorPlates,
      spaces,
      thermalZones: zones,
      surfaces,
      openings: Object.freeze([opening]),
      shadingDevices: Object.freeze([]),
    }),
    envelope: Object.freeze({
      constructions,
      infiltrationAirChangesPerHour: missingInfiltration,
      airTightnessNotes: assumptionFact(
        "envelope.airTightnessNotes",
        "Natural/design ACH screening input; not an ACH50 test.",
        now,
      ),
      thermalBridgeNotes: assumptionFact(
        "envelope.thermalBridgeNotes",
        "No separate thermal-bridge surcharge in this screening model.",
        now,
      ),
    }),
    usageProfiles: Object.freeze([usage]),
    systems: Object.freeze({
      hvac: Object.freeze([hvac]),
      domesticHotWater: Object.freeze([]),
      renewables: Object.freeze([]),
    }),
    facts: Object.freeze([]),
    conflicts: Object.freeze(
      ingestion.conflicts.map((conflict) =>
        conflict.key === "opening.W01.widthM"
          ? Object.freeze({
              ...conflict,
              affectedObjectIds: Object.freeze([openingId]),
            })
          : conflict,
      ),
    ),
    missingValues: Object.freeze([
      Object.freeze({
        id: "missing.reference-office.infiltration",
        key: missingInfiltration.key,
        affectedObjectIds: Object.freeze([buildingId]),
        requiredFor: "envelope" as const,
        blocking: true,
        allowedAssumptionIds: Object.freeze([
          REFERENCE_OFFICE_INFILTRATION_ASSUMPTION_ID,
        ]),
        message:
          "No airtightness or infiltration value is present in the registered drawing set.",
        createdAt: now,
      }),
    ]),
    assumptions,
    mappings: Object.freeze([
      ...zones.map((zone) =>
        Object.freeze({
          canonicalObjectId: zone.id,
          sourceEntityRefs: uniqueSourceRefs(geometrySources),
          threeObjectIds: Object.freeze([`three-${zone.id}`]),
        }),
      ),
      Object.freeze({
        canonicalObjectId: opening.id,
        sourceEntityRefs: uniqueSourceRefs([openingWidth, openingHeight, sillHeight]),
        threeObjectIds: Object.freeze([]),
      }),
    ]),
    readiness: Object.freeze([]),
    scenarios: Object.freeze([]),
    simulationRuns: Object.freeze([]),
    createdAt: now,
    updatedAt: now,
  };
  const indexed = Object.freeze({
    ...shell,
    facts: collectEnergyFacts(shell),
  });
  const validation = validateCanonicalEnergyModel(indexed);
  return Object.freeze({
    ...indexed,
    readiness: Object.freeze([...validation.readiness]),
  });
}
