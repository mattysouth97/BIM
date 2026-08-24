import { calculateAnnualDemand, type AnnualDemand } from "@/lib/energy/annual-demand";
import { getClimateData, type ClimateData } from "@/lib/energy/climate-data";
import { calculateHeatLoss, type HeatLossResult } from "@/lib/energy/heat-loss";
import {
  calculateSystemBreakdown,
  type SystemBreakdown,
} from "@/lib/energy/system-breakdown";
import type { MaterialProperties, WallAssembly } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { assertScenarioMatchesBaseline, resolveScenarioFact } from "./scenarios";
import type {
  CanonicalEnergyModel,
  CanonicalSimulationResult,
  EnergyFact,
  EnergyScenario,
  EngineInputSnapshot,
  SimulationRun,
  SourceReference,
  SurfaceType,
} from "./types";
import {
  assertCanonicalEnergyModelReady,
  ModelReadinessError,
} from "./validation";

export const DEGREE_DAY_ENGINE_ID = "bimfit-degree-day" as const;
export const DEGREE_DAY_ENGINE_VERSION = "existing-2026.08" as const;
export const ENERGY_ADAPTER_VERSION = "1.0.0" as const;
export const ENERGY_ENGINE_INPUT_SCHEMA_VERSION = "1.0.0" as const;

export type EngineApproximationKind =
  | "screening_method"
  | "boundary_translation"
  | "whole_building_aggregation"
  | "representative_geometry"
  | "ratio_attribution"
  | "area_apportionment"
  | "unsupported_output"
  | "engine_default";

export type EngineApproximation = Readonly<{
  id: string;
  kind: EngineApproximationKind;
  title: string;
  explanation: string;
  affectedInputPaths: readonly string[];
  sourceFactIds: readonly string[];
}>;

export type EngineInputProvenance = Readonly<{
  inputPath: string;
  factIds: readonly string[];
  statuses: readonly string[];
  assumptionIds: readonly string[];
  sourceRefs: readonly SourceReference[];
  transformation: string | null;
}>;

export type EngineZoneMapping = Readonly<{
  zoneId: string;
  conditioned: boolean;
  floorAreaSqm: number;
  volumeM3: number;
  threeObjectIds: readonly string[];
  sourceFactIds: readonly string[];
}>;

export type EngineSurfaceMapping = Readonly<{
  surfaceId: string;
  surfaceType: SurfaceType;
  boundaryCondition: string;
  areaSqm: number;
  uValueWPerM2K: number | null;
  threeObjectIds: readonly string[];
  sourceFactIds: readonly string[];
}>;

export type EngineOpeningMapping = Readonly<{
  openingId: string;
  hostSurfaceId: string;
  openingType: string;
  areaSqm: number;
  uValueWPerM2K: number | null;
  threeObjectIds: readonly string[];
  sourceFactIds: readonly string[];
}>;

export type DegreeDayEnginePayload = Readonly<{
  canonicalModelId: string;
  canonicalModelVersion: string;
  scenarioId: string;
  scenarioDeltaIds: readonly string[];
  recipe: BuildingRecipe;
  materials: MaterialProperties;
  climate: ClimateData;
  units: Readonly<{
    geometry: "m";
    area: "m2";
    volume: "m3";
    uValue: "W/(m2*K)";
    infiltration: "ACH-natural";
    ventilationEngineBoundary: "m3/h";
    energy: "kWh/year";
    designLoad: "W";
  }>;
  mapping: Readonly<{
    conditionedFloorAreaSqm: number;
    zones: readonly EngineZoneMapping[];
    surfaces: readonly EngineSurfaceMapping[];
    openings: readonly EngineOpeningMapping[];
  }>;
  provenance: readonly EngineInputProvenance[];
  approximations: readonly EngineApproximation[];
}>;

export type CompiledDegreeDayInput = Omit<EngineInputSnapshot, "payload"> &
  Readonly<{ payload: DegreeDayEnginePayload }>;

export type DegreeDayEngineOutput = Readonly<{
  engineId: typeof DEGREE_DAY_ENGINE_ID;
  engineVersion: typeof DEGREE_DAY_ENGINE_VERSION;
  inputHash: string;
  heatLoss: HeatLossResult;
  annualDemand: AnnualDemand;
  systemBreakdown: SystemBreakdown;
}>;

export type DegreeDaySimulationRun = SimulationRun &
  Readonly<{ engineOutput: DegreeDayEngineOutput | null }>;

export type SpatialEnergyDatum = Readonly<{
  canonicalObjectId: string;
  threeObjectIds: readonly string[];
  metric:
    | "annual_energy"
    | "heating_energy"
    | "cooling_energy"
    | "design_heat_loss";
  value: number | null;
  unit: "kWh/year" | "W";
  status: "calculated" | "area_apportioned_approximation" | "not_applicable" | "missing";
  sourceFactIds: readonly string[];
  explanation: string;
}>;

export type SpatialEnergyMapping = Readonly<{
  zones: readonly SpatialEnergyDatum[];
  envelope: readonly SpatialEnergyDatum[];
  openings: readonly SpatialEnergyDatum[];
}>;

type WeightedValue = Readonly<{
  value: number;
  weight: number;
  facts: readonly EnergyFact<unknown>[];
}>;

const PLACEHOLDER_OPAQUE_MATERIAL = Object.freeze({
  color: "#b8b0a8",
  roughness: 0.9,
  metalness: 0,
});
const PLACEHOLDER_GLASS_MATERIAL = Object.freeze({
  color: "#88bbdd",
  roughness: 0.1,
  metalness: 0.3,
  transparent: true,
  opacity: 0.4,
});

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function valueOf<T>(fact: EnergyFact<T>, scenario: EnergyScenario | undefined): T {
  const resolved = resolveScenarioFact(fact, scenario);
  if (resolved.value == null) {
    throw new ModelReadinessError({
      validForSimulation: false,
      issues: [{
        id: `validation:COMPILE_MISSING_FACT:${resolved.id}`,
        code: "COMPILE_MISSING_FACT",
        severity: "error",
        category: "simulation",
        message: `Required engine fact ${resolved.key} is missing.`,
        affectedObjectIds: [],
        factIds: [resolved.id],
        correctiveAction: "Confirm a source value or an explicit assumption before compiling.",
      }],
      blockingIssueIds: [`validation:COMPILE_MISSING_FACT:${resolved.id}`],
      readiness: [],
    });
  }
  return resolved.value;
}

function numberOf(
  fact: EnergyFact<number>,
  scenario: EnergyScenario | undefined,
  label: string,
  allowZero = false,
): number {
  const value = valueOf(fact, scenario);
  if (!finiteNumber(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${label} must be ${allowZero ? "non-negative" : "positive"}.`);
  }
  return value;
}

function resolvedFact<T>(
  fact: EnergyFact<T>,
  scenario: EnergyScenario | undefined,
): EnergyFact<T> {
  return resolveScenarioFact(fact, scenario);
}

function provenanceEntry(
  inputPath: string,
  facts: readonly EnergyFact<unknown>[],
  scenario: EnergyScenario | undefined,
  transformation: string | null = null,
): EngineInputProvenance {
  const resolved = facts.map((fact) => resolvedFact(fact, scenario));
  return {
    inputPath,
    factIds: resolved.map((fact) => fact.id),
    statuses: resolved.map((fact) => fact.status),
    assumptionIds: resolved.flatMap((fact) =>
      fact.assumptionId == null ? [] : [fact.assumptionId],
    ),
    sourceRefs: resolved.flatMap((fact) => fact.sourceRefs),
    transformation,
  };
}

function weightedAverage(rows: readonly WeightedValue[], label: string): number {
  const usable = rows.filter((row) => finiteNumber(row.value) && row.weight > 0);
  const denominator = usable.reduce((sum, row) => sum + row.weight, 0);
  if (denominator <= 0) throw new Error(`Cannot calculate area-weighted ${label}.`);
  return usable.reduce((sum, row) => sum + row.value * row.weight, 0) / denominator;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

/** Browser-safe, deterministic snapshot fingerprint (not a security hash). */
export function deterministicInputHash(value: unknown): string {
  const serialized = stableStringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `fnv1a32x2-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function immutableSnapshot<T>(value: T): T {
  const clone = JSON.parse(stableStringify(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate == null || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    for (const child of Object.values(candidate as Record<string, unknown>)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function mainPurposeCode(useType: string): string {
  if (/^\d{5}$/.test(useType)) return useType;
  const normalized = useType.trim().toLowerCase();
  if (normalized.includes("office") || normalized.includes("사무")) return "14000";
  if (
    normalized.includes("apartment") ||
    normalized.includes("residential") ||
    normalized.includes("주거") ||
    normalized.includes("공동주택")
  ) return "02000";
  if (normalized.includes("retail") || normalized.includes("판매")) return "07000";
  return "00000";
}

function regionCode(model: CanonicalEnergyModel): string | undefined {
  const source = `${model.site.weatherSource.value ?? ""} ${model.site.location.value ?? ""}`
    .toLowerCase();
  const regions: readonly (readonly [string, readonly string[]])[] = [
    ["11", ["seoul", "서울"]],
    ["26", ["busan", "부산"]],
    ["27", ["daegu", "대구"]],
    ["28", ["incheon", "인천"]],
    ["29", ["gwangju", "광주"]],
    ["30", ["daejeon", "대전"]],
    ["31", ["ulsan", "울산"]],
    ["36", ["sejong", "세종"]],
    ["41", ["gyeonggi", "경기"]],
    ["43", ["chungbuk", "충북"]],
    ["44", ["chungnam", "충남"]],
    ["52", ["jeonbuk", "전북"]],
    ["46", ["jeonnam", "전남"]],
    ["47", ["gyeongbuk", "경북"]],
    ["48", ["gyeongnam", "경남"]],
    ["50", ["jeju", "제주"]],
    ["51", ["gangwon", "강원"]],
  ];
  return regions.find(([, tokens]) => tokens.some((token) => source.includes(token)))?.[0];
}

function flatNumberFact(
  model: CanonicalEnergyModel,
  key: string,
): EnergyFact<number> | undefined {
  const fact = model.facts.find((candidate) => candidate.key === key);
  return fact != null && finiteNumber(fact.value)
    ? fact as EnergyFact<number>
    : undefined;
}

function resolveClimate(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario | undefined,
  provenance: EngineInputProvenance[],
  approximations: EngineApproximation[],
): ClimateData {
  const hddFact = flatNumberFact(model, "site.climate.hdd");
  const cddFact = flatNumberFact(model, "site.climate.cdd");
  const winterFact = flatNumberFact(model, "site.climate.winterDesignTemperatureC");
  const summerFact = flatNumberFact(model, "site.climate.summerDesignTemperatureC");
  const solarFact = flatNumberFact(model, "site.climate.coolingSeasonSolarKwhPerM2");
  const explicit = hddFact != null && cddFact != null && winterFact != null && summerFact != null;
  const code = regionCode(model);
  if (!explicit && code == null) {
    throw new Error("Weather source has no explicit climate facts and no supported regional mapping.");
  }
  const regional = getClimateData(code);

  const profileWeights = new Map(
    model.geometry.thermalZones
      .filter((zone) => zone.conditioned.value === true && zone.usageProfileId != null)
      .map((zone) => [zone.usageProfileId!, numberOf(zone.floorAreaSqm, scenario, "zone area")]),
  );
  const weightedProfileFact = (kind: "heating" | "cooling"): number => {
    const rows = model.usageProfiles.map((profile) => {
      const fact = kind === "heating" ? profile.heatingSetpointC : profile.coolingSetpointC;
      return {
        value: numberOf(fact, scenario, `${kind} setpoint`),
        weight: profileWeights.get(profile.id) ?? 1,
        facts: [fact],
      };
    });
    provenance.push(provenanceEntry(
      kind === "heating" ? "climate.indoorTemp" : "climate.indoorCoolTemp",
      rows.flatMap((row) => row.facts),
      scenario,
      "conditioned-zone-area-weighted average",
    ));
    return weightedAverage(rows, `${kind} setpoint`);
  };

  if (explicit) {
    provenance.push(
      provenanceEntry("climate.hdd", [hddFact], scenario),
      provenanceEntry("climate.cdd", [cddFact], scenario),
      provenanceEntry("climate.winterDesignTemp", [winterFact], scenario),
      provenanceEntry("climate.summerDesignTemp", [summerFact], scenario),
    );
  } else {
    provenance.push(provenanceEntry(
      "climate.regionalDegreeDaysAndDesignTemperatures",
      [model.site.weatherSource, model.site.location],
      scenario,
      `BIMFIT static Korean regional climate lookup (${code})`,
    ));
    approximations.push({
      id: "engine-assumption:regional-climate",
      kind: "engine_default",
      title: "Regional degree-day climate",
      explanation: "The selected weather source was mapped to BIMFIT's existing Korean regional HDD/CDD and design-temperature table.",
      affectedInputPaths: ["climate.hdd", "climate.cdd", "climate.winterDesignTemp", "climate.summerDesignTemp"],
      sourceFactIds: [model.site.weatherSource.id, model.site.location.id],
    });
  }
  if (solarFact != null) {
    provenance.push(provenanceEntry("climate.coolingSeasonSolar", [solarFact], scenario));
  } else {
    approximations.push({
      id: "engine-assumption:cooling-solar",
      kind: "engine_default",
      title: "Cooling-season solar irradiation",
      explanation: "The existing engine's 350 kWh/m² orientation-averaged cooling-season solar input is used because the canonical weather source has no explicit solar series.",
      affectedInputPaths: ["climate.coolingSeasonSolar"],
      sourceFactIds: [model.site.weatherSource.id],
    });
  }
  return {
    hdd: hddFact == null ? regional.hdd : numberOf(hddFact, scenario, "HDD", true),
    cdd: cddFact == null ? regional.cdd : numberOf(cddFact, scenario, "CDD", true),
    winterDesignTemp: winterFact == null ? regional.winterDesignTemp : valueOf(winterFact, scenario),
    summerDesignTemp: summerFact == null ? regional.summerDesignTemp : valueOf(summerFact, scenario),
    indoorTemp: weightedProfileFact("heating"),
    indoorCoolTemp: weightedProfileFact("cooling"),
    coolingSeasonSolar: solarFact == null
      ? regional.coolingSeasonSolar
      : numberOf(solarFact, scenario, "cooling-season solar", true),
  };
}

function constructionFor(
  model: CanonicalEnergyModel,
  constructionId: string,
) {
  const construction = model.envelope.constructions.find(
    (candidate) => candidate.id === constructionId,
  );
  if (construction == null) throw new Error(`Missing construction ${constructionId}.`);
  return construction;
}

function objectThreeIds(model: CanonicalEnergyModel, objectId: string): readonly string[] {
  return model.mappings.find((mapping) => mapping.canonicalObjectId === objectId)?.threeObjectIds ?? [];
}

function compileGeometry(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario | undefined,
  provenance: EngineInputProvenance[],
  approximations: EngineApproximation[],
): { recipe: BuildingRecipe; conditionedArea: number } {
  const storeys = [...model.geometry.storeys].sort(
    (a, b) => valueOf(a.elevationM, scenario) - valueOf(b.elevationM, scenario),
  );
  const plate = model.geometry.floorPlates
    .filter((candidate) => candidate.boundary.value != null)
    .sort((a, b) => {
      const aStorey = storeys.find((storey) => storey.id === a.storeyId);
      const bStorey = storeys.find((storey) => storey.id === b.storeyId);
      return valueOf(aStorey!.elevationM, scenario) - valueOf(bStorey!.elevationM, scenario);
    })[0];
  if (plate?.boundary.value == null) throw new Error("No representative floor plate is available.");
  const boundary = valueOf(plate.boundary, scenario);
  const xs = boundary.map((point) => point[0]);
  const ys = boundary.map((point) => point[1]);
  const footprintWidth = Math.max(...xs) - Math.min(...xs);
  const footprintDepth = Math.max(...ys) - Math.min(...ys);
  const elevations = storeys.map((storey) => {
    const elevation = valueOf(storey.elevationM, scenario);
    if (!finiteNumber(elevation)) throw new Error("Storey elevation must be finite.");
    return elevation;
  });
  const heights = storeys.map((storey) => numberOf(storey.floorToFloorHeightM, scenario, "floor-to-floor height"));
  const minElevation = Math.min(...elevations);
  const maxTop = Math.max(...elevations.map((elevation, index) => elevation + heights[index]));
  const floors: FloorSpec[] = storeys.map((storey, index) => ({
    floorNo: index + 1,
    label: storey.name,
    type: elevations[index] < 0 ? "below" : "above",
    y: elevations[index],
    height: heights[index],
    isGroundFloor: index === elevations.findIndex((elevation) => elevation >= 0),
  }));
  const conditionedArea = model.geometry.thermalZones
    .filter((zone) => zone.conditioned.value === true)
    .reduce((sum, zone) => sum + numberOf(zone.floorAreaSqm, scenario, "conditioned zone area"), 0);
  const glazedOpenings = model.geometry.openings.filter(
    (opening) =>
      opening.type === "window" || opening.type === "curtain_wall",
  );
  const averageOpeningWidth = glazedOpenings.length > 0
    ? glazedOpenings.reduce(
        (sum, opening) =>
          sum + numberOf(opening.widthM, scenario, "window width"),
        0,
      ) / glazedOpenings.length
    : 1;
  const averageOpeningHeight = glazedOpenings.length > 0
    ? glazedOpenings.reduce(
        (sum, opening) =>
          sum + numberOf(opening.heightM, scenario, "window height"),
        0,
      ) / glazedOpenings.length
    : 1;
  const averageSillHeight = glazedOpenings.length > 0
    ? glazedOpenings.reduce(
        (sum, opening) =>
          sum + numberOf(
            opening.sillHeightM,
            scenario,
            "window sill height",
            true,
          ),
        0,
      ) / glazedOpenings.length
    : 0.9;
  const exteriorWallArea = model.geometry.surfaces
    .filter(
      (surface) =>
        surface.type === "exterior_wall" &&
        valueOf(surface.boundaryCondition, scenario) === "outdoors",
    )
    .reduce(
      (sum, surface) =>
        sum + numberOf(surface.areaSqm, scenario, "exterior wall area"),
      0,
    );
  const glazedArea = glazedOpenings.reduce(
    (sum, opening) =>
      sum + numberOf(opening.areaSqm, scenario, "window area"),
    0,
  );
  const visualWindowRatio =
    exteriorWallArea > 0
      ? Math.min(Math.max(glazedArea / exteriorWallArea, 0), 0.85)
      : 0;
  provenance.push(
    provenanceEntry("recipe.footprintPolygon", [plate.boundary], scenario),
    provenanceEntry("recipe.totalHeight", storeys.flatMap((storey) => [
      storey.elevationM,
      storey.floorToFloorHeightM,
    ]), scenario, "maximum storey top minus minimum storey elevation"),
    provenanceEntry(
      "recipe.officialFloorAreaSqm",
      model.geometry.thermalZones
        .filter((zone) => zone.conditioned.value === true)
        .map((zone) => zone.floorAreaSqm),
      scenario,
      "sum of conditioned thermal-zone floor areas",
    ),
  );
  if (glazedOpenings.length > 0) {
    provenance.push(
      provenanceEntry(
        "recipe.facade.windowWidth",
        glazedOpenings.map((opening) => opening.widthM),
        scenario,
        "arithmetic mean of reviewed glazed-opening widths for display",
      ),
      provenanceEntry(
        "recipe.facade.windowHeight",
        glazedOpenings.map((opening) => opening.heightM),
        scenario,
        "arithmetic mean of reviewed glazed-opening heights for display",
      ),
      provenanceEntry(
        "recipe.facade.sillHeight",
        glazedOpenings.map((opening) => opening.sillHeightM),
        scenario,
        "arithmetic mean of reviewed glazed-opening sill heights for display",
      ),
      provenanceEntry(
        "recipe.facade.windowRatio",
        [
          ...glazedOpenings.map((opening) => opening.areaSqm),
          ...model.geometry.surfaces
            .filter(
              (surface) =>
                surface.type === "exterior_wall" &&
                valueOf(surface.boundaryCondition, scenario) === "outdoors",
            )
            .map((surface) => surface.areaSqm),
        ],
        scenario,
        "reviewed glazed area divided by reviewed exterior-wall area for display",
      ),
    );
  }
  if (model.geometry.floorPlates.length > 1) {
    const signatures = new Set(model.geometry.floorPlates.map((candidate) =>
      stableStringify(candidate.boundary.value),
    ));
    if (signatures.size > 1) {
      approximations.push({
        id: "engine-approximation:representative-footprint",
        kind: "representative_geometry",
        title: "Representative whole-building footprint",
        explanation: "The existing engine accepts one repeated footprint, so it uses the lowest valid floor plate while retaining exact conditioned floor area for intensity calculations.",
        affectedInputPaths: ["recipe.footprintPolygon", "recipe.floors"],
        sourceFactIds: model.geometry.floorPlates.map((candidate) => candidate.boundary.id),
      });
    }
  }
  const rings: [number, number][][] = [
    boundary.map((point) => [point[0], point[1]] as [number, number]),
    ...plate.voidBoundaries.flatMap((voidBoundary) =>
      voidBoundary.value == null
        ? []
        : [voidBoundary.value.map((point) => [point[0], point[1]] as [number, number])],
    ),
  ];
  const useType = valueOf(model.building.useType, scenario);
  const recipe: BuildingRecipe = {
    footprintWidth,
    footprintDepth,
    footprintPolygon: rings,
    officialFloorAreaSqm: conditionedArea,
    floors,
    totalHeight: maxTop - minElevation,
    wallThickness: 0.2,
    era: "2020+",
    strctCd: "",
    mainPurpsCd: mainPurposeCode(useType),
    facade: {
      windowWidth: Math.max(averageOpeningWidth, 0.2),
      windowHeight: Math.max(averageOpeningHeight, 0.2),
      sillHeight: Math.max(averageSillHeight, 0),
      windowSpacing: Math.max(averageOpeningWidth + 1, 1.2),
      windowRatio: visualWindowRatio,
      mullionDepth: 0,
      mullionWidth: 0,
      glassInset: 0,
      solidPanelChance: 0,
      parapetHeight: 0,
      cornerInset: 0,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0 },
    roof: { type: "flat", flatThickness: 0.2, gableHeight: 0, hipInset: 0 },
    materials: {
      wall: PLACEHOLDER_OPAQUE_MATERIAL,
      glass: PLACEHOLDER_GLASS_MATERIAL,
      mullion: PLACEHOLDER_OPAQUE_MATERIAL,
      slab: PLACEHOLDER_OPAQUE_MATERIAL,
      column: PLACEHOLDER_OPAQUE_MATERIAL,
      roof: PLACEHOLDER_OPAQUE_MATERIAL,
      groundFloor: PLACEHOLDER_OPAQUE_MATERIAL,
    },
    siteWidth: Math.max(footprintWidth * 1.5, footprintWidth + 10),
    siteDepth: Math.max(footprintDepth * 1.5, footprintDepth + 10),
    buildingName: valueOf(model.building.name, scenario),
    address: valueOf(model.site.location, scenario),
  };
  return { recipe, conditionedArea };
}

function compileMaterials(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario | undefined,
  provenance: EngineInputProvenance[],
  approximations: EngineApproximation[],
): MaterialProperties {
  const exteriorWalls = model.geometry.surfaces.filter(
    (surface) => surface.type === "exterior_wall" &&
      surface.boundaryCondition.value === "outdoors",
  );
  const wallRows = exteriorWalls.map((surface): WeightedValue => {
    const constructionId = valueOf(surface.constructionId, scenario);
    const construction = constructionFor(model, constructionId);
    return {
      value: numberOf(construction.uValueWPerM2K, scenario, "wall U-value"),
      weight: numberOf(surface.areaSqm, scenario, "wall area"),
      facts: [surface.areaSqm, surface.constructionId, construction.uValueWPerM2K],
    };
  });
  const wallU = weightedAverage(wallRows, "wall U-value");
  const grossWallArea = wallRows.reduce((sum, row) => sum + row.weight, 0);
  provenance.push(provenanceEntry(
    "materials.envelope.walls[].uValue",
    wallRows.flatMap((row) => row.facts),
    scenario,
    "exterior-surface-area-weighted whole-building U-value",
  ));

  const thermalRows = (surfaceType: "roof" | "ground_floor"): WeightedValue[] =>
    model.geometry.surfaces
      .filter((surface) => surface.type === surfaceType)
      .map((surface) => {
        const construction = constructionFor(model, valueOf(surface.constructionId, scenario));
        return {
          value: numberOf(construction.uValueWPerM2K, scenario, `${surfaceType} U-value`),
          weight: numberOf(surface.areaSqm, scenario, `${surfaceType} area`),
          facts: [surface.areaSqm, surface.constructionId, construction.uValueWPerM2K],
        };
      });
  const roofRows = thermalRows("roof");
  const floorRows = thermalRows("ground_floor");
  const roofU = weightedAverage(roofRows, "roof U-value");
  const floorU = weightedAverage(floorRows, "ground-floor U-value");
  provenance.push(
    provenanceEntry("materials.envelope.roof.uValue", roofRows.flatMap((row) => row.facts), scenario, "area-weighted average"),
    provenanceEntry("materials.envelope.groundFloor.uValue", floorRows.flatMap((row) => row.facts), scenario, "area-weighted average"),
  );

  const glazedOpenings = model.geometry.openings.filter(
    (opening) => opening.type === "window" || opening.type === "curtain_wall" || opening.type === "skylight",
  );
  const windowRows = glazedOpenings.map((opening) => {
    const construction = constructionFor(model, valueOf(opening.constructionId, scenario));
    const area = numberOf(opening.areaSqm, scenario, "opening area");
    return {
      uValue: numberOf(construction.uValueWPerM2K, scenario, "window U-value"),
      shgc: numberOf(construction.shgc, scenario, "window SHGC", true),
      area,
      facts: [opening.areaSqm, opening.constructionId, construction.uValueWPerM2K, construction.shgc],
    };
  });
  const windowArea = windowRows.reduce((sum, row) => sum + row.area, 0);
  const windowU = windowArea > 0
    ? windowRows.reduce((sum, row) => sum + row.uValue * row.area, 0) / windowArea
    : 1;
  const shgc = windowArea > 0
    ? windowRows.reduce((sum, row) => sum + row.shgc * row.area, 0) / windowArea
    : 0;
  const averageWwr = grossWallArea > 0 ? Math.min(windowArea / grossWallArea, 0.95) : 0;
  provenance.push(
    provenanceEntry("materials.envelope.windows.uValue", windowRows.flatMap((row) => row.facts), scenario, "opening-area-weighted average"),
    provenanceEntry("materials.envelope.windows.shgc", windowRows.flatMap((row) => row.facts), scenario, "opening-area-weighted average"),
    provenanceEntry(
      "materials.envelope.windows.windowToWallRatio",
      [...exteriorWalls.map((surface) => surface.areaSqm), ...glazedOpenings.map((opening) => opening.areaSqm)],
      scenario,
      "total exterior glazing area divided by total exterior wall area; applied as the engine's orientation-average WWR",
    ),
  );

  if (model.geometry.openings.some((opening) => opening.type === "door")) {
    approximations.push({
      id: "engine-approximation:exterior-doors",
      kind: "whole_building_aggregation",
      title: "Exterior doors included in opaque wall aggregate",
      explanation: "The existing engine has no separate exterior-door term; door area and U-value are not independently resolved from the opaque wall calculation.",
      affectedInputPaths: ["materials.envelope.walls"],
      sourceFactIds: model.geometry.openings
        .filter((opening) => opening.type === "door")
        .flatMap((opening) => [opening.areaSqm.id, opening.constructionId.id]),
    });
  }

  const zoneArea = new Map(model.geometry.thermalZones.map((zone) => [
    zone.id,
    zone.conditioned.value === true ? numberOf(zone.floorAreaSqm, scenario, "zone area") : 0,
  ]));
  const systemWeight = (servedZoneIds: readonly string[]): number => {
    const area = servedZoneIds.reduce((sum, zoneId) => sum + (zoneArea.get(zoneId) ?? 0), 0);
    return area > 0 ? area : 1;
  };
  const systems = model.systems.hvac;
  const heatingRows = systems.map((system): WeightedValue => ({
    value: numberOf(system.heatingEfficiency, scenario, "heating efficiency"),
    weight: systemWeight(valueOf(system.servedZoneIds, scenario)),
    facts: [system.heatingEfficiency, system.servedZoneIds],
  }));
  const activeCoolingSystems = systems.filter(
    (system) => `${valueOf(system.coolingSource, scenario)}`.toLowerCase() !== "none",
  );
  const coolingRows = activeCoolingSystems.map((system): WeightedValue => ({
    value: numberOf(system.coolingCop, scenario, "cooling COP"),
    weight: systemWeight(valueOf(system.servedZoneIds, scenario)),
    facts: [system.coolingCop, system.servedZoneIds],
  }));
  const heatingEfficiency = weightedAverage(heatingRows, "heating efficiency");
  const coolingEfficiency = coolingRows.length > 0
    ? weightedAverage(coolingRows, "cooling COP")
    : 0;
  const ventilationM3h = systems.reduce((sum, system) =>
    sum + numberOf(system.ventilationLps, scenario, "ventilation flow", true) * 3.6,
  0);
  const heatRecoveryRows = systems
    .map((system): WeightedValue => ({
      value: numberOf(system.heatRecoveryEfficiency, scenario, "heat-recovery efficiency", true),
      weight: numberOf(system.ventilationLps, scenario, "ventilation flow", true),
      facts: [system.heatRecoveryEfficiency, system.ventilationLps],
    }))
    .filter((row) => row.weight > 0);
  const heatRecoveryEfficiency = heatRecoveryRows.length > 0
    ? weightedAverage(heatRecoveryRows, "heat-recovery efficiency")
    : 0;
  provenance.push(
    provenanceEntry("materials.hvac.heating.efficiency", heatingRows.flatMap((row) => row.facts), scenario, "served-conditioned-area-weighted average"),
    provenanceEntry("materials.hvac.cooling.efficiency", coolingRows.flatMap((row) => row.facts), scenario, "served-conditioned-area-weighted average"),
    provenanceEntry(
      "materials.hvac.ventilation.airflowRate",
      systems.map((system) => system.ventilationLps),
      scenario,
      "sum of system outdoor-air flow; L/s multiplied by 3.6 to m³/h",
    ),
    provenanceEntry(
      "materials.hvac.ventilation.heatRecoveryEfficiency",
      heatRecoveryRows.flatMap((row) => row.facts),
      scenario,
      "ventilation-flow-weighted average",
    ),
  );
  if (systems.length > 1) {
    approximations.push({
      id: "engine-approximation:hvac-aggregation",
      kind: "whole_building_aggregation",
      title: "Whole-building HVAC aggregation",
      explanation: "The current engine represents one whole-building HVAC system; efficiencies are weighted by served conditioned area and ventilation flows are summed.",
      affectedInputPaths: ["materials.hvac"],
      sourceFactIds: systems.flatMap((system) => [
        system.heatingEfficiency.id,
        system.coolingCop.id,
        system.servedZoneIds.id,
      ]),
    });
  }

  const primarySystem = [...systems].sort((a, b) =>
    systemWeight(valueOf(b.servedZoneIds, scenario)) - systemWeight(valueOf(a.servedZoneIds, scenario)),
  )[0];
  const heatingSource = `${valueOf(primarySystem.heatingSource, scenario)}`.toLowerCase();
  const heatingFuel: MaterialProperties["hvac"]["heating"]["fuelType"] =
    heatingSource.includes("heat pump") || heatingSource.includes("heat-pump") || heatingSource.includes("히트펌프")
      ? "heat-pump"
      : heatingSource.includes("district") || heatingSource.includes("지역")
        ? "district-heat"
        : heatingSource.includes("electric") || heatingSource.includes("전기")
          ? "electric"
          : heatingSource.includes("oil") || heatingSource.includes("유류")
            ? "oil"
            : "gas";
  provenance.push(provenanceEntry(
    "materials.hvac.heating.fuelType",
    [primarySystem.heatingSource],
    scenario,
    "deterministic source-name mapping to the existing engine fuel enum",
  ));

  const naturalAch = numberOf(
    model.envelope.infiltrationAirChangesPerHour,
    scenario,
    "natural infiltration ACH",
    true,
  );
  const engineAch50Representation = naturalAch * 20;
  provenance.push(provenanceEntry(
    "materials.envelope.airtightness.ach50",
    [model.envelope.infiltrationAirChangesPerHour],
    scenario,
    "natural/design ACH multiplied by the engine's fixed LBL N-factor 20; calculateHeatLoss divides by 20 and recovers the supplied ACH",
  ));
  approximations.push({
    id: "engine-boundary:natural-ach",
    kind: "boundary_translation",
    title: "Natural ACH boundary translation",
    explanation: "The legacy MaterialProperties field is named ach50. The adapter stores natural ACH×20 because calculateHeatLoss divides that field by 20, preserving the canonical natural/design ACH exactly in the engine calculation.",
    affectedInputPaths: ["materials.envelope.airtightness.ach50"],
    sourceFactIds: [model.envelope.infiltrationAirChangesPerHour.id],
  });

  const usageRows = model.usageProfiles.map((profile) => ({
    lpd: numberOf(profile.lightingPowerDensityWPerSqm, scenario, "lighting power density", true),
    occupancy: numberOf(profile.occupancyDensityPeoplePerSqm, scenario, "occupancy density", true),
    profile,
  }));
  const averageLpd = usageRows.reduce((sum, row) => sum + row.lpd, 0) / Math.max(usageRows.length, 1);
  const averageOccupancy = usageRows.reduce((sum, row) => sum + row.occupancy, 0) / Math.max(usageRows.length, 1);

  const wallOrientations: WallAssembly["orientation"][] = ["N", "S", "E", "W"];
  const containsAssumedInputs = model.facts.some(
    (fact) =>
      fact.assumptionId != null ||
      fact.status === "defaulted" ||
      fact.status === "inferred",
  );
  provenance.push(
    provenanceEntry(
      "materials.envelope.walls[].thermalBridge",
      [model.envelope.thermalBridgeNotes],
      scenario,
      "fixed zero additive U-value surcharge; see engine-assumption:thermal-bridge-zero",
    ),
    provenanceEntry(
      "materials.envelope.foundation.groundTemperature",
      [
        model.site.weatherSource,
        model.site.location,
        model.site.groundRelationship,
      ],
      scenario,
      "fixed 13.5 degC legacy-engine screening default; see engine-assumption:ground-temperature",
    ),
  );
  approximations.push({
    id: "engine-assumption:thermal-bridge-zero",
    kind: "engine_default",
    title: "Zero thermal-bridge surcharge",
    explanation:
      "The legacy material boundary has no canonical numeric thermal-bridge input, so every wall uses a zero additive U-value surcharge. This can understate wall transmission where junction losses are material.",
    affectedInputPaths: ["materials.envelope.walls[].thermalBridge"],
    sourceFactIds: [model.envelope.thermalBridgeNotes.id],
  });
  approximations.push({
    id: "engine-assumption:ground-temperature",
    kind: "engine_default",
    title: "Ground-temperature screening default",
    explanation:
      "The legacy degree-day engine uses a fixed 13.5 °C ground temperature because the canonical model has no ground-temperature field. This affects ground-floor design and annual heat loss and is not measured site data.",
    affectedInputPaths: [
      "materials.envelope.foundation.groundTemperature",
    ],
    sourceFactIds: [
      model.site.weatherSource.id,
      model.site.location.id,
      model.site.groundRelationship.id,
    ],
  });
  return {
    source: containsAssumedInputs ? "code-estimate" : "user-input",
    confidence: containsAssumedInputs ? "estimated" : "measured",
    codeYear: 2026,
    envelope: {
      walls: wallOrientations.map((orientation) => ({
        orientation,
        uValue: wallU,
        rValue: 1 / wallU,
        layers: [],
        thermalBridge: 0,
        surfaceArea: grossWallArea / wallOrientations.length,
      })),
      roof: {
        uValue: roofU,
        layers: [],
        solarReflectance: 0.5,
        emissivity: 0.9,
        greenRoofCoverage: 0,
      },
      groundFloor: {
        uValue: floorU,
        layers: [],
        groundContactResistance: 0,
      },
      windows: {
        uValue: windowU,
        shgc,
        vlt: 0,
        glassType: "double",
        coating: "none",
        gasFill: "air",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 0,
        shadingCoefficient: 1,
        windowToWallRatio: {
          N: averageWwr,
          S: averageWwr,
          E: averageWwr,
          W: averageWwr,
        },
      },
      foundation: {
        perimeterInsulationUValue: floorU,
        groundTemperature: 13.5,
        moistureBarrier: "none",
      },
      airtightness: {
        ach50: engineAch50Representation,
        equivalentLeakageArea: 0,
        testMethod: "estimated",
      },
    },
    hvac: {
      heating: {
        systemType: heatingFuel === "district-heat" ? "district" : "central",
        fuelType: heatingFuel,
        efficiency: heatingEfficiency,
        capacity: valueOf(primarySystem.capacityKw, scenario) ?? 0,
      },
      cooling: {
        systemType: coolingRows.length > 0 ? "central-chiller" : "none",
        efficiency: coolingEfficiency,
        capacity: coolingRows.length > 0 ? valueOf(primarySystem.capacityKw, scenario) ?? 0 : 0,
      },
      ventilation: {
        type: heatRecoveryEfficiency > 0
          ? "heat-recovery"
          : ventilationM3h > 0
            ? "mechanical-supply"
            : "natural",
        heatRecoveryEfficiency,
        airflowRate: ventilationM3h,
      },
      dhw: {
        systemType: "gas-boiler",
        efficiency: 1,
        storageVolume: 0,
      },
    },
    lighting: {
      lightingPowerDensity: averageLpd,
      controlType: "manual",
      lampType: "led",
    },
    renewable: {
      solarPV: {
        installed: false,
        capacity: 0,
        panelType: "monocrystalline",
        tiltAngle: 0,
        orientation: 0,
        area: 0,
      },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: {
      occupancyDensity: averageOccupancy,
      weekdaySchedule: [],
      weekendSchedule: [],
      internalHeatGain: 0,
      hotWaterDemand: 0,
    },
  };
}

function compileObjectMappings(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario | undefined,
): DegreeDayEnginePayload["mapping"] {
  const zones = model.geometry.thermalZones.map((zone): EngineZoneMapping => ({
    zoneId: zone.id,
    conditioned: valueOf(zone.conditioned, scenario),
    floorAreaSqm: numberOf(zone.floorAreaSqm, scenario, "zone area"),
    volumeM3: numberOf(zone.volumeM3, scenario, "zone volume"),
    threeObjectIds: objectThreeIds(model, zone.id),
    sourceFactIds: [zone.conditioned.id, zone.floorAreaSqm.id, zone.volumeM3.id],
  }));
  const surfaces = model.geometry.surfaces.map((surface): EngineSurfaceMapping => {
    const constructionId = surface.constructionId.value;
    const construction = constructionId == null
      ? undefined
      : model.envelope.constructions.find((candidate) => candidate.id === constructionId);
    return {
      surfaceId: surface.id,
      surfaceType: surface.type,
      boundaryCondition: valueOf(surface.boundaryCondition, scenario),
      areaSqm: numberOf(surface.areaSqm, scenario, "surface area"),
      uValueWPerM2K: construction == null
        ? null
        : numberOf(construction.uValueWPerM2K, scenario, "surface U-value"),
      threeObjectIds: surface.threeObjectId == null
        ? objectThreeIds(model, surface.id)
        : [surface.threeObjectId],
      sourceFactIds: [
        surface.areaSqm.id,
        surface.boundaryCondition.id,
        surface.constructionId.id,
        ...(construction == null ? [] : [construction.uValueWPerM2K.id]),
      ],
    };
  });
  const openings = model.geometry.openings.map((opening): EngineOpeningMapping => {
    const construction = constructionFor(model, valueOf(opening.constructionId, scenario));
    return {
      openingId: opening.id,
      hostSurfaceId: opening.hostSurfaceId,
      openingType: opening.type,
      areaSqm: numberOf(opening.areaSqm, scenario, "opening area"),
      uValueWPerM2K: numberOf(construction.uValueWPerM2K, scenario, "opening U-value"),
      threeObjectIds: opening.threeObjectId == null
        ? objectThreeIds(model, opening.id)
        : [opening.threeObjectId],
      sourceFactIds: [
        opening.areaSqm.id,
        opening.constructionId.id,
        construction.uValueWPerM2K.id,
      ],
    };
  });
  return {
    conditionedFloorAreaSqm: zones
      .filter((zone) => zone.conditioned)
      .reduce((sum, zone) => sum + zone.floorAreaSqm, 0),
    zones,
    surfaces,
    openings,
  };
}

/** Compiles a validated canonical model into the existing real engine contract. */
export function compileCanonicalModelToEngineInput(
  model: CanonicalEnergyModel,
  scenario?: EnergyScenario,
): CompiledDegreeDayInput {
  assertCanonicalEnergyModelReady(model);
  if (scenario != null) assertScenarioMatchesBaseline(scenario, model);
  const provenance: EngineInputProvenance[] = [];
  const approximations: EngineApproximation[] = [{
    id: "engine-method:degree-day-screening",
    kind: "screening_method",
    title: "Degree-day screening simulation",
    explanation: "Heating and cooling use BIMFIT's existing whole-building degree-day engine. This is a design-stage screening result, not a regulatory dynamic simulation.",
    affectedInputPaths: ["recipe", "materials", "climate"],
    sourceFactIds: [],
  }, {
    id: "engine-approximation:end-use-ratios",
    kind: "ratio_attribution",
    title: "Ratio-estimated non-HVAC end uses",
    explanation: "Lighting, domestic hot water, and plug-load results are ratio estimates anchored to the real degree-day HVAC result; their canonical schedule and density fields are not simulated by this engine.",
    affectedInputPaths: ["result.annualByEndUseKwh.lighting", "result.annualByEndUseKwh.domesticHotWater", "result.annualByEndUseKwh.equipment"],
    sourceFactIds: [model.building.useType.id],
  }, {
    id: "engine-approximation:zone-apportionment",
    kind: "area_apportionment",
    title: "Area-apportioned zone results",
    explanation: "The engine is whole-building only. Zone annual heating, cooling, and total energy are apportioned by conditioned floor area and are never presented as zone calculations.",
    affectedInputPaths: ["result.zones"],
    sourceFactIds: model.geometry.thermalZones.map((zone) => zone.floorAreaSqm.id),
  }, {
    id: "engine-unsupported:monthly-and-cooling-peak",
    kind: "unsupported_output",
    title: "Unavailable temporal and peak outputs",
    explanation: "The current engine does not calculate monthly results, time series, zone peaks, or a cooling peak. Those fields remain empty or null rather than being fabricated.",
    affectedInputPaths: ["result.monthly", "result.zones[].timeSeries", "result.zones[].peakHeatingKw", "result.zones[].peakCoolingKw", "result.peakCoolingKw"],
    sourceFactIds: [],
  }];
  const tierOneAssumption = model.assumptions.find(
    (assumption) =>
      assumption.id === "assumption.tier1-office-screening-template",
  );
  if (tierOneAssumption) {
    approximations.push({
      id: "engine-assumption:tier1-office-screening-template",
      kind: "engine_default",
      title: tierOneAssumption.title,
      explanation:
        "Assumption-heavy Tier-1 office screening template inputs are active; this run is not measured data or a compliance prediction.",
      affectedInputPaths: [
        "recipe.floors",
        "recipe.totalHeight",
        "recipe.facade",
        "materials.envelope",
        "materials.hvac",
        "materials.lighting",
        "materials.occupancy",
        "climate",
      ],
      sourceFactIds: model.facts
        .filter((fact) => fact.assumptionId === tierOneAssumption.id)
        .map((fact) => fact.id),
    });
  }
  const { recipe } = compileGeometry(model, scenario, provenance, approximations);
  const materials = compileMaterials(model, scenario, provenance, approximations);
  const climate = resolveClimate(model, scenario, provenance, approximations);
  const mapping = compileObjectMappings(model, scenario);
  const payload: DegreeDayEnginePayload = immutableSnapshot({
    canonicalModelId: model.id,
    canonicalModelVersion: model.modelVersion,
    scenarioId: scenario?.id ?? "baseline",
    scenarioDeltaIds: scenario?.deltas.map((delta) => delta.id) ?? [],
    recipe,
    materials,
    climate,
    units: {
      geometry: "m",
      area: "m2",
      volume: "m3",
      uValue: "W/(m2*K)",
      infiltration: "ACH-natural",
      ventilationEngineBoundary: "m3/h",
      energy: "kWh/year",
      designLoad: "W",
    },
    mapping,
    provenance,
    approximations,
  });
  const hashBasis = {
    schemaVersion: ENERGY_ENGINE_INPUT_SCHEMA_VERSION,
    engineId: DEGREE_DAY_ENGINE_ID,
    engineVersion: DEGREE_DAY_ENGINE_VERSION,
    adapterVersion: ENERGY_ADAPTER_VERSION,
    payload,
  };
  return immutableSnapshot({
    ...hashBasis,
    inputHash: deterministicInputHash(hashBasis),
  });
}

function isDegreeDayPayload(value: unknown): value is DegreeDayEnginePayload {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Partial<DegreeDayEnginePayload>;
  return (
    candidate.recipe != null &&
    candidate.materials != null &&
    candidate.climate != null &&
    candidate.mapping != null &&
    typeof candidate.canonicalModelId === "string" &&
    typeof candidate.scenarioId === "string"
  );
}

function assertUntamperedInput(input: EngineInputSnapshot): DegreeDayEnginePayload {
  if (input.engineId !== DEGREE_DAY_ENGINE_ID ||
      input.engineVersion !== DEGREE_DAY_ENGINE_VERSION ||
      input.adapterVersion !== ENERGY_ADAPTER_VERSION ||
      input.schemaVersion !== ENERGY_ENGINE_INPUT_SCHEMA_VERSION) {
    throw new Error("Engine input version is not supported by this adapter.");
  }
  if (!isDegreeDayPayload(input.payload)) {
    throw new Error("Engine input payload does not match the degree-day adapter contract.");
  }
  const expectedHash = deterministicInputHash({
    schemaVersion: input.schemaVersion,
    engineId: input.engineId,
    engineVersion: input.engineVersion,
    adapterVersion: input.adapterVersion,
    payload: input.payload,
  });
  if (expectedHash !== input.inputHash) {
    throw new Error("Engine input hash mismatch; the stored snapshot was changed after compilation.");
  }
  return input.payload;
}

/** Converts only outputs the real engine produced; unsupported outputs stay empty/null. */
export function parseEngineOutput(
  output: DegreeDayEngineOutput,
  input: CompiledDegreeDayInput,
): CanonicalSimulationResult {
  if (output.inputHash !== input.inputHash) {
    throw new Error("Engine output belongs to a different input snapshot.");
  }
  const area = input.payload.mapping.conditionedFloorAreaSqm;
  const conditionedZones = input.payload.mapping.zones.filter((zone) => zone.conditioned);
  const zones = conditionedZones.map((zone) => {
    const share = area > 0 ? zone.floorAreaSqm / area : 0;
    return {
      zoneId: zone.zoneId,
      annualEnergyKwh: output.systemBreakdown.total * share,
      heatingKwh: output.annualDemand.heatingDemand * share,
      coolingKwh: output.annualDemand.coolingDemand * share,
      peakHeatingKw: null,
      peakCoolingKw: null,
    };
  });
  return {
    annualEnergyKwh: output.systemBreakdown.total,
    energyUseIntensityKwhPerM2: area > 0 ? output.systemBreakdown.total / area : 0,
    annualByEndUseKwh: {
      heating: output.annualDemand.heatingDemand,
      cooling: output.annualDemand.coolingDemand,
      lighting: output.systemBreakdown.lighting,
      equipment: output.systemBreakdown.plugLoads,
      domesticHotWater: output.systemBreakdown.dhw,
    },
    monthly: [],
    zones,
    peakHeatingKw: output.heatLoss.totalHeatLoss / 1000,
    peakCoolingKw: null,
  };
}

export type RunSimulationOptions = Readonly<{
  now?: () => string;
}>;

/** Runs the production degree-day functions; no mock or fixture path exists here. */
export function runSimulation(
  input: CompiledDegreeDayInput,
  options: RunSimulationOptions = {},
): DegreeDaySimulationRun {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const exactInput = immutableSnapshot(input);
  const base = {
    id: `energy-run-${input.inputHash.replace(/[^a-z0-9]/gi, "-")}`,
    modelId: isDegreeDayPayload(input.payload) ? input.payload.canonicalModelId : "unknown",
    scenarioId: isDegreeDayPayload(input.payload) ? input.payload.scenarioId : "unknown",
    engineInput: exactInput,
    startedAt,
  };
  try {
    const payload = assertUntamperedInput(input);
    const heatLoss = calculateHeatLoss(payload.materials, payload.recipe, payload.climate);
    const annualDemand = calculateAnnualDemand(
      heatLoss,
      payload.materials,
      payload.recipe,
      payload.climate,
    );
    const systemBreakdown = calculateSystemBreakdown(
      payload.materials,
      payload.recipe,
      payload.climate,
    );
    const engineOutput: DegreeDayEngineOutput = immutableSnapshot({
      engineId: DEGREE_DAY_ENGINE_ID,
      engineVersion: DEGREE_DAY_ENGINE_VERSION,
      inputHash: input.inputHash,
      heatLoss,
      annualDemand,
      systemBreakdown,
    });
    const result = parseEngineOutput(engineOutput, input);
    return {
      ...base,
      status: "succeeded",
      result,
      engineOutput,
      logs: [
        `Validated immutable engine input ${input.inputHash}.`,
        `Executed ${DEGREE_DAY_ENGINE_ID}@${DEGREE_DAY_ENGINE_VERSION}.`,
        "Parsed annual whole-building output and preserved unsupported outputs as empty/null.",
      ],
      warnings: payload.approximations.map((entry) => entry.explanation),
      completedAt: now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown engine failure.";
    return {
      ...base,
      status: "failed",
      result: null,
      engineOutput: null,
      logs: ["Simulation did not complete; no result was persisted."],
      warnings: [],
      error: {
        kind: message.includes("input") || message.includes("adapter") ? "adapter" : "engine",
        message,
      },
      completedAt: now(),
    };
  }
}

function engineElementName(surfaceType: SurfaceType): string | undefined {
  if (surfaceType === "exterior_wall") return "Walls";
  if (surfaceType === "roof") return "Roof";
  if (surfaceType === "ground_floor") return "Ground Floor";
  return undefined;
}

function apportionedEnvelopeData(
  objects: readonly EngineSurfaceMapping[],
  output: DegreeDayEngineOutput,
): SpatialEnergyDatum[] {
  return objects.map((object) => {
    const elementName = engineElementName(object.surfaceType);
    if (elementName == null || object.boundaryCondition === "adjacent_space") {
      return {
        canonicalObjectId: object.surfaceId,
        threeObjectIds: object.threeObjectIds,
        metric: "design_heat_loss",
        value: null,
        unit: "W",
        status: "not_applicable",
        sourceFactIds: object.sourceFactIds,
        explanation: "This surface is not a separately calculated whole-building exterior heat-loss category.",
      };
    }
    const peers = objects.filter((candidate) => engineElementName(candidate.surfaceType) === elementName);
    const totalUa = peers.reduce((sum, peer) =>
      sum + peer.areaSqm * (peer.uValueWPerM2K ?? 0),
    0);
    const categoryLoss = output.heatLoss.elements.find(
      (element) => element.element === elementName,
    )?.heatLoss;
    const ua = object.areaSqm * (object.uValueWPerM2K ?? 0);
    return {
      canonicalObjectId: object.surfaceId,
      threeObjectIds: object.threeObjectIds,
      metric: "design_heat_loss",
      value: categoryLoss == null || totalUa <= 0 ? null : categoryLoss * ua / totalUa,
      unit: "W",
      status: categoryLoss == null || totalUa <= 0 ? "missing" : "area_apportioned_approximation",
      sourceFactIds: object.sourceFactIds,
      explanation: "The real whole-building category heat loss is apportioned to this surface by U×A; it is not a surface-level engine solve.",
    };
  });
}

/** Maps numerical results back to stable canonical and existing Three.js IDs. */
export function mapResultsToCanonicalObjects(
  result: CanonicalSimulationResult,
  input: CompiledDegreeDayInput,
  output: DegreeDayEngineOutput,
): SpatialEnergyMapping {
  const zoneResult = new Map(result.zones.map((zone) => [zone.zoneId, zone]));
  const zones: SpatialEnergyDatum[] = input.payload.mapping.zones.map((zone) => {
    const mapped = zoneResult.get(zone.zoneId);
    return {
      canonicalObjectId: zone.zoneId,
      threeObjectIds: zone.threeObjectIds,
      metric: "annual_energy",
      value: mapped?.annualEnergyKwh ?? null,
      unit: "kWh/year",
      status: zone.conditioned
        ? mapped == null ? "missing" : "area_apportioned_approximation"
        : "not_applicable",
      sourceFactIds: zone.sourceFactIds,
      explanation: zone.conditioned
        ? "Whole-building annual energy is apportioned by conditioned zone floor area."
        : "Unconditioned space is distinct from a conditioned zone with zero load.",
    };
  });
  const windowLoss = output.heatLoss.elements.find((element) => element.element === "Windows")?.heatLoss;
  const glazed = input.payload.mapping.openings.filter((opening) =>
    opening.openingType === "window" ||
    opening.openingType === "curtain_wall" ||
    opening.openingType === "skylight",
  );
  const totalWindowUa = glazed.reduce((sum, opening) =>
    sum + opening.areaSqm * (opening.uValueWPerM2K ?? 0),
  0);
  const openings: SpatialEnergyDatum[] = input.payload.mapping.openings.map((opening) => {
    const isGlazed = glazed.includes(opening);
    const ua = opening.areaSqm * (opening.uValueWPerM2K ?? 0);
    return {
      canonicalObjectId: opening.openingId,
      threeObjectIds: opening.threeObjectIds,
      metric: "design_heat_loss",
      value: isGlazed && windowLoss != null && totalWindowUa > 0
        ? windowLoss * ua / totalWindowUa
        : null,
      unit: "W",
      status: !isGlazed
        ? "not_applicable"
        : windowLoss == null || totalWindowUa <= 0
          ? "missing"
          : "area_apportioned_approximation",
      sourceFactIds: opening.sourceFactIds,
      explanation: isGlazed
        ? "Whole-building glazing heat loss is apportioned by opening U×A."
        : "The existing engine does not calculate a separate door heat-loss result.",
    };
  });
  return {
    zones,
    envelope: apportionedEnvelopeData(input.payload.mapping.surfaces, output),
    openings,
  };
}
