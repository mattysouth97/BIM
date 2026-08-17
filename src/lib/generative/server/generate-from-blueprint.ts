// src/lib/generative/server/generate-from-blueprint.ts
//
// The native schematic path: BlueprintSpec → BuildingSpec → building.
//
// NO REASONING MODEL IS CALLED HERE, and that is the point. A blueprint is
// already semantic — a closed boundary IS the footprint, a zone's program IS a
// SpaceType, a hard hold IS a lock. There is nothing left to interpret, so
// asking a model to interpret it would only introduce variance into a step the
// user already decided. The prompt, if any, travels through as design intent
// prose and changes no geometry.
//
// Factored out of the route so the whole path is testable without a Request and
// without a stream: the route is then a thin SSE translation of the outcome
// this function returns.

import {
  BlueprintSpecSchema,
  compileBlueprintToSpec,
  measureBlueprintFidelity,
  validateBlueprint,
  type BlueprintFidelityReport,
  type BlueprintSpec,
  type BlueprintValidationReport,
  type BlueprintViolation,
} from "../blueprint";
import { buildDesign, generationIdFor } from "../build";
import type { ProgressFn } from "../generate/pipeline";
import { seedFromPrompt } from "../rng";
import { specCoherenceIssues } from "../spec/coherence";
import type { BuildingSpec } from "../spec/building-spec";
import type { BuildingMetrics } from "../generate/types";
import type { ValidationReport } from "../validate/rules";
import type { DesignStatus } from "../spec/status";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BimModelSnapshot } from "@/lib/bim/model/types";

/**
 * Two lead-in stages (reading, compiling) before the ten deterministic pipeline
 * stages, and one closing validation stage — the same shape the prompt route
 * reports, so the studio's stage list does not change meaning between paths.
 */
export const BLUEPRINT_TOTAL_STAGES = 13;

/** Reported by the provider field: no model ran, and the payload says so. */
export const NATIVE_SCHEMATIC_PROVIDER = {
  name: "native-schematic",
  model: "none",
  latencyMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  retries: 0,
} as const;

export interface BlueprintGenerationInput {
  /** Unvalidated: parsed against BlueprintSpecSchema here, never trusted. */
  blueprint: unknown;
  prompt?: string;
  buildingPk?: string;
  seed?: number;
  /** Session locks; merged with the locks the compiler derives from fidelity. */
  locks?: string[];
}

export interface BlueprintGenerationPayload {
  success: true;
  generationId: string;
  revision: number;
  seed: number;
  spec: BuildingSpec;
  recipe: BuildingRecipe;
  snapshot: BimModelSnapshot;
  metrics: BuildingMetrics;
  validation: ValidationReport;
  status: DesignStatus;
  approximations: string[];
  provider: typeof NATIVE_SCHEMATIC_PROVIDER;
  /* --- schematic additions --- */
  /** The blueprint that produced this building, as parsed. */
  blueprint: BlueprintSpec;
  blueprintValidation: BlueprintValidationReport;
  /** Locks the blueprint's "exact" fidelity implies, merged with the request's. */
  compiledLocks: string[];
  /**
   * MEASURED schematic fidelity — boundary, void, core, anchor, zone and
   * topology deviations computed from the generated geometry, one number per
   * dimension and never an aggregate score. This is the proof step: "the
   * building follows the drawing" as arithmetic, not reassurance.
   */
  fidelity: BlueprintFidelityReport;
}

export type BlueprintGenerationFailureCode =
  | "INVALID_BLUEPRINT"
  | "BLUEPRINT_INVALID"
  | "BLUEPRINT_NOT_BUILDABLE"
  | "SCHEMA_VALIDATION_FAILED";

export interface BlueprintGenerationFailure {
  ok: false;
  code: BlueprintGenerationFailureCode;
  message: string;
  /** Our own text, always safe to show — no upstream vendor string reaches here. */
  detail?: string;
  /** Present whenever validation ran; the honest reason the build did not start. */
  blueprintValidation?: BlueprintValidationReport;
}

export type BlueprintGenerationOutcome =
  | { ok: true; payload: BlueprintGenerationPayload }
  | BlueprintGenerationFailure;

/** One line per issue, worst first — the detail the SSE error carries. */
export function describeBlueprintIssues(violations: BlueprintViolation[]): string {
  return violations
    .map(
      (v) =>
        `${v.priority} ${v.code}: ${v.message}${v.suggestion ? ` — ${v.suggestion}` : ""}`,
    )
    .join("\n");
}

/**
 * A P0 issue means the drawing does not resolve: a loop that never closes, an
 * id used twice, a reference to an object that is not there. Generation cannot
 * proceed by guessing which reading was meant, so it does not proceed at all.
 * P1 and below are reported with the result and left visible.
 */
export function runBlueprintGeneration(
  input: BlueprintGenerationInput,
  onStage?: (event: {
    stage: string;
    label: string;
    index: number;
    total: number;
    detail?: string;
  }) => void,
): BlueprintGenerationOutcome {
  const stage = (stageId: string, label: string, index: number, detail?: string) =>
    onStage?.({
      stage: stageId,
      label,
      index,
      total: BLUEPRINT_TOTAL_STAGES,
      ...(detail ? { detail } : {}),
    });

  stage("reading", "Reading the schematic", 0);

  const parsed = BlueprintSpecSchema.safeParse(input.blueprint);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_BLUEPRINT",
      message: "The schematic does not match the blueprint schema.",
      detail: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n"),
    };
  }

  const blueprint = parsed.data;
  const blueprintValidation = validateBlueprint(blueprint);
  const blocking = blueprintValidation.violations.filter((v) => v.priority === "P0");
  if (blocking.length > 0) {
    return {
      ok: false,
      code: "BLUEPRINT_INVALID",
      message: `The schematic has ${blocking.length} issue(s) that make it unusable as design authority.`,
      detail: describeBlueprintIssues(blocking),
      blueprintValidation,
    };
  }

  if (blueprint.boundaries.length === 0) {
    // Not a P0 rule — an empty blueprint is well-formed, just not a building.
    return {
      ok: false,
      code: "BLUEPRINT_NOT_BUILDABLE",
      message: "The schematic has no boundary, so there is no footprint to build.",
      detail: "Draw a closed boundary loop and assign it to at least one level.",
      blueprintValidation,
    };
  }

  const seed =
    input.seed ?? seedFromPrompt(input.prompt ?? blueprint.name, blueprint.id);

  stage("compiling", "Compiling the schematic into a building program", 1);

  let compiled;
  try {
    compiled = compileBlueprintToSpec(blueprint, {
      seed,
      ...(input.prompt ? { prompt: input.prompt } : {}),
    });
  } catch (error) {
    return {
      ok: false,
      code: "BLUEPRINT_NOT_BUILDABLE",
      message: "The schematic could not be compiled into a building program.",
      detail: error instanceof Error ? error.message : undefined,
      blueprintValidation,
    };
  }

  // The compiler is ours and deterministic, but a spec that contradicts itself
  // would build into colliding element ids. Same guard as the prompt route.
  const incoherent = specCoherenceIssues(compiled.spec);
  if (incoherent.length > 0) {
    return {
      ok: false,
      code: "SCHEMA_VALIDATION_FAILED",
      message: "The compiled building specification was internally inconsistent.",
      detail: incoherent.map((issue) => `- ${issue.message}`).join("\n"),
      blueprintValidation,
    };
  }

  // Compiler locks first, then the session's — sorted and de-duplicated so the
  // same blueprint always yields the same lock set.
  const compiledLocks = [
    ...new Set([...compiled.locks, ...(input.locks ?? [])]),
  ].sort();

  const buildingPk = input.buildingPk ?? "generated";
  const generationId = generationIdFor(seed, 0);

  const relay: ProgressFn = (progress) =>
    stage(
      progress.stage,
      progress.label,
      // Offset by the two schematic stages already reported.
      progress.index + 2,
      progress.detail,
    );

  const built = buildDesign({
    spec: compiled.spec,
    buildingPk,
    generationId,
    locks: compiledLocks,
    onStage: relay,
  });

  stage("validating", "Validating building", BLUEPRINT_TOTAL_STAGES - 1);

  return {
    ok: true,
    payload: {
      success: true,
      generationId,
      revision: 0,
      seed,
      spec: compiled.spec,
      recipe: built.recipe,
      snapshot: built.snapshot,
      metrics: built.metrics,
      validation: built.validation,
      status: built.status,
      approximations: built.approximations,
      provider: NATIVE_SCHEMATIC_PROVIDER,
      blueprint,
      blueprintValidation,
      compiledLocks,
      fidelity: measureBlueprintFidelity(blueprint, built.building),
    },
  };
}
