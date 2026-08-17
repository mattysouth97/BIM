// src/app/api/generative/evaluate/route.ts
//
// POST /api/generative/evaluate
//
// "Why does the building look like this?" (brief §57). The answer must be
// grounded in the model that exists, so the summary handed to the reasoning
// layer is recomputed here from the spec rather than taken from the client —
// a client-supplied summary is a client-supplied claim, and an explanation of
// numbers nobody verified is worse than no explanation.
//
// Not streamed: this is one short call with nothing to show mid-flight.

import { NextRequest } from "next/server";
import { z } from "zod";

import { buildDesign, generationIdFor } from "@/lib/generative/build";
import { resolveReasoningProvider } from "@/lib/generative/provider";
import { parseSpec, providerTraceOf } from "@/lib/generative/server/edit";
import { badRequest, toErrorEvent } from "@/lib/generative/server/stream";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RequestSchema = z.object({
  spec: z.unknown(),
  buildingPk: z.string().min(1).max(120).default("generated"),
  revision: z.number().int().min(0).max(9_999).default(0),
  locks: z.array(z.string().min(3).max(120)).max(200).default([]),
});

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
      "The evaluation request was not valid.",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }

  const specResult = parseSpec(parsed.data.spec);
  if (!specResult.ok) {
    return badRequest(
      "INVALID_SPEC",
      "The supplied building specification was not valid.",
      specResult.detail,
    );
  }

  const { buildingPk, revision, locks } = parsed.data;
  const spec = specResult.spec;

  try {
    const current = buildDesign({
      spec,
      buildingPk,
      generationId: generationIdFor(spec.generationSeed, revision),
      locks,
    });

    const provider = resolveReasoningProvider();
    const review = await provider.evaluateBuilding(current.summary, spec);

    return Response.json({
      success: true,
      review: review.data,
      // Echo the numbers the explanation was grounded in, so a claim in the
      // prose can be checked against the model without leaving the panel.
      grounding: {
        floors: current.summary.floors,
        grossAreaSqm: current.summary.grossAreaSqm,
        netAreaSqm: current.summary.netAreaSqm,
        circulationRatio: current.summary.circulationRatio,
        coreStrategy: current.summary.coreStrategy,
        gridXMm: current.summary.gridXMm,
        gridZMm: current.summary.gridZMm,
        violations: current.summary.violations.length,
        lockedSystems: current.summary.lockedSystems,
      },
      provider: providerTraceOf(review),
    });
  } catch (error) {
    const event = toErrorEvent(error, "EVALUATION_FAILED");
    if (event.type !== "error") throw error;
    return Response.json(
      {
        success: false,
        error: { code: event.code, message: event.message, detail: event.detail },
      },
      { status: event.code === "NO_CREDENTIALS" ? 400 : 502 },
    );
  }
}
