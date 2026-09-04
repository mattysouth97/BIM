// src/app/api/cad/web-evidence/route.ts
//
// POST /api/cad/web-evidence
//
// Searches the open web for published facts about one building. Opt-in: this
// costs a model call and several seconds, so the panel only calls it when the
// user asks for it.
//
// GET reports whether the search is configured, so the panel can say plainly
// that the option is unavailable rather than offering a dead button.

import { NextRequest } from "next/server";

import {
  isWebSearchAvailable,
  searchWebEvidence,
} from "@/lib/cad-reconstruction/server/search-web-evidence";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CLIENT_FAULT_CODES = new Set(["INVALID_REQUEST", "CANCELLED"]);

export async function GET() {
  return Response.json({ available: isWebSearchAvailable() });
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

  const outcome = await searchWebEvidence(body, { signal: request.signal });

  if (!outcome.ok) {
    return Response.json(
      { success: false, error: { code: outcome.code, message: outcome.message } },
      { status: CLIENT_FAULT_CODES.has(outcome.code) ? 400 : 502 },
    );
  }

  return Response.json({ success: true, ...outcome.payload });
}
