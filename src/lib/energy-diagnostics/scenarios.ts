import type {
  CanonicalEnergyModel,
  EnergyFact,
  EnergyScenario,
  IsoDateTime,
  ScenarioDelta,
} from "./types";
import { canonicalModelContentFingerprint } from "./simulation";

export type ScenarioChange<T> = Readonly<{
  id: string;
  path: string;
  key?: string;
  baselineFact: EnergyFact<T>;
  value: T;
  unit?: string;
}>;

export type CreateScenarioOptions = Readonly<{
  id: string;
  name: string;
  baseline: CanonicalEnergyModel;
  changes: readonly ScenarioChange<unknown>[];
  now?: IsoDateTime;
}>;

const SUPPORTED_PATH_PATTERNS: readonly RegExp[] = [
  /^envelope\.constructions\.\d+\.(uValueWPerM2K|shgc)$/,
  /^envelope\.infiltrationAirChangesPerHour$/,
  /^systems\.hvac\.\d+\.(heatingEfficiency|coolingCop|heatRecoveryEfficiency|ventilationLps)$/,
  /^geometry\.openings\.\d+\.areaSqm$/,
];

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Only exposes parameters the current degree-day adapter actually consumes. */
export function isSupportedSimulationDeltaPath(path: string): boolean {
  return SUPPORTED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function validateReplacement(path: string, value: unknown): void {
  if (!finiteNumber(value)) {
    throw new Error(`Scenario replacement at ${path} must be a finite number.`);
  }
  if (path.endsWith(".shgc") && (value < 0 || value > 1)) {
    throw new Error(`Scenario SHGC at ${path} must be between 0 and 1.`);
  }
  if (path.endsWith("heatRecoveryEfficiency") && (value < 0 || value > 100)) {
    throw new Error(
      `Scenario heat-recovery efficiency at ${path} must be a fraction or percentage between 0 and 100.`,
    );
  }
  const allowsZero =
    path.endsWith(".shgc") ||
    path.endsWith("heatRecoveryEfficiency") ||
    path.endsWith("infiltrationAirChangesPerHour") ||
    path.endsWith("ventilationLps");
  if (
    !allowsZero &&
    value <= 0
  ) {
    throw new Error(`Scenario replacement at ${path} must be positive.`);
  }
  if (allowsZero && value < 0) {
    throw new Error(`Scenario replacement at ${path} must be non-negative.`);
  }
}

export function createScenarioDelta<T>(
  change: ScenarioChange<T>,
  now: IsoDateTime = new Date().toISOString(),
): ScenarioDelta {
  if (!isSupportedSimulationDeltaPath(change.path)) {
    throw new Error(
      `Unsupported scenario path ${change.path}; the current real engine does not consume this parameter.`,
    );
  }
  validateReplacement(change.path, change.value);
  const replacement: EnergyFact<T> = {
    id: `${change.id}:replacement`,
    key: change.key ?? change.baselineFact.key,
    value: change.value,
    unit: change.unit ?? change.baselineFact.unit,
    status: "user_confirmed",
    confidence: 1,
    sourceRefs: [],
    extractionMethod: "user_input",
    authority: "user_confirmed_project_value",
    reviewedByUser: true,
    createdAt: now,
    updatedAt: now,
  };
  return {
    id: change.id,
    path: change.path,
    key: replacement.key,
    baselineFactId: change.baselineFact.id,
    replacement,
  };
}

/**
 * Creates a delta-only scenario. The baseline model is referenced by identity
 * and exact content fingerprint; none of its facts are copied into or changed
 * by the scenario.
 */
export function createEnergyScenario({
  id,
  name,
  baseline,
  changes,
  now = new Date().toISOString(),
}: CreateScenarioOptions): EnergyScenario {
  if (name.trim().length === 0) {
    throw new Error("Scenario name must not be empty.");
  }
  const baselineFactIds = new Set<string>();
  const deltas = changes.map((change) => {
    if (baselineFactIds.has(change.baselineFact.id)) {
      throw new Error(
        `Scenario contains more than one replacement for fact ${change.baselineFact.id}.`,
      );
    }
    baselineFactIds.add(change.baselineFact.id);
    return createScenarioDelta(change, now);
  });
  return {
    id,
    name: name.trim(),
    baselineModelId: baseline.id,
    baselineModelVersion: canonicalModelContentFingerprint(baseline),
    deltas,
    createdAt: now,
    updatedAt: now,
  };
}

export function assertScenarioMatchesBaseline(
  scenario: EnergyScenario,
  baseline: CanonicalEnergyModel,
): void {
  const baselineFingerprint = canonicalModelContentFingerprint(baseline);
  if (scenario.baselineModelId !== baseline.id) {
    throw new Error(
      `Scenario ${scenario.id} belongs to model ${scenario.baselineModelId}, not ${baseline.id}.`,
    );
  }
  if (scenario.baselineModelVersion !== baselineFingerprint) {
    throw new Error(
      `Scenario ${scenario.id} targets model content ${scenario.baselineModelVersion}, not ${baselineFingerprint}.`,
    );
  }
  for (const delta of scenario.deltas) {
    if (!isSupportedSimulationDeltaPath(delta.path)) {
      throw new Error(
        `Scenario ${scenario.id} contains unsupported engine delta ${delta.path}.`,
      );
    }
    validateReplacement(delta.path, delta.replacement.value);
  }
}

/**
 * Resolves a fact for compilation without mutating either the canonical model
 * or its scenario. A replacement must keep the baseline fact's semantic key.
 */
export function resolveScenarioFact<T>(
  baselineFact: EnergyFact<T>,
  scenario?: EnergyScenario,
): EnergyFact<T> {
  if (scenario == null) return baselineFact;
  const delta = scenario.deltas.find(
    (candidate) => candidate.baselineFactId === baselineFact.id,
  );
  if (delta == null) return baselineFact;
  if (delta.replacement.key !== baselineFact.key) {
    throw new Error(
      `Scenario delta ${delta.id} changes semantic key ${baselineFact.key} to ${delta.replacement.key}.`,
    );
  }
  return delta.replacement as EnergyFact<T>;
}

export function scenarioDeltaFactIds(
  scenario: EnergyScenario | undefined,
): ReadonlySet<string> {
  return new Set(scenario?.deltas.map((delta) => delta.baselineFactId) ?? []);
}
