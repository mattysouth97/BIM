// src/app/api/cad/reconstruct/route.ts
//
// POST /api/cad/reconstruct
//
// Reads the user's statement into typed reconstruction claims. This route does
// NOT build geometry: the solver runs in the browser from evidence the client
// already holds (register, GIS outline), so the drawing is deterministic and
// no building data makes a second trip to the server.
//
// GET reports which reader is configured, so the prompt module can tell the
// user whether it is using the model or the rule-based parser.

import { NextRequest } from "next/server";

import {
  interpretClaims,
  isClaudeAvailable,
} from "@/lib/cad-reconstruction/server/interpret-claims";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLIENT_FAULT_CODES = new Set(["INVALID_REQUEST", "CANCELLED"]);

export async function GET() {
  return Response.json({
    reader: isClaudeAvailable() ? "claude" : "deterministic",
    model: isClaudeAvailable()
      ? (process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5")
      : null,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Body must be JSON." } },
      { status: 400 },
    );
  }

  const outcome = await interpretClaims(body, { signal: request.signal });

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

  return Response.json({ success: true, ...outcome.payload });
}
