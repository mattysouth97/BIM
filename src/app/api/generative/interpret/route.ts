// src/app/api/generative/interpret/route.ts
//
// POST /api/generative/interpret
//
// The missing seam for schematic IMPORT: measured segment geometry (a CAD
// import today, eventually a traced raster) in, a real BlueprintSpec out —
// read through whichever reasoning provider is configured, offline fallback
// included. See `server/interpret.ts` for the actual reading; this file only
// translates one HTTP request into that call and its outcome into a response.
//
// Not streamed, same reasoning as `/evaluate`: this is one short provider
// call with nothing to show mid-flight, not a multi-stage build.

import { NextRequest } from "next/server";

import { runBlueprintInterpretation } from "@/lib/generative/server/interpret";
import { badRequest } from "@/lib/generative/server/stream";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Codes that mean the CALLER'S input was the problem — a malformed body, no
 * closed loop in the geometry, credentials the deployment forgot to set, an
 * input kind this provider cannot read at all. Everything else (a schema the
 * provider itself failed to satisfy, an upstream/rate-limit/timeout failure)
 * is ours or the provider's fault. Same binary split `/evaluate` uses, sized
 * to the extra codes this route's provider call can actually raise.
 */
const CLIENT_FAULT_CODES = new Set([
  "INVALID_REQUEST",
  "NO_CREDENTIALS",
  "UNSUPPORTED_INPUT",
  "INTERPRETATION_FAILED",
]);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("BAD_REQUEST", "Body must be JSON.");
  }

  const outcome = await runBlueprintInterpretation(body, { signal: request.signal });

  if (!outcome.ok) {
    return Response.json(
      {
        success: false,
        error: {
          code: outcome.code,
          message: outcome.message,
          ...(outcome.detail ? { detail: outcome.detail } : {}),
        },
      },
      { status: CLIENT_FAULT_CODES.has(outcome.code) ? 400 : 502 },
    );
  }

  return Response.json(outcome.payload);
}
