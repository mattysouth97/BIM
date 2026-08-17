// src/lib/generative/patch/apply.ts
//
// Applying a BuildingPatch to a BuildingSpec.
//
// This is the hinge the whole edit loop turns on. A provider proposes a patch;
// nothing about that patch is trusted. Before a single operation lands:
//
//   - the path must resolve to somewhere that already exists (`paths.ts`),
//   - the path must not be covered by a lock (`session/locks.ts`),
//   - and the ENTIRE result must re-parse against BuildingSpecSchema.
//
// The last check is the important one. Individual operations can each look
// reasonable and still leave the spec incoherent — a level inserted with a
// floorNo of 0, a glazing ratio above 0.95, a core wider than its own schema
// allows. Re-parsing the whole tree means a rejected patch leaves the caller
// with the spec they started with, unmutated (§66: model output is untrusted
// input until validated).

import {
  BuildingSpecSchema,
  type BuildingPatch,
  type BuildingSpec,
} from "../spec/building-spec";
import { specCoherenceIssues } from "../spec/coherence";
import { lockRejection, type LockToken } from "../session/locks";
import { applyOp, type PatchOp } from "./paths";

export type PatchErrorCode = "ALL_REJECTED" | "SCHEMA_INVALID" | "INCOHERENT";

export interface RejectedOp {
  op: PatchOp;
  /** `locked` is a user decision; `path` is a bad proposal from the provider. */
  kind: "locked" | "path";
  reason: string;
}

export interface PatchApplication {
  ok: boolean;
  /** The result on success; the UNCHANGED input on failure. Never partial. */
  spec: BuildingSpec;
  applied: PatchOp[];
  rejected: RejectedOp[];
  error?: { code: PatchErrorCode; message: string; detail?: string };
}

/** The spec is strictly JSON, so this is a complete and cheap deep clone. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function applySpecPatch(input: {
  spec: BuildingSpec;
  patch: BuildingPatch;
  locks?: Iterable<LockToken>;
}): PatchApplication {
  const locks = [...(input.locks ?? [])];
  const draft = clone(input.spec);
  const applied: PatchOp[] = [];
  const rejected: RejectedOp[] = [];

  for (const op of input.patch.operations) {
    const locked = lockRejection({
      path: op.path,
      op: op.op,
      tokens: locks,
      // Lock checks read level indices, which only shift as operations land.
      // Checking against the draft keeps index → floorNo honest mid-patch.
      spec: draft,
    });
    if (locked) {
      rejected.push({ op, kind: "locked", reason: locked });
      continue;
    }

    const result = applyOp(draft, op);
    if (result === true) {
      applied.push(op);
    } else {
      rejected.push({ op, kind: "path", reason: result.message });
    }
  }

  if (applied.length === 0) {
    const lockedCount = rejected.filter((r) => r.kind === "locked").length;
    return {
      ok: false,
      spec: input.spec,
      applied,
      rejected,
      error: {
        code: "ALL_REJECTED",
        message:
          lockedCount === rejected.length && lockedCount > 0
            ? "Every proposed change was blocked by a lock."
            : "No proposed change could be applied to the specification.",
        detail: rejected.map((r) => `${r.op.path}: ${r.reason}`).join("\n"),
      },
    };
  }

  const parsed = BuildingSpecSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      spec: input.spec,
      applied: [],
      rejected: [
        ...rejected,
        ...applied.map((op) => ({
          op,
          kind: "path" as const,
          reason: "Rolled back: the patched specification failed validation.",
        })),
      ],
      error: {
        code: "SCHEMA_INVALID",
        message: "The patched specification was not valid, so nothing was changed.",
        detail: parsed.error.issues
          .slice(0, 20)
          .map((issue) => `- ${issue.path.join("/") || "(root)"}: ${issue.message}`)
          .join("\n"),
      },
    };
  }

  // Schema-valid is not the same as coherent. Two levels numbered 3 satisfy
  // every field constraint and still collapse the model's identity downstream.
  const incoherent = specCoherenceIssues(parsed.data);
  if (incoherent.length > 0) {
    return {
      ok: false,
      spec: input.spec,
      applied: [],
      rejected: [
        ...rejected,
        ...applied.map((op) => ({
          op,
          kind: "path" as const,
          reason: "Rolled back: the patched specification was not coherent.",
        })),
      ],
      error: {
        code: "INCOHERENT",
        message: "The change would have left the building inconsistent, so nothing was changed.",
        detail: incoherent.map((issue) => `- ${issue.message}`).join("\n"),
      },
    };
  }

  return { ok: true, spec: parsed.data, applied, rejected };
}
