import {
  compileCanonicalModelToEngineInput,
  mapResultsToCanonicalObjects,
  runSimulation,
  type CompiledDegreeDayInput,
  type DegreeDaySimulationRun,
  type SpatialEnergyMapping,
} from "@/lib/energy-diagnostics/adapter";
import { documentTier } from "@/lib/energy-diagnostics/classification";
import {
  collectEnergyFacts,
  createEnergyFact,
} from "@/lib/energy-diagnostics/facts";
import {
  ingestDrawingSet,
  type DrawingSetIngestionResult,
  type DrawingSourceInput,
} from "@/lib/energy-diagnostics/ingestion";
import {
  buildRepresentativeOfficeModel,
  REFERENCE_OFFICE_INFILTRATION_ASSUMPTION_ID,
} from "@/lib/energy-diagnostics/reference-office-model";
import { representativeOfficeDrawingSetInputs } from "@/lib/energy-diagnostics/reference-office-sources";
import {
  createEnergyScenario,
  type ScenarioChange,
} from "@/lib/energy-diagnostics/scenarios";
import { reconcileCanonicalModelFingerprint } from "@/lib/energy-diagnostics/simulation";
import type {
  CanonicalEnergyModel,
  ConflictRecord,
  DrawingDocumentType,
  EnergyFact,
  EnergyScenario,
} from "@/lib/energy-diagnostics/types";
import { validateCanonicalEnergyModel } from "@/lib/energy-diagnostics/validation";
import {
  mergeThermalZones,
  splitThermalZone,
} from "@/lib/energy-diagnostics/zoning";

export const REFERENCE_INGESTED_AT = "2026-01-15T00:00:00.000Z";
export const INFILTRATION_ASSUMPTION_ID =
  REFERENCE_OFFICE_INFILTRATION_ASSUMPTION_ID;

export type RepresentativeCase = Readonly<{
  model: CanonicalEnergyModel;
  ingestion: DrawingSetIngestionResult;
  sources: readonly DrawingSourceInput[];
}>;

function refreshModel(
  input: CanonicalEnergyModel,
  updatedAt = new Date().toISOString(),
): CanonicalEnergyModel {
  const shell: CanonicalEnergyModel = {
    ...input,
    facts: [],
    updatedAt,
  };
  const indexed: CanonicalEnergyModel = {
    ...shell,
    facts: collectEnergyFacts(shell),
  };
  const validation = validateCanonicalEnergyModel(indexed);
  return reconcileCanonicalModelFingerprint(Object.freeze({
    ...indexed,
    readiness: Object.freeze([...validation.readiness]),
  }));
}

export async function loadRepresentativeCase(): Promise<RepresentativeCase> {
  const sources = representativeOfficeDrawingSetInputs();
  const ingestion = await ingestDrawingSet(sources, {
    setName: "BIMFIT representative office drawing set",
    ingestedAt: REFERENCE_INGESTED_AT,
  });
  return Object.freeze({
    model: buildRepresentativeOfficeModel(ingestion, REFERENCE_INGESTED_AT),
    ingestion,
    sources,
  });
}

export function applyInfiltrationAssumption(
  model: CanonicalEnergyModel,
  now = new Date().toISOString(),
): CanonicalEnergyModel {
  if (
    !model.missingValues.some(
      (missing) => missing.id === "missing.reference-office.infiltration",
    )
  ) {
    return model;
  }
  const replacement: EnergyFact<number> = Object.freeze({
    ...model.envelope.infiltrationAirChangesPerHour,
    value: 0.5,
    unit: "ACH",
    status: "defaulted",
    confidence: null,
    sourceRefs: Object.freeze([]),
    extractionMethod: "project_default",
    authority: "project_template",
    assumptionId: INFILTRATION_ASSUMPTION_ID,
    reviewedByUser: true,
    updatedAt: now,
  });
  const assumptions = model.assumptions.map((assumption) =>
    assumption.id === INFILTRATION_ASSUMPTION_ID
      ? Object.freeze({ ...assumption, overriddenByFactId: replacement.id })
      : assumption,
  );
  return refreshModel(
    {
      ...model,
      envelope: Object.freeze({
        ...model.envelope,
        infiltrationAirChangesPerHour: replacement,
      }),
      missingValues: Object.freeze(
        model.missingValues.filter(
          (missing) => missing.id !== "missing.reference-office.infiltration",
        ),
      ),
      assumptions: Object.freeze(assumptions),
    },
    now,
  );
}

export function resolveVisibleConflict(
  model: CanonicalEnergyModel,
  conflictId: string,
  selectedFactId: string,
  now = new Date().toISOString(),
): CanonicalEnergyModel {
  const conflict = model.conflicts.find((candidate) => candidate.id === conflictId);
  const selected = conflict?.candidates.find(
    (candidate) => candidate.fact.id === selectedFactId,
  )?.fact;
  if (!conflict || !selected) return model;
  if (conflict.key !== "opening.W01.widthM") return model;
  const affectedOpeningIds = new Set(conflict.affectedObjectIds);
  const targetOpenings = model.geometry.openings.filter(
    (opening) =>
      affectedOpeningIds.has(opening.id) &&
      opening.widthM.key === conflict.key,
  );
  if (targetOpenings.length === 0) return model;

  const confirmed: EnergyFact<unknown> = Object.freeze({
    ...selected,
    status: "user_confirmed",
    confidence: 1,
    extractionMethod: "user_input",
    authority: "user_confirmed_project_value",
    conflictIds: Object.freeze([
      ...new Set([...(selected.conflictIds ?? []), conflict.id]),
    ]),
    reviewedByUser: true,
    updatedAt: now,
  });
  const updatedConflict: ConflictRecord = Object.freeze({
    ...conflict,
    candidates: Object.freeze(
      conflict.candidates.map((candidate) =>
        candidate.fact.id === selectedFactId
          ? Object.freeze({ ...candidate, fact: confirmed })
          : candidate,
      ),
    ),
    selectedFactId,
    selectionRationale: "The user selected and confirmed this drawing value.",
    resolutionStatus: "user_resolved",
    resolvedAt: now,
  });
  const openings = model.geometry.openings.map((opening) => {
    if (
      affectedOpeningIds.has(opening.id) &&
      opening.widthM.key === conflict.key
    ) {
      const widthM = confirmed as EnergyFact<number>;
      const heightM = opening.heightM;
      const sourceRefs = Object.freeze([
        ...new Map(
          [...widthM.sourceRefs, ...heightM.sourceRefs].map((source) => [
            source.id,
            source,
          ]),
        ).values(),
      ]);
      const areaSqm =
        widthM.value != null && heightM.value != null
          ? createEnergyFact({
              key: opening.areaSqm.key,
              value: widthM.value * heightM.value,
              unit: opening.areaSqm.unit ?? "m2",
              status: "inferred",
              confidence: Math.min(
                widthM.confidence ?? 1,
                heightM.confidence ?? 1,
              ),
              sourceRefs,
              extractionMethod: "rule_inference",
              authority: "deterministic_rule_inference",
              conflictIds: Object.freeze([conflict.id]),
              reviewedByUser: true,
              createdAt: opening.areaSqm.createdAt,
              updatedAt: now,
            })
          : opening.areaSqm;
      return Object.freeze({ ...opening, widthM, areaSqm });
    }
    return opening;
  });
  return refreshModel(
    {
      ...model,
      geometry: Object.freeze({
        ...model.geometry,
        openings: Object.freeze(openings),
      }),
      conflicts: Object.freeze(
        model.conflicts.map((candidate) =>
          candidate.id === conflictId ? updatedConflict : candidate,
        ),
      ),
    },
    now,
  );
}

export function runBaselineModel(
  model: CanonicalEnergyModel,
): Readonly<{ model: CanonicalEnergyModel; run: DegreeDaySimulationRun }> {
  const baseline = reconcileCanonicalModelFingerprint(model);
  const input = compileCanonicalModelToEngineInput(baseline);
  const run = runSimulation(input);
  return Object.freeze({
    model: refreshModel({
      ...baseline,
      simulationRuns: Object.freeze([
        ...baseline.simulationRuns.filter(
          (candidate) => candidate.scenarioId !== "baseline",
        ),
        run,
      ]),
    }),
    run,
  });
}

export function runWindowScenario(
  model: CanonicalEnergyModel,
  uValueWPerM2K: number,
): Readonly<{
  model: CanonicalEnergyModel;
  scenario: EnergyScenario;
  run: DegreeDaySimulationRun;
}> {
  const baseline = reconcileCanonicalModelFingerprint(model);
  const windowIndex = baseline.envelope.constructions.findIndex(
    (construction) => construction.kind === "window",
  );
  if (windowIndex < 0) throw new Error("The model has no window construction.");
  const baselineFact = baseline.envelope.constructions[windowIndex].uValueWPerM2K;
  const scenario = createEnergyScenario({
    id: `scenario-window-u-${uValueWPerM2K.toFixed(2).replace(".", "-")}`,
    name: `Window U ${uValueWPerM2K.toFixed(2)} W/(m²·K)`,
    baseline,
    changes: [
      {
        id: `delta-window-u-${windowIndex}`,
        path: `envelope.constructions.${windowIndex}.uValueWPerM2K`,
        baselineFact,
        value: uValueWPerM2K,
        unit: "W/m2K",
      },
    ],
  });
  const input = compileCanonicalModelToEngineInput(baseline, scenario);
  const run = runSimulation(input);
  return Object.freeze({
    model: refreshModel({
      ...baseline,
      scenarios: Object.freeze([
        ...baseline.scenarios.filter((candidate) => candidate.id !== scenario.id),
        scenario,
      ]),
      simulationRuns: Object.freeze([
        ...baseline.simulationRuns.filter(
          (candidate) => candidate.scenarioId !== scenario.id,
        ),
        run,
      ]),
    }),
    scenario,
    run,
  });
}

/**
 * Records the user's explicit document-type assignment on an ingested drawing
 * set. The assignment is authoritative (`method: "user_assignment"`), keeps the
 * automatic guess visible as an alternative, and re-derives the set tier.
 */
export function assignDocumentClassification(
  ingestion: DrawingSetIngestionResult,
  documentId: string,
  documentType: DrawingDocumentType,
): DrawingSetIngestionResult {
  const documents = ingestion.drawingSet.documents.map((document) => {
    if (document.id !== documentId) return document;
    const previous = document.classification;
    const alternatives =
      previous.method === "user_assignment"
        ? previous.alternatives
        : Object.freeze([
            Object.freeze({
              documentType: previous.documentType,
              confidence: previous.confidence,
            }),
            ...previous.alternatives,
          ]);
    return Object.freeze({
      ...document,
      classification: Object.freeze({
        ...previous,
        documentType,
        confidence: 1,
        method: "user_assignment" as const,
        alternatives,
      }),
    });
  });
  return Object.freeze({
    ...ingestion,
    drawingSet: Object.freeze({
      ...ingestion.drawingSet,
      tier: documents.reduce<1 | 2 | 3>(
        (highest, document) =>
          Math.max(
            highest,
            documentTier(document.classification.documentType),
          ) as 1 | 2 | 3,
        1,
      ),
      documents: Object.freeze(documents),
    }),
  });
}

export type ImprovementScenarioValues = Readonly<{
  windowUValueWPerM2K?: number;
  windowShgc?: number;
  infiltrationAch?: number;
  heatingCop?: number;
  /** Multiplies every opening's area, e.g. 0.8 shrinks all glazing by 20%. */
  openingAreaScale?: number;
}>;

/**
 * Runs one delta-only alternative over any combination of the engine-consumed
 * improvement parameters. Unset parameters keep their baseline facts.
 */
export function runImprovementScenario(
  model: CanonicalEnergyModel,
  values: ImprovementScenarioValues,
): Readonly<{
  model: CanonicalEnergyModel;
  scenario: EnergyScenario;
  run: DegreeDaySimulationRun;
}> {
  const baseline = reconcileCanonicalModelFingerprint(model);
  const changes: ScenarioChange<unknown>[] = [];
  const idParts: string[] = [];
  const nameParts: string[] = [];
  if (values.windowUValueWPerM2K != null) {
    const windowIndex = baseline.envelope.constructions.findIndex(
      (construction) => construction.kind === "window",
    );
    if (windowIndex < 0) throw new Error("The model has no window construction.");
    changes.push({
      id: `delta-window-u-${windowIndex}`,
      path: `envelope.constructions.${windowIndex}.uValueWPerM2K`,
      baselineFact: baseline.envelope.constructions[windowIndex].uValueWPerM2K,
      value: values.windowUValueWPerM2K,
      unit: "W/m2K",
    });
    idParts.push(`window-u-${values.windowUValueWPerM2K.toFixed(2)}`);
    nameParts.push(
      `Window U-value ${values.windowUValueWPerM2K.toFixed(2)} W/m²·K`,
    );
  }
  if (values.windowShgc != null) {
    const windowIndex = baseline.envelope.constructions.findIndex(
      (construction) => construction.kind === "window",
    );
    if (windowIndex < 0) throw new Error("The model has no window construction.");
    changes.push({
      id: `delta-window-shgc-${windowIndex}`,
      path: `envelope.constructions.${windowIndex}.shgc`,
      baselineFact: baseline.envelope.constructions[windowIndex].shgc,
      value: values.windowShgc,
    });
    idParts.push(`shgc-${values.windowShgc.toFixed(2)}`);
    nameParts.push(`Window SHGC ${values.windowShgc.toFixed(2)}`);
  }
  if (values.infiltrationAch != null) {
    changes.push({
      id: "delta-infiltration-ach",
      path: "envelope.infiltrationAirChangesPerHour",
      baselineFact: baseline.envelope.infiltrationAirChangesPerHour,
      value: values.infiltrationAch,
      unit: "ACH",
    });
    idParts.push(`ach-${values.infiltrationAch.toFixed(2)}`);
    nameParts.push(`Infiltration ${values.infiltrationAch.toFixed(2)} ACH`);
  }
  if (values.heatingCop != null) {
    if (baseline.systems.hvac.length === 0) {
      throw new Error("The model has no HVAC system.");
    }
    changes.push({
      id: "delta-heating-cop-0",
      path: "systems.hvac.0.heatingEfficiency",
      baselineFact: baseline.systems.hvac[0].heatingEfficiency,
      value: values.heatingCop,
    });
    idParts.push(`cop-${values.heatingCop.toFixed(2)}`);
    nameParts.push(`Heating COP ${values.heatingCop.toFixed(2)}`);
  }
  if (values.openingAreaScale != null) {
    if (!(values.openingAreaScale > 0)) {
      throw new Error("The opening-area scale must be positive.");
    }
    baseline.geometry.openings.forEach((opening, index) => {
      const baseline = opening.areaSqm;
      if (typeof baseline.value !== "number" || !Number.isFinite(baseline.value)) return;
      changes.push({
        id: `delta-opening-area-${index}`,
        path: `geometry.openings.${index}.areaSqm`,
        baselineFact: baseline,
        value: baseline.value * values.openingAreaScale!,
        unit: baseline.unit ?? "m2",
      });
    });
    idParts.push(`glazing-x${values.openingAreaScale.toFixed(2)}`);
    nameParts.push(
      `Glazing area ${(values.openingAreaScale * 100).toFixed(0)}% of baseline`,
    );
  }
  if (changes.length === 0) {
    throw new Error("An improvement scenario needs at least one changed value.");
  }
  const scenario = createEnergyScenario({
    id: `scenario-${idParts.join("-").replaceAll(".", "-")}`,
    name: `Improvement · ${nameParts.join(" · ")}`,
    baseline,
    changes,
  });
  const input = compileCanonicalModelToEngineInput(baseline, scenario);
  const run = runSimulation(input);
  return Object.freeze({
    model: refreshModel({
      ...baseline,
      scenarios: Object.freeze([
        ...baseline.scenarios.filter((candidate) => candidate.id !== scenario.id),
        scenario,
      ]),
      simulationRuns: Object.freeze([
        ...baseline.simulationRuns.filter(
          (candidate) => candidate.scenarioId !== scenario.id,
        ),
        run,
      ]),
    }),
    scenario,
    run,
  });
}

function remapZoneReferences(
  model: CanonicalEnergyModel,
  removedZoneIds: ReadonlySet<string>,
  replacements: readonly CanonicalEnergyModel["geometry"]["thermalZones"][number][],
  spaceToZone: ReadonlyMap<string, string>,
  now: string,
): CanonicalEnergyModel {
  const keptZones = model.geometry.thermalZones.filter(
    (zone) => !removedZoneIds.has(zone.id),
  );
  const spaces = model.geometry.spaces.map((space) => {
    const next = spaceToZone.get(space.id);
    return next != null && next !== space.thermalZoneId
      ? Object.freeze({ ...space, thermalZoneId: next })
      : space;
  });
  const replacementIds = replacements.map((zone) => zone.id);
  const hvac = model.systems.hvac.map((system) => {
    const served = system.servedZoneIds.value ?? [];
    if (!served.some((id) => removedZoneIds.has(id))) return system;
    const nextServed = [
      ...new Set([
        ...served.filter((id) => !removedZoneIds.has(id)),
        ...replacementIds,
      ]),
    ].sort();
    return Object.freeze({
      ...system,
      servedZoneIds: Object.freeze({
        ...system.servedZoneIds,
        value: Object.freeze(nextServed),
        updatedAt: now,
      }),
    });
  });
  // The merged/split zones keep their 2D↔3D traceability: removed zones'
  // object mappings collapse onto the replacements (union for a merge; the
  // viewer bridge's per-space fallback covers splits without a mapping).
  const removedMappings = model.mappings.filter((mapping) =>
    removedZoneIds.has(mapping.canonicalObjectId),
  );
  const inheritedThreeIds = Object.freeze([
    ...new Set(removedMappings.flatMap((mapping) => mapping.threeObjectIds)),
  ]);
  const inheritedSourceRefs = Object.freeze([
    ...new Map(
      removedMappings
        .flatMap((mapping) => mapping.sourceEntityRefs)
        .map((source) => [source.id, source] as const),
    ).values(),
  ]);
  const mappings = Object.freeze([
    ...model.mappings.filter(
      (mapping) => !removedZoneIds.has(mapping.canonicalObjectId),
    ),
    ...(replacements.length === 1 && removedMappings.length > 0
      ? [
          Object.freeze({
            canonicalObjectId: replacements[0].id,
            threeObjectIds: inheritedThreeIds,
            sourceEntityRefs: inheritedSourceRefs,
          }),
        ]
      : []),
  ]);
  return refreshModel(
    {
      ...model,
      geometry: Object.freeze({
        ...model.geometry,
        thermalZones: Object.freeze([...keptZones, ...replacements]),
        spaces: Object.freeze(spaces),
      }),
      systems: Object.freeze({ ...model.systems, hvac: Object.freeze(hvac) }),
      mappings,
    },
    now,
  );
}

/** Merges user-selected zones into one reviewed zone, keeping every reference coherent. */
export function mergeModelZones(
  model: CanonicalEnergyModel,
  zoneIds: readonly string[],
  name: string,
  now = new Date().toISOString(),
): CanonicalEnergyModel {
  const zones = model.geometry.thermalZones.filter((zone) =>
    zoneIds.includes(zone.id),
  );
  const merged = mergeThermalZones({ zones, name, createdAt: now });
  const removed = new Set(zones.map((zone) => zone.id));
  const spaceToZone = new Map(
    merged.sourceSpaceIds.map((spaceId) => [spaceId, merged.id] as const),
  );
  return remapZoneReferences(model, removed, [merged], spaceToZone, now);
}

/** Splits a zone into one reviewed zone per source space. */
export function splitModelZoneBySpace(
  model: CanonicalEnergyModel,
  zoneId: string,
  now = new Date().toISOString(),
): CanonicalEnergyModel {
  const zone = model.geometry.thermalZones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error(`Unknown thermal zone ${zoneId}.`);
  if (zone.sourceSpaceIds.length < 2) {
    throw new Error("The zone already contains a single space.");
  }
  const spaceById = new Map(model.geometry.spaces.map((space) => [space.id, space]));
  const groups = zone.sourceSpaceIds.map((spaceId) => ({
    name:
      spaceById.get(spaceId)?.name.value ??
      `${zone.name.value ?? zone.stableKey} · ${spaceId}`,
    sourceSpaceIds: [spaceId] as const,
  }));
  const splits = splitThermalZone({
    zone,
    spaces: model.geometry.spaces,
    groups,
    createdAt: now,
  });
  const spaceToZone = new Map(
    splits.flatMap((split) =>
      split.sourceSpaceIds.map((spaceId) => [spaceId, split.id] as const),
    ),
  );
  return remapZoneReferences(model, new Set([zone.id]), splits, spaceToZone, now);
}

export function spatialResultsForRun(
  run: DegreeDaySimulationRun | null,
): SpatialEnergyMapping | null {
  if (!run?.result || !run.engineOutput) return null;
  return mapResultsToCanonicalObjects(
    run.result,
    run.engineInput as CompiledDegreeDayInput,
    run.engineOutput,
  );
}
