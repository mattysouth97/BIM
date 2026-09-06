// src/lib/retrofit/measure-selection.ts
// Picking the work, when the USER picks it.
//
// Pure set logic over measure ids: no React, no store, no THREE. The chip row
// calls `toggleMeasure` and renders whatever it reports back.
//
// The one rule that must not be re-invented here is mutual exclusion. A
// building gets a condensing boiler OR a heat pump, never both, and the
// knapsack has always known that via `conflictGroup ?? exclusiveGroup`
// (`measureExclusionKey` in economic-model.ts). Now that a person can assemble
// the set by hand, the same rule has to hold at click time — otherwise a
// hand-picked set could contain a pair the optimiser would never produce, and
// the economics would happily price a building with two heating plants.
//
// Distinct from `measure-interactions.ts`, which is easy to confuse with this:
// that module DAMPS the savings of measures that share a demand stream (an
// envelope package leaves the HRV less heat to recover). Damping is about
// arithmetic on measures that legitimately coexist. This is about the pairs
// that cannot coexist at all.

import type { RetrofitMeasure } from "./retrofit-types";
import { measureExclusionKey } from "./economic-model";

export interface MeasureToggleResult {
  /** The set after the click, ids in the order the catalogue lists them. */
  next: string[];
  /**
   * Measures dropped because the one just switched ON excludes them. Empty on
   * a switch-off, and empty when nothing conflicted. The chip row says this
   * out loud rather than letting a selection quietly disappear.
   */
  evicted: RetrofitMeasure[];
}

/** Order ids the way the catalogue does, so the set never depends on click order. */
function inCatalogueOrder(ids: Iterable<string>, all: readonly RetrofitMeasure[]): string[] {
  const wanted = new Set(ids);
  return all.map((m) => m.id).filter((id) => wanted.has(id));
}

/**
 * Switch one measure on or off.
 *
 * Switching ON evicts every already-chosen measure sharing its exclusion key.
 * Switching OFF evicts nothing — removing work can never create a conflict.
 * An id not in `all` is ignored rather than added: the chip row can only offer
 * what the generators produced, so an unknown id is a bug upstream and adding
 * it would put a measure in the set that nothing can price.
 */
export function toggleMeasure(
  current: readonly string[],
  measureId: string,
  all: readonly RetrofitMeasure[],
): MeasureToggleResult {
  const measure = all.find((m) => m.id === measureId);
  if (!measure) return { next: [...current], evicted: [] };

  if (current.includes(measureId)) {
    return {
      next: current.filter((id) => id !== measureId),
      evicted: [],
    };
  }

  const key = measureExclusionKey(measure);
  const evicted = key
    ? all.filter(
        (m) =>
          m.id !== measureId &&
          current.includes(m.id) &&
          measureExclusionKey(m) === key,
      )
    : [];

  const evictedIds = new Set(evicted.map((m) => m.id));
  const kept = current.filter((id) => !evictedIds.has(id));
  return {
    next: inCatalogueOrder([...kept, measureId], all),
    evicted,
  };
}

/**
 * The measures this one would evict if it were switched on now — what the chip
 * has to disclose BEFORE the click, not only after it.
 */
export function conflictsWith(
  measureId: string,
  current: readonly string[],
  all: readonly RetrofitMeasure[],
): RetrofitMeasure[] {
  if (current.includes(measureId)) return [];
  const measure = all.find((m) => m.id === measureId);
  const key = measure ? measureExclusionKey(measure) : undefined;
  if (!key) return [];
  return all.filter(
    (m) =>
      m.id !== measureId &&
      current.includes(m.id) &&
      measureExclusionKey(m) === key,
  );
}

/**
 * Every measure that shares an exclusion key with this one, chosen or not —
 * the alternatives, for a chip that wants to say "택일" whether or not the
 * sibling is currently on.
 */
export function alternativesTo(
  measureId: string,
  all: readonly RetrofitMeasure[],
): RetrofitMeasure[] {
  const measure = all.find((m) => m.id === measureId);
  const key = measure ? measureExclusionKey(measure) : undefined;
  if (!key) return [];
  return all.filter((m) => m.id !== measureId && measureExclusionKey(m) === key);
}
