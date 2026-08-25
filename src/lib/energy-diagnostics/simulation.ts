import type {
  CanonicalEnergyModel,
  EnergyScenario,
  ModelContentFingerprint,
  SimulationRun,
} from "./types";

export const MODEL_CONTENT_FINGERPRINT_VERSION = "model-fingerprint-v1" as const;

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

function deterministicFingerprint(value: unknown): string {
  const serialized = stableStringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

/**
 * Produces the identity of simulation-relevant canonical content. Derived
 * indexes, validation summaries, scenarios, runs, and bookkeeping timestamps
 * are excluded so recording a result does not invalidate that same result.
 */
export function canonicalModelContentFingerprint(
  model: CanonicalEnergyModel,
): ModelContentFingerprint {
  const {
    modelVersion: _modelVersion,
    facts: _facts,
    readiness: _readiness,
    scenarios: _scenarios,
    simulationRuns: _simulationRuns,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...content
  } = model;
  return `${MODEL_CONTENT_FINGERPRINT_VERSION}-${deterministicFingerprint(content)}`;
}

function runPayloadModelVersion(run: SimulationRun): string | null {
  const payload = run.engineInput.payload;
  if (payload == null || typeof payload !== "object") return null;
  const value = (payload as Readonly<Record<string, unknown>>).canonicalModelVersion;
  return typeof value === "string" ? value : null;
}

export function isScenarioCurrentForModel(
  scenario: EnergyScenario,
  model: CanonicalEnergyModel,
): boolean {
  const fingerprint = canonicalModelContentFingerprint(model);
  return (
    model.modelVersion === fingerprint &&
    scenario.baselineModelId === model.id &&
    scenario.baselineModelVersion === fingerprint
  );
}

export function isSimulationRunCurrentForModel(
  run: SimulationRun,
  model: CanonicalEnergyModel,
): boolean {
  const fingerprint = canonicalModelContentFingerprint(model);
  const scenarioIsCurrent =
    run.scenarioId === "baseline" ||
    model.scenarios.some(
      (scenario) =>
        scenario.id === run.scenarioId &&
        scenario.baselineModelId === model.id &&
        scenario.baselineModelVersion === fingerprint,
    );
  return (
    model.modelVersion === fingerprint &&
    run.modelId === model.id &&
    runPayloadModelVersion(run) === fingerprint &&
    scenarioIsCurrent
  );
}

/**
 * Upgrades a canonical model to the fingerprint contract and removes derived
 * artifacts that cannot be proven to target its exact current content. The
 * base model is always preserved; legacy results are never silently rebound.
 */
export function reconcileCanonicalModelFingerprint(
  model: CanonicalEnergyModel,
): CanonicalEnergyModel {
  const fingerprint = canonicalModelContentFingerprint(model);
  const revisionWasCurrent = model.modelVersion === fingerprint;
  const scenarios = revisionWasCurrent
    ? model.scenarios.filter(
        (scenario) =>
          scenario.baselineModelId === model.id &&
          scenario.baselineModelVersion === fingerprint,
      )
    : [];
  const currentScenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const simulationRuns = revisionWasCurrent
    ? model.simulationRuns.filter(
        (run) =>
          run.modelId === model.id &&
          runPayloadModelVersion(run) === fingerprint &&
          (run.scenarioId === "baseline" || currentScenarioIds.has(run.scenarioId)),
      )
    : [];

  if (
    revisionWasCurrent &&
    scenarios.length === model.scenarios.length &&
    simulationRuns.length === model.simulationRuns.length
  ) {
    return model;
  }

  return Object.freeze({
    ...model,
    modelVersion: fingerprint,
    scenarios: Object.freeze(scenarios),
    simulationRuns: Object.freeze(simulationRuns),
  });
}
