import { collectEnergyFacts, createEnergyFact, createMissingFact } from "./facts";
import {
  areSpacesAdjacent,
  calculateZoneVolume,
  orientedEdges,
  polygonArea,
} from "./geometry";
import { stableId } from "./ids";
import type { DrawingSourceInput, ExtractionSignal } from "./ingestion";
import type {
  AssumptionRecord,
  CanonicalEnergyModel,
  ConstructionAssembly,
  EnergyDiagnosticFixture,
  EnergyFact,
  FloorPlate,
  HvacSystem,
  Opening,
  Point2D,
  Polygon2D,
  SourceDocument,
  SourceReference,
  Space,
  Storey,
  Surface,
  ThermalZone,
  UsageProfile,
} from "./types";
import { CANONICAL_ENERGY_MODEL_VERSION } from "./types";
import { suggestThermalZones, type OrientationBand } from "./zoning";

const FIXTURE_DATE = "2026-01-15T00:00:00.000Z";
const HEIGHT_M = 3;

type FixtureSpaceSpec = Readonly<{
  id: string;
  storey: number;
  name: string;
  boundary: Polygon2D;
  conditioned: boolean;
  useType: string;
  orientation: OrientationBand;
  isCore?: boolean;
  isAtrium?: boolean;
  floorAreaSqm?: number;
  volumeM3?: number;
}>;

type FixtureConfig = Readonly<{
  id: EnergyDiagnosticFixture["id"];
  name: string;
  purpose: readonly string[];
  floorBoundaries: readonly Polygon2D[];
  floorVoids?: Readonly<Record<number, readonly Polygon2D[]>>;
  spaces: readonly FixtureSpaceSpec[];
  expected: EnergyDiagnosticFixture["expected"];
}>;

const RECT_10_X_8 = rect(0, 0, 10, 8);
const RECT_30_X_20 = rect(0, 0, 30, 20);
const L_SHAPE: Polygon2D = Object.freeze([
  [0, 0],
  [20, 0],
  [20, 10],
  [10, 10],
  [10, 20],
  [0, 20],
]);
const RECT_20_X_20 = rect(0, 0, 20, 20);

const FIXTURE_CONFIGS: readonly FixtureConfig[] = [
  {
    id: "fixture-a",
    name: "Single-zone rectangular building",
    purpose: [
      "Unit validation",
      "Surface orientation and exterior area",
      "Opening placement and basic engine mapping",
    ],
    floorBoundaries: [RECT_10_X_8],
    spaces: [
      space("a-office", 0, "Open office", RECT_10_X_8, true, "office", "mixed"),
    ],
    expected: expectation(80, 80, 240, 1, 1, 5, [
      { openingId: "opening-fixture-a-1", hostSurfaceId: "surface-fixture-a-0-wall-0" },
    ], [
      "Identical inputs produce identical results.",
      "Lower wall U-value reduces heating demand in the controlled heating case.",
    ]),
  },
  {
    id: "fixture-b",
    name: "Multi-zone office floor",
    purpose: [
      "Perimeter/core zoning",
      "Interior adjacency",
      "Mixed schedules and HVAC service mapping",
    ],
    floorBoundaries: [RECT_30_X_20],
    spaces: [
      space("b-south", 0, "South office", rect(0, 0, 30, 6), true, "office", "south"),
      space("b-north", 0, "North office", rect(0, 14, 30, 20), true, "office", "north"),
      space("b-west", 0, "West office", rect(0, 6, 10, 14), true, "office", "west"),
      space("b-core", 0, "Core support", rect(10, 6, 20, 14), true, "office_support", "core", true),
      space("b-east", 0, "East office", rect(20, 6, 30, 14), true, "office", "east"),
    ],
    expected: expectation(600, 600, 1_800, 1, 5, 5, [], [
      "Higher lighting power density increases lighting electricity.",
      "Longer office operating hours increase applicable internal loads.",
    ]),
  },
  {
    id: "fixture-c",
    name: "Irregular L-shaped building",
    purpose: [
      "Concave boundary geometry",
      "Orientation and exterior surface classification",
    ],
    floorBoundaries: [L_SHAPE],
    spaces: [
      space("c-main", 0, "L-shaped studio", L_SHAPE, true, "office", "mixed"),
    ],
    expected: expectation(300, 300, 900, 1, 1, 7, [], [
      "Rotating asymmetric glazing changes orientation-sensitive solar results.",
    ]),
  },
  {
    id: "fixture-d",
    name: "Three-storey office with core and atrium",
    purpose: [
      "Repeated floors and vertical adjacency",
      "Void handling and zone-volume calculation",
      "Representative multi-storey design-stage office",
    ],
    floorBoundaries: [RECT_20_X_20, RECT_20_X_20, RECT_20_X_20],
    floorVoids: {
      1: [rect(10, 8, 12, 12)],
      2: [rect(10, 8, 12, 12)],
    },
    spaces: multiStoreySpaces(),
    expected: expectation(1_184, 1_160, 3_600, 3, 16, 13, [], [
      "Duplicating an identical conditioned floor approximately scales area and loads.",
      "Atrium volume remains distinct from occupied floor area.",
    ]),
  },
  {
    id: "fixture-e",
    name: "Conditioned and unconditioned spaces",
    purpose: [
      "Thermal-boundary classification",
      "Prevention of false zero-load interpretation",
    ],
    floorBoundaries: [rect(0, 0, 20, 10)],
    spaces: [
      space("e-office", 0, "Conditioned office", rect(0, 0, 15, 10), true, "office", "mixed"),
      space("e-parking", 0, "Unconditioned parking", rect(15, 0, 20, 10), false, "parking", "mixed"),
    ],
    expected: expectation(200, 150, 600, 1, 2, 5, [], [
      "Unconditioned space is reported separately from a zero-load conditioned zone.",
    ]),
  },
] as const;

export const ENERGY_DIAGNOSTIC_FIXTURES: readonly EnergyDiagnosticFixture[] =
  Object.freeze(FIXTURE_CONFIGS.map(buildFixture));

export function getEnergyDiagnosticFixture(
  fixtureId: EnergyDiagnosticFixture["id"],
): EnergyDiagnosticFixture {
  const fixture = ENERGY_DIAGNOSTIC_FIXTURES.find((candidate) => candidate.id === fixtureId);
  if (!fixture) throw new Error(`Unknown energy diagnostic fixture ${fixtureId}.`);
  return fixture;
}

/**
 * Non-proprietary reference inputs for upload -> classify -> extract -> review.
 * Schedule values are explicit adapter signals with source regions; numerical
 * geometry is extracted only from the real DXF payload.
 */
export function representativeOfficeDrawingSetInputs(): readonly DrawingSourceInput[] {
  const planDxf = rectangularDxf(20, 20, "BIM_OUTLINE");
  return Object.freeze([
    {
      fileName: "A101-office-floor-plan-rev-A.dxf",
      mimeType: "application/dxf",
      content: planDxf,
      revision: "A",
      northOrientationDeg: 0,
      textSample: "OFFICE FLOOR PLAN LEVELS 01-03 REPEATED BIM_OUTLINE",
      extractionSignals: [
        signal("geometry.repeatedStoreyCount", 3, "count", "drawing_annotation", "LEVELS 01-03 TYPICAL", 0.96),
      ],
    },
    {
      fileName: "A201-east-elevation-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("EAST ELEVATION W01 1500 x 1500"),
      revision: "A",
      extractionSignals: [
        signal("opening.W01.widthM", 1.5, "m", "drawing_annotation", "W01 width 1500", 0.88),
        signal("opening.W01.heightM", 1.5, "m", "drawing_annotation", "W01 height 1500", 0.88),
      ],
    },
    {
      fileName: "A301-building-section-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("BUILDING SECTION FLOOR TO FLOOR 3000"),
      revision: "A",
      extractionSignals: [
        signal("geometry.floorToFloorHeightM", 3, "m", "drawing_annotation", "FLOOR TO FLOOR 3000", 0.96),
      ],
    },
    {
      fileName: "A601-window-schedule-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("WINDOW SCHEDULE W01 1800 x 1500 U=1.6 SHGC=0.35"),
      revision: "A",
      extractionSignals: [
        signal("opening.W01.widthM", 1.8, "m", "explicit_schedule_or_specification", "W01 WIDTH 1800", 0.99, "schedule_table"),
        signal("construction.window.W01.uValue", 1.6, "W/m2K", "explicit_schedule_or_specification", "W01 U-VALUE 1.60", 0.99, "schedule_table"),
        signal("construction.window.W01.shgc", 0.35, undefined, "explicit_schedule_or_specification", "W01 SHGC 0.35", 0.99, "schedule_table"),
      ],
    },
    {
      fileName: "A602-exterior-wall-detail-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("EXTERIOR WALL DETAIL EW01 U=0.32"),
      revision: "A",
      extractionSignals: [
        signal("construction.wall.EW01.uValue", 0.32, "W/m2K", "explicit_schedule_or_specification", "EW01 U-VALUE 0.32", 0.98, "schedule_table"),
      ],
    },
    {
      fileName: "M601-hvac-equipment-schedule-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("HVAC EQUIPMENT SCHEDULE HP01 CAPACITY 120kW COP 3.6"),
      revision: "A",
      extractionSignals: [
        signal("system.HP01.systemType", "air_source_heat_pump", undefined, "explicit_schedule_or_specification", "HP01 AIR SOURCE HEAT PUMP", 0.99, "schedule_table"),
        signal("system.HP01.capacityKw", 120, "kW", "explicit_schedule_or_specification", "HP01 CAPACITY 120 kW", 0.99, "schedule_table"),
        signal("system.HP01.coolingCop", 3.6, undefined, "explicit_schedule_or_specification", "HP01 COOLING COP 3.6", 0.99, "schedule_table"),
      ],
    },
    {
      fileName: "E201-lighting-plan-rev-A.svg",
      mimeType: "image/svg+xml",
      content: safeSvg("LIGHTING PLAN OFFICE LPD 8 W/M2"),
      revision: "A",
      extractionSignals: [
        signal("usage.office.lightingPowerDensity", 8, "W/m2", "drawing_annotation", "OFFICE LPD 8 W/M2", 0.92),
      ],
    },
  ]);
}

function buildFixture(config: FixtureConfig): EnergyDiagnosticFixture {
  const documentId = `document-${config.id}`;
  const extractionRunId = `extraction-${config.id}`;
  const document = fixtureDocument(config, documentId, extractionRunId);
  const source = fixtureSource(documentId, extractionRunId, config.id);
  const floorPlates: FloorPlate[] = config.floorBoundaries.map((boundary, storeyIndex) => {
    const voids = config.floorVoids?.[storeyIndex] ?? [];
    const netArea = polygonArea(boundary) - voids.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
    return Object.freeze({
      id: `plate-${config.id}-${storeyIndex}`,
      storeyId: `storey-${config.id}-${storeyIndex}`,
      boundary: verifiedFact(`geometry.plate.${config.id}.${storeyIndex}.boundary`, boundary, "m", source, "vector_geometry", "dimensioned_vector_geometry"),
      areaSqm: verifiedFact(`geometry.plate.${config.id}.${storeyIndex}.areaSqm`, netArea, "m2", source, "vector_geometry", "dimensioned_vector_geometry"),
      voidBoundaries: Object.freeze(
        voids.map((voidBoundary, index) =>
          verifiedFact(`geometry.plate.${config.id}.${storeyIndex}.void.${index}`, voidBoundary, "m", source, "vector_geometry", "dimensioned_vector_geometry"),
        ),
      ),
      sourceEntityIds: Object.freeze([`fixture:${config.id}:plate:${storeyIndex}`]),
    });
  });
  const storeys: Storey[] = config.floorBoundaries.map((_, index) => {
    const storeySpaces = config.spaces.filter((item) => item.storey === index);
    return Object.freeze({
      id: `storey-${config.id}-${index}`,
      name: `Level ${index + 1}`,
      elevationM: verifiedFact(`geometry.storey.${config.id}.${index}.elevationM`, index * HEIGHT_M, "m", source),
      floorToFloorHeightM: verifiedFact(`geometry.storey.${config.id}.${index}.heightM`, HEIGHT_M, "m", source),
      floorPlateIds: Object.freeze([`plate-${config.id}-${index}`]),
      spaceIds: Object.freeze(storeySpaces.map((item) => item.id)),
    });
  });
  let spaces = buildSpaces(config, source);
  const orientations = Object.fromEntries(config.spaces.map((item) => [item.id, item.orientation]));
  let zones = suggestThermalZones(spaces, {
    createdAt: FIXTURE_DATE,
    orientationBySpaceId: orientations,
    scheduleKeyBySpaceId: Object.fromEntries(config.spaces.map((item) => [item.id, item.useType])),
    hvacServiceKeyBySpaceId: Object.fromEntries(config.spaces.map((item) => [item.id, item.conditioned ? "hvac-main" : "none"])),
  });
  const zoneBySpaceId = new Map(zones.flatMap((zone) => zone.sourceSpaceIds.map((id) => [id, zone.id])));
  spaces = spaces.map((item) => Object.freeze({ ...item, thermalZoneId: zoneBySpaceId.get(item.id) ?? null }));
  zones = zones.map((zone) => Object.freeze({
    ...zone,
    usageProfileId: "usage-office",
    hvacSystemIds: zone.conditioned.value ? Object.freeze(["hvac-main"]) : Object.freeze([]),
  }));

  const surfaces = buildSurfaces(config, source, spaces);
  const openings = buildOpenings(config, source);
  const constructions = buildConstructions(source);
  const usage = buildUsageProfile(source);
  const hvac = buildHvac(source, zones);
  const assumptions: readonly AssumptionRecord[] = Object.freeze([]);

  const shell: CanonicalEnergyModel = {
    id: `model-${config.id}`,
    schemaVersion: CANONICAL_ENERGY_MODEL_VERSION,
    modelVersion: "fixture-v1",
    project: { id: `project-${config.id}`, name: config.name, locale: "ko" },
    building: {
      id: `building-${config.id}`,
      name: verifiedFact("building.name", config.name, undefined, source),
      useType: verifiedFact("building.useType", "office", undefined, source),
    },
    site: {
      location: verifiedFact("site.location", "Seoul, KR", undefined, source),
      latitudeDeg: verifiedFact("site.latitudeDeg", 37.5665, "deg", source),
      longitudeDeg: verifiedFact("site.longitudeDeg", 126.978, "deg", source),
      northOrientationDeg: verifiedFact("site.northOrientationDeg", 0, "deg", source),
      weatherSource: verifiedFact("site.weatherSource", "KR-Seoul-TMY", undefined, source),
      groundRelationship: verifiedFact("site.groundRelationship", "slab_on_grade", undefined, source),
    },
    drawingSet: {
      id: `drawing-set-${config.id}`,
      name: `${config.name} source set`,
      tier: 2,
      documents: [document],
      revisionGroupIds: [document.revisionGroupId],
      createdAt: FIXTURE_DATE,
      updatedAt: FIXTURE_DATE,
    },
    extractionRuns: [{
      id: extractionRunId,
      pipelineVersion: "fixture-v1",
      sourceDocumentIds: [documentId],
      sourceContentHashes: [document.contentHash],
      status: "completed",
      startedAt: FIXTURE_DATE,
      completedAt: FIXTURE_DATE,
      warnings: [],
      unsupportedStages: [],
    }],
    geometry: {
      coordinateSystem: verifiedFact("geometry.coordinateSystem", "local-meters-x-east-y-north", undefined, source),
      storeys,
      floorPlates,
      spaces,
      thermalZones: zones,
      surfaces,
      openings,
      shadingDevices: [],
    },
    envelope: {
      constructions,
      infiltrationAirChangesPerHour: verifiedFact("envelope.infiltration.airChangesPerHour", 0.5, "ACH", source),
      airTightnessNotes: verifiedFact("envelope.airTightnessNotes", "Natural/design ACH input; not ACH50.", undefined, source),
      thermalBridgeNotes: verifiedFact("envelope.thermalBridgeNotes", "No explicit thermal-bridge adjustment in controlled fixture.", undefined, source),
    },
    usageProfiles: [usage],
    systems: { hvac: [hvac], domesticHotWater: [], renewables: [] },
    facts: [],
    conflicts: [],
    missingValues: [],
    assumptions,
    mappings: zones.map((zone) => ({
      canonicalObjectId: zone.id,
      sourceEntityRefs: source ? [source] : [],
      threeObjectIds: [`three-${zone.id}`],
    })),
    readiness: ["geometry", "envelope", "usage", "systems", "simulation"].map((category) => ({
      category: category as "geometry" | "envelope" | "usage" | "systems" | "simulation",
      status: "ready" as const,
      verifiedCount: 1,
      assumedCount: 0,
      conflictCount: 0,
      missingCount: 0,
      blockingRecordIds: [],
    })),
    scenarios: [],
    simulationRuns: [],
    createdAt: FIXTURE_DATE,
    updatedAt: FIXTURE_DATE,
  };
  const model = Object.freeze({ ...shell, facts: collectEnergyFacts(shell) });
  return Object.freeze({
    id: config.id,
    name: config.name,
    purpose: config.purpose,
    model,
    expected: config.expected,
  });
}

function buildSpaces(config: FixtureConfig, source: SourceReference): readonly Space[] {
  const preliminary = config.spaces.map((item) => {
    const floorArea = item.floorAreaSqm ?? polygonArea(item.boundary);
    const volume = item.volumeM3 ?? calculateZoneVolume(floorArea, HEIGHT_M);
    return Object.freeze({
      id: item.id,
      name: verifiedFact(`space.${item.id}.name`, item.name, undefined, source),
      storeyId: `storey-${config.id}-${item.storey}`,
      boundary: verifiedFact(`space.${item.id}.boundary`, item.boundary, "m", source, "vector_geometry", "dimensioned_vector_geometry"),
      floorAreaSqm: verifiedFact(`space.${item.id}.floorAreaSqm`, floorArea, "m2", source, "vector_geometry", "dimensioned_vector_geometry"),
      volumeM3: verifiedFact(`space.${item.id}.volumeM3`, volume, "m3", source, "rule_inference", "deterministic_rule_inference"),
      conditioned: verifiedFact(`space.${item.id}.conditioned`, item.conditioned, undefined, source),
      spaceType: verifiedFact(`space.${item.id}.spaceType`, item.useType, undefined, source),
      thermalZoneId: null,
      adjacentSpaceIds: Object.freeze([]) as readonly string[],
      isCore: item.isCore ?? false,
      isAtrium: item.isAtrium ?? false,
    });
  });
  return preliminary.map((item) => Object.freeze({
    ...item,
    adjacentSpaceIds: Object.freeze(
      preliminary
        .filter(
          (other) =>
            other.id !== item.id &&
            other.storeyId === item.storeyId &&
            areSpacesAdjacent(item.boundary.value ?? [], other.boundary.value ?? []),
        )
        .map((other) => other.id)
        .sort(),
    ),
  }));
}

function buildSurfaces(
  config: FixtureConfig,
  source: SourceReference,
  spaces: readonly Space[],
): readonly Surface[] {
  const surfaces: Surface[] = [];
  config.floorBoundaries.forEach((boundary, storeyIndex) => {
    const hostSpace = spaces.find((space) => space.storeyId === `storey-${config.id}-${storeyIndex}`);
    if (!hostSpace) return;
    for (const edge of orientedEdges(boundary)) {
      const id = `surface-${config.id}-${storeyIndex}-wall-${edge.index}`;
      surfaces.push(Object.freeze({
        id,
        type: "exterior_wall",
        storeyId: hostSpace.storeyId,
        spaceId: hostSpace.id,
        adjacentSpaceId: null,
        boundaryCondition: verifiedFact(`surface.${id}.boundaryCondition`, "outdoors" as const, undefined, source),
        geometry: verifiedFact(`surface.${id}.geometry`, [edge.start, edge.end], "m", source, "vector_geometry", "dimensioned_vector_geometry"),
        areaSqm: verifiedFact(`surface.${id}.areaSqm`, edge.lengthM * HEIGHT_M, "m2", source, "rule_inference", "deterministic_rule_inference"),
        azimuthDeg: verifiedFact(`surface.${id}.azimuthDeg`, edge.outwardAzimuthDeg, "deg", source, "rule_inference", "deterministic_rule_inference"),
        tiltDeg: verifiedFact(`surface.${id}.tiltDeg`, 90, "deg", source),
        constructionId: verifiedFact(`surface.${id}.constructionId`, "construction-wall", undefined, source),
        openingIds: config.id === "fixture-a" && storeyIndex === 0 && edge.index === 0 ? ["opening-fixture-a-1"] : [],
        threeObjectId: `three-${id}`,
      }));
    }
  });
  const firstSpace = spaces[0];
  if (firstSpace) {
    const groundId = `surface-${config.id}-ground`;
    const roofId = `surface-${config.id}-roof`;
    surfaces.push(planarSurface(groundId, "ground_floor", "ground", 180, config.expected.totalFloorAreaSqm, firstSpace, "construction-ground", source));
    surfaces.push(planarSurface(roofId, "roof", "outdoors", 0, polygonArea(config.floorBoundaries.at(-1) ?? []), spaces.find((space) => space.storeyId.endsWith(`-${config.floorBoundaries.length - 1}`)) ?? firstSpace, "construction-roof", source));
  }
  return Object.freeze(surfaces);
}

function planarSurface(
  id: string,
  type: "ground_floor" | "roof",
  boundary: "ground" | "outdoors",
  tiltDeg: number,
  areaSqm: number,
  space: Space,
  constructionId: string,
  source: SourceReference,
): Surface {
  return Object.freeze({
    id,
    type,
    storeyId: space.storeyId,
    spaceId: space.id,
    adjacentSpaceId: null,
    boundaryCondition: verifiedFact(`surface.${id}.boundaryCondition`, boundary, undefined, source),
    geometry: verifiedFact(`surface.${id}.geometry`, space.boundary.value ?? [], "m", source, "vector_geometry", "dimensioned_vector_geometry"),
    areaSqm: verifiedFact(`surface.${id}.areaSqm`, areaSqm, "m2", source),
    azimuthDeg: verifiedFact(`surface.${id}.azimuthDeg`, 0, "deg", source),
    tiltDeg: verifiedFact(`surface.${id}.tiltDeg`, tiltDeg, "deg", source),
    constructionId: verifiedFact(`surface.${id}.constructionId`, constructionId, undefined, source),
    openingIds: [],
    threeObjectId: `three-${id}`,
  });
}

function buildOpenings(config: FixtureConfig, source: SourceReference): readonly Opening[] {
  if (config.id !== "fixture-a") return Object.freeze([]);
  const id = "opening-fixture-a-1";
  return Object.freeze([Object.freeze({
    id,
    type: "window" as const,
    hostSurfaceId: "surface-fixture-a-0-wall-0",
    areaSqm: verifiedFact(`opening.${id}.areaSqm`, 3, "m2", source),
    widthM: verifiedFact(`opening.${id}.widthM`, 2, "m", source),
    heightM: verifiedFact(`opening.${id}.heightM`, 1.5, "m", source),
    sillHeightM: verifiedFact(`opening.${id}.sillHeightM`, 0.9, "m", source),
    constructionId: verifiedFact(`opening.${id}.constructionId`, "construction-window", undefined, source),
    geometryRef: verifiedFact(`opening.${id}.geometryRef`, "fixture-window-region", undefined, source),
    threeObjectId: `three-${id}`,
  })]);
}

function buildConstructions(source: SourceReference): readonly ConstructionAssembly[] {
  return Object.freeze([
    construction("construction-wall", "Exterior wall", "opaque", 0.35, null, source),
    construction("construction-roof", "Roof", "opaque", 0.2, null, source),
    construction("construction-ground", "Ground slab", "opaque", 0.4, null, source),
    construction("construction-window", "Double low-e window", "window", 1.6, 0.35, source),
  ]);
}

function construction(
  id: string,
  name: string,
  kind: ConstructionAssembly["kind"],
  uValue: number,
  shgc: number | null,
  source: SourceReference,
): ConstructionAssembly {
  return Object.freeze({
    id,
    name: verifiedFact(`construction.${id}.name`, name, undefined, source),
    kind,
    layers: kind === "opaque" ? [Object.freeze({
      id: `${id}-insulation`,
      name: verifiedFact(`construction.${id}.layer.name`, "Controlled insulation layer", undefined, source),
      thicknessM: verifiedFact(`construction.${id}.layer.thicknessM`, 0.1, "m", source),
      conductivityWPerMK: verifiedFact(`construction.${id}.layer.conductivity`, 0.035, "W/mK", source),
      densityKgPerM3: verifiedFact(`construction.${id}.layer.density`, 30, "kg/m3", source),
      specificHeatJPerKgK: verifiedFact(`construction.${id}.layer.specificHeat`, 1_400, "J/kgK", source),
    })] : [],
    uValueWPerM2K: verifiedFact(`construction.${id}.uValue`, uValue, "W/m2K", source),
    rValueM2KPerW: verifiedFact(`construction.${id}.rValue`, 1 / uValue, "m2K/W", source),
    shgc: shgc === null
      ? createMissingFact<number>({ key: `construction.${id}.shgc`, createdAt: FIXTURE_DATE })
      : verifiedFact(`construction.${id}.shgc`, shgc, undefined, source),
    visibleTransmittance: kind === "window"
      ? verifiedFact(`construction.${id}.visibleTransmittance`, 0.6, undefined, source)
      : createMissingFact<number>({ key: `construction.${id}.visibleTransmittance`, createdAt: FIXTURE_DATE }),
  });
}

function buildUsageProfile(source: SourceReference): UsageProfile {
  const occupiedSchedule = Object.freeze(Array.from({ length: 24 }, (_, hour) => ({
    hour,
    value: hour >= 8 && hour < 18 ? 1 : 0.05,
  })));
  return Object.freeze({
    id: "usage-office",
    name: verifiedFact("usage.office.name", "Office weekday", undefined, source),
    spaceType: verifiedFact("usage.office.spaceType", "office", undefined, source),
    occupancyDensityPeoplePerSqm: verifiedFact("usage.office.occupancyDensity", 0.1, "people/m2", source),
    occupancySchedule: verifiedFact("usage.office.occupancySchedule", occupiedSchedule, "fraction", source),
    lightingPowerDensityWPerSqm: verifiedFact("usage.office.lightingPowerDensity", 8, "W/m2", source),
    lightingSchedule: verifiedFact("usage.office.lightingSchedule", occupiedSchedule, "fraction", source),
    equipmentPowerDensityWPerSqm: verifiedFact("usage.office.equipmentPowerDensity", 10, "W/m2", source),
    equipmentSchedule: verifiedFact("usage.office.equipmentSchedule", occupiedSchedule, "fraction", source),
    ventilationLpsPerPerson: verifiedFact("usage.office.ventilation", 10, "L/s-person", source),
    heatingSetpointC: verifiedFact("usage.office.heatingSetpoint", 20, "degC", source),
    coolingSetpointC: verifiedFact("usage.office.coolingSetpoint", 26, "degC", source),
    operatingHours: verifiedFact("usage.office.operatingHours", "Mon-Fri 08:00-18:00", undefined, source),
    holidaySchedule: verifiedFact("usage.office.holidaySchedule", Object.freeze([]) as readonly string[], undefined, source),
  });
}

function buildHvac(source: SourceReference, zones: readonly ThermalZone[]): HvacSystem {
  const servedZoneIds = Object.freeze(
    zones.filter((zone) => zone.conditioned.value).map((zone) => zone.id),
  );
  const schedule = Object.freeze(Array.from({ length: 24 }, (_, hour) => ({
    hour,
    value: hour >= 7 && hour < 19 ? 1 : 0,
  })));
  return Object.freeze({
    id: "hvac-main",
    name: verifiedFact("system.hvac-main.name", "Air-source heat pump", undefined, source),
    systemType: verifiedFact("system.hvac-main.systemType", "packaged_heat_pump", undefined, source),
    servedZoneIds: verifiedFact("system.hvac-main.servedZoneIds", servedZoneIds, undefined, source),
    heatingSource: verifiedFact("system.hvac-main.heatingSource", "electric_heat_pump", undefined, source),
    coolingSource: verifiedFact("system.hvac-main.coolingSource", "electric_dx", undefined, source),
    distributionSystem: verifiedFact("system.hvac-main.distributionSystem", "air", undefined, source),
    capacityKw: verifiedFact("system.hvac-main.capacityKw", 150, "kW", source),
    heatingEfficiency: verifiedFact("system.hvac-main.heatingEfficiency", 3.2, "COP", source),
    coolingCop: verifiedFact("system.hvac-main.coolingCop", 3.5, "COP", source),
    outdoorAirStrategy: verifiedFact("system.hvac-main.outdoorAirStrategy", "scheduled_outdoor_air", undefined, source),
    heatRecoveryEfficiency: verifiedFact("system.hvac-main.heatRecoveryEfficiency", 0.7, "fraction", source),
    ventilationLps: verifiedFact("system.hvac-main.ventilationLps", 1_000, "L/s", source),
    controlSchedule: verifiedFact("system.hvac-main.controlSchedule", schedule, "fraction", source),
    threeObjectIds: ["three-hvac-main"],
  });
}

function fixtureDocument(
  config: FixtureConfig,
  documentId: string,
  extractionRunId: string,
): SourceDocument {
  const source = fixtureSource(documentId, extractionRunId, config.id);
  return Object.freeze({
    id: documentId,
    fileName: `${config.id}-controlled-vector.dxf`,
    format: "dxf",
    mimeType: "application/dxf",
    byteLength: 1_024,
    contentHash: config.id.slice(-1).repeat(64),
    revision: "A",
    revisionGroupId: `revision-group-${config.id}`,
    classification: {
      documentType: "floor_plan",
      discipline: "architectural",
      confidence: 1,
      method: "user_assignment",
      matchedSignals: ["fixture_truth"],
      alternatives: [],
    } as const,
    pages: [{ id: `page-${config.id}-1`, pageNumber: 1, label: "A101" }],
    cadLayers: [{ name: "BIM_OUTLINE", entityCount: 1, visible: true }],
    units: verifiedFact(`drawing.${documentId}.units`, "m", undefined, source),
    drawingScale: verifiedFact(`drawing.${documentId}.drawingScale`, 1, "m/drawing-unit", source),
    northOrientationDeg: verifiedFact(`drawing.${documentId}.northOrientationDeg`, 0, "deg", source),
    validationStatus: "accepted",
    createdAt: FIXTURE_DATE,
  });
}

function verifiedFact<T>(
  key: string,
  value: T,
  unit: string | undefined,
  source: SourceReference,
  extractionMethod: "vector_geometry" | "schedule_table" | "rule_inference" = "schedule_table",
  authority: "dimensioned_vector_geometry" | "explicit_schedule_or_specification" | "deterministic_rule_inference" = "explicit_schedule_or_specification",
): EnergyFact<T> {
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "verified",
    confidence: 1,
    sourceRefs: [source],
    extractionMethod,
    authority,
    reviewedByUser: true,
    createdAt: FIXTURE_DATE,
  });
}

function fixtureSource(
  documentId: string,
  extractionRunId: string,
  fixtureId: string,
): SourceReference {
  return Object.freeze({
    id: stableId("source", documentId, fixtureId),
    documentId,
    pageNumber: 1,
    sheetId: "A101",
    cadLayer: "BIM_OUTLINE",
    geometryRef: `fixture:${fixtureId}`,
    entityRef: `fixture-truth:${fixtureId}`,
    originalText: `Controlled non-proprietary fixture ${fixtureId}`,
    drawingRevision: "A",
    extractionRunId,
    previewCoordinates: [],
  });
}

function signal(
  key: string,
  value: unknown,
  unit: string | undefined,
  authority: ExtractionSignal["authority"],
  originalText: string,
  confidence: number,
  extractionMethod: ExtractionSignal["extractionMethod"] = "drawing_text",
): ExtractionSignal {
  return {
    key,
    value,
    ...(unit ? { unit } : {}),
    confidence,
    extractionMethod,
    authority,
    pageNumber: 1,
    sheetId: "SCHEDULE-1",
    boundingBox: { x: 10, y: 10, width: 120, height: 24 },
    originalText,
  };
}

function safeSvg(text: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><text x="10" y="30">${text}</text></svg>`;
}

function rectangularDxf(widthM: number, heightM: number, layer: string): string {
  const pairs: readonly (readonly [number, string | number])[] = [
    [0, "SECTION"], [2, "HEADER"], [9, "$INSUNITS"], [70, 6], [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"], [0, "LWPOLYLINE"], [8, layer], [90, 4], [70, 1],
    [10, 0], [20, 0], [10, widthM], [20, 0], [10, widthM], [20, heightM], [10, 0], [20, heightM],
    [0, "ENDSEC"], [0, "EOF"],
  ];
  return `${pairs.map(([code, value]) => `${code}\n${value}`).join("\n")}\n`;
}

function rect(minX: number, minY: number, maxX: number, maxY: number): Polygon2D {
  return Object.freeze([
    Object.freeze([minX, minY]) as Point2D,
    Object.freeze([maxX, minY]) as Point2D,
    Object.freeze([maxX, maxY]) as Point2D,
    Object.freeze([minX, maxY]) as Point2D,
  ]);
}

function space(
  id: string,
  storey: number,
  name: string,
  boundary: Polygon2D,
  conditioned: boolean,
  useType: string,
  orientation: OrientationBand,
  isCore = false,
  isAtrium = false,
  floorAreaSqm?: number,
  volumeM3?: number,
): FixtureSpaceSpec {
  return {
    id,
    storey,
    name,
    boundary,
    conditioned,
    useType,
    orientation,
    isCore,
    isAtrium,
    ...(floorAreaSqm === undefined ? {} : { floorAreaSqm }),
    ...(volumeM3 === undefined ? {} : { volumeM3 }),
  };
}

function multiStoreySpaces(): readonly FixtureSpaceSpec[] {
  const result: FixtureSpaceSpec[] = [];
  for (let floor = 0; floor < 3; floor += 1) {
    result.push(
      space(`d-${floor}-south`, floor, `L${floor + 1} south office`, rect(0, 0, 20, 8), true, "office", "south"),
      space(`d-${floor}-north`, floor, `L${floor + 1} north office`, rect(0, 12, 20, 20), true, "office", "north"),
      space(`d-${floor}-west`, floor, `L${floor + 1} west office`, rect(0, 8, 8, 12), true, "office", "west"),
      space(`d-${floor}-core`, floor, `L${floor + 1} core`, rect(8, 8, 10, 12), false, "core", "core", true),
      space(`d-${floor}-east`, floor, `L${floor + 1} east office`, rect(12, 8, 20, 12), true, "office", "east"),
    );
    // One vertically spanning atrium space owns the floor area once and the
    // full three-storey volume. Upper plates carry matching void boundaries,
    // so no zero-area pseudo-zones enter the engine adapter.
    if (floor === 0) {
      result.push(
        space(
          "d-atrium",
          0,
          "Three-storey atrium",
          rect(10, 8, 12, 12),
          true,
          "atrium",
          "core",
          false,
          true,
          8,
          72,
        ),
      );
    }
  }
  return result;
}

function expectation(
  totalFloorAreaSqm: number,
  totalConditionedAreaSqm: number,
  totalZoneVolumeM3: number,
  storeyCount: number,
  thermalZoneCount: number,
  exteriorSurfaceCount: number,
  openingHostPairs: EnergyDiagnosticFixture["expected"]["openingHostPairs"],
  simulationExpectations: readonly string[],
): EnergyDiagnosticFixture["expected"] {
  return {
    totalFloorAreaSqm,
    totalConditionedAreaSqm,
    totalZoneVolumeM3,
    storeyCount,
    thermalZoneCount,
    exteriorSurfaceCount,
    openingHostPairs,
    simulationExpectations,
  };
}
