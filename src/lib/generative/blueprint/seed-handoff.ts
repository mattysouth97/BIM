"use client";

// src/lib/generative/blueprint/seed-handoff.ts
//
// One-shot handoff of a seed blueprint from the twin workspace to the studio.
//
// The blueprint store is deliberately not persisted, and a soft navigation
// keeps it alive — so `loadBlueprint` alone already delivers the drawing. This
// module covers the two things it cannot: surviving a hard reload of /studio,
// and telling the studio that a seed is WAITING, which is what lets it open on
// the schematic rather than on the prompt box.
//
// `take` semantics: reading clears the stash. A seed that stayed behind would
// re-open the drawing every time the studio mounted, long after the user moved
// on to something else.

import { safeParseBlueprintSpec, type BlueprintSpec } from "./blueprint-spec";

/** sessionStorage, not localStorage: the handoff is one navigation long. */
const SEED_KEY = "generative:seed-blueprint";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Storage disabled (private mode, blocked cookies). The in-memory store
    // still carries the seed across a soft navigation.
    return null;
  }
}

export function stashSeedBlueprint(spec: BlueprintSpec): void {
  try {
    storage()?.setItem(SEED_KEY, JSON.stringify(spec));
  } catch {
    // Quota or serialisation failure is not worth failing the navigation over.
  }
}

/** The stashed seed, removed from the stash. Null when there is none. */
export function takeSeedBlueprint(): BlueprintSpec | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(SEED_KEY);
  if (raw === null) return null;
  store.removeItem(SEED_KEY);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // Storage is user-writable; never hand unvalidated JSON to the editor.
  const result = safeParseBlueprintSpec(parsed);
  return result.success ? result.data : null;
}

export function clearSeedBlueprint(): void {
  try {
    storage()?.removeItem(SEED_KEY);
  } catch {
    /* nothing to clear */
  }
}
