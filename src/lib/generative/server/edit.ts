// src/lib/generative/server/edit.ts
//
// The shared spine of every edit: modification and repair differ only in what
// produces the patch.
//
// The order is deliberate and is the safety property of the whole feature:
//
//   patch → apply (locks + schema) → REBUILD → validate → diff
//
// The rebuild happens BEFORE the user is asked to accept anything, so the diff
// they review is measured off real geometry rather than predicted from the
// operations. A patch that validates cleanly but produces a building with three
// unreachable rooms shows up here, at review time, not after acceptance.
//
// Nothing is committed server-side. The route hands back a fully-built candidate
// and the client decides whether it becomes the current design — which is also
// what makes design options and branching possible at all.

import { z } from "zod";

import { buildDesign, generationIdFor } from "../build";
import { applySpecPatch } from "../patch/apply";
import { diffMetrics, diffSpecs } from "../patch/diff";
import { lockDescriptions, type LockToken } from "../session/locks";
import {
  BuildingSpecSchema,
  type BuildingPatch,
  type BuildingSpec,
} from "../spec/building-spec";
import type { BimSummary, ProviderResult } from "../provider/types";
import type { BuiltDesign } from "../build";
import type { Send } from "./stream";

/** Fields every edit route accepts. Routes extend this with their own. */
export const EditRequestBase = {
  spec: z.unknown(),
  buildingPk: z.string().min(1).max(120).default("generated"),
  /** Lineage counter — becomes the `.n` suffix on the generation id. */
  revision: z.number().int().min(0).max(9_999).default(0),
  locks: z.array(z.string().min(3).max(120)).max(200).default([]),
  designRules: z.array(z.string().max(300)).max(40).default([]),
};

export function parseSpec(
  raw: unknown,
): { ok: true; spec: BuildingSpec } | { ok: false; detail: string[] } {
  const parsed = BuildingSpecSchema.safeParse(raw);
  if (parsed.success) return { ok: true, spec: parsed.data };
  return {
    ok: false,
    detail: parsed.error.issues
      .slice(0, 20)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}

const TOTAL_STAGES = 13;

/** Build the design the user is currently looking at, so advice is grounded. */
export function readCurrentDesign(input: {
  spec: BuildingSpec;
  buildingPk: string;
  revision: number;
  locks: LockToken[];
  send: Send;
}): BuiltDesign {
  input.send({
    type: "stage",
    stage: "reading",
    label: "Reading the current model",
    index: 0,
    total: TOTAL_STAGES,
  });

  return buildDesign({
    spec: input.spec,
    buildingPk: input.buildingPk,
    generationId: generationIdFor(input.spec.generationSeed, input.revision),
    locks: input.locks,
  });
}

export type EditOutcome =
  | {
      kind: "applied";
      generationId: string;
      revision: number;
      spec: BuildingSpec;
      patch: BuildingPatch;
      applied: BuildingPatch["operations"];
      rejected: Array<{ path: string; reason: string; kind: "locked" | "path" }>;
      diff: ReturnType<typeof diffSpecs>;
      metricDeltas: ReturnType<typeof diffMetrics>;
      recipe: BuiltDesign["recipe"];
      snapshot: BuiltDesign["snapshot"];
      metrics: BuiltDesign["metrics"];
      validation: BuiltDesign["validation"];
      status: BuiltDesign["status"];
      approximations: string[];
    }
  | {
      kind: "rejected";
      patch: BuildingPatch;
      rejected: Array<{ path: string; reason: string; kind: "locked" | "path" }>;
      error: { code: string; message: string; detail?: string };
    };

/**
 * Apply a proposed patch and rebuild. Returns a candidate design; commits
 * nothing. A rejected patch is a first-class outcome, not an exception — the
 * user needs to see WHICH operation a lock stopped, and why.
 */
export function completeEdit(input: {
  current: BuiltDesign;
  spec: BuildingSpec;
  patch: BuildingPatch;
  buildingPk: string;
  revision: number;
  locks: LockToken[];
  send: Send;
}): EditOutcome {
  const application = applySpecPatch({
    spec: input.spec,
    patch: input.patch,
    locks: input.locks,
  });

  const rejected = application.rejected.map((r) => ({
    path: r.op.path,
    reason: r.reason,
    kind: r.kind,
  }));

  if (!application.ok) {
    return {
      kind: "rejected",
      patch: input.patch,
      rejected,
      error: application.error ?? {
        code: "ALL_REJECTED",
        message: "The change could not be applied.",
      },
    };
  }

  const nextRevision = input.revision + 1;
  const generationId = generationIdFor(application.spec.generationSeed, nextRevision);

  const next = buildDesign({
    spec: application.spec,
    buildingPk: input.buildingPk,
    generationId,
    locks: input.locks,
    // Locked and human-modified elements survive the rebuild (§42).
    authoredElements: input.current.snapshot.elements.filter(
      (element) =>
        element.locked === true ||
        element.origin === "authored" ||
        element.generationSource?.type === "MODIFIED" ||
        element.generationSource?.type === "AUTHORED",
    ),
    onStage: (progress) =>
      input.send({
        type: "stage",
        stage: progress.stage,
        label: progress.label,
        index: progress.index + 2,
        total: TOTAL_STAGES,
        ...(progress.detail ? { detail: progress.detail } : {}),
      }),
  });

  input.send({
    type: "stage",
    stage: "validating",
    label: "Validating the change",
    index: TOTAL_STAGES - 1,
    total: TOTAL_STAGES,
  });

  return {
    kind: "applied",
    generationId,
    revision: nextRevision,
    spec: application.spec,
    patch: input.patch,
    applied: application.applied,
    rejected,
    diff: diffSpecs(input.spec, application.spec),
    metricDeltas: diffMetrics(input.current.metrics, next.metrics),
    recipe: next.recipe,
    snapshot: next.snapshot,
    metrics: next.metrics,
    validation: next.validation,
    status: next.status,
    approximations: next.approximations,
  };
}

/** What the provider is told it may not touch, in words it can act on (§41). */
export function lockedForProvider(locks: LockToken[]): string[] {
  return lockDescriptions(locks);
}

export function providerTraceOf<T>(result: ProviderResult<T>) {
  return {
    name: result.trace.provider,
    model: result.trace.model,
    latencyMs: result.trace.latencyMs,
    inputTokens: result.trace.inputTokens,
    outputTokens: result.trace.outputTokens,
    retries: result.trace.retries,
  };
}

export type { BimSummary };
