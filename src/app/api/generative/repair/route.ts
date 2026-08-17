// src/app/api/generative/repair/route.ts
//
// POST /api/generative/repair
//
// Constraint-driven repair (brief §22). Deterministic validators find the
// problems; the reasoning layer proposes a parametric fix; the same lock-checked
// apply-and-rebuild path proves whether it actually worked.
//
// `attempt` is carried by the caller and bounded here. Uncontrolled iteration —
// repair, re-validate, repair again — is how a generative system burns money
// and converges on nothing. Two attempts, then the remaining violations are
// shown to the user honestly.

import { NextRequest } from "next/server";
import { z } from "zod";

import { resolveReasoningProvider } from "@/lib/generative/provider";
import { toViolationSummaries } from "@/lib/generative/graph/summary";
// Client-safe module: it holds only types and this shared bound, so the route
// and the UI cannot disagree about how many attempts a repair gets.
import { MAX_REPAIR_ATTEMPTS } from "@/lib/generative/client";
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

const RequestSchema = z.object({
  ...EditRequestBase,
  attempt: z.number().int().min(1).max(MAX_REPAIR_ATTEMPTS).default(1),
  /** Repair only these codes. Empty ⇒ everything critical or warning. */
  codes: z.array(z.string().min(1).max(60)).max(40).default([]),
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
      "The repair request was not valid.",
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

  const { attempt, codes, buildingPk, revision, locks } = parsed.data;
  const spec = specResult.spec;

  return sseResponse("REPAIR_FAILED", async (send) => {
    const current = readCurrentDesign({ spec, buildingPk, revision, locks, send });

    // Repair works from a fresh validation of the CURRENT build, never from a
    // violation list the client supplied — a stale list would repair a problem
    // that no longer exists and report success for it.
    const targets = current.validation.violations.filter(
      (v) =>
        (codes.length === 0 ? v.severity !== "advisory" : codes.includes(v.code)),
    );

    if (targets.length === 0) {
      send({
        type: "result",
        payload: {
          success: false,
          kind: "nothing-to-repair",
          message:
            codes.length === 0
              ? "There are no critical or warning issues to repair."
              : "None of the selected issues are present in the current model.",
          validation: current.validation,
        },
      });
      return;
    }

    send({
      type: "stage",
      stage: "interpreting",
      label: `Proposing a fix for ${targets.length} issue(s)`,
      index: 1,
      total: 13,
      detail: `attempt ${attempt} of ${MAX_REPAIR_ATTEMPTS}`,
    });

    const provider = resolveReasoningProvider();
    const proposal = await provider.repairBuilding({
      spec,
      summary: current.summary,
      violations: toViolationSummaries(targets),
      locked: lockedForProvider(locks),
      attempt,
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

    // Report the repair on its own terms: did the targeted violations go away?
    const resolvedCodes =
      outcome.kind === "applied"
        ? [
            ...new Set(
              targets
                .filter(
                  (target) =>
                    !outcome.validation.violations.some((v) => v.code === target.code),
                )
                .map((v) => v.code),
            ),
          ]
        : [];

    send({
      type: "result",
      payload: {
        success: outcome.kind === "applied",
        attempt,
        attemptsRemaining: MAX_REPAIR_ATTEMPTS - attempt,
        targetedCodes: [...new Set(targets.map((v) => v.code))],
        resolvedCodes,
        ...outcome,
        provider: providerTraceOf(proposal),
      },
    });
  });
}
