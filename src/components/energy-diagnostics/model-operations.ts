import {
  compileCanonicalModelToEngineInput,
  mapResultsToCanonicalObjects,
  runSimulation,
  type CompiledDegreeDayInput,
  type DegreeDaySimulationRun,
  type SpatialEnergyMapping,
} from "@/lib/energy-diagnostics/adapter";
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
import { createEnergyScenario } from "@/lib/energy-diagnostics/scenarios";
import type {
  CanonicalEnergyModel,
  ConflictRecord,
  EnergyFact,
  EnergyScenario,
} from "@/lib/energy-diagnostics/types";
import { validateCanonicalEnergyModel } from "@/lib/energy-diagnostics/validation";

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
  return Object.freeze({
    ...indexed,
    readiness: Object.freeze([...validation.readiness]),
  });
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
  const input = compileCanonicalModelToEngineInput(model);
  const run = runSimulation(input);
  return Object.freeze({
    model: refreshModel({
      ...model,
      simulationRuns: Object.freeze([
        ...model.simulationRuns.filter(
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
  const windowIndex = model.envelope.constructions.findIndex(
    (construction) => construction.kind === "window",
  );
  if (windowIndex < 0) throw new Error("The model has no window construction.");
  const baselineFact = model.envelope.constructions[windowIndex].uValueWPerM2K;
  const scenario = createEnergyScenario({
    id: `scenario-window-u-${uValueWPerM2K.toFixed(2).replace(".", "-")}`,
    name: `Window U ${uValueWPerM2K.toFixed(2)} W/(m²·K)`,
    baseline: model,
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
  const input = compileCanonicalModelToEngineInput(model, scenario);
  const run = runSimulation(input);
  return Object.freeze({
    model: refreshModel({
      ...model,
      scenarios: Object.freeze([
        ...model.scenarios.filter((candidate) => candidate.id !== scenario.id),
        scenario,
      ]),
      simulationRuns: Object.freeze([
        ...model.simulationRuns.filter(
          (candidate) => candidate.scenarioId !== scenario.id,
        ),
        run,
      ]),
    }),
    scenario,
    run,
  });
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
