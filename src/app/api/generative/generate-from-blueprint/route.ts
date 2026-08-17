// src/app/api/generative/generate-from-blueprint/route.ts
//
// POST /api/generative/generate-from-blueprint
//
// The native schematic route. Same SSE envelope as /generate, and deliberately
// NO reasoning call: a blueprint is already semantic, so there is nothing for a
// model to interpret (see server/generate-from-blueprint.ts).
//
// The whole path lives in that server module; this file validates the request
// envelope and translates one outcome into stream events.

import { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, sseResponse } from "@/lib/generative/server/stream";
import { runBlueprintGeneration } from "@/lib/generative/server/generate-from-blueprint";

// No model call, but a large blueprint still solves thousands of spaces; never
// cache it, and keep the sibling route's ceiling.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestSchema = z.object({
  /** Parsed against BlueprintSpecSchema downstream, where the report is built. */
  blueprint: z.unknown(),
  prompt: z.string().max(4_000).optional(),
  buildingPk: z.string().min(1).max(120).default("generated"),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
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
      "The generation request was not valid.",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }

  const { blueprint, prompt, buildingPk, seed, locks } = parsed.data;

  return sseResponse("GENERATION_FAILED", async (send) => {
    const outcome = runBlueprintGeneration(
      {
        blueprint,
        buildingPk,
        locks,
        ...(prompt ? { prompt } : {}),
        ...(seed === undefined ? {} : { seed }),
      },
      (event) => send({ type: "stage", ...event }),
    );

    if (!outcome.ok) {
      // The report rides along structurally as well as in `detail`: a client
      // that wants the issue list should not have to parse prose. The detail
      // text is ours, so it is safe to show (§65 concerns upstream strings).
      const errorEvent = {
        type: "error" as const,
        code: outcome.code,
        message: outcome.message,
        ...(outcome.detail ? { detail: outcome.detail } : {}),
        ...(outcome.blueprintValidation
          ? { blueprintValidation: outcome.blueprintValidation }
          : {}),
      };
      send(errorEvent);
      return;
    }

    send({ type: "result", payload: outcome.payload });
  });
}
