/**
 * Refinement — replacing a baseline assumption with something the user
 * actually knows about their building.
 *
 * This is the second half of the product: the 건축물대장 gives a baseline whose
 * envelope, systems and operation are era-code defaults, and the user then
 * moves each of those toward the real building using a drawing, a schedule, or
 * a value they can state. Every upgrade:
 *
 *  - keeps the fact's identity, so assumption records, scenario deltas,
 *    conflicts and spatial result mappings all keep pointing at it;
 *  - records WHERE the new value came from, so a typed number is never
 *    presented as a reading off a drawing;
 *  - retires the assumption it replaces instead of leaving a stale one;
 *  - is reversible, because the baseline revision is never mutated.
 *
 * Deliberately does NOT go through `createScenarioDelta`: that helper stamps
 * every typed number as `user_confirmed` / `user_confirmed_project_value` /
 * confidence 1, which would launder a guess into the same authority as a
 * specification. A scenario asks "what if"; a refinement asserts "this is what
 * the building is". They are different claims and must stay separate.
 */

import { collectEnergyFacts, createEnergyFact, replaceFact } from "./facts";
import { reconcileCanonicalModelFingerprint } from "./simulation";
import type {
  AssumptionRecord,
  CanonicalEnergyModel,
  EnergyFact,
  EvidenceAuthority,
  EvidenceStatus,
  ExtractionMethod,
  IsoDateTime,
  SourceReference,
} from "./types";
import { validateCanonicalEnergyModel } from "./validation";

/** Where a refined value came from. This is the honesty boundary. */
export type RefinementProvenance =
  /**
   * The user states a value they know for their building (a commissioning
   * report, a product datasheet, a survey). Authoritative because a person
   * took responsibility for it — but never dressed up as a document reading.
   */
  | Readonly<{ kind: "stated_by_user"; note?: string }>
  /** Read off a registered document — a schedule, a detail, a specification. */
  | Readonly<{
      kind: "read_from_document";
      sourceRefs: readonly SourceReference[];
      confidence?: number;
      note?: string;
    }>;

export type FactUpgrade = Readonly<{
  /** The baseline fact being replaced. Its id is preserved. */
  targetFactId: string;
  value: unknown;
  provenance: RefinementProvenance;
}>;

export type RefinementPlan = Readonly<{
  upgrades: readonly FactUpgrade[];
  /**
   * Assumptions these upgrades retire. Each is marked as overridden by the
   * fact that replaced it rather than deleted, so the history stays readable.
   */
  clearedAssumptionIds?: readonly string[];
}>;

export type AppliedUpgrade = Readonly<{
  factId: string;
  key: string;
  fromValue: unknown;
  toValue: unknown;
  fromAuthority: EvidenceAuthority;
  toAuthority: EvidenceAuthority;
  fromStatus: EvidenceStatus;
  toStatus: EvidenceStatus;
}>;

export type RefinementRejection =
  | "unknown_fact"
  | "type_mismatch"
  | "non_finite_value"
  | "empty_plan"
  | "model_invalid";

export type RefinementOutcome =
  | Readonly<{
      status: "applied";
      model: CanonicalEnergyModel;
      upgrades: readonly AppliedUpgrade[];
      clearedAssumptionIds: readonly string[];
    }>
  | Readonly<{
      status: "rejected";
      reason: RefinementRejection;
      message: string;
      /** Present for `model_invalid`: what the change would have broken. */
      issues?: readonly string[];
    }>;

function rejected(
  reason: RefinementRejection,
  message: string,
  issues?: readonly string[],
): RefinementOutcome {
  return Object.freeze({
    status: "rejected" as const,
    reason,
    message,
    ...(issues ? { issues: Object.freeze([...issues]) } : {}),
  });
}

function provenanceFields(provenance: RefinementProvenance): Readonly<{
  status: EvidenceStatus;
  extractionMethod: ExtractionMethod;
  authority: EvidenceAuthority;
  confidence: number | null;
  sourceRefs: readonly SourceReference[];
}> {
  if (provenance.kind === "read_from_document") {
    return {
      status: "extracted",
      extractionMethod: "schedule_table",
      authority: "explicit_schedule_or_specification",
      confidence: provenance.confidence ?? 0.9,
      sourceRefs: provenance.sourceRefs,
    };
  }
  return {
    // A person asserting a project value is authoritative, but it carries no
    // measured confidence and cites no document — both of which stay visible.
    status: "user_confirmed",
    extractionMethod: "user_input",
    authority: "user_confirmed_project_value",
    confidence: null,
    sourceRefs: [],
  };
}

/** Same JS type, so a number never silently becomes a string. */
function sameShape(before: unknown, after: unknown): boolean {
  if (typeof before !== typeof after) return false;
  if (Array.isArray(before) !== Array.isArray(after)) return false;
  return true;
}

export function commitRefinement(
  model: CanonicalEnergyModel,
  plan: RefinementPlan,
  now: IsoDateTime = new Date().toISOString(),
): RefinementOutcome {
  if (plan.upgrades.length === 0) {
    return rejected("empty_plan", "No refinement was supplied.");
  }

  const byId = new Map(model.facts.map((fact) => [fact.id, fact]));
  const applied: AppliedUpgrade[] = [];
  let next: CanonicalEnergyModel = model;

  for (const upgrade of plan.upgrades) {
    const before = byId.get(upgrade.targetFactId);
    if (!before) {
      return rejected(
        "unknown_fact",
        `No fact ${upgrade.targetFactId} exists in this model.`,
      );
    }
    if (upgrade.value == null) {
      return rejected(
        "type_mismatch",
        `A refined value for ${before.key} cannot be empty.`,
      );
    }
    if (!sameShape(before.value, upgrade.value)) {
      return rejected(
        "type_mismatch",
        `A refined value for ${before.key} must be the same kind of value as the baseline.`,
      );
    }
    if (typeof upgrade.value === "number" && !Number.isFinite(upgrade.value)) {
      return rejected(
        "non_finite_value",
        `A refined value for ${before.key} must be a finite number.`,
      );
    }

    const fields = provenanceFields(upgrade.provenance);
    const replacement: EnergyFact<unknown> = createEnergyFact({
      // Identity is preserved: assumption records, scenario deltas, conflicts
      // and result mappings all reference facts by id.
      id: before.id,
      key: before.key,
      value: upgrade.value,
      ...(before.unit ? { unit: before.unit } : {}),
      status: fields.status,
      confidence: fields.confidence,
      sourceRefs: fields.sourceRefs,
      extractionMethod: fields.extractionMethod,
      authority: fields.authority,
      // The assumption is retired, so the fact stops naming it.
      reviewedByUser: true,
      createdAt: before.createdAt,
      updatedAt: now,
    });

    next = replaceFact(next, replacement);
    applied.push(
      Object.freeze({
        factId: before.id,
        key: before.key,
        fromValue: before.value,
        toValue: upgrade.value,
        fromAuthority: before.authority,
        toAuthority: replacement.authority,
        fromStatus: before.status,
        toStatus: replacement.status,
      }),
    );
  }

  // An assumption whose facts have all been replaced is marked overridden by
  // the fact that replaced it — kept, not deleted, so the history reads.
  const upgradedIds = new Set(applied.map((entry) => entry.factId));
  const explicitlyCleared = new Set(plan.clearedAssumptionIds ?? []);
  const assumptions: AssumptionRecord[] = next.assumptions.map((assumption) => {
    if (assumption.overriddenByFactId) return assumption;
    const stillAssumed = next.facts.some(
      (fact) => fact.assumptionId === assumption.id && !upgradedIds.has(fact.id),
    );
    const shouldClear = explicitlyCleared.has(assumption.id) || !stillAssumed;
    if (!shouldClear) return assumption;
    const cause = applied.find((entry) => {
      const fact = model.facts.find((candidate) => candidate.id === entry.factId);
      return fact?.assumptionId === assumption.id;
    });
    if (!cause) return assumption;
    return Object.freeze({ ...assumption, overriddenByFactId: cause.factId });
  });

  const shell: CanonicalEnergyModel = {
    ...next,
    assumptions: Object.freeze(assumptions),
    facts: [],
    updatedAt: now,
  };
  const indexed: CanonicalEnergyModel = Object.freeze({
    ...shell,
    facts: collectEnergyFacts(shell),
  });
  const validation = validateCanonicalEnergyModel(indexed);
  if (!validation.validForSimulation) {
    return rejected(
      "model_invalid",
      "That value would leave the model unable to simulate.",
      validation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message),
    );
  }

  const refreshed = reconcileCanonicalModelFingerprint(
    Object.freeze({
      ...indexed,
      readiness: Object.freeze([...validation.readiness]),
    }),
  );

  return Object.freeze({
    status: "applied" as const,
    model: refreshed,
    upgrades: Object.freeze(applied),
    clearedAssumptionIds: Object.freeze(
      assumptions
        .filter(
          (assumption, index) =>
            assumption.overriddenByFactId &&
            !next.assumptions[index]?.overriddenByFactId,
        )
        .map((assumption) => assumption.id),
    ),
  });
}

/**
 * Corrections the user already made, expressed so they can be re-applied to a
 * REBUILT model.
 *
 * Rebuilding the baseline from a better outline necessarily mints new fact
 * ids, so a carried-over correction is matched by fact key instead. Only the
 * user's own assertions and document readings travel; era defaults are left
 * behind so the rebuilt model derives them fresh.
 */
export function capturedRefinements(
  model: CanonicalEnergyModel,
): readonly Readonly<{
  key: string;
  value: unknown;
  provenance: RefinementProvenance;
}>[] {
  return Object.freeze(
    model.facts
      .filter(
        (fact) =>
          fact.assumptionId == null &&
          fact.value != null &&
          // Source-document metadata (`drawing.<id>.units`, `.drawingScale`)
          // and the register's own readings (`ledger.*`) are regenerated by a
          // rebuild. Only what the USER asserted about the building travels.
          !fact.key.startsWith("drawing.") &&
          !fact.key.startsWith("ledger.") &&
          (fact.status === "user_confirmed" ||
            (fact.status === "extracted" &&
              fact.authority === "explicit_schedule_or_specification")),
      )
      .map((fact) =>
        Object.freeze({
          key: fact.key,
          value: fact.value,
          provenance:
            fact.status === "user_confirmed"
              ? ({ kind: "stated_by_user" } as const)
              : ({
                  kind: "read_from_document",
                  sourceRefs: fact.sourceRefs,
                  ...(fact.confidence != null
                    ? { confidence: fact.confidence }
                    : {}),
                } as const),
        }),
      ),
  );
}

/**
 * Re-applies captured corrections to a freshly built model, matching by fact
 * key. Keys that no longer exist are reported rather than silently dropped —
 * a correction that quietly vanished would leave the user believing a value
 * they set is still in force.
 */
export function reapplyRefinements(
  model: CanonicalEnergyModel,
  captured: readonly Readonly<{
    key: string;
    value: unknown;
    provenance: RefinementProvenance;
  }>[],
  now?: IsoDateTime,
): Readonly<{
  outcome: RefinementOutcome;
  droppedKeys: readonly string[];
}> {
  const byKey = new Map(model.facts.map((fact) => [fact.key, fact]));
  const upgrades: FactUpgrade[] = [];
  const dropped: string[] = [];
  for (const entry of captured) {
    const target = byKey.get(entry.key);
    if (!target) {
      dropped.push(entry.key);
      continue;
    }
    if (target.value === entry.value) continue;
    upgrades.push({
      targetFactId: target.id,
      value: entry.value,
      provenance: entry.provenance,
    });
  }
  if (upgrades.length === 0) {
    return Object.freeze({
      outcome: Object.freeze({
        status: "applied" as const,
        model,
        upgrades: Object.freeze([]),
        clearedAssumptionIds: Object.freeze([]),
      }),
      droppedKeys: Object.freeze(dropped),
    });
  }
  return Object.freeze({
    outcome: commitRefinement(model, { upgrades }, now),
    droppedKeys: Object.freeze(dropped),
  });
}

/**
 * The baseline facts a user can meaningfully state a real value for, grouped
 * the way the register's own assumptions are grouped.
 *
 * Keys are matched by suffix so per-construction facts
 * (`envelope.construction.<id>.uValueWPerM2K`) resolve without hardcoding ids.
 */
export const REFINABLE_FACT_KEYS = Object.freeze({
  envelope: Object.freeze([
    ".uValueWPerM2K",
    ".shgc",
    "envelope.infiltrationAirChangesPerHour",
  ]),
  systems: Object.freeze([
    ".heatingEfficiency",
    ".coolingCop",
    ".heatRecoveryEfficiency",
    ".ventilationLps",
  ]),
  usage: Object.freeze([
    ".lightingPowerDensityWPerSqm",
    ".equipmentPowerDensityWPerSqm",
    ".occupancyDensityPeoplePerSqm",
    ".heatingSetpointC",
    ".coolingSetpointC",
  ]),
});

export type RefinableGroup = keyof typeof REFINABLE_FACT_KEYS;

export function refinableFacts(
  model: CanonicalEnergyModel,
  group: RefinableGroup,
): readonly EnergyFact<number>[] {
  const suffixes = REFINABLE_FACT_KEYS[group];
  return Object.freeze(
    model.facts.filter(
      (fact): fact is EnergyFact<number> =>
        typeof fact.value === "number" &&
        suffixes.some((suffix) =>
          suffix.startsWith(".") ? fact.key.endsWith(suffix) : fact.key === suffix,
        ),
    ),
  );
}
