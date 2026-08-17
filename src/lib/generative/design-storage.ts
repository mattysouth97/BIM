// src/lib/generative/design-storage.ts
//
// Durable storage for generated designs, and the door back into a saved one.
//
// The session store is deliberately not persisted (a design holds a full BIM
// snapshot, several of them at once in history — that belongs in memory). But a
// design nobody can navigate back to is not a project, it is a demo. What IS
// worth persisting is the small, sufficient part: the SPEC plus the identity it
// was built under. Everything else — recipe, snapshot, metrics, validation,
// status — is a pure function of the spec, because `buildDesign` is pure given
// (spec, buildingPk, generationId, locks). So the record stays kilobytes and
// the reopened design is byte-identical to the one that was saved, rather than
// a stale copy that drifts from the engine that made it.
//
// What is NOT stored, stated plainly:
//   • Lock tokens. Locks are session intent (§42), not part of the design; a
//     reopened design carries no `locked: true` stamps, and re-locking is a
//     user decision, not something this module may invent.
//   • Authored elements. Human-authored geometry lives in the BIM model store,
//     which owns its own persistence.
//   • Provider summaries. Which model answered, how long it took and what it
//     cost describe a REQUEST, not a building.

import { get, set, keys } from "idb-keyval";

import { buildDesign } from "./build";
import type { DesignPayload } from "./client";
import type { BuildingSpec } from "./spec/building-spec";

/** One IndexedDB key per design. */
const DESIGN_PREFIX = "gen-design:";

/**
 * The pk the routes stamp onto emitted BIM elements. Every generative route
 * defaults `buildingPk` to this string, so rebuilding under it is what makes a
 * reopened snapshot identical to the one the studio showed — element ids and
 * provenance included.
 */
const GENERATED_BUILDING_PK = "generated";

/**
 * Ids minted by `generationIdFor` — `GEN-0042`, `GEN-0042.3`. A 건축물대장
 * 관리번호 is numeric and can never take this shape, so nothing keyed on this
 * predicate can ever collide with a ledger building.
 */
const GENERATED_PK = /^GEN-\d{4}(\.\d+)?$/;

export function isGeneratedPk(id: string): boolean {
  return typeof id === "string" && GENERATED_PK.test(id);
}

/**
 * Store key the workspace scene and energy panels must use.
 *
 * A generated design's synthetic title carries an EMPTY `mgmBldrgstPk` on
 * purpose (consumption / official-grade lookups must miss). The 3D scene used
 * to fall through to `"unknown"` and re-derive a rectangular box from that
 * title. The generation id is the real pk — it is what `publishGeneratedDesign`
 * already seeded.
 */
export function workspaceBuildingPk(input: {
  generationId?: string | null;
  titlePk?: string | null;
  activePk?: string | null;
}): string {
  if (input.generationId && isGeneratedPk(input.generationId)) {
    return input.generationId;
  }
  const title = String(input.titlePk || "");
  if (title) return title;
  if (input.activePk && isGeneratedPk(input.activePk)) return input.activePk;
  return title || input.activePk || "unknown";
}

/** Everything needed to reconstruct a design, and nothing that can go stale. */
export interface StoredDesignRecord {
  generationId: string;
  spec: BuildingSpec;
  seed: number;
  revision: number;
  savedAtIso: string;
  /** User-facing label. Absent ⇒ callers fall back to the spec's project name. */
  name?: string;
}

/** A saved design as the picker lists it — no spec, so listing stays cheap. */
export interface DesignIndexEntry {
  generationId: string;
  name?: string;
  savedAtIso: string;
}

/** A stored design, rebuilt. The same payload shape a live generation carries. */
export type LoadedDesign = DesignPayload & {
  generationId: string;
  seed: number;
  revision: number;
};

export type DesignStorageErrorCode =
  | "SAVE_FAILED"
  | "LOAD_FAILED"
  | "LIST_FAILED"
  | "INVALID_ID"
  | "CORRUPT_RECORD";

/**
 * A storage failure the caller must handle. IndexedDB can be unavailable
 * (private windows, blocked storage, quota), and a design that silently failed
 * to save is worse than one that visibly did not: the user walks away believing
 * their work is durable.
 */
export class DesignStorageError extends Error {
  readonly code: DesignStorageErrorCode;
  constructor(code: DesignStorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DesignStorageError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Record shape                                                        */
/* ------------------------------------------------------------------ */

/**
 * IndexedDB hands back whatever was written, including by an older build of
 * this app. A record missing its spec cannot be rebuilt, and guessing at the
 * missing half would produce a building nobody designed.
 */
function isStoredDesignRecord(value: unknown): value is StoredDesignRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<StoredDesignRecord>;
  return (
    typeof record.generationId === "string" &&
    typeof record.seed === "number" &&
    typeof record.revision === "number" &&
    typeof record.savedAtIso === "string" &&
    typeof record.spec === "object" &&
    record.spec !== null
  );
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

export async function saveDesign(record: StoredDesignRecord): Promise<void> {
  // A record filed under an id the route cannot classify is unreachable: the
  // building route only accepts GEN- ids, so this would save into a hole.
  if (!isGeneratedPk(record.generationId)) {
    throw new DesignStorageError(
      "INVALID_ID",
      `"${record.generationId}" is not a generated design id (expected GEN-0000 or GEN-0000.1).`,
    );
  }

  try {
    await set(DESIGN_PREFIX + record.generationId, record);
  } catch (cause) {
    throw new DesignStorageError(
      "SAVE_FAILED",
      "The design could not be saved to this browser's storage.",
      { cause },
    );
  }
  // A re-save is a new source of truth for this id; drop the build memoised
  // against the previous one rather than serve a design that no longer exists.
  memo.delete(record.generationId);
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function loadDesignRecord(
  generationId: string,
): Promise<StoredDesignRecord | null> {
  let stored: unknown;
  try {
    stored = await get(DESIGN_PREFIX + generationId);
  } catch (cause) {
    throw new DesignStorageError(
      "LOAD_FAILED",
      "This browser's storage could not be read.",
      { cause },
    );
  }

  if (stored === undefined || stored === null) return null;
  if (!isStoredDesignRecord(stored)) {
    throw new DesignStorageError(
      "CORRUPT_RECORD",
      `The saved record for ${generationId} is not a design this version can rebuild.`,
    );
  }
  return stored;
}

export async function listDesigns(): Promise<DesignIndexEntry[]> {
  let allKeys: IDBValidKey[];
  try {
    allKeys = await keys();
  } catch (cause) {
    throw new DesignStorageError(
      "LIST_FAILED",
      "This browser's storage could not be read.",
      { cause },
    );
  }

  const ids = allKeys
    .filter((key): key is string => typeof key === "string" && key.startsWith(DESIGN_PREFIX))
    .map((key) => key.slice(DESIGN_PREFIX.length));

  const entries: DesignIndexEntry[] = [];
  for (const id of ids) {
    // A record this version cannot rebuild is not offerable, so it is left out
    // of the list rather than listed as a link that would fail on click. It is
    // still readable through `loadDesignRecord`, which says why it failed.
    let record: StoredDesignRecord | null = null;
    try {
      record = await loadDesignRecord(id);
    } catch (error) {
      if (!(error instanceof DesignStorageError && error.code === "CORRUPT_RECORD")) {
        throw error;
      }
    }
    if (!record) continue;
    entries.push({
      generationId: record.generationId,
      name: record.name,
      savedAtIso: record.savedAtIso,
    });
  }

  // Newest first: the design someone just saved is the one they are looking for.
  return entries.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
}

/* ------------------------------------------------------------------ */
/* Rebuild                                                             */
/* ------------------------------------------------------------------ */

/**
 * Rebuilding is deterministic but not free — it runs the whole solver. Two
 * panels asking for the same design must not solve it twice, and navigating
 * away and back must not re-solve either.
 *
 * Keyed by `savedAtIso` as well as id: a design saved again under the same id
 * (a second session whose seed landed on the same four digits) is a DIFFERENT
 * building, and returning the memoised one would show the wrong one.
 */
const memo = new Map<string, { savedAtIso: string; design: LoadedDesign }>();

/** Test seam. Nothing in the app clears the memo — it is keyed to be safe. */
export function __clearDesignMemo(): void {
  memo.clear();
}

export async function getOrBuildDesign(generationId: string): Promise<LoadedDesign | null> {
  const record = await loadDesignRecord(generationId);
  if (!record) return null;

  const cached = memo.get(generationId);
  if (cached && cached.savedAtIso === record.savedAtIso) return cached.design;

  const built = buildDesign({
    spec: record.spec,
    buildingPk: GENERATED_BUILDING_PK,
    generationId: record.generationId,
    // No locks: see the header. A rebuilt design carries no lock stamps.
  });

  const design: LoadedDesign = {
    spec: record.spec,
    recipe: built.recipe,
    snapshot: built.snapshot,
    metrics: built.metrics,
    validation: built.validation,
    status: built.status,
    approximations: built.approximations,
    generationId: record.generationId,
    seed: record.seed,
    revision: record.revision,
  };

  memo.set(generationId, { savedAtIso: record.savedAtIso, design });
  return design;
}
