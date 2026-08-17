// src/lib/generative/spec/coherence.ts
//
// Invariants the Zod schema cannot express.
//
// `BuildingSpecSchema` validates each field and each array element on its own
// terms. What it cannot say is "no two levels may be the same storey", because
// that is a statement about the array as a whole. So a patch like
// `{op:"set", path:"/levels/0/floorNo", value:2}` passes schema validation
// cleanly and then corrupts everything downstream: the solver builds two
// storeys numbered 2, the emitter mints two elements called `SLAB-L2`, the
// navigation tree shows two nodes with the same lock token, and `mergeGenerated`
// silently collapses the pair. Nothing reports it.
//
// These checks are cheap, deterministic and run before a patched spec is
// allowed to become a design. They are deliberately narrow: only violations
// that produce COLLIDING IDENTITY, never matters of architectural taste — those
// belong in `validate/rules.ts`, where they surface as reviewable issues rather
// than as a rejected edit.

import type { BuildingSpec } from "./building-spec";

export interface CoherenceIssue {
  code: "DUPLICATE_LEVEL" | "DUPLICATE_PROGRAM_ID" | "ORPHAN_PROGRAM_LEVEL";
  message: string;
}

function duplicates<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    else seen.add(value);
  }
  return [...repeated];
}

export function specCoherenceIssues(spec: BuildingSpec): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];

  const repeatedFloors = duplicates(spec.levels.map((level) => level.floorNo));
  if (repeatedFloors.length > 0) {
    issues.push({
      code: "DUPLICATE_LEVEL",
      message: `Two or more levels share storey ${repeatedFloors
        .sort((a, b) => a - b)
        .join(", ")}. Every storey number must be unique — element ids are derived from it.`,
    });
  }

  const repeatedProgram = duplicates(spec.program.map((item) => item.id));
  if (repeatedProgram.length > 0) {
    issues.push({
      code: "DUPLICATE_PROGRAM_ID",
      message: `Program ids must be unique; "${repeatedProgram.join('", "')}" appear more than once, so adjacency targets are ambiguous.`,
    });
  }

  const floorNos = new Set(spec.levels.map((level) => level.floorNo));
  const orphans = spec.program.filter((item) =>
    item.levels.some((floorNo) => !floorNos.has(floorNo)),
  );
  if (orphans.length > 0) {
    issues.push({
      code: "ORPHAN_PROGRAM_LEVEL",
      message: `Program "${orphans[0].label}" is assigned to a storey that does not exist${
        orphans.length > 1 ? ` (and ${orphans.length - 1} more)` : ""
      }, so it would be silently dropped.`,
    });
  }

  return issues;
}
