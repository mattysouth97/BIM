import { stableId } from "./ids";
import type {
  CanonicalEnergyModel,
  ConflictRecord,
  EnergyFact,
  EvidenceAuthority,
  EvidenceStatus,
  ExtractionMethod,
  IsoDateTime,
  SourceReference,
} from "./types";

/** Lower values are stronger and match the documented source-of-truth order. */
export const SOURCE_PRIORITY: Readonly<Record<EvidenceAuthority, number>> = {
  user_confirmed_project_value: 1,
  explicit_schedule_or_specification: 2,
  dimensioned_vector_geometry: 3,
  drawing_annotation: 4,
  repeated_graphical_evidence: 5,
  deterministic_rule_inference: 6,
  project_template: 7,
  regional_or_engine_default: 8,
};

export type CreateEnergyFactInput<T> = Readonly<{
  id?: string;
  key: string;
  value: T | null;
  unit?: string;
  status: EvidenceStatus;
  confidence: number | null;
  sourceRefs?: readonly SourceReference[];
  extractionMethod: ExtractionMethod;
  authority: EvidenceAuthority;
  assumptionId?: string;
  conflictIds?: readonly string[];
  reviewedByUser?: boolean;
  createdAt: IsoDateTime;
  updatedAt?: IsoDateTime;
}>;

export function createEnergyFact<T>(
  input: CreateEnergyFactInput<T>,
): EnergyFact<T> {
  const sourceRefs = input.sourceRefs ?? [];
  const confidence = normalizeConfidence(input.confidence);

  if (input.status === "missing" && input.value !== null) {
    throw new Error(`Missing fact ${input.key} must have a null value.`);
  }
  if (input.status !== "missing" && input.value === null) {
    throw new Error(`Non-missing fact ${input.key} cannot have a null value.`);
  }
  if (
    sourceRefs.length === 0 &&
    !input.assumptionId &&
    input.extractionMethod !== "user_input" &&
    input.status !== "missing"
  ) {
    throw new Error(
      `Fact ${input.key} needs source evidence, user input, or an assumption.`,
    );
  }

  return Object.freeze({
    id:
      input.id ??
      stableId(
        "fact",
        input.key,
        input.value,
        input.authority,
        sourceRefs.map((source) => source.id),
      ),
    key: input.key,
    value: input.value,
    ...(input.unit ? { unit: input.unit } : {}),
    status: input.status,
    confidence,
    sourceRefs: Object.freeze([...sourceRefs]),
    extractionMethod: input.extractionMethod,
    authority: input.authority,
    ...(input.assumptionId ? { assumptionId: input.assumptionId } : {}),
    ...(input.conflictIds && input.conflictIds.length > 0
      ? { conflictIds: Object.freeze([...input.conflictIds]) }
      : {}),
    reviewedByUser: input.reviewedByUser ?? false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  });
}

export function createMissingFact<T>(input: Readonly<{
  id?: string;
  key: string;
  unit?: string;
  createdAt: IsoDateTime;
}>): EnergyFact<T> {
  return createEnergyFact<T>({
    ...input,
    value: null,
    status: "missing",
    confidence: null,
    sourceRefs: [],
    extractionMethod: "engine_default",
    authority: "regional_or_engine_default",
    reviewedByUser: false,
  });
}

export function sourcePriorityOf(fact: EnergyFact<unknown>): number {
  return SOURCE_PRIORITY[fact.authority];
}

export type CandidateResolution<T> = Readonly<{
  selected: EnergyFact<T>;
  conflict: ConflictRecord<T> | null;
}>;

/**
 * Resolves candidates without discarding disagreements. Ties are deterministic:
 * source priority, then confidence, then stable fact id.
 */
export function resolveFactCandidates<T>(input: Readonly<{
  key: string;
  candidates: readonly EnergyFact<T>[];
  affectedObjectIds?: readonly string[];
  blocking: boolean;
  downstreamImpact: string;
  createdAt: IsoDateTime;
}>): CandidateResolution<T> {
  if (input.candidates.length === 0) {
    throw new Error(`Cannot resolve ${input.key} without candidates.`);
  }
  for (const candidate of input.candidates) {
    if (candidate.key !== input.key) {
      throw new Error(
        `Candidate ${candidate.id} has key ${candidate.key}, expected ${input.key}.`,
      );
    }
  }

  const ranked = [...input.candidates].sort(compareFacts);
  const selected = ranked[0];
  const uniqueValues = new Set(ranked.map((fact) => stableValue(fact.value)));
  if (uniqueValues.size <= 1) return { selected, conflict: null };

  const conflictId = stableId(
    "conflict",
    input.key,
    ranked.map((fact) => [fact.id, fact.value]),
  );
  const selectedWithConflict = createEnergyFact<T>({
    ...selected,
    status: "conflicted",
    conflictIds: [...(selected.conflictIds ?? []), conflictId],
    updatedAt: input.createdAt,
  });

  return {
    selected: selectedWithConflict,
    conflict: Object.freeze({
      id: conflictId,
      key: input.key,
      affectedObjectIds: Object.freeze([...(input.affectedObjectIds ?? [])]),
      candidates: Object.freeze(
        ranked.map((fact) =>
          Object.freeze({ fact, priority: sourcePriorityOf(fact) }),
        ),
      ),
      selectedFactId: selected.id,
      selectionRationale:
        `Auto-selected ${selected.id} using documented source priority; ` +
        "the disagreement remains visible and reversible.",
      resolutionStatus: "auto_selected_visible",
      blocking: input.blocking,
      downstreamImpact: input.downstreamImpact,
      createdAt: input.createdAt,
    }),
  };
}

export function findFactById(
  model: CanonicalEnergyModel,
  factId: string,
): EnergyFact<unknown> | undefined {
  return model.facts.find((fact) => fact.id === factId);
}

export function findFactsByKey(
  model: CanonicalEnergyModel,
  key: string,
): readonly EnergyFact<unknown>[] {
  return model.facts.filter((fact) => fact.key === key);
}

/**
 * Collects each structurally embedded fact exactly once. This is used to build
 * the flat lookup without creating a second source of truth.
 */
export function collectEnergyFacts(value: unknown): readonly EnergyFact<unknown>[] {
  const found = new Map<string, EnergyFact<unknown>>();
  const seen = new WeakSet<object>();

  const visit = (current: unknown, propertyName?: string): void => {
    if (!current || typeof current !== "object") return;
    if (seen.has(current)) return;
    seen.add(current);

    if (isEnergyFact(current)) {
      const previous = found.get(current.id);
      if (previous && stableValue(previous) !== stableValue(current)) {
        throw new Error(`Divergent EnergyFact copies share id ${current.id}.`);
      }
      found.set(current.id, current);
      return;
    }
    if (Array.isArray(current)) {
      for (const child of current) visit(child, propertyName);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      // A model's flat lookup is an index, not another traversal root.
      if (key === "facts" || propertyName === "facts") continue;
      visit(child, key);
    }
  };

  visit(value);
  return Object.freeze([...found.values()].sort((a, b) => a.id.localeCompare(b.id)));
}

/**
 * Purely replaces every embedded and flat copy of a fact. Structural sharing
 * is retained for branches that do not contain the target fact.
 */
export function replaceFact<T>(value: T, replacement: EnergyFact<unknown>): T {
  const memo = new WeakMap<object, unknown>();

  const walk = (current: unknown): unknown => {
    if (!current || typeof current !== "object") return current;
    if (isEnergyFact(current) && current.id === replacement.id) {
      return replacement;
    }
    const memoized = memo.get(current);
    if (memoized !== undefined) return memoized;

    if (Array.isArray(current)) {
      let changed = false;
      const next: unknown[] = [];
      memo.set(current, next);
      for (const child of current) {
        const replaced = walk(child);
        next.push(replaced);
        changed ||= replaced !== child;
      }
      const result = changed ? Object.freeze(next) : current;
      memo.set(current, result);
      return result;
    }

    let changed = false;
    const source = current as Readonly<Record<string, unknown>>;
    const next: Record<string, unknown> = {};
    memo.set(current, next);
    for (const [key, child] of Object.entries(source)) {
      const replaced = walk(child);
      next[key] = replaced;
      changed ||= replaced !== child;
    }
    const result = changed ? Object.freeze(next) : current;
    memo.set(current, result);
    return result;
  };

  return walk(value) as T;
}

export function assertMaterialFactsHaveProvenance(
  model: Pick<CanonicalEnergyModel, "facts" | "assumptions">,
): void {
  const knownAssumptionIds = new Set(
    model.assumptions.map((assumption) => assumption.id),
  );
  for (const fact of model.facts) {
    if (fact.status === "missing") continue;
    const hasIndependentOrigin =
      fact.sourceRefs.length > 0 || fact.extractionMethod === "user_input";
    if (
      !hasIndependentOrigin &&
      fact.assumptionId != null &&
      !knownAssumptionIds.has(fact.assumptionId)
    ) {
      throw new Error(
        `Fact ${fact.id} references unknown assumption ${fact.assumptionId}.`,
      );
    }
    const hasOrigin =
      hasIndependentOrigin ||
      (fact.assumptionId != null && knownAssumptionIds.has(fact.assumptionId));
    if (!hasOrigin) throw new Error(`Fact ${fact.id} has no traceable origin.`);
  }
}

function compareFacts(left: EnergyFact<unknown>, right: EnergyFact<unknown>): number {
  const priority = sourcePriorityOf(left) - sourcePriorityOf(right);
  if (priority !== 0) return priority;
  const confidence = (right.confidence ?? -1) - (left.confidence ?? -1);
  if (confidence !== 0) return confidence;
  return left.id.localeCompare(right.id);
}

function normalizeConfidence(confidence: number | null): number | null {
  if (confidence === null) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Confidence must be null or between 0 and 1; got ${confidence}.`);
  }
  return confidence;
}

function isEnergyFact(value: object): value is EnergyFact<unknown> {
  const candidate = value as Partial<EnergyFact<unknown>>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.key === "string" &&
    typeof candidate.status === "string" &&
    Array.isArray(candidate.sourceRefs) &&
    typeof candidate.extractionMethod === "string" &&
    typeof candidate.authority === "string" &&
    typeof candidate.reviewedByUser === "boolean"
  );
}

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableValue(child)}`)
    .join(",")}}`;
}
