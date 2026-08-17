// src/lib/generative/server/interpret.ts
//
// The IMPORT interpretation seam: measured vector geometry (from a CAD
// import, eventually a traced raster) → a real BlueprintSpec, read through
// the same provider abstraction every other reasoning call goes through.
//
// The reading itself does NOT happen here — `blueprint/from-segments.ts`'s
// `interpretSegmentsToBlueprint` (offline) or Claude's tool call (online)
// does that, behind `BIMReasoningProvider.interpretBlueprint`. Both are
// complete and tested; what was missing was a route that actually reached
// them. This module is that seam: validate the wire shape, resolve whichever
// provider is configured (heuristic works with no API key — brief §65/§66,
// the offline fallback must never be a dead button), and hand back the
// reading UNFILTERED. Assumptions, uncertainties and validation violations
// all ride along, because the moment the user is about to accept a reading
// into the editor ("Use Schematic") is exactly the moment they need to see
// what the reader was unsure about — not a summary that decided for them.
//
// Mirrors `server/generate-from-blueprint.ts`'s outcome shape (`{ok:true,
// payload} | {ok:false,code,message,detail?}`) so the two blueprint routes
// share one error vocabulary, and the same never-trust-the-input discipline:
// `body` here is `unknown`, parsed against `InterpretRequestSchema` inside
// this function, exactly like `runBlueprintGeneration` never trusts its
// `blueprint` field. Unlike that module, this one calls a reasoning
// provider, so provider failures (no credentials, schema retries exhausted,
// an upstream error) are folded into the same outcome via `toErrorEvent` —
// the shared normalizer that also decides which error detail is safe to
// show the client (§65/§95: a raw upstream string never crosses this
// boundary).
//
// SVG→segments (a raster/vector tracing UI) is a separate producer feeding
// the same `segments` contract; this module only ever consumes the
// already-measured `{startMm, endMm, layer?}` shape, never a raster. A raster
// path (`kind: "image"`) exists on the provider interface, but no producer of
// that shape reaches this route yet — wiring it through here would be an
// untested, unreachable branch, so it stays out until one does.

import { z } from "zod";

import {
  PointMmSchema,
  validateBlueprint,
  type BlueprintAssumption,
  type BlueprintSpec,
  type BlueprintViolation,
  type InterpretationUncertainty,
} from "../blueprint";
import { resolveReasoningProvider, type ProviderResult } from "../provider";
import { providerTraceOf } from "./edit";
import { toErrorEvent } from "./stream";

/* ------------------------------------------------------------------ */
/* Request shape — the from-segments wire contract                     */
/* ------------------------------------------------------------------ */

const InterpretSegmentSchema = z.object({
  startMm: PointMmSchema,
  endMm: PointMmSchema,
  /** Originating CAD/drawing layer, when known — the strongest hint available. */
  layer: z.string().min(1).max(120).optional(),
});

const InterpretLabelSchema = z.object({
  text: z.string().min(1).max(500),
  positionMm: PointMmSchema,
  /** Text height in millimetres, when known. Informational only. */
  heightMm: z.number().min(0).max(1_000_000).optional(),
});

export const InterpretRequestSchema = z.object({
  segments: z.array(InterpretSegmentSchema).min(1).max(20_000),
  labels: z.array(InterpretLabelSchema).max(5_000).default([]),
  prompt: z.string().max(4_000).optional(),
});

export type InterpretRequest = z.infer<typeof InterpretRequestSchema>;

/* ------------------------------------------------------------------ */
/* Outcome                                                             */
/* ------------------------------------------------------------------ */

export interface InterpretationPayload {
  success: true;
  /** The read blueprint — design authority the "Use Schematic" flow adopts. */
  blueprint: BlueprintSpec;
  /**
   * Deterministic rule violations found in the READING itself (a self-crossing
   * loop the source drawing genuinely had, a scale never calibrated, ...).
   * Never filtered here — the caller decides what is acceptable to import,
   * this seam only reports what `validateBlueprint` actually found.
   */
  violations: BlueprintViolation[];
  /** What the reader was unsure about, lifted straight off the spec. */
  uncertainties: InterpretationUncertainty[];
  /** Why each inferred value was inferred, lifted straight off the spec. */
  assumptions: BlueprintAssumption[];
  provider: ReturnType<typeof providerTraceOf>;
}

export interface InterpretationFailure {
  ok: false;
  code: string;
  message: string;
  /** Our own text, always safe to show — see `toErrorEvent`'s safe-detail list. */
  detail?: string;
}

export type InterpretationOutcome =
  | { ok: true; payload: InterpretationPayload }
  | InterpretationFailure;

/**
 * Read a BlueprintSpec off measured segment geometry, via whichever reasoning
 * provider is configured. `body` is UNVALIDATED — parsed against
 * `InterpretRequestSchema` here, never trusted.
 */
export async function runBlueprintInterpretation(
  body: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<InterpretationOutcome> {
  const parsed = InterpretRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "The interpretation request was not valid.",
      detail: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n"),
    };
  }

  const { segments, labels, prompt } = parsed.data;

  let result: ProviderResult<BlueprintSpec>;
  try {
    const provider = resolveReasoningProvider();
    result = await provider.interpretBlueprint({
      kind: "segments",
      segments,
      labels,
      ...(prompt ? { prompt } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    // Reuse the SSE routes' normalizer rather than re-deriving which detail is
    // safe to show: a ProviderError's detail crosses this boundary only for
    // codes WE wrote the text for; everything else is logged, not returned.
    const event = toErrorEvent(error, "UPSTREAM_ERROR");
    return {
      ok: false,
      code: event.type === "error" ? event.code : "UPSTREAM_ERROR",
      message:
        event.type === "error"
          ? event.message
          : "The interpretation could not be completed.",
      ...(event.type === "error" && event.detail ? { detail: event.detail } : {}),
    };
  }

  const blueprint = result.data;
  const report = validateBlueprint(blueprint);

  return {
    ok: true,
    payload: {
      success: true,
      blueprint,
      violations: report.violations,
      uncertainties: blueprint.uncertainty,
      assumptions: blueprint.assumptions,
      provider: providerTraceOf(result),
    },
  };
}
