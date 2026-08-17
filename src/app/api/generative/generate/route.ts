// src/app/api/generative/generate/route.ts
//
// POST /api/generative/generate
//
// Runs the full generation pipeline and streams progress as Server-Sent Events
// so the client can show the building forming stage by stage instead of a
// spinner (brief §52, §70).
//
// The Anthropic key is read here, on the server, and never leaves it. The
// response contains a BuildingSpec, a BuildingRecipe and a BIM snapshot — no
// credentials, and no raw upstream error text.

import { NextRequest } from "next/server";
import { z } from "zod";

import { buildDesign, generationIdFor } from "@/lib/generative/build";
import { resolveReasoningProvider, ProviderError } from "@/lib/generative/provider";
import { specCoherenceIssues } from "@/lib/generative/spec/coherence";
import { providerTraceOf } from "@/lib/generative/server/edit";
import { badRequest, sseResponse } from "@/lib/generative/server/stream";
import { seedFromPrompt } from "@/lib/generative/rng";

// Generation calls a reasoning model and can take a minute; never cache it.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestSchema = z.object({
  prompt: z.string().min(3).max(4_000),
  buildingPk: z.string().min(1).max(120).default("generated"),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  hints: z
    .object({
      use: z.string().max(40).optional(),
      floors: z.number().int().min(1).max(120).optional(),
      grossAreaSqm: z.number().min(20).max(2_000_000).optional(),
      siteWidthMm: z.number().int().min(1_000).max(2_000_000).optional(),
      siteDepthMm: z.number().int().min(1_000).max(2_000_000).optional(),
      floorToFloorMm: z.number().int().min(2_200).max(12_000).optional(),
      structuralSystem: z.string().max(40).optional(),
      style: z.string().max(120).optional(),
    })
    .optional(),
  designRules: z.array(z.string().max(300)).max(40).optional(),
  /** Carried into the rebuild so a regeneration honours existing locks (§42). */
  locks: z.array(z.string().min(3).max(120)).max(200).default([]),
});

const TOTAL_STAGES = 13;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("BAD_REQUEST", "Body must be JSON.");
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(
      "INVALID_REQUEST",
      "The generation request was not valid.",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }

  const { prompt, buildingPk, hints, designRules, locks } = parsed.data;
  const seed = parsed.data.seed ?? seedFromPrompt(prompt);

  return sseResponse("GENERATION_FAILED", async (send) => {
    /* --- 1. reasoning --- */
    send({
      type: "stage",
      stage: "interpreting",
      label: "Interpreting design intent",
      index: 0,
      total: TOTAL_STAGES,
    });

    const provider = resolveReasoningProvider();
    const proposal = await provider.generateBuilding({
      prompt,
      hints,
      seed,
      designRules,
      signal: request.signal,
    });

    // Schema-valid but incoherent output (two levels numbered 3, a program on a
    // storey that does not exist) would build into a model with colliding
    // element ids. Fail loudly rather than quietly produce a corrupt building.
    const incoherent = specCoherenceIssues(proposal.data);
    if (incoherent.length > 0) {
      throw new ProviderError(
        "SCHEMA_VALIDATION_FAILED",
        "The generated specification was internally inconsistent.",
        incoherent.map((issue) => `- ${issue.message}`).join("\n"),
      );
    }

    send({
      type: "stage",
      stage: "program",
      label: "Building program created",
      index: 1,
      total: TOTAL_STAGES,
    });

    /* --- 2. deterministic geometry, graph and validation --- */
    const generationId = generationIdFor(seed, 0);
    const built = buildDesign({
      spec: proposal.data,
      buildingPk,
      generationId,
      locks,
      onStage: (progress) =>
        send({
          type: "stage",
          stage: progress.stage,
          label: progress.label,
          // Offset by the two reasoning stages already reported.
          index: progress.index + 2,
          total: TOTAL_STAGES,
          ...(progress.detail ? { detail: progress.detail } : {}),
        }),
    });

    send({
      type: "stage",
      stage: "validating",
      label: "Validating building",
      index: TOTAL_STAGES - 1,
      total: TOTAL_STAGES,
    });

    send({
      type: "result",
      payload: {
        success: true,
        generationId,
        revision: 0,
        seed,
        spec: proposal.data,
        recipe: built.recipe,
        snapshot: built.snapshot,
        metrics: built.metrics,
        validation: built.validation,
        status: built.status,
        approximations: built.approximations,
        provider: providerTraceOf(proposal),
      },
    });
  });
}
