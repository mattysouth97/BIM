// src/lib/generative/client.ts
//
// Browser-side client for the generative endpoints. Consumes the SSE stream so
// the UI can show each stage as it completes rather than freezing (brief §52).
//
// Deliberately free of any Anthropic import: the key lives on the server and
// nothing here knows a model is involved.

import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BimModelSnapshot } from "@/lib/bim/model/types";
import type { BuildingPatch, BuildingReview, BuildingSpec } from "./spec/building-spec";
import type {
  BlueprintSpec,
  BlueprintValidationReport,
} from "./blueprint";
import type { DesignStatus } from "./spec/status";
import type { BuildingMetrics } from "./generate/types";
import type { ValidationReport } from "./validate/rules";
import type { MetricDelta, SpecDiffEntry } from "./patch/diff";
import type { PatchOp } from "./patch/paths";

/* ------------------------------------------------------------------ */
/* Shared shapes                                                       */
/* ------------------------------------------------------------------ */

export interface ProviderSummary {
  name: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  retries: number;
}

/** Everything a built design carries. Identical for a generation and an edit. */
export interface DesignPayload {
  spec: BuildingSpec;
  recipe: BuildingRecipe;
  snapshot: BimModelSnapshot;
  metrics: BuildingMetrics;
  validation: ValidationReport;
  status: DesignStatus;
  approximations: string[];
}

export interface GenerationResult extends DesignPayload {
  success: true;
  generationId: string;
  revision: number;
  seed: number;
  provider: ProviderSummary;
}

export interface RejectedOpSummary {
  path: string;
  reason: string;
  /** `locked` is the user's own decision; `path` is a bad provider proposal. */
  kind: "locked" | "path";
}

export interface ModificationScope {
  kind: "building" | "system" | "level" | "zone" | "space" | "element" | "selection";
  label: string;
  floorNos?: number[];
  elementIds?: string[];
}

/** A candidate design: fully built, reviewable, not yet adopted. */
export interface AppliedEdit extends DesignPayload {
  kind: "applied";
  success: true;
  generationId: string;
  revision: number;
  patch: BuildingPatch;
  applied: PatchOp[];
  rejected: RejectedOpSummary[];
  diff: SpecDiffEntry[];
  metricDeltas: MetricDelta[];
  provider: ProviderSummary;
  /* modify */
  instruction?: string;
  scope?: ModificationScope;
  /* repair */
  attempt?: number;
  attemptsRemaining?: number;
  targetedCodes?: string[];
  resolvedCodes?: string[];
}

export interface RejectedEdit {
  kind: "rejected";
  success: false;
  patch: BuildingPatch;
  rejected: RejectedOpSummary[];
  error: { code: string; message: string; detail?: string };
  provider: ProviderSummary;
  instruction?: string;
  scope?: ModificationScope;
}

export interface NothingToRepair {
  kind: "nothing-to-repair";
  success: false;
  message: string;
  validation: ValidationReport;
}

export type EditResult = AppliedEdit | RejectedEdit | NothingToRepair;

export interface EvaluationResult {
  review: BuildingReview;
  grounding: {
    floors: number;
    grossAreaSqm: number;
    netAreaSqm: number;
    circulationRatio: number;
    coreStrategy: string;
    gridXMm: number;
    gridZMm: number;
    violations: number;
    lockedSystems: string[];
  };
  provider: ProviderSummary;
}

export interface StageEvent {
  stage: string;
  label: string;
  index: number;
  total: number;
  detail?: string;
}

/**
 * Repair is bounded (§22). Uncontrolled iteration — repair, re-validate, repair
 * again — is how a generative system burns money and converges on nothing. The
 * route enforces this; the UI reads the same constant so the two cannot drift.
 */
export const MAX_REPAIR_ATTEMPTS = 3;

export class GenerationError extends Error {
  readonly code: string;
  readonly detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

async function postJson(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    // A non-200 means the request never reached the stream (bad input, etc.).
    const detail = await response.json().catch(() => null);
    throw new GenerationError(
      detail?.error?.code ?? "REQUEST_FAILED",
      detail?.error?.message ?? "The request was rejected.",
      Array.isArray(detail?.error?.detail)
        ? detail.error.detail.join("\n")
        : detail?.error?.detail,
    );
  }
  return response;
}

/**
 * Read an SSE stream to completion, forwarding stages and returning the single
 * `result` payload. A stream that ends without one is an error, not an empty
 * success — silently rendering nothing would look like the model refused.
 */
async function readEventStream<T>(
  response: Response,
  onStage: ((event: StageEvent) => void) | undefined,
): Promise<T> {
  if (!response.body) {
    throw new GenerationError("NO_STREAM", "The server returned no stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (event.type === "stage") {
        onStage?.(event as unknown as StageEvent);
      } else if (event.type === "result") {
        result = event.payload as T;
      } else if (event.type === "error") {
        throw new GenerationError(
          String(event.code ?? "REQUEST_FAILED"),
          String(event.message ?? "The request failed."),
          event.detail ? String(event.detail) : undefined,
        );
      }
    }
  }

  if (!result) {
    throw new GenerationError(
      "INCOMPLETE",
      "The stream ended before a result was produced.",
    );
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  prompt: string;
  buildingPk?: string;
  seed?: number;
  hints?: Record<string, unknown>;
  designRules?: string[];
  locks?: string[];
  onStage?: (event: StageEvent) => void;
  signal?: AbortSignal;
}

export async function generateBuilding(
  options: GenerateOptions,
): Promise<GenerationResult> {
  const response = await postJson(
    "/api/generative/generate",
    {
      prompt: options.prompt,
      buildingPk: options.buildingPk ?? "generated",
      seed: options.seed,
      hints: options.hints,
      designRules: options.designRules,
      locks: options.locks ?? [],
    },
    options.signal,
  );
  return readEventStream<GenerationResult>(response, options.onStage);
}

/* ------------------------------------------------------------------ */
/* Generate from a schematic                                           */
/* ------------------------------------------------------------------ */

/**
 * A generation driven by a drawn schematic rather than a sentence. The result
 * is a `GenerationResult` plus the schematic's own audit trail: the blueprint
 * that produced it, the blueprint's validation report, and the locks its
 * "exact" fidelity implied. Those three are what let the plan view prove the
 * building followed the drawing.
 */
export interface BlueprintGenerationResult extends GenerationResult {
  blueprint: BlueprintSpec;
  blueprintValidation: BlueprintValidationReport;
  compiledLocks: string[];
}

export interface GenerateFromBlueprintOptions {
  blueprint: BlueprintSpec;
  /** Optional prose intent. It becomes design intent; it moves no geometry. */
  prompt?: string;
  buildingPk?: string;
  seed?: number;
  locks?: string[];
  onStage?: (event: StageEvent) => void;
  signal?: AbortSignal;
}

export async function generateFromBlueprint(
  options: GenerateFromBlueprintOptions,
): Promise<BlueprintGenerationResult> {
  const response = await postJson(
    "/api/generative/generate-from-blueprint",
    {
      blueprint: options.blueprint,
      buildingPk: options.buildingPk ?? "generated",
      ...(options.prompt ? { prompt: options.prompt } : {}),
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      locks: options.locks ?? [],
    },
    options.signal,
  );
  return readEventStream<BlueprintGenerationResult>(response, options.onStage);
}

/* ------------------------------------------------------------------ */
/* Modify                                                              */
/* ------------------------------------------------------------------ */

export interface ModifyOptions {
  spec: BuildingSpec;
  instruction: string;
  scope?: ModificationScope;
  buildingPk?: string;
  revision?: number;
  locks?: string[];
  designRules?: string[];
  onStage?: (event: StageEvent) => void;
  signal?: AbortSignal;
}

export async function modifyBuilding(options: ModifyOptions): Promise<EditResult> {
  const response = await postJson(
    "/api/generative/modify",
    {
      spec: options.spec,
      instruction: options.instruction,
      scope: options.scope ?? { kind: "building", label: "Whole building" },
      buildingPk: options.buildingPk ?? "generated",
      revision: options.revision ?? 0,
      locks: options.locks ?? [],
      designRules: options.designRules ?? [],
    },
    options.signal,
  );
  return readEventStream<EditResult>(response, options.onStage);
}

/* ------------------------------------------------------------------ */
/* Repair                                                              */
/* ------------------------------------------------------------------ */

export interface RepairOptions {
  spec: BuildingSpec;
  attempt?: number;
  /** Restrict the repair to these violation codes. Empty ⇒ all non-advisory. */
  codes?: string[];
  buildingPk?: string;
  revision?: number;
  locks?: string[];
  onStage?: (event: StageEvent) => void;
  signal?: AbortSignal;
}

export async function repairBuilding(options: RepairOptions): Promise<EditResult> {
  const response = await postJson(
    "/api/generative/repair",
    {
      spec: options.spec,
      attempt: options.attempt ?? 1,
      codes: options.codes ?? [],
      buildingPk: options.buildingPk ?? "generated",
      revision: options.revision ?? 0,
      locks: options.locks ?? [],
    },
    options.signal,
  );
  return readEventStream<EditResult>(response, options.onStage);
}

/* ------------------------------------------------------------------ */
/* Evaluate                                                            */
/* ------------------------------------------------------------------ */

export async function evaluateBuilding(options: {
  spec: BuildingSpec;
  buildingPk?: string;
  revision?: number;
  locks?: string[];
  signal?: AbortSignal;
}): Promise<EvaluationResult> {
  const response = await postJson(
    "/api/generative/evaluate",
    {
      spec: options.spec,
      buildingPk: options.buildingPk ?? "generated",
      revision: options.revision ?? 0,
      locks: options.locks ?? [],
    },
    options.signal,
  );

  const payload = await response.json();
  if (!payload?.success) {
    throw new GenerationError(
      payload?.error?.code ?? "EVALUATION_FAILED",
      payload?.error?.message ?? "The building could not be explained.",
      payload?.error?.detail,
    );
  }
  return payload as EvaluationResult;
}
