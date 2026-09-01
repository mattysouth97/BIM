/**
 * 건축물대장 → a multi-storey, source-traceable baseline energy model.
 *
 * This is the L0 rung of the twin: everything the register genuinely states is
 * carried as an extracted fact with a real source reference, and everything it
 * does not state is a **named, visible, reversible assumption** drawn from the
 * era-indexed Korean code tables. Nothing in between is invented.
 *
 * Deliberately a sibling of `tier-one-model.ts`, never an extension of it.
 * Tier-1's single storey is thirteen hardcoded singletons rather than a
 * parameter, and sharing its `modelVersion` prefix or assumption id would trip
 * the Tier-1 acceptance gate in `validation.ts`.
 *
 * Basements are recorded but NOT extruded: `envelopeQuantities` prices every
 * storey's walls against the outdoor winter temperature and there is no ISO
 * 13370 ground-coupling path in `src/lib/energy/`, so a below-grade storey
 * would be charged as if it stood in open air.
 */

import {
  AIRTIGHTNESS,
  FLOOR_HEIGHTS,
  FLOOR_U_VALUES,
  HVAC_DEFAULTS,
  LIGHTING_DEFAULTS,
  OCCUPANCY_DEFAULTS,
  ROOF_U_VALUES,
  STRUCTURE_TO_WALL_KEY,
  WALL_LAYERS,
  WALL_U_VALUES,
  WINDOW_RATIOS,
  WINDOW_SHGC,
  WINDOW_U_VALUES,
} from "@/lib/korean-building-codes";
import {
  thicknessForTargetU,
  type AssemblyLayerInput,
  type HeatFlowDirection,
} from "@/lib/energy-standards/assembly";
import {
  classifyEraExplicit,
  ledgerFloorHeightCategory,
  ledgerUseCategory,
  normalizeFloorRows,
} from "@/lib/ledger/floor-rows";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

import { collectEnergyFacts, createEnergyFact } from "./facts";
import { calculateZoneVolume, orientedEdges, polygonArea } from "./geometry";
import { stableId } from "./ids";
import type { DrawingSetIngestionResult } from "./ingestion";
import { resolveLedgerWeatherSource } from "./ledger-climate";
import { LEDGER_FOOTPRINT_ASSUMPTION_ID } from "./ledger-source";
import {
  CANONICAL_ENERGY_MODEL_VERSION,
  type AssumptionRecord,
  type CanonicalEnergyModel,
  type ConstructionAssembly,
  type EnergyFact,
  type MaterialLayer,
  type IsoDateTime,
  type MissingValueRecord,
  type Opening,
  type Polygon2D,
  type ScheduleValue,
  type SourceReference,
  type Space,
  type Storey,
  type Surface,
  type ThermalZone,
} from "./types";
import { validateCanonicalEnergyModel } from "./validation";

export const LEDGER_BASELINE_MODEL_VERSION = "ledger-baseline-v1";

export const LEDGER_ENVELOPE_ASSUMPTION_ID =
  "assumption.ledger-era-envelope-defaults";
export const LEDGER_SYSTEMS_ASSUMPTION_ID =
  "assumption.ledger-era-systems-defaults";
export const LEDGER_USAGE_ASSUMPTION_ID =
  "assumption.ledger-era-usage-defaults";
export const LEDGER_BASEMENT_ASSUMPTION_ID =
  "assumption.ledger-basement-excluded";
export const LEDGER_ERA_UNKNOWN_ASSUMPTION_ID =
  "assumption.ledger-era-unknown";
export { LEDGER_FOOTPRINT_ASSUMPTION_ID };

/** Every assumption id this builder can attach, for UI grouping. */
export const LEDGER_ASSUMPTION_IDS = Object.freeze([
  LEDGER_ENVELOPE_ASSUMPTION_ID,
  LEDGER_SYSTEMS_ASSUMPTION_ID,
  LEDGER_USAGE_ASSUMPTION_ID,
  LEDGER_FOOTPRINT_ASSUMPTION_ID,
  LEDGER_BASEMENT_ASSUMPTION_ID,
  LEDGER_ERA_UNKNOWN_ASSUMPTION_ID,
]);

export type LedgerInsufficientReason =
  | "rejected_source"
  | "no_boundary"
  | "invalid_boundary"
  | "missing_footprint_area"
  | "missing_floor_count"
  | "non_positive_height"
  | "climate_unresolvable";

export type LedgerBaselineOutcome =
  | Readonly<{
      status: "created";
      model: CanonicalEnergyModel;
      storeyCount: number;
      boundaryId: string;
      /** Below-grade storeys recorded but excluded from the thermal model. */
      excludedBasementCount: number;
      excludedBasementAreaSqm: number;
    }>
  | Readonly<{
      status: "insufficient_ledger";
      reason: LedgerInsufficientReason;
      message: string;
    }>;

export type LedgerBaselineInput = Readonly<{
  ingestion: DrawingSetIngestionResult;
  title: BrTitleInfo;
  floors?: readonly BrFloorInfo[];
  locale: "ko" | "en";
  now?: IsoDateTime;
}>;

// ── Fact constructors ───────────────────────────────────────────────────────

/**
 * A value read from an era-indexed code table. Never carries a source
 * reference: nothing in the register is evidence for a U-value, and a
 * "convenience" helper that attached the register's refs to a defaulted fact
 * is precisely how this guarantee would die.
 */
function assumptionFact<T>(
  key: string,
  value: T,
  now: IsoDateTime,
  assumptionId: string,
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
    assumptionId,
    reviewedByUser: false,
    createdAt: now,
  });
}

function uniqueSourceRefs(
  facts: readonly EnergyFact<unknown>[],
): readonly SourceReference[] {
  return Object.freeze([
    ...new Map(
      facts
        .flatMap((fact) => fact.sourceRefs)
        .map((source) => [source.id, source]),
    ).values(),
  ]);
}

/**
 * A value computed by a deterministic rule over registered facts.
 *
 * `assumptionId` is set when the rule also consumes an era code-table value
 * (window areas, for instance, are a real measured perimeter multiplied by a
 * defaulted window-to-wall ratio). Naming the assumption keeps the default
 * visible instead of letting it hide inside an "inferred" label.
 */
function inferredFact<T>(
  key: string,
  value: T,
  sourceFacts: readonly EnergyFact<unknown>[],
  now: IsoDateTime,
  unit?: string,
  assumptionId?: string,
): EnergyFact<T> {
  const sourceRefs = uniqueSourceRefs(sourceFacts);
  if (sourceRefs.length === 0) {
    throw new Error(`Ledger inference ${key} has no source evidence.`);
  }
  const confidences = sourceFacts
    .map((fact) => fact.confidence)
    .filter((candidate): candidate is number => candidate != null);
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "inferred",
    confidence: confidences.length > 0 ? Math.min(...confidences) : null,
    sourceRefs,
    extractionMethod: "rule_inference",
    authority: "deterministic_rule_inference",
    ...(assumptionId ? { assumptionId } : {}),
    reviewedByUser: false,
    createdAt: now,
  });
}

function factForKey<T>(
  ingestion: DrawingSetIngestionResult,
  key: string,
): EnergyFact<T> | undefined {
  return ingestion.extractedFacts.find((fact) => fact.key === key) as
    | EnergyFact<T>
    | undefined;
}

function insufficient(
  reason: LedgerInsufficientReason,
  message: string,
): LedgerBaselineOutcome {
  return Object.freeze({ status: "insufficient_ledger" as const, reason, message });
}

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

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildLedgerBaselineModel(
  input: LedgerBaselineInput,
): LedgerBaselineOutcome {
  const { ingestion, title, locale } = input;
  const now = input.now ?? new Date().toISOString();

  if (ingestion.rejectedFiles.length > 0) {
    return insufficient(
      "rejected_source",
      "The building-register source was rejected during ingestion.",
    );
  }

  const registerDocument = ingestion.drawingSet.documents.find(
    (document) =>
      document.classification.documentType === "building_register_record",
  );
  if (!registerDocument) {
    return insufficient(
      "rejected_source",
      "No building-register document is present in the drawing set.",
    );
  }

  const extractedBoundary = ingestion.extractedBoundaries.find(
    (boundary) => boundary.documentId === registerDocument.id,
  );
  if (!extractedBoundary || extractedBoundary.polygon.value == null) {
    return insufficient(
      "no_boundary",
      "No building outline is available: the register states no 건축면적 and no measured outline was supplied.",
    );
  }
  // Bound after the guard: TypeScript discards this narrowing inside the
  // per-storey closures below.
  const boundaryPolygonFact: EnergyFact<Polygon2D> = extractedBoundary.polygon;
  const boundaryAreaFact: EnergyFact<number> = extractedBoundary.areaSqm;
  const boundaryRecordId: string = extractedBoundary.id;
  const boundary: Polygon2D = extractedBoundary.polygon.value;
  const rawBoundaryArea = boundaryAreaFact.value;
  if (rawBoundaryArea == null || !(rawBoundaryArea > 0)) {
    return insufficient("invalid_boundary", "The building outline encloses no area.");
  }
  const boundaryAreaSqm: number = rawBoundaryArea;

  // ── Registered scalars ────────────────────────────────────────────────
  const archAreaFact = factForKey<number>(ingestion, "ledger.archAreaSqm");
  const totAreaFact = factForKey<number>(ingestion, "ledger.totAreaSqm");
  const aboveCountFact = factForKey<number>(ingestion, "ledger.grndFlrCnt");
  const heightFact = factForKey<number>(ingestion, "ledger.heightM");
  const useFact = factForKey<string>(ingestion, "ledger.mainPurpsCd");
  const strctFact = factForKey<string>(ingestion, "ledger.strctCd");
  const addressFact = factForKey<string>(ingestion, "ledger.platPlcNm");
  const nameFact = factForKey<string>(ingestion, "ledger.bldNm");

  if (archAreaFact?.value == null) {
    return insufficient(
      "missing_footprint_area",
      "The register states no 건축면적 (a value of 0 means unavailable, not zero).",
    );
  }
  const aboveCount = Math.round(Number(aboveCountFact?.value ?? 0));
  if (!Number.isFinite(aboveCount) || aboveCount < 1 || !aboveCountFact) {
    return insufficient(
      "missing_floor_count",
      "The register states no above-ground storey count (지상층수).",
    );
  }

  const weather = resolveLedgerWeatherSource(title);
  if (!weather) {
    return insufficient(
      "climate_unresolvable",
      "The building's region could not be determined from 시군구코드 or the address, so no climate file can be chosen.",
    );
  }

  // ── Era and use ───────────────────────────────────────────────────────
  const eraResolution = classifyEraExplicit({
    useAprDay: title.useAprDay,
    pmsDay: title.pmsDay,
  });
  const era = eraResolution.era;
  const mainPurpsCd = String(useFact?.value ?? title.mainPurpsCd ?? "").trim();
  const useCategory = ledgerUseCategory(mainPurpsCd);
  const isResidential = useCategory === "residential";
  const heightCategory = ledgerFloorHeightCategory(mainPurpsCd);

  // Height: registered 높이 divided by the registered storey count, else the
  // era/use floor height. A registered 0 already emitted no fact.
  const registeredHeight = heightFact?.value ?? null;
  const storeyHeightM =
    registeredHeight != null && registeredHeight > 0
      ? registeredHeight / aboveCount
      : FLOOR_HEIGHTS[era][heightCategory];
  if (!(storeyHeightM > 0)) {
    return insufficient(
      "non_positive_height",
      "A positive floor-to-floor height could not be derived.",
    );
  }
  const storeyHeightFact =
    registeredHeight != null && registeredHeight > 0
      ? inferredFact(
          "geometry.storeyHeightM",
          storeyHeightM,
          [heightFact!, aboveCountFact],
          now,
          "m",
        )
      : assumptionFact(
          "geometry.storeyHeightM",
          storeyHeightM,
          now,
          LEDGER_ENVELOPE_ASSUMPTION_ID,
          "m",
        );

  // ── Per-storey areas ──────────────────────────────────────────────────
  const rows = normalizeFloorRows(title, input.floors ?? []);
  const aboveRows = new Map<number, BrFloorInfo>();
  let excludedBasementCount = 0;
  let excludedBasementAreaSqm = 0;
  for (const row of rows) {
    const floorNo = Number(row.flrNo);
    const below = (row.flrGbCdNm || "").includes("지하") || floorNo < 0;
    if (below) {
      excludedBasementCount += 1;
      excludedBasementAreaSqm += Math.max(0, Number(row.area) || 0);
      continue;
    }
    aboveRows.set(Math.abs(floorNo), row);
  }
  if (excludedBasementCount === 0) {
    const declared = Math.round(Number(title.ugrndFlrCnt) || 0);
    if (declared > 0) excludedBasementCount = declared;
  }

  const drawingSetId = ingestion.drawingSet.id;
  const buildingId = stableId("building-ledger", drawingSetId);

  type StoreyArea = Readonly<{
    value: number;
    fact: EnergyFact<number>;
    sources: readonly EnergyFact<unknown>[];
  }>;

  /**
   * Registered floor area for a storey, else an even share of 연면적, else the
   * outline area. An arrow function rather than a declaration: TypeScript
   * discards the boundary narrowing above inside a hoisted function body.
   */
  const storeyAreaFact = (storeyIndex: number, zoneId: string): StoreyArea => {
    const floorNo = storeyIndex + 1;
    const registered = factForKey<number>(
      ingestion,
      `ledger.floor.above.${floorNo}.areaSqm`,
    );
    if (registered && registered.value != null && registered.value > 0) {
      return {
        value: registered.value,
        fact: registered,
        sources: [registered],
      };
    }
    if (totAreaFact?.value != null && totAreaFact.value > 0) {
      const share =
        (totAreaFact.value - excludedBasementAreaSqm > 0
          ? totAreaFact.value - excludedBasementAreaSqm
          : totAreaFact.value) / aboveCount;
      if (share > 0) {
        return {
          value: share,
          fact: inferredFact(
            `zone.${zoneId}.floorAreaSqm`,
            share,
            [totAreaFact, aboveCountFact],
            now,
            "m2",
          ),
          sources: [totAreaFact, aboveCountFact] as readonly EnergyFact<unknown>[],
        };
      }
    }
    return {
      value: boundaryAreaSqm,
      fact: inferredFact(
        `zone.${zoneId}.floorAreaSqm`,
        boundaryAreaSqm,
        [boundaryAreaFact],
        now,
        "m2",
      ),
      sources: [boundaryAreaFact],
    };
  };

  const geometrySources: readonly EnergyFact<unknown>[] = Object.freeze([
    boundaryPolygonFact,
    boundaryAreaFact,
  ]);

  /**
   * A value derived from other facts, which degrades to a named assumption
   * when none of its inputs carry evidence.
   *
   * This is not a nicety: when the register states no 높이 (a documented zero),
   * the storey height comes from the era table and carries no source refs, so
   * anything derived from it alone — window height, sill height — has nothing
   * to cite. `inferredFact` correctly refuses to invent evidence, so the
   * honest result is an assumption, not a crash.
   */
  const derivedFact = (
    key: string,
    value: number,
    sources: readonly EnergyFact<unknown>[],
    unit: string,
    assumptionId: string,
  ): EnergyFact<number> =>
    sources.some((fact) => fact.sourceRefs.length > 0)
      ? inferredFact(key, value, sources, now, unit, assumptionId)
      : assumptionFact(key, value, now, assumptionId, unit);

  // Orientation is not on the register. 0 deg is a stated template value.
  const northOrientationDeg = assumptionFact(
    "site.northOrientationDeg",
    0,
    now,
    LEDGER_ENVELOPE_ASSUMPTION_ID,
    "deg",
  );

  // ── Storeys, plates, spaces, zones ────────────────────────────────────
  const storeys: Storey[] = [];
  const floorPlates: CanonicalEnergyModel["geometry"]["floorPlates"][number][] = [];
  const spaces: Space[] = [];
  const zones: ThermalZone[] = [];
  const storeyIds: string[] = [];
  const spaceIds: string[] = [];
  const zoneIds: string[] = [];
  const storeyAreas: number[] = [];

  for (let index = 0; index < aboveCount; index += 1) {
    const storeyId = stableId("storey-ledger", drawingSetId, index + 1);
    const plateId = stableId("plate-ledger", drawingSetId, index + 1);
    const spaceId = stableId("space-ledger", drawingSetId, index + 1);
    const zoneId = stableId("zone-ledger", drawingSetId, index + 1);
    storeyIds.push(storeyId);
    spaceIds.push(spaceId);
    zoneIds.push(zoneId);

    const area = storeyAreaFact(index, zoneId);
    storeyAreas.push(area.value);

    storeys.push(
      Object.freeze({
        id: storeyId,
        name: `${index + 1}F`,
        elevationM: inferredFact(
          `geometry.storey.${storeyId}.elevationM`,
          index * storeyHeightM,
          [storeyHeightFact, aboveCountFact],
          now,
          "m",
        ),
        floorToFloorHeightM: storeyHeightFact,
        floorPlateIds: Object.freeze([plateId]),
        spaceIds: Object.freeze([spaceId]),
      }),
    );

    floorPlates.push(
      Object.freeze({
        id: plateId,
        storeyId,
        boundary: boundaryPolygonFact,
        areaSqm: boundaryAreaFact,
        voidBoundaries: Object.freeze([]),
        sourceEntityIds: Object.freeze([boundaryRecordId]),
      }),
    );

    spaces.push(
      Object.freeze({
        id: spaceId,
        name: inferredFact(
          `space.${spaceId}.name`,
          `${index + 1}F`,
          [aboveCountFact],
          now,
        ),
        storeyId,
        boundary: boundaryPolygonFact,
        floorAreaSqm: area.fact,
        volumeM3: inferredFact(
          `space.${spaceId}.volumeM3`,
          calculateZoneVolume(area.value, storeyHeightM),
          [...area.sources, storeyHeightFact],
          now,
          "m3",
        ),
        conditioned: assumptionFact(
          `space.${spaceId}.conditioned`,
          true,
          now,
          LEDGER_USAGE_ASSUMPTION_ID,
        ),
        spaceType: inferredFact(
          `space.${spaceId}.spaceType`,
          mainPurpsCd || "00000",
          useFact ? [useFact] : [aboveCountFact],
          now,
        ),
        thermalZoneId: zoneId,
        adjacentSpaceIds: Object.freeze([]),
        isCore: false,
        isAtrium: false,
      }),
    );

    zones.push(
      Object.freeze({
        id: zoneId,
        name: inferredFact(
          `zone.${zoneId}.name`,
          `${index + 1}F zone`,
          [aboveCountFact],
          now,
        ),
        sourceSpaceIds: Object.freeze([spaceId]),
        storeyIds: Object.freeze([storeyId]),
        conditioned: assumptionFact(
          `zone.${zoneId}.conditioned`,
          true,
          now,
          LEDGER_USAGE_ASSUMPTION_ID,
        ),
        floorAreaSqm: area.fact,
        volumeM3: inferredFact(
          `zone.${zoneId}.volumeM3`,
          calculateZoneVolume(area.value, storeyHeightM),
          [...area.sources, storeyHeightFact],
          now,
          "m3",
        ),
        orientationBand: assumptionFact(
          `zone.${zoneId}.orientationBand`,
          "mixed" as const,
          now,
          LEDGER_USAGE_ASSUMPTION_ID,
        ),
        usageProfileId: "usage-ledger-main",
        hvacSystemIds: Object.freeze(["hvac-ledger-main"]),
        stableKey: stableId("zone-key-ledger", drawingSetId, index + 1),
      }),
    );
  }

  // ── Envelope constructions (four, shared by every storey) ─────────────
  const wallU = isResidential
    ? WALL_U_VALUES[era].residential
    : WALL_U_VALUES[era].nonResidential;
  const roofU = isResidential
    ? ROOF_U_VALUES[era].residential
    : ROOF_U_VALUES[era].nonResidential;
  const groundU = isResidential
    ? FLOOR_U_VALUES[era].residential
    : FLOOR_U_VALUES[era].nonResidential;
  const windowU = WINDOW_U_VALUES[era];
  const windowShgc = WINDOW_SHGC[era];
  const wwr = WINDOW_RATIOS[era][useCategory] ?? WINDOW_RATIOS[era].default;
  // The code tables state ACH50 (a blower-door pressurisation figure); the
  // engine wants a natural air-change rate. The conventional divide-by-20
  // ("n50/20") rule applies. Getting this wrong overstates ventilation loss
  // twentyfold while still looking like an ordinary building.
  const naturalAch = AIRTIGHTNESS[era] / 20;

  function envelopeFact(key: string, value: number, unit: string) {
    return assumptionFact(key, value, now, LEDGER_ENVELOPE_ASSUMPTION_ID, unit);
  }

  // ── Assumed layer compositions ────────────────────────────────────────
  // The register states the structure family (구조코드); the era table states
  // the assembly U. Neither states the layer build-up, so the layers below
  // are a named assumption: the structure family's conventional stack with
  // its insulation thickness SOLVED so the ISO-6946 layer sum reproduces the
  // era-table U exactly. When no physical insulation thickness can reach the
  // era U (very leaky pre-code walls on a resistive stack), no layers are
  // emitted — an inconsistent stack would be an invented fact.
  type RawLayer = Readonly<{
    name: string;
    thicknessM: number;
    conductivityWPerMK?: number;
    fixedResistanceM2KPerW?: number;
    densityKgPerM3: number;
    specificHeatJPerKgK: number;
  }>;

  const wallKey = STRUCTURE_TO_WALL_KEY[String(strctFact?.value ?? "").trim()] ?? "rc";
  const wallStack: readonly RawLayer[] = (WALL_LAYERS[wallKey] ?? WALL_LAYERS.rc).map(
    (layer) =>
      layer.name.includes("공기층")
        ? // Still-air conduction over-credits a cavity; use the KS-practice
          // cavity resistance instead of d/λ.
          {
            name: layer.name,
            thicknessM: layer.thickness / 1000,
            fixedResistanceM2KPerW: 0.17,
            densityKgPerM3: layer.density,
            specificHeatJPerKgK: layer.specificHeat,
          }
        : {
            name: layer.name,
            thicknessM: layer.thickness / 1000,
            conductivityWPerMK: layer.thermalConductivity,
            densityKgPerM3: layer.density,
            specificHeatJPerKgK: layer.specificHeat,
          },
  );
  const roofStack: readonly RawLayer[] = [
    { name: "방수층", thicknessM: 0.01, conductivityWPerMK: 0.17, densityKgPerM3: 1200, specificHeatJPerKgK: 1000 },
    { name: "단열재(XPS)", thicknessM: 0.1, conductivityWPerMK: 0.034, densityKgPerM3: 30, specificHeatJPerKgK: 1450 },
    { name: "콘크리트 슬래브", thicknessM: 0.15, conductivityWPerMK: 1.6, densityKgPerM3: 2300, specificHeatJPerKgK: 880 },
    { name: "천장 마감", thicknessM: 0.01, conductivityWPerMK: 0.17, densityKgPerM3: 750, specificHeatJPerKgK: 1090 },
  ];
  const groundStack: readonly RawLayer[] = [
    { name: "마감 모르타르", thicknessM: 0.04, conductivityWPerMK: 1.4, densityKgPerM3: 2000, specificHeatJPerKgK: 920 },
    { name: "단열재(XPS)", thicknessM: 0.1, conductivityWPerMK: 0.034, densityKgPerM3: 30, specificHeatJPerKgK: 1450 },
    { name: "콘크리트 슬래브", thicknessM: 0.15, conductivityWPerMK: 1.6, densityKgPerM3: 2300, specificHeatJPerKgK: 880 },
  ];

  function assumedLayers(
    constructionId: string,
    stack: readonly RawLayer[],
    direction: HeatFlowDirection,
    targetU: number,
  ): readonly MaterialLayer[] {
    const inputs: AssemblyLayerInput[] = stack.map((layer, index) => ({
      id: `${constructionId}-layer-${index}`,
      thicknessM: layer.thicknessM,
      ...(layer.fixedResistanceM2KPerW !== undefined
        ? { fixedResistanceM2KPerW: layer.fixedResistanceM2KPerW }
        : { conductivityWPerMK: layer.conductivityWPerMK }),
    }));
    const insulationIndex = stack.findIndex((layer) => layer.name.includes("단열재"));
    if (insulationIndex < 0) return Object.freeze([]);
    const solved = thicknessForTargetU(
      inputs,
      direction,
      `${constructionId}-layer-${insulationIndex}`,
      targetU,
    );
    if (solved === null) return Object.freeze([]);
    return Object.freeze(
      stack.map((layer, index) => {
        const thicknessM = index === insulationIndex ? solved : layer.thicknessM;
        const base = `envelope.construction.${constructionId}.layers.${index}`;
        return Object.freeze({
          id: `${constructionId}-layer-${index}`,
          name: assumptionFact(`${base}.name`, layer.name, now, LEDGER_ENVELOPE_ASSUMPTION_ID),
          thicknessM: envelopeFact(`${base}.thicknessM`, thicknessM, "m"),
          conductivityWPerMK: envelopeFact(
            `${base}.conductivityWPerMK`,
            layer.conductivityWPerMK ??
              // A cavity credited at fixed R is stored with the equivalent
              // conductance so the layer round-trips through the calculator.
              thicknessM / (layer.fixedResistanceM2KPerW ?? 0.17),
            "W/mK",
          ),
          densityKgPerM3: envelopeFact(`${base}.densityKgPerM3`, layer.densityKgPerM3, "kg/m3"),
          specificHeatJPerKgK: envelopeFact(
            `${base}.specificHeatJPerKgK`,
            layer.specificHeatJPerKgK,
            "J/kgK",
          ),
        });
      }),
    );
  }

  function assembly(
    id: string,
    name: string,
    kind: ConstructionAssembly["kind"],
    uValue: number,
    shgc: number,
    visibleTransmittance: number,
    layers: readonly MaterialLayer[] = Object.freeze([]),
  ): ConstructionAssembly {
    const uFact = envelopeFact(
      `envelope.construction.${id}.uValueWPerM2K`,
      uValue,
      "W/m2K",
    );
    return Object.freeze({
      id,
      name: assumptionFact(
        `envelope.construction.${id}.name`,
        name,
        now,
        LEDGER_ENVELOPE_ASSUMPTION_ID,
      ),
      kind,
      layers,
      uValueWPerM2K: uFact,
      rValueM2KPerW: assumptionFact(
        `envelope.construction.${id}.rValueM2KPerW`,
        Math.round((1 / uValue) * 1_000) / 1_000,
        now,
        LEDGER_ENVELOPE_ASSUMPTION_ID,
        "m2K/W",
      ),
      shgc: envelopeFact(`envelope.construction.${id}.shgc`, shgc, "-"),
      visibleTransmittance: envelopeFact(
        `envelope.construction.${id}.visibleTransmittance`,
        visibleTransmittance,
        "-",
      ),
    });
  }

  const wallConstruction = assembly(
    "ledger-construction-wall",
    `외벽 · ${era} 코드 기본값`,
    "opaque",
    wallU,
    0,
    0,
    assumedLayers("ledger-construction-wall", wallStack, "horizontal", wallU),
  );
  const roofConstruction = assembly(
    "ledger-construction-roof",
    `지붕 · ${era} 코드 기본값`,
    "opaque",
    roofU,
    0,
    0,
    assumedLayers("ledger-construction-roof", roofStack, "upward", roofU),
  );
  const groundConstruction = assembly(
    "ledger-construction-ground",
    `최하층 바닥 · ${era} 코드 기본값`,
    "opaque",
    groundU,
    0,
    0,
    assumedLayers("ledger-construction-ground", groundStack, "downward", groundU),
  );
  const windowConstruction = assembly(
    "ledger-construction-window",
    `창호 · ${era} 코드 기본값`,
    "window",
    windowU,
    windowShgc,
    0.6,
  );

  // ── Surfaces and openings ─────────────────────────────────────────────
  const edges = orientedEdges(boundary);
  const surfaces: Surface[] = [];
  const openings: Opening[] = [];

  for (let storeyIndex = 0; storeyIndex < aboveCount; storeyIndex += 1) {
    for (const edge of edges) {
      const surfaceId = `surface-ledger-${storeyIndex + 1}-wall-${edge.index + 1}`;
      const openingId = `opening-ledger-${storeyIndex + 1}-window-${edge.index + 1}`;
      const wallAreaSqm = edge.lengthM * storeyHeightM;
      const windowAreaSqm = wallAreaSqm * wwr;
      // A window no taller than 60% of the storey, centred, so the sill is a
      // plausible height and the width never exceeds the wall it sits in.
      const windowHeightM = Math.max(
        0.6,
        Math.min(storeyHeightM * 0.6, storeyHeightM - 0.6),
      );
      const windowWidthM = windowAreaSqm / windowHeightM;
      const sillHeightM =
        Math.round(Math.max(0, (storeyHeightM - windowHeightM) / 2) * 100) / 100;

      const hasWindow = windowAreaSqm > 0.01 && windowWidthM > 0.01;
      surfaces.push(
        Object.freeze({
          id: surfaceId,
          type: "exterior_wall" as const,
          storeyId: storeyIds[storeyIndex],
          spaceId: spaceIds[storeyIndex],
          adjacentSpaceId: null,
          boundaryCondition: inferredFact(
            `surface.${surfaceId}.boundaryCondition`,
            "outdoors" as const,
            geometrySources,
            now,
          ),
          geometry: inferredFact(
            `surface.${surfaceId}.geometry`,
            Object.freeze([edge.start, edge.end]) as unknown as Polygon2D,
            geometrySources,
            now,
            "m",
          ),
          areaSqm: inferredFact(
            `surface.${surfaceId}.areaSqm`,
            wallAreaSqm,
            [...geometrySources, storeyHeightFact],
            now,
            "m2",
          ),
          azimuthDeg: inferredFact(
            `surface.${surfaceId}.azimuthDeg`,
            (edge.outwardAzimuthDeg + (northOrientationDeg.value ?? 0)) % 360,
            geometrySources,
            now,
            "deg",
          ),
          tiltDeg: inferredFact(
            `surface.${surfaceId}.tiltDeg`,
            90,
            geometrySources,
            now,
            "deg",
          ),
          constructionId: assumptionFact(
            `surface.${surfaceId}.constructionId`,
            wallConstruction.id,
            now,
            LEDGER_ENVELOPE_ASSUMPTION_ID,
          ),
          openingIds: hasWindow ? Object.freeze([openingId]) : Object.freeze([]),
          threeObjectId: `three-${surfaceId}`,
        }),
      );

      if (!hasWindow) continue;
      openings.push(
        Object.freeze({
          id: openingId,
          type: "window" as const,
          hostSurfaceId: surfaceId,
          areaSqm: inferredFact(
            `opening.${openingId}.areaSqm`,
            windowAreaSqm,
            [...geometrySources, storeyHeightFact],
            now,
            "m2",
            LEDGER_ENVELOPE_ASSUMPTION_ID,
          ),
          widthM: inferredFact(
            `opening.${openingId}.widthM`,
            windowWidthM,
            geometrySources,
            now,
            "m",
            LEDGER_ENVELOPE_ASSUMPTION_ID,
          ),
          heightM: derivedFact(
            `opening.${openingId}.heightM`,
            windowHeightM,
            [storeyHeightFact],
            "m",
            LEDGER_ENVELOPE_ASSUMPTION_ID,
          ),
          sillHeightM: derivedFact(
            `opening.${openingId}.sillHeightM`,
            sillHeightM,
            [storeyHeightFact],
            "m",
            LEDGER_ENVELOPE_ASSUMPTION_ID,
          ),
          constructionId: assumptionFact(
            `opening.${openingId}.constructionId`,
            windowConstruction.id,
            now,
            LEDGER_ENVELOPE_ASSUMPTION_ID,
          ),
          geometryRef: inferredFact(
            `opening.${openingId}.geometryRef`,
            surfaceId,
            geometrySources,
            now,
          ),
          threeObjectId: `three-${openingId}`,
        }),
      );
    }
  }

  // Ground floor on the lowest above-grade storey; roof on the topmost.
  surfaces.push(
    Object.freeze({
      id: "surface-ledger-ground",
      type: "ground_floor" as const,
      storeyId: storeyIds[0],
      spaceId: spaceIds[0],
      adjacentSpaceId: null,
      boundaryCondition: inferredFact(
        "surface.surface-ledger-ground.boundaryCondition",
        "ground" as const,
        geometrySources,
        now,
      ),
      geometry: inferredFact(
        "surface.surface-ledger-ground.geometry",
        boundary,
        geometrySources,
        now,
        "m",
      ),
      areaSqm: inferredFact(
        "surface.surface-ledger-ground.areaSqm",
        polygonArea(boundary),
        geometrySources,
        now,
        "m2",
      ),
      azimuthDeg: inferredFact(
        "surface.surface-ledger-ground.azimuthDeg",
        0,
        geometrySources,
        now,
        "deg",
      ),
      tiltDeg: inferredFact(
        "surface.surface-ledger-ground.tiltDeg",
        180,
        geometrySources,
        now,
        "deg",
      ),
      constructionId: assumptionFact(
        "surface.surface-ledger-ground.constructionId",
        groundConstruction.id,
        now,
        LEDGER_ENVELOPE_ASSUMPTION_ID,
      ),
      openingIds: Object.freeze([]),
      threeObjectId: "three-surface-ledger-ground",
    }),
    Object.freeze({
      id: "surface-ledger-roof",
      type: "roof" as const,
      storeyId: storeyIds[aboveCount - 1],
      spaceId: spaceIds[aboveCount - 1],
      adjacentSpaceId: null,
      boundaryCondition: inferredFact(
        "surface.surface-ledger-roof.boundaryCondition",
        "outdoors" as const,
        geometrySources,
        now,
      ),
      geometry: inferredFact(
        "surface.surface-ledger-roof.geometry",
        boundary,
        geometrySources,
        now,
        "m",
      ),
      areaSqm: inferredFact(
        "surface.surface-ledger-roof.areaSqm",
        polygonArea(boundary),
        geometrySources,
        now,
        "m2",
      ),
      azimuthDeg: inferredFact(
        "surface.surface-ledger-roof.azimuthDeg",
        0,
        geometrySources,
        now,
        "deg",
      ),
      tiltDeg: inferredFact(
        "surface.surface-ledger-roof.tiltDeg",
        0,
        geometrySources,
        now,
        "deg",
      ),
      constructionId: assumptionFact(
        "surface.surface-ledger-roof.constructionId",
        roofConstruction.id,
        now,
        LEDGER_ENVELOPE_ASSUMPTION_ID,
      ),
      openingIds: Object.freeze([]),
      threeObjectId: "three-surface-ledger-roof",
    }),
  );

  // ── Usage and systems ─────────────────────────────────────────────────
  const lighting = LIGHTING_DEFAULTS[mainPurpsCd] ?? LIGHTING_DEFAULTS.default;
  const occupancy = OCCUPANCY_DEFAULTS[mainPurpsCd] ?? OCCUPANCY_DEFAULTS.default;
  const hvacDefaults = HVAC_DEFAULTS[mainPurpsCd] ?? HVAC_DEFAULTS.default;

  function usageFact<T>(key: string, value: T, unit?: string) {
    return assumptionFact(key, value, now, LEDGER_USAGE_ASSUMPTION_ID, unit);
  }
  function systemsFact<T>(key: string, value: T, unit?: string) {
    return assumptionFact(key, value, now, LEDGER_SYSTEMS_ASSUMPTION_ID, unit);
  }

  const usage = Object.freeze({
    id: "usage-ledger-main",
    name: usageFact("usage.usage-ledger-main.name", `${era} 용도 기본 운전 프로파일`),
    spaceType: inferredFact(
      "usage.usage-ledger-main.spaceType",
      mainPurpsCd || "00000",
      useFact ? [useFact] : [aboveCountFact],
      now,
    ),
    occupancyDensityPeoplePerSqm: usageFact(
      "usage.usage-ledger-main.occupancyDensityPeoplePerSqm",
      occupancy.density,
      "people/m2",
    ),
    occupancySchedule: usageFact(
      "usage.usage-ledger-main.occupancySchedule",
      occupiedSchedule,
    ),
    lightingPowerDensityWPerSqm: usageFact(
      "usage.usage-ledger-main.lightingPowerDensityWPerSqm",
      lighting.lpd,
      "W/m2",
    ),
    lightingSchedule: usageFact(
      "usage.usage-ledger-main.lightingSchedule",
      occupiedSchedule,
    ),
    equipmentPowerDensityWPerSqm: usageFact(
      "usage.usage-ledger-main.equipmentPowerDensityWPerSqm",
      occupancy.internalGain,
      "W/m2",
    ),
    equipmentSchedule: usageFact(
      "usage.usage-ledger-main.equipmentSchedule",
      occupiedSchedule,
    ),
    ventilationLpsPerPerson: usageFact(
      "usage.usage-ledger-main.ventilationLpsPerPerson",
      10,
      "L/s/person",
    ),
    heatingSetpointC: usageFact(
      "usage.usage-ledger-main.heatingSetpointC",
      isResidential ? 22 : 20,
      "C",
    ),
    coolingSetpointC: usageFact(
      "usage.usage-ledger-main.coolingSetpointC",
      26,
      "C",
    ),
    operatingHours: usageFact(
      "usage.usage-ledger-main.operatingHours",
      isResidential ? "Daily 00:00-24:00" : "Mon-Fri 08:00-18:00",
    ),
    holidaySchedule: usageFact(
      "usage.usage-ledger-main.holidaySchedule",
      Object.freeze([]) as readonly string[],
    ),
  });

  const totalConditionedArea = storeyAreas.reduce((sum, area) => sum + area, 0);
  const hasCooling = hvacDefaults.coolingEfficiency > 0;
  const hvac = Object.freeze({
    id: "hvac-ledger-main",
    name: systemsFact("systems.hvac-ledger-main.name", "대장 연식 기반 기본 설비"),
    systemType: systemsFact(
      "systems.hvac-ledger-main.systemType",
      hvacDefaults.heatingType,
    ),
    servedZoneIds: systemsFact(
      "systems.hvac-ledger-main.servedZoneIds",
      Object.freeze([...zoneIds]) as readonly string[],
    ),
    heatingSource: systemsFact(
      "systems.hvac-ledger-main.heatingSource",
      hvacDefaults.fuelType,
    ),
    // The validator and the adapter both require this exact lowercase token
    // when there is no cooling plant.
    coolingSource: systemsFact(
      "systems.hvac-ledger-main.coolingSource",
      hasCooling ? hvacDefaults.coolingType : "none",
    ),
    distributionSystem: systemsFact(
      "systems.hvac-ledger-main.distributionSystem",
      "unknown",
    ),
    capacityKw: systemsFact(
      "systems.hvac-ledger-main.capacityKw",
      Math.round(totalConditionedArea * 0.1 * 10) / 10,
      "kW",
    ),
    heatingEfficiency: systemsFact(
      "systems.hvac-ledger-main.heatingEfficiency",
      hvacDefaults.heatingEfficiency,
      "-",
    ),
    coolingCop: systemsFact(
      "systems.hvac-ledger-main.coolingCop",
      hvacDefaults.coolingEfficiency,
      "COP",
    ),
    outdoorAirStrategy: systemsFact(
      "systems.hvac-ledger-main.outdoorAirStrategy",
      "unknown",
    ),
    heatRecoveryEfficiency: systemsFact(
      "systems.hvac-ledger-main.heatRecoveryEfficiency",
      0,
      "-",
    ),
    ventilationLps: systemsFact(
      "systems.hvac-ledger-main.ventilationLps",
      Math.round(totalConditionedArea * occupancy.density * 10 * 10) / 10,
      "L/s",
    ),
    controlSchedule: systemsFact(
      "systems.hvac-ledger-main.controlSchedule",
      hvacSchedule,
    ),
    threeObjectIds: Object.freeze([]),
  });

  // ── Assumptions and missing values ────────────────────────────────────
  const eraLabel = eraResolution.resolved
    ? `${era} (${eraResolution.sourceField === "useAprDay" ? "사용승인일" : "허가일"} ${eraResolution.rawValue})`
    : `${era} (등록된 날짜 없음 — 명시적 대체값)`;

  const assumptions: AssumptionRecord[] = [
    Object.freeze({
      id: LEDGER_ENVELOPE_ASSUMPTION_ID,
      key: "envelope",
      title:
        locale === "ko"
          ? "외피 성능: 연식 기반 코드 기본값"
          : "Envelope performance: era-based code defaults",
      explanation:
        locale === "ko"
          ? `건축물대장에는 단열 성능이 기재되지 않습니다. 외벽 ${wallU} · 지붕 ${roofU} · 최하층 ${groundU} · 창 ${windowU} W/m²K, SHGC ${windowShgc}, 창면적비 ${wwr}, 침기 ${naturalAch.toFixed(3)} ACH(자연)는 ${eraLabel} 기준 코드 표에서 가져온 값이며 측정값이 아닙니다.`
          : `The register states no thermal performance. Wall ${wallU}, roof ${roofU}, ground ${groundU}, window ${windowU} W/m2K, SHGC ${windowShgc}, window-to-wall ${wwr} and ${naturalAch.toFixed(3)} ACH natural infiltration come from the ${eraLabel} code tables and are not measurements.`,
      trigger: "A building-register record with no envelope drawings.",
      scopeObjectIds: Object.freeze([buildingId]),
      method: "project_default" as const,
      simulationImpact:
        "Sets every envelope U-value, the window area and the ventilation loss term.",
      reversible: true as const,
    }),
    Object.freeze({
      id: LEDGER_SYSTEMS_ASSUMPTION_ID,
      key: "systems",
      title:
        locale === "ko"
          ? "설비 사양: 용도 기반 기본값"
          : "Systems: use-type defaults",
      explanation:
        locale === "ko"
          ? `건축물대장에는 설비 정보가 없습니다. 난방효율 ${hvacDefaults.heatingEfficiency}, 냉방 COP ${hvacDefaults.coolingEfficiency}, 열원 ${hvacDefaults.fuelType}는 주용도 ${mainPurpsCd || "미상"} 기본값입니다. 기계/전기 일람표를 추가하면 대체됩니다.`
          : `The register carries no systems data. Heating efficiency ${hvacDefaults.heatingEfficiency}, cooling COP ${hvacDefaults.coolingEfficiency} and ${hvacDefaults.fuelType} are defaults for use ${mainPurpsCd || "unknown"}. A mechanical or electrical schedule replaces them.`,
      trigger: "A building-register record with no mechanical drawings.",
      scopeObjectIds: Object.freeze([buildingId]),
      method: "project_default" as const,
      simulationImpact: "Sets heating efficiency, cooling COP and ventilation rate.",
      reversible: true as const,
    }),
    Object.freeze({
      id: LEDGER_USAGE_ASSUMPTION_ID,
      key: "usage",
      title:
        locale === "ko" ? "운전 프로파일: 용도 기반 기본값" : "Operation: use-type defaults",
      explanation:
        locale === "ko"
          ? `재실밀도 ${occupancy.density} 인/m², 조명 ${lighting.lpd} W/m², 기기 ${occupancy.internalGain} W/m² 및 운전시간은 주용도 기본값이며 실제 사용 실적이 아닙니다. 모든 층은 냉난방 대상으로 가정합니다.`
          : `Occupancy ${occupancy.density} p/m2, lighting ${lighting.lpd} W/m2, equipment ${occupancy.internalGain} W/m2 and the operating hours are use-type defaults, not metered behaviour. Every storey is assumed conditioned.`,
      trigger: "A building-register record with no usage information.",
      scopeObjectIds: Object.freeze([buildingId]),
      method: "project_default" as const,
      simulationImpact: "Sets internal gains, setpoints and conditioned area.",
      reversible: true as const,
    }),
  ];

  if (boundaryPolygonFact.assumptionId === LEDGER_FOOTPRINT_ASSUMPTION_ID) {
    assumptions.push(
      Object.freeze({
        id: LEDGER_FOOTPRINT_ASSUMPTION_ID,
        key: "geometry.footprintBoundary",
        title:
          locale === "ko"
            ? "외곽선: 건축면적에서 생성한 직사각형"
            : "Outline: rectangle derived from 건축면적",
        explanation:
          locale === "ko"
            ? `실측 외곽선이 없어 건축면적 ${archAreaFact.value} m²를 1.5:1 비율의 직사각형으로 환산했습니다. 실제 건물 형상이 아니며, 도면이나 GIS 외곽선을 추가하면 대체됩니다.`
            : `No measured outline was available, so 건축면적 ${archAreaFact.value} m2 was expressed as a 1.5:1 rectangle. This is not the real plan shape; a drawing or GIS outline replaces it.`,
        trigger: "No measured building outline was supplied with the register.",
        scopeObjectIds: Object.freeze([buildingId]),
        method: "rule_inference" as const,
        simulationImpact:
          "Sets the perimeter, hence all exterior wall and window areas.",
        reversible: true as const,
      }),
    );
  }

  const missingValues: MissingValueRecord[] = [];

  if (excludedBasementCount > 0) {
    assumptions.push(
      Object.freeze({
        id: LEDGER_BASEMENT_ASSUMPTION_ID,
        key: "geometry.basementExcluded",
        title:
          locale === "ko"
            ? `지하 ${excludedBasementCount}개 층은 열모델에서 제외`
            : `${excludedBasementCount} below-grade storey(s) excluded`,
        explanation:
          locale === "ko"
            ? `등록된 지하 ${excludedBasementCount}개 층(연면적 ${Math.round(excludedBasementAreaSqm)} m²)은 지상층과 동일하게 외기에 접한 것으로 계산되면 난방 부하가 과대평가되므로 제외했습니다. 지반 접촉 계산(ISO 13370) 경로가 추가되면 포함됩니다.`
            : `The ${excludedBasementCount} registered below-grade storey(s) (${Math.round(excludedBasementAreaSqm)} m2) are excluded: the engine prices every storey against outdoor air, so including them would overstate heating. They return when a ground-coupling path exists.`,
        trigger: "The register declares below-grade storeys.",
        scopeObjectIds: Object.freeze([buildingId]),
        method: "rule_inference" as const,
        simulationImpact:
          "Excluded area is not in the conditioned floor area, so EUI is reported per above-grade area.",
        reversible: true as const,
      }),
    );
    missingValues.push(
      Object.freeze({
        id: stableId("missing", "ledger.basement", drawingSetId),
        key: "geometry.basementThermalModel",
        affectedObjectIds: Object.freeze([buildingId]),
        requiredFor: "geometry" as const,
        blocking: false,
        allowedAssumptionIds: Object.freeze([LEDGER_BASEMENT_ASSUMPTION_ID]),
        message:
          locale === "ko"
            ? `지하 ${excludedBasementCount}개 층(${Math.round(excludedBasementAreaSqm)} m²)은 계산에 포함되지 않았습니다.`
            : `${excludedBasementCount} below-grade storey(s) (${Math.round(excludedBasementAreaSqm)} m2) are not represented in the calculation.`,
        createdAt: now,
      }),
    );
  }

  if (!eraResolution.resolved) {
    assumptions.push(
      Object.freeze({
        id: LEDGER_ERA_UNKNOWN_ASSUMPTION_ID,
        key: "building.era",
        title:
          locale === "ko"
            ? "연식 미상 — 1990-1999 기준을 적용"
            : "Era unknown — 1990-1999 tables applied",
        explanation:
          locale === "ko"
            ? "건축물대장에 사용승인일과 허가일이 모두 없어 연식을 확정할 수 없습니다. 연식은 모든 U값·창면적비·침기·층고를 결정하므로, 적용된 1990-1999 기준은 읽어낸 값이 아니라 명시적 대체값입니다."
            : "Neither 사용승인일 nor 허가일 is present, so the era could not be read. Era sets every U-value, the window ratio, airtightness and floor height, so the 1990-1999 tables in use here are a stated fallback, not a reading.",
        trigger: "The register carries no usable approval or permit date.",
        scopeObjectIds: Object.freeze([buildingId]),
        method: "project_default" as const,
        simulationImpact: "Selects the whole era-indexed default set.",
        reversible: true as const,
      }),
    );
    missingValues.push(
      Object.freeze({
        id: stableId("missing", "ledger.era", drawingSetId),
        key: "building.era",
        affectedObjectIds: Object.freeze([buildingId]),
        requiredFor: "envelope" as const,
        blocking: false,
        allowedAssumptionIds: Object.freeze([LEDGER_ERA_UNKNOWN_ASSUMPTION_ID]),
        message:
          locale === "ko"
            ? "연식을 확인할 수 없어 1990-1999 기준을 적용했습니다."
            : "The building era could not be established; 1990-1999 tables were applied.",
        createdAt: now,
      }),
    );
  }

  // ── Assembly ──────────────────────────────────────────────────────────
  const buildingName =
    (nameFact?.value ?? "").trim() ||
    (addressFact?.value ?? "").trim() ||
    (locale === "ko" ? "등록 건축물" : "Registered building");

  const shell: CanonicalEnergyModel = {
    id: stableId("model-ledger", drawingSetId),
    schemaVersion: CANONICAL_ENERGY_MODEL_VERSION,
    modelVersion: LEDGER_BASELINE_MODEL_VERSION,
    project: {
      id: stableId("project-ledger", drawingSetId),
      name: buildingName,
      locale,
    },
    building: {
      id: buildingId,
      name: nameFact
        ? inferredFact("building.name", buildingName, [nameFact], now)
        : addressFact
          ? inferredFact("building.name", buildingName, [addressFact], now)
          : assumptionFact(
              "building.name",
              buildingName,
              now,
              LEDGER_USAGE_ASSUMPTION_ID,
            ),
      // Kept as the raw five-digit 주용도코드: the adapter matches it directly.
      useType: useFact
        ? inferredFact("building.useType", mainPurpsCd, [useFact], now)
        : assumptionFact(
            "building.useType",
            mainPurpsCd || "00000",
            now,
            LEDGER_USAGE_ASSUMPTION_ID,
          ),
    },
    site: {
      location: addressFact
        ? inferredFact(
            "site.location",
            `${(addressFact.value ?? "").trim()} · ${weather.ko}`,
            [addressFact],
            now,
          )
        : assumptionFact(
            "site.location",
            weather.ko,
            now,
            LEDGER_USAGE_ASSUMPTION_ID,
          ),
      latitudeDeg: assumptionFact(
        "site.latitudeDeg",
        37.5665,
        now,
        LEDGER_USAGE_ASSUMPTION_ID,
        "deg",
      ),
      longitudeDeg: assumptionFact(
        "site.longitudeDeg",
        126.978,
        now,
        LEDGER_USAGE_ASSUMPTION_ID,
        "deg",
      ),
      northOrientationDeg,
      weatherSource: assumptionFact(
        "site.weatherSource",
        weather.weatherSource,
        now,
        LEDGER_USAGE_ASSUMPTION_ID,
      ),
      groundRelationship: assumptionFact(
        "site.groundRelationship",
        "slab_on_grade",
        now,
        LEDGER_ENVELOPE_ASSUMPTION_ID,
      ),
    },
    drawingSet: Object.freeze({
      ...ingestion.drawingSet,
      name: buildingName,
      tier: 1 as const,
    }),
    extractionRuns: Object.freeze([ingestion.extractionRun]),
    geometry: Object.freeze({
      coordinateSystem: inferredFact(
        "geometry.coordinateSystem",
        "local-meters-x-east-y-north",
        [boundaryPolygonFact],
        now,
      ),
      storeys: Object.freeze(storeys),
      floorPlates: Object.freeze(floorPlates),
      spaces: Object.freeze(spaces),
      thermalZones: Object.freeze(zones),
      surfaces: Object.freeze(surfaces),
      openings: Object.freeze(openings),
      shadingDevices: Object.freeze([]),
    }),
    envelope: Object.freeze({
      constructions: Object.freeze([
        wallConstruction,
        roofConstruction,
        groundConstruction,
        windowConstruction,
      ]),
      infiltrationAirChangesPerHour: envelopeFact(
        "envelope.infiltrationAirChangesPerHour",
        naturalAch,
        "ACH",
      ),
      airTightnessNotes: assumptionFact(
        "envelope.airTightnessNotes",
        `ACH50 ${AIRTIGHTNESS[era]} (${era} 코드 표) ÷ 20 → 자연 침기율. 실측 기밀시험 값이 아닙니다.`,
        now,
        LEDGER_ENVELOPE_ASSUMPTION_ID,
      ),
      thermalBridgeNotes: assumptionFact(
        "envelope.thermalBridgeNotes",
        "열교 가산 없음 — 스크리닝 모델.",
        now,
        LEDGER_ENVELOPE_ASSUMPTION_ID,
      ),
    }),
    usageProfiles: Object.freeze([usage]),
    systems: Object.freeze({
      hvac: Object.freeze([hvac]),
      domesticHotWater: Object.freeze([]),
      renewables: Object.freeze([]),
    }),
    facts: Object.freeze([]),
    conflicts: Object.freeze([...ingestion.conflicts]),
    missingValues: Object.freeze([
      ...ingestion.missingValues.map((missing) =>
        // A register is not a drawing; nothing about it can block on tracing.
        missing.blocking ? Object.freeze({ ...missing, blocking: false }) : missing,
      ),
      ...missingValues,
    ]),
    assumptions: Object.freeze(assumptions),
    mappings: Object.freeze(
      zones.map((zone) =>
        Object.freeze({
          canonicalObjectId: zone.id,
          sourceEntityRefs: uniqueSourceRefs(geometrySources),
          threeObjectIds: Object.freeze([`three-${zone.id}`]),
        }),
      ),
    ),
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
  const model = Object.freeze({
    ...indexed,
    readiness: Object.freeze([...validation.readiness]),
  });

  return Object.freeze({
    status: "created" as const,
    model,
    storeyCount: aboveCount,
    boundaryId: boundaryRecordId,
    excludedBasementCount,
    excludedBasementAreaSqm,
  });
}
