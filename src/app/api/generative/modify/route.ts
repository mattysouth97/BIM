// src/app/api/generative/modify/route.ts
//
// POST /api/generative/modify
//
// Natural-language editing (brief §18, §39, §54). "Make the top two floors
// residential" arrives here with the current specification, whatever the user
// had selected, and the lock set; a scoped patch comes back, is applied under
// those locks, and the building is rebuilt so the change can be reviewed
// against real geometry before it is accepted.
//
// The route is stateless and commits nothing. The candidate design it returns
// becomes the current design only when the client says so — which is what makes
// diff review, branching and design options possible.

import { NextRequest } from "next/server";
import { z } from "zod";

import { resolveReasoningProvider } from "@/lib/generative/provider";
import {
  EditRequestBase,
  completeEdit,
  lockedForProvider,
  parseSpec,
  providerTraceOf,
  readCurrentDesign,
} from "@/lib/generative/server/edit";
import { badRequest, sseResponse } from "@/lib/generative/server/stream";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ScopeSchema = z.object({
  kind: z
    .enum(["building", "system", "level", "zone", "space", "element", "selection"])
    .default("building"),
  label: z.string().min(1).max(120).default("Whole building"),
  floorNos: z.array(z.number().int().min(-8).max(120)).max(120).optional(),
  elementIds: z.array(z.string().min(1).max(80)).max(500).optional(),
});

const RequestSchema = z.object({
  ...EditRequestBase,
  instruction: z.string().min(2).max(2_000),
  scope: ScopeSchema.default({ kind: "building", label: "Whole building" }),
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
      "The modification request was not valid.",
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

  const { instruction, scope, buildingPk, revision, locks, designRules } = parsed.data;
  const spec = specResult.spec;

  return sseResponse("MODIFICATION_FAILED", async (send) => {
    const current = readCurrentDesign({ spec, buildingPk, revision, locks, send });

    send({
      type: "stage",
      stage: "interpreting",
      label: "Interpreting the change",
      index: 1,
      total: 13,
      detail: scope.kind === "building" ? undefined : scope.label,
    });

    const provider = resolveReasoningProvider();
    const proposal = await provider.modifyBuilding({
      spec,
      summary: current.summary,
      instruction,
      scope,
      locked: lockedForProvider(locks),
      designRules,
      signal: request.signal,
    });

    const outcome = completeEdit({
      current,
      spec,
      patch: proposal.data,
      buildingPk,
      revision,
      locks,
      send,
    });

    send({
      type: "result",
      payload: {
        success: outcome.kind === "applied",
        instruction,
        scope,
        ...outcome,
        provider: providerTraceOf(proposal),
      },
    });
  });
}
