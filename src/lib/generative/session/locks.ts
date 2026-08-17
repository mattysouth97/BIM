// src/lib/generative/session/locks.ts
//
// Locking — the mechanism behind "USER EDIT > LOCKED > AI GENERATION > DEFAULT"
// (brief §41, §42, §83).
//
// A lock is enforced in TWO places, and the split matters:
//
//   1. SPEC LEVEL (here + `patch/apply.ts`). Locking a system forbids patch
//      operations against the part of the BuildingSpec that drives it. This is
//      the lock that actually prevents a change, because everything downstream
//      is recomputed from the spec.
//
//   2. ELEMENT LEVEL (`graph/emit.ts` → `mergeGenerated`). Locking an individual
//      element stamps `locked: true` on it, so a regeneration preserves that
//      element rather than overwriting it.
//
// An element lock therefore cannot stop a spec change — the spec has no element
// ids in it. It protects the instance. Saying so plainly in the UI is the
// difference between a lock the user trusts and one that quietly lies.

import type { BimElement, BimSystem } from "@/lib/bim/model/types";
import { levelIdForFloor } from "@/lib/bim/model/types";
import type { BuildingSpec } from "../spec/building-spec";

export type LockToken = string;

export type Lock =
  | { kind: "system"; system: BimSystem }
  | { kind: "level"; floorNo: number }
  | { kind: "element"; elementId: string };

/** Systems the user can lock. Ordered as they read in the navigation tree. */
export const LOCKABLE_SYSTEMS: BimSystem[] = [
  "massing",
  "structure",
  "core",
  "envelope",
  "openings",
  "partitions",
  "circulation",
  "roof",
  "mep",
];

export const SYSTEM_LABEL: Record<BimSystem, string> = {
  massing: "Massing",
  structure: "Structure",
  envelope: "Envelope",
  core: "Core",
  circulation: "Circulation",
  partitions: "Partitions",
  openings: "Openings",
  mep: "MEP",
  roof: "Roof",
};

/**
 * Which parts of the specification each system is generated from. `*` matches a
 * single path segment, so one pattern covers every element of an array.
 *
 * Overlap is intentional: facade side geometry drives both the envelope and the
 * window openings hosted in it, so locking either one protects it. A lock that
 * is too broad is a nuisance; a lock that is too narrow is a broken promise.
 */
export const SYSTEM_SPEC_PATHS: Record<BimSystem, string[]> = {
  massing: ["/massing", "/site", "/orientation"],
  structure: ["/structure"],
  core: ["/core"],
  envelope: ["/facade"],
  openings: [
    "/facade/sides/*/glazingRatio",
    "/facade/sides/*/windowWidthMm",
    "/facade/sides/*/sillHeightMm",
    "/facade/sides/*/headHeightMm",
    "/facade/sides/*/moduleMm",
    "/dimensions/doorWidthMm",
    "/dimensions/doorHeightMm",
  ],
  partitions: ["/program", "/dimensions/interiorWallMm"],
  circulation: ["/dimensions/corridorWidthMm"],
  roof: ["/roof"],
  mep: ["/mep"],
};

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export const systemLock = (system: BimSystem): LockToken => `system:${system}`;
export const levelLock = (floorNo: number): LockToken => `level:${floorNo}`;
export const elementLock = (elementId: string): LockToken => `element:${elementId}`;

export function parseLock(token: LockToken): Lock | null {
  const separator = token.indexOf(":");
  if (separator < 0) return null;
  const kind = token.slice(0, separator);
  const rest = token.slice(separator + 1);
  if (!rest) return null;

  if (kind === "system") {
    return LOCKABLE_SYSTEMS.includes(rest as BimSystem)
      ? { kind: "system", system: rest as BimSystem }
      : null;
  }
  if (kind === "level") {
    // Only the canonical form `levelLock()` emits. `Number()` alone would accept
    // " 5", "+5" and "0x10" — distinct strings naming the same storey, so a
    // lock added under one spelling could not be released under another, and a
    // whitespace payload would silently fabricate a lock on storey 0.
    if (!/^-?\d+$/.test(rest)) return null;
    return { kind: "level", floorNo: Number(rest) };
  }
  if (kind === "element") return { kind: "element", elementId: rest };
  return null;
}

export function lockedSystems(tokens: Iterable<LockToken>): BimSystem[] {
  const out: BimSystem[] = [];
  for (const token of tokens) {
    const lock = parseLock(token);
    if (lock?.kind === "system") out.push(lock.system);
  }
  return [...new Set(out)].sort();
}

export function lockedFloorNos(tokens: Iterable<LockToken>): number[] {
  const out: number[] = [];
  for (const token of tokens) {
    const lock = parseLock(token);
    if (lock?.kind === "level") out.push(lock.floorNo);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function lockedElementIds(tokens: Iterable<LockToken>): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    const lock = parseLock(token);
    if (lock?.kind === "element") out.push(lock.elementId);
  }
  return [...new Set(out)];
}

/** What the reasoning provider is told it must not touch (§41). */
export function lockDescriptions(tokens: Iterable<LockToken>): string[] {
  const out: string[] = [];
  for (const system of lockedSystems(tokens)) {
    out.push(`${SYSTEM_LABEL[system]} system (spec paths: ${SYSTEM_SPEC_PATHS[system].join(", ")})`);
  }
  for (const floorNo of lockedFloorNos(tokens)) {
    out.push(`Level ${floorNo} (its height, name and usage)`);
  }
  const elements = lockedElementIds(tokens);
  if (elements.length > 0) {
    out.push(
      `${elements.length} individual element(s), preserved on regeneration: ${elements
        .slice(0, 8)
        .join(", ")}${elements.length > 8 ? "…" : ""}`,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Enforcement                                                         */
/* ------------------------------------------------------------------ */

/**
 * Does writing `path` touch anything `pattern` protects? `*` matches exactly one
 * segment, and segments are compared whole, so "/structure" does not cover
 * "/structures".
 *
 * The comparison runs in BOTH directions, and that is the whole point. Checking
 * only "is the pattern a prefix of the path" protects the descendants of a
 * locked leaf but leaves its ancestors wide open: with `openings` locked
 * (pattern "/facade/sides/&#42;/glazingRatio"), a single `set` on
 * "/facade/sides/0" replaces the entire side object — glazing ratio included —
 * and the shorter path never matches the longer pattern. Overlap in either
 * direction is a write into protected territory.
 */
function overlaps(pattern: string, path: string): boolean {
  const p = pattern.split("/").filter(Boolean);
  const t = path.split("/").filter(Boolean);
  const shared = Math.min(p.length, t.length);
  if (shared === 0) return false;

  for (let i = 0; i < shared; i += 1) {
    if (p[i] !== "*" && p[i] !== t[i]) return false;
  }
  return true;
}

/**
 * Why this path may not be written, or null when it is free.
 *
 * Level locks also veto insert/remove on `/levels` outright: those shift array
 * indices, so an unlocked insertion would silently renumber the locked level's
 * address. Refusing is honest; renumbering behind the user's back is not.
 */
export function lockRejection(input: {
  path: string;
  op: "set" | "insert" | "remove";
  tokens: Iterable<LockToken>;
  spec: BuildingSpec;
}): string | null {
  const tokens = [...input.tokens];

  for (const system of lockedSystems(tokens)) {
    for (const pattern of SYSTEM_SPEC_PATHS[system]) {
      if (overlaps(pattern, input.path)) {
        return `${SYSTEM_LABEL[system]} is locked.`;
      }
    }
  }

  const floors = lockedFloorNos(tokens);
  if (floors.length > 0) {
    const segments = input.path.split("/").filter(Boolean);
    if (segments[0] === "levels") {
      if (input.op !== "set" || segments.length < 2) {
        return `Levels cannot be added or removed while level ${floors.join(", ")} is locked.`;
      }
      const index = Number(segments[1]);
      const level = input.spec.levels[index];
      if (level && floors.includes(level.floorNo)) {
        return `Level ${level.floorNo} (${level.name}) is locked.`;
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Element stamping                                                    */
/* ------------------------------------------------------------------ */

/**
 * Stamp `locked` onto every element to match the lock set, so `mergeGenerated`
 * preserves exactly what the user protected. System and level locks propagate to
 * their elements here — that is what makes "lock the core" survive a rebuild.
 *
 * The token set is the SOURCE OF TRUTH, so this un-stamps as well as stamps,
 * including when the set is empty. Short-circuiting on an empty set would mean
 * releasing the last lock never cleared `locked: true`, leaving elements
 * protected forever with nothing in the session left to explain why.
 */
export function applyLocksToElements(
  elements: BimElement[],
  tokens: Iterable<LockToken>,
): BimElement[] {
  const list = [...tokens];
  const systems = new Set(lockedSystems(list));
  const floors = new Set(lockedFloorNos(list).map((n) => levelIdForFloor(n)));
  const ids = new Set(lockedElementIds(list));

  let changed = false;
  const next = elements.map((element) => {
    const locked =
      ids.has(element.id) ||
      (element.system !== undefined && systems.has(element.system)) ||
      (element.levelId !== null && floors.has(element.levelId));
    if (locked === Boolean(element.locked)) return element;
    changed = true;
    return { ...element, locked };
  });

  // Identity return when nothing moved keeps referential equality for callers
  // that memoise on the array.
  return changed ? next : elements;
}
