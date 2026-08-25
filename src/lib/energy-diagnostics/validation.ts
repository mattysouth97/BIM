import type {
  CanonicalEnergyModel,
  EnergyFact,
  ReadinessCategory,
} from "./types";

export type ValidationCategory = ReadinessCategory["category"];

export type ValidationIssue = Readonly<{
  id: string;
  code: string;
  severity: "error" | "warning" | "info";
  category: ValidationCategory;
  message: string;
  affectedObjectIds: readonly string[];
  factIds: readonly string[];
  correctiveAction: string;
}>;

export type CanonicalModelValidation = Readonly<{
  validForSimulation: boolean;
  issues: readonly ValidationIssue[];
  blockingIssueIds: readonly string[];
  readiness: readonly ReadinessCategory[];
}>;

const CATEGORY_ORDER: readonly ValidationCategory[] = [
  "geometry",
  "envelope",
  "usage",
  "systems",
  "simulation",
];

const AREA_UNITS = new Set(["m2", "m²", "sqm"]);
const LENGTH_UNITS = new Set(["m", "meter", "metre"]);
const VOLUME_UNITS = new Set(["m3", "m³"]);
const U_VALUE_UNITS = new Set([
  "w/m2k",
  "w/m²k",
  "w/(m2·k)",
  "w/(m²·k)",
]);
const ACH_UNITS = new Set(["ach", "1/h", "h-1", "h⁻¹"]);
const TEMPERATURE_UNITS = new Set(["c", "°c", "degc"]);
const COP_UNITS = new Set(["cop", "ratio", "-"]);

function normalizeUnit(unit: string | undefined): string | undefined {
  return unit?.trim().toLowerCase().replaceAll(" ", "");
}

function hasExpectedUnit(
  fact: EnergyFact<unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const normalized = normalizeUnit(fact.unit);
  return normalized == null || expected.has(normalized);
}

function hasTraceableOrigin(
  fact: EnergyFact<unknown>,
  knownAssumptionIds: ReadonlySet<string>,
): boolean {
  if (fact.value == null || fact.status === "missing") return false;
  if (hasIndependentTraceableOrigin(fact)) return true;
  return (
    fact.assumptionId != null &&
    knownAssumptionIds.has(fact.assumptionId) &&
    (fact.extractionMethod === "rule_inference" ||
      fact.extractionMethod === "project_default" ||
      fact.extractionMethod === "engine_default")
  );
}

function hasIndependentTraceableOrigin(fact: EnergyFact<unknown>): boolean {
  return fact.sourceRefs.length > 0 || (
    fact.extractionMethod === "user_input" &&
    (fact.status === "user_confirmed" || fact.status === "verified")
  );
}

function categoryForKey(key: string): ValidationCategory {
  if (
    key.startsWith("geometry.") ||
    key.startsWith("storey.") ||
    key.startsWith("floorPlate.") ||
    key.startsWith("space.") ||
    key.startsWith("zone.") ||
    key.startsWith("surface.") ||
    key.startsWith("opening.")
  ) {
    return "geometry";
  }
  if (key.startsWith("construction.") || key.startsWith("envelope.")) {
    return "envelope";
  }
  if (key.startsWith("usage.") || key.startsWith("building.use")) {
    return "usage";
  }
  if (
    key.startsWith("system.") ||
    key.startsWith("dhw.") ||
    key.startsWith("renewable.")
  ) {
    return "systems";
  }
  return "simulation";
}

function samePoint(
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  return Math.abs(a[0] - b[0]) <= 1e-9 && Math.abs(a[1] - b[1]) <= 1e-9;
}

function signedArea(points: readonly (readonly [number, number])[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function orientation(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(
  point: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  return (
    Math.abs(orientation(a, b, point)) <= 1e-9 &&
    point[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    point[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    point[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    point[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

function segmentsIntersect(
  a1: readonly [number, number],
  a2: readonly [number, number],
  b1: readonly [number, number],
  b2: readonly [number, number],
): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
      ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    return true;
  }
  return (
    pointOnSegment(b1, a1, a2) ||
    pointOnSegment(b2, a1, a2) ||
    pointOnSegment(a1, b1, b2) ||
    pointOnSegment(a2, b1, b2)
  );
}

function hasSelfIntersection(
  points: readonly (readonly [number, number])[],
): boolean {
  const ring = samePoint(points[0], points.at(-1)!) ? points : [...points, points[0]];
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      const adjacent =
        Math.abs(first - second) <= 1 ||
        (first === 0 && second === segmentCount - 1);
      if (adjacent) continue;
      if (
        segmentsIntersect(
          ring[first],
          ring[first + 1],
          ring[second],
          ring[second + 1],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function weatherCanCompile(model: CanonicalEnergyModel): boolean {
  const numericClimateKeys = new Set([
    "site.climate.hdd",
    "site.climate.cdd",
    "site.climate.winterDesignTemperatureC",
    "site.climate.summerDesignTemperatureC",
  ]);
  const suppliedClimateKeys = new Set(
    model.facts
      .filter((fact) => numericClimateKeys.has(fact.key) &&
        typeof fact.value === "number" && Number.isFinite(fact.value))
      .map((fact) => fact.key),
  );
  if (suppliedClimateKeys.size === numericClimateKeys.size) return true;

  const source = `${model.site.weatherSource.value ?? ""} ${model.site.location.value ?? ""}`
    .toLowerCase();
  return [
    "seoul", "서울", "busan", "부산", "daegu", "대구", "incheon", "인천",
    "gwangju", "광주", "daejeon", "대전", "ulsan", "울산", "sejong", "세종",
    "gyeonggi", "경기", "chungbuk", "충북", "chungnam", "충남", "jeonbuk", "전북",
    "jeonnam", "전남", "gyeongbuk", "경북", "gyeongnam", "경남", "jeju", "제주",
    "gangwon", "강원",
  ].some((token) => source.includes(token));
}

function makeIssue(
  code: string,
  severity: ValidationIssue["severity"],
  category: ValidationCategory,
  message: string,
  correctiveAction: string,
  affectedObjectIds: readonly string[] = [],
  factIds: readonly string[] = [],
): ValidationIssue {
  const objectSuffix = affectedObjectIds[0] ?? factIds[0] ?? "model";
  return {
    id: `validation:${code}:${objectSuffix}`,
    code,
    severity,
    category,
    message,
    affectedObjectIds,
    factIds,
    correctiveAction,
  };
}

const TIER_ONE_SCREENING_ASSUMPTION_ID =
  "assumption.tier1-office-screening-template";
const TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY =
  "simulation.tier1OfficeScreeningTemplateAccepted";

function tierOneTemplateDependentFacts(
  model: CanonicalEnergyModel,
): readonly EnergyFact<unknown>[] {
  return [
    model.building.name,
    model.building.useType,
    model.site.location,
    model.site.latitudeDeg,
    model.site.longitudeDeg,
    ...(model.site.northOrientationDeg.extractionMethod === "user_input"
      ? []
      : [model.site.northOrientationDeg]),
    model.site.weatherSource,
    model.site.groundRelationship,
    model.geometry.coordinateSystem,
    ...model.geometry.storeys.flatMap((storey) => [
      storey.elevationM,
      storey.floorToFloorHeightM,
    ]),
    ...model.geometry.spaces.flatMap((space) => [
      space.name,
      space.boundary,
      space.floorAreaSqm,
      space.volumeM3,
      space.conditioned,
      space.spaceType,
    ]),
    ...model.geometry.thermalZones.flatMap((zone) => [
      zone.name,
      zone.conditioned,
      zone.floorAreaSqm,
      zone.volumeM3,
      zone.orientationBand,
    ]),
    ...model.geometry.surfaces.flatMap((surface) => [
      surface.boundaryCondition,
      surface.geometry,
      surface.areaSqm,
      surface.azimuthDeg,
      surface.tiltDeg,
      surface.constructionId,
    ]),
    ...model.geometry.openings.flatMap((opening) => [
      opening.areaSqm,
      opening.widthM,
      opening.heightM,
      opening.sillHeightM,
      opening.constructionId,
      opening.geometryRef,
    ]),
    ...model.envelope.constructions.flatMap((construction) => [
      construction.name,
      construction.uValueWPerM2K,
      construction.rValueM2KPerW,
      construction.shgc,
      construction.visibleTransmittance,
      ...construction.layers.flatMap((layer) => [
        layer.name,
        layer.thicknessM,
        layer.conductivityWPerMK,
        layer.densityKgPerM3,
        layer.specificHeatJPerKgK,
      ]),
    ]),
    model.envelope.infiltrationAirChangesPerHour,
    model.envelope.airTightnessNotes,
    model.envelope.thermalBridgeNotes,
    ...model.usageProfiles.flatMap((profile) => [
      profile.name,
      profile.spaceType,
      profile.occupancyDensityPeoplePerSqm,
      profile.occupancySchedule,
      profile.lightingPowerDensityWPerSqm,
      profile.lightingSchedule,
      profile.equipmentPowerDensityWPerSqm,
      profile.equipmentSchedule,
      profile.ventilationLpsPerPerson,
      profile.heatingSetpointC,
      profile.coolingSetpointC,
      profile.operatingHours,
      profile.holidaySchedule,
    ]),
    ...model.systems.hvac.flatMap((system) => [
      system.name,
      system.systemType,
      system.servedZoneIds,
      system.heatingSource,
      system.coolingSource,
      system.distributionSystem,
      system.capacityKw,
      system.heatingEfficiency,
      system.coolingCop,
      system.outdoorAirStrategy,
      system.heatRecoveryEfficiency,
      system.ventilationLps,
      system.controlSchedule,
    ]),
  ];
}

/**
 * Validates the canonical model before it crosses the real degree-day engine
 * boundary. It never repairs or mutates exact geometry.
 */
export function validateCanonicalEnergyModel(
  model: CanonicalEnergyModel,
): CanonicalModelValidation {
  const issues: ValidationIssue[] = [];
  const issueKeys = new Set<string>();
  const knownAssumptionIds = new Set(
    model.assumptions.map((assumption) => assumption.id),
  );
  const add = (issue: ValidationIssue) => {
    const key = `${issue.code}:${issue.affectedObjectIds.join(",")}:${issue.factIds.join(",")}`;
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      issues.push(issue);
    }
  };

  const tierOneModel =
    model.modelVersion.startsWith("tier1-office-screening-") ||
    model.assumptions.some(
      (assumption) => assumption.id === TIER_ONE_SCREENING_ASSUMPTION_ID,
    );
  if (tierOneModel) {
    const assumption = model.assumptions.find(
      (candidate) => candidate.id === TIER_ONE_SCREENING_ASSUMPTION_ID,
    );
    if (!assumption) {
      add(makeIssue(
        "TIER_ONE_TEMPLATE_RECORD_MISSING", "error", "simulation",
        "The Tier-1 model has no matching visible screening-template record.",
        "Restore the versioned Tier-1 assumption record before simulation.",
        [model.building.id],
      ));
    }
    const uncoveredFacts = tierOneTemplateDependentFacts(model).filter(
      (fact) => fact.assumptionId !== TIER_ONE_SCREENING_ASSUMPTION_ID,
    );
    for (const fact of uncoveredFacts) {
      add(makeIssue(
        "TIER_ONE_ASSUMPTION_COVERAGE", "error", categoryForKey(fact.key),
        `Tier-1 template-dependent fact ${fact.key} is not linked to the versioned screening assumption.`,
        "Rebuild the Tier-1 model or restore the fact's template assumption reference.",
        [model.building.id], [fact.id],
      ));
    }
    const acceptanceRecordPresent = model.missingValues.some(
      (missing) => missing.key === TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
    );
    const unreviewedTemplateFacts = tierOneTemplateDependentFacts(model).filter(
      (fact) => !fact.reviewedByUser,
    );
    const unreviewedBoundaryFacts = model.geometry.floorPlates.flatMap((plate) =>
      [plate.boundary, plate.areaSqm].filter((fact) => !fact.reviewedByUser),
    );
    if (
      acceptanceRecordPresent ||
      unreviewedTemplateFacts.length > 0 ||
      unreviewedBoundaryFacts.length > 0
    ) {
      add(makeIssue(
        "TIER_ONE_ACCEPTANCE_REQUIRED", "error", "simulation",
        "The selected floor boundary and versioned Tier-1 screening assumptions have not both been explicitly accepted.",
        "Review the boundary and exact template values, then use the Tier-1 acceptance action.",
        [model.building.id],
        [...unreviewedBoundaryFacts, ...unreviewedTemplateFacts].map((fact) => fact.id),
      ));
    }
  }

  if (model.geometry.storeys.length === 0) {
    add(makeIssue(
      "GEOMETRY_NO_STOREYS", "error", "geometry",
      "No valid storey is available for simulation.",
      "Extract or create at least one level with an elevation and floor-to-floor height.",
    ));
  }
  if (model.geometry.floorPlates.length === 0) {
    add(makeIssue(
      "GEOMETRY_NO_FLOOR_PLATES", "error", "geometry",
      "No closed floor plate is available for simulation.",
      "Review a floor-plan boundary and close the floor plate before continuing.",
    ));
  }

  for (const storey of model.geometry.storeys) {
    if (!isFinitePositive(storey.floorToFloorHeightM.value)) {
      add(makeIssue(
        "GEOMETRY_INVALID_STOREY_HEIGHT", "error", "geometry",
        `${storey.name} has no positive floor-to-floor height.`,
        "Confirm a section dimension or enter a positive floor-to-floor height.",
        [storey.id], [storey.floorToFloorHeightM.id],
      ));
    }
  }

  for (const plate of model.geometry.floorPlates) {
    const boundary = plate.boundary.value;
    if (boundary == null || boundary.length < 3) {
      add(makeIssue(
        "GEOMETRY_OPEN_FLOOR_PLATE", "error", "geometry",
        `Floor plate ${plate.id} does not contain a valid polygon ring.`,
        "Close the boundary in extraction review; exact-mode geometry is not changed automatically.",
        [plate.id], [plate.boundary.id],
      ));
      continue;
    }
    if (Math.abs(signedArea(boundary)) <= 1e-6 || !isFinitePositive(plate.areaSqm.value)) {
      add(makeIssue(
        "GEOMETRY_ZERO_AREA_FLOOR_PLATE", "error", "geometry",
        `Floor plate ${plate.id} has zero or invalid area.`,
        "Correct the boundary or its units, then regenerate the floor plate.",
        [plate.id], [plate.areaSqm.id, plate.boundary.id],
      ));
    }
    if (hasSelfIntersection(boundary)) {
      add(makeIssue(
        "GEOMETRY_SELF_INTERSECTION", "error", "geometry",
        `Floor plate ${plate.id} self-intersects.`,
        "Split or redraw the crossing boundary in extraction review.",
        [plate.id], [plate.boundary.id],
      ));
    }
    if (!hasExpectedUnit(plate.areaSqm, AREA_UNITS)) {
      add(makeIssue(
        "UNIT_FLOOR_AREA", "error", "geometry",
        `Floor plate ${plate.id} uses unsupported area units (${plate.areaSqm.unit}).`,
        "Convert the floor area to m² at the drawing-review boundary.",
        [plate.id], [plate.areaSqm.id],
      ));
    }
  }

  const conditionedZones = model.geometry.thermalZones.filter(
    (zone) => zone.conditioned.value === true,
  );
  if (conditionedZones.length === 0) {
    add(makeIssue(
      "GEOMETRY_NO_CONDITIONED_ZONES", "error", "geometry",
      "No conditioned thermal zone is available.",
      "Confirm conditioning status and accept, merge, or split the suggested thermal zones.",
    ));
  }
  const spaceIds = new Set(model.geometry.spaces.map((space) => space.id));
  for (const zone of conditionedZones) {
    if (!isFinitePositive(zone.floorAreaSqm.value) || !isFinitePositive(zone.volumeM3.value)) {
      add(makeIssue(
        "GEOMETRY_INVALID_ZONE_QUANTITY", "error", "geometry",
        `Thermal zone ${zone.id} has invalid area or volume.`,
        "Confirm the source spaces, floor height, zone area, and zone volume.",
        [zone.id], [zone.floorAreaSqm.id, zone.volumeM3.id],
      ));
    }
    const orphanSpaceIds = zone.sourceSpaceIds.filter((id) => !spaceIds.has(id));
    if (orphanSpaceIds.length > 0) {
      add(makeIssue(
        "GEOMETRY_ORPHAN_ZONE_SPACES", "error", "geometry",
        `Thermal zone ${zone.id} refers to missing source spaces.`,
        "Rebuild the zone mapping after reconciling the revised floor plan.",
        [zone.id, ...orphanSpaceIds],
      ));
    }
  }

  const surfacesById = new Map(model.geometry.surfaces.map((surface) => [surface.id, surface]));
  const constructionById = new Map(
    model.envelope.constructions.map((construction) => [construction.id, construction]),
  );
  const surfaceIds = new Set<string>();
  for (const surface of model.geometry.surfaces) {
    if (surfaceIds.has(surface.id)) {
      add(makeIssue(
        "GEOMETRY_DUPLICATE_SURFACE", "error", "geometry",
        `Surface identifier ${surface.id} is duplicated.`,
        "Reconcile duplicate entities and regenerate stable identifiers.",
        [surface.id],
      ));
    }
    surfaceIds.add(surface.id);
    if (!isFinitePositive(surface.areaSqm.value)) {
      add(makeIssue(
        "GEOMETRY_ZERO_AREA_SURFACE", "error", "geometry",
        `Surface ${surface.id} has zero or invalid area.`,
        "Correct the surface geometry before engine compilation.",
        [surface.id], [surface.areaSqm.id],
      ));
    }
    if (!spaceIds.has(surface.spaceId)) {
      add(makeIssue(
        "GEOMETRY_ORPHAN_SURFACE", "error", "geometry",
        `Surface ${surface.id} refers to missing space ${surface.spaceId}.`,
        "Reconcile surface-to-space topology.",
        [surface.id, surface.spaceId],
      ));
    }
    if (
      surface.boundaryCondition.value === "adjacent_space" &&
      (surface.adjacentSpaceId == null || !spaceIds.has(surface.adjacentSpaceId))
    ) {
      add(makeIssue(
        "GEOMETRY_MISSING_ADJACENCY", "error", "geometry",
        `Interior surface ${surface.id} has no valid adjacent space.`,
        "Assign the neighboring space or correct the boundary classification.",
        [surface.id], [surface.boundaryCondition.id],
      ));
    }
    if (
      (surface.boundaryCondition.value === "outdoors" ||
        surface.boundaryCondition.value === "ground") &&
      (surface.constructionId.value == null ||
        !constructionById.has(surface.constructionId.value))
    ) {
      add(makeIssue(
        "ENVELOPE_MISSING_CONSTRUCTION", "error", "envelope",
        `Thermal-boundary surface ${surface.id} has no valid construction.`,
        "Assign an extracted, confirmed, or explicitly assumed construction assembly.",
        [surface.id], [surface.constructionId.id],
      ));
    }
  }

  for (const opening of model.geometry.openings) {
    const host = surfacesById.get(opening.hostSurfaceId);
    if (host == null) {
      add(makeIssue(
        "GEOMETRY_ORPHAN_OPENING", "error", "geometry",
        `Opening ${opening.id} has no host surface.`,
        "Map the opening to an exterior host wall or remove the orphan entity.",
        [opening.id, opening.hostSurfaceId],
      ));
      continue;
    }
    if (host.boundaryCondition.value !== "outdoors") {
      add(makeIssue(
        "GEOMETRY_OPENING_ON_INTERIOR", "error", "geometry",
        `Opening ${opening.id} is assigned to a non-exterior surface.`,
        "Correct the host-wall boundary condition or opening assignment.",
        [opening.id, host.id],
      ));
    }
    if (!isFinitePositive(opening.areaSqm.value) ||
        (isFinitePositive(host.areaSqm.value) && opening.areaSqm.value > host.areaSqm.value)) {
      add(makeIssue(
        "GEOMETRY_INVALID_OPENING_AREA", "error", "geometry",
        `Opening ${opening.id} has invalid area relative to host ${host.id}.`,
        "Review opening dimensions, drawing units, and host-wall mapping.",
        [opening.id, host.id], [opening.areaSqm.id, host.areaSqm.id],
      ));
    }
    if (opening.constructionId.value == null ||
        !constructionById.has(opening.constructionId.value)) {
      add(makeIssue(
        "ENVELOPE_MISSING_OPENING_CONSTRUCTION", "error", "envelope",
        `Opening ${opening.id} has no valid construction.`,
        "Assign a window or door schedule type, or confirm an explicit assumption.",
        [opening.id], [opening.constructionId.id],
      ));
    }
  }

  const requiredSurfaceTypes = [
    "exterior_wall",
    "roof",
    "ground_floor",
  ] as const;
  for (const type of requiredSurfaceTypes) {
    if (!model.geometry.surfaces.some((surface) => surface.type === type)) {
      add(makeIssue(
        `ENVELOPE_NO_${type.toUpperCase()}`, "error", "envelope",
        `No ${type.replaceAll("_", " ")} is available for the whole-building engine.`,
        "Confirm the thermal-boundary classification for the extracted geometry.",
      ));
    }
  }
  if (model.geometry.openings.length === 0) {
    add(makeIssue(
      "ENVELOPE_NO_OPENINGS", "warning", "envelope",
      "The model has no exterior openings; this is treated as a verified zero only if explicitly confirmed.",
      "Confirm that the design has no openings, or extract the window/door schedule and elevations.",
    ));
  }

  for (const construction of model.envelope.constructions) {
    if (!isFinitePositive(construction.uValueWPerM2K.value)) {
      add(makeIssue(
        "ENVELOPE_INVALID_U_VALUE", "error", "envelope",
        `Construction ${construction.id} has no positive U-value.`,
        "Confirm a schedule value or accept a visible construction assumption.",
        [construction.id], [construction.uValueWPerM2K.id],
      ));
    } else if (!hasExpectedUnit(construction.uValueWPerM2K, U_VALUE_UNITS)) {
      add(makeIssue(
        "UNIT_U_VALUE", "error", "envelope",
        `Construction ${construction.id} uses unsupported U-value units (${construction.uValueWPerM2K.unit}).`,
        "Convert the U-value to W/(m²·K) before simulation.",
        [construction.id], [construction.uValueWPerM2K.id],
      ));
    }
  }
  if (!isFiniteNonNegative(model.envelope.infiltrationAirChangesPerHour.value)) {
    add(makeIssue(
      "ENVELOPE_MISSING_INFILTRATION", "error", "envelope",
      "The natural/design infiltration rate is missing or invalid.",
      "Enter an ACH assumption or derive one from a documented airtightness test.",
      [], [model.envelope.infiltrationAirChangesPerHour.id],
    ));
  } else if (!hasExpectedUnit(model.envelope.infiltrationAirChangesPerHour, ACH_UNITS)) {
    add(makeIssue(
      "UNIT_INFILTRATION", "error", "envelope",
      `Infiltration uses unsupported units (${model.envelope.infiltrationAirChangesPerHour.unit}).`,
      "Convert natural/design infiltration to ACH before simulation.",
      [], [model.envelope.infiltrationAirChangesPerHour.id],
    ));
  }

  if (model.usageProfiles.length === 0) {
    add(makeIssue(
      "USAGE_NO_PROFILE", "error", "usage",
      "No usage profile is assigned.",
      "Assign a use, occupancy, schedule, lighting, equipment, and setpoint profile.",
    ));
  }
  for (const profile of model.usageProfiles) {
    if (!isFinitePositive(profile.heatingSetpointC.value) ||
        !hasExpectedUnit(profile.heatingSetpointC, TEMPERATURE_UNITS)) {
      add(makeIssue(
        "USAGE_INVALID_HEATING_SETPOINT", "error", "usage",
        `Usage profile ${profile.id} has no valid heating setpoint in °C.`,
        "Confirm or explicitly assume the heating setpoint.",
        [profile.id], [profile.heatingSetpointC.id],
      ));
    }
    if (!isFinitePositive(profile.coolingSetpointC.value) ||
        !hasExpectedUnit(profile.coolingSetpointC, TEMPERATURE_UNITS)) {
      add(makeIssue(
        "USAGE_INVALID_COOLING_SETPOINT", "error", "usage",
        `Usage profile ${profile.id} has no valid cooling setpoint in °C.`,
        "Confirm or explicitly assume the cooling setpoint.",
        [profile.id], [profile.coolingSetpointC.id],
      ));
    }
  }

  if (model.systems.hvac.length === 0) {
    add(makeIssue(
      "SYSTEMS_NO_HVAC", "error", "systems",
      "No HVAC system is assigned to conditioned zones.",
      "Assign a real system or accept an explicit early-design system assumption.",
    ));
  }
  const conditionedZoneIds = new Set(conditionedZones.map((zone) => zone.id));
  const servedConditionedZoneIds = new Set<string>();
  for (const system of model.systems.hvac) {
    if (!isFinitePositive(system.heatingEfficiency.value)) {
      add(makeIssue(
        "SYSTEMS_INVALID_HEATING_EFFICIENCY", "error", "systems",
        `HVAC system ${system.id} has no positive heating efficiency.`,
        "Confirm the equipment schedule value or an explicit system assumption.",
        [system.id], [system.heatingEfficiency.id],
      ));
    }
    const coolingIsNone = `${system.coolingSource.value ?? ""}`.toLowerCase() === "none";
    if (!coolingIsNone && !isFinitePositive(system.coolingCop.value)) {
      add(makeIssue(
        "SYSTEMS_INVALID_COOLING_COP", "error", "systems",
        `HVAC system ${system.id} has no positive cooling COP.`,
        "Confirm the equipment schedule COP or mark the system as having no cooling.",
        [system.id], [system.coolingCop.id],
      ));
    } else if (!hasExpectedUnit(system.coolingCop, COP_UNITS)) {
      add(makeIssue(
        "UNIT_COOLING_COP", "error", "systems",
        `HVAC system ${system.id} uses unsupported COP units (${system.coolingCop.unit}).`,
        "Convert cooling performance to dimensionless COP.",
        [system.id], [system.coolingCop.id],
      ));
    }
    for (const zoneId of system.servedZoneIds.value ?? []) {
      if (conditionedZoneIds.has(zoneId)) servedConditionedZoneIds.add(zoneId);
      else {
        add(makeIssue(
          "SYSTEMS_ORPHAN_ZONE_REFERENCE", "error", "systems",
          `HVAC system ${system.id} refers to unknown or unconditioned zone ${zoneId}.`,
          "Correct the system service-area mapping.",
          [system.id, zoneId], [system.servedZoneIds.id],
        ));
      }
    }
  }
  for (const zoneId of conditionedZoneIds) {
    if (!servedConditionedZoneIds.has(zoneId)) {
      add(makeIssue(
        "SYSTEMS_UNSERVED_ZONE", "error", "systems",
        `Conditioned zone ${zoneId} has no HVAC service mapping.`,
        "Assign the zone to an HVAC system or mark it unconditioned.",
        [zoneId],
      ));
    }
  }

  if (model.site.weatherSource.value == null || !weatherCanCompile(model)) {
    add(makeIssue(
      "SIMULATION_WEATHER_UNRESOLVED", "error", "simulation",
      "The weather source cannot be mapped to degree-day climate inputs.",
      "Choose a supported Korean regional weather source or supply HDD, CDD, and design temperatures explicitly.",
      [], [model.site.weatherSource.id],
    ));
  }

  for (const conflict of model.conflicts) {
    if (conflict.blocking && conflict.resolutionStatus !== "user_resolved") {
      add(makeIssue(
        "SIMULATION_BLOCKING_CONFLICT", "error", categoryForKey(conflict.key),
        `Blocking conflict ${conflict.id} has not been explicitly resolved by a user: ${conflict.downstreamImpact}`,
        "Explicitly resolve the conflict as a user, or correct the source drawing and regenerate it.",
        conflict.affectedObjectIds, conflict.candidates.map((candidate) => candidate.fact.id),
      ));
    } else if (conflict.resolutionStatus !== "user_resolved") {
      add(makeIssue(
        "SIMULATION_VISIBLE_CONFLICT", "warning", categoryForKey(conflict.key),
        `Conflict ${conflict.id} is using a visible, reversible selection: ${conflict.downstreamImpact}`,
        "Review the selected candidate before relying on the diagnosis.",
        conflict.affectedObjectIds, conflict.candidates.map((candidate) => candidate.fact.id),
      ));
    }
  }

  for (const missing of model.missingValues) {
    add(makeIssue(
      missing.blocking ? "MISSING_REQUIRED_VALUE" : "MISSING_OPTIONAL_VALUE",
      missing.blocking ? "error" : "warning",
      missing.requiredFor,
      missing.message,
      missing.allowedAssumptionIds.length > 0
        ? "Confirm a source value or select one of the visible allowed assumptions."
        : "Provide the missing value from a source or user confirmation.",
      missing.affectedObjectIds,
    ));
  }

  const engineMaterialFacts: EnergyFact<unknown>[] = [
    model.building.useType,
    model.site.weatherSource,
    model.envelope.infiltrationAirChangesPerHour,
    ...model.geometry.storeys.flatMap((storey) => [
      storey.elevationM,
      storey.floorToFloorHeightM,
    ]),
    ...conditionedZones.flatMap((zone) => [zone.floorAreaSqm, zone.volumeM3]),
    ...model.geometry.surfaces
      .filter((surface) => surface.boundaryCondition.value === "outdoors" ||
        surface.boundaryCondition.value === "ground")
      .flatMap((surface) => [surface.areaSqm, surface.constructionId]),
    ...model.geometry.openings.flatMap((opening) => [
      opening.areaSqm,
      opening.constructionId,
    ]),
    ...model.envelope.constructions.flatMap((construction) => [
      construction.uValueWPerM2K,
      ...(construction.kind === "window" ? [construction.shgc] : []),
    ]),
    ...model.usageProfiles.flatMap((profile) => [
      profile.heatingSetpointC,
      profile.coolingSetpointC,
    ]),
    ...model.systems.hvac.flatMap((system) => [
      system.heatingSource,
      system.coolingSource,
      system.heatingEfficiency,
      system.coolingCop,
      system.heatRecoveryEfficiency,
      system.ventilationLps,
      system.servedZoneIds,
    ]),
  ];
  for (const fact of engineMaterialFacts) {
    const danglingAssumptionId =
      !hasIndependentTraceableOrigin(fact) &&
      fact.assumptionId != null &&
      !knownAssumptionIds.has(fact.assumptionId);
    if (danglingAssumptionId) {
      add(makeIssue(
        "PROVENANCE_DANGLING_ASSUMPTION", "error", categoryForKey(fact.key),
        `Engine input ${fact.key} references missing assumption ${fact.assumptionId}.`,
        "Restore the named assumption record or remove the stale assumption reference.",
        [], [fact.id],
      ));
    } else if (!hasTraceableOrigin(fact, knownAssumptionIds)) {
      add(makeIssue(
        "PROVENANCE_UNKNOWN_ENGINE_INPUT", "error", categoryForKey(fact.key),
        `Engine input ${fact.key} has no traceable source, user confirmation, or explicit assumption.`,
        "Open the input source inspector and confirm a source or named assumption.",
        [], [fact.id],
      ));
    }
  }

  const readiness = CATEGORY_ORDER.map((category): ReadinessCategory => {
    const relevantFacts = model.facts.filter((fact) => categoryForKey(fact.key) === category);
    const categoryIssues = issues.filter((issue) => issue.category === category);
    const blockingRecordIds = categoryIssues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.id);
    const assumedCount = relevantFacts.filter((fact) =>
      fact.status === "defaulted" || fact.status === "inferred",
    ).length;
    const conflictCount = relevantFacts.filter((fact) => fact.status === "conflicted").length;
    const missingCount = relevantFacts.filter((fact) =>
      fact.status === "missing" || fact.value == null,
    ).length;
    return {
      category,
      status: blockingRecordIds.length > 0
        ? "blocked"
        : assumedCount > 0 || categoryIssues.some((issue) => issue.severity === "warning")
          ? "assumptions_required"
          : "ready",
      verifiedCount: relevantFacts.filter((fact) =>
        fact.status === "verified" || fact.status === "user_confirmed",
      ).length,
      assumedCount,
      conflictCount,
      missingCount,
      blockingRecordIds,
    };
  });
  const blockingIssueIds = issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.id);

  return {
    validForSimulation: blockingIssueIds.length === 0,
    issues,
    blockingIssueIds,
    readiness,
  };
}

export function assertCanonicalEnergyModelReady(
  model: CanonicalEnergyModel,
): CanonicalModelValidation {
  const validation = validateCanonicalEnergyModel(model);
  if (!validation.validForSimulation) {
    throw new ModelReadinessError(validation);
  }
  return validation;
}

export class ModelReadinessError extends Error {
  readonly validation: CanonicalModelValidation;

  constructor(validation: CanonicalModelValidation) {
    const summary = validation.issues
      .filter((issue) => issue.severity === "error")
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(" ");
    super(`Canonical energy model is not simulation-ready. ${summary}`);
    this.name = "ModelReadinessError";
    this.validation = validation;
  }
}

export const ENERGY_DIAGNOSTIC_UNIT_SETS = Object.freeze({
  area: AREA_UNITS,
  length: LENGTH_UNITS,
  volume: VOLUME_UNITS,
  uValue: U_VALUE_UNITS,
  airChanges: ACH_UNITS,
  temperature: TEMPERATURE_UNITS,
  cop: COP_UNITS,
});
