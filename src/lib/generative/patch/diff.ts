// src/lib/generative/patch/diff.ts
//
// What actually changed — computed from the two specifications, not from the
// patch that was requested.
//
// This distinction is the entire point. A patch says "increase glazing"; the
// diff says the south elevation went from 0.40 to 0.52 and the window count
// from 96 to 124. Only the second is reviewable, and only the second catches a
// patch whose operations partly failed, partly landed, or landed somewhere the
// user did not expect. The diff preview shows this before anything is accepted
// (brief §55: never change the model without showing what changed).

import type { ValueSource } from "../spec/building-spec";
import type { BuildingSpec } from "../spec/building-spec";
import type { BuildingMetrics } from "../generate/types";

export interface SpecDiffEntry {
  path: string;
  /** Human-readable trail, e.g. "Facade · Sides · South · Glazing ratio". */
  label: string;
  kind: "changed" | "added" | "removed";
  before?: unknown;
  after?: unknown;
  beforeText: string;
  afterText: string;
  /** Present when the value carries provenance and its source moved. */
  sourceBefore?: ValueSource;
  sourceAfter?: ValueSource;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

const SECTION_LABEL: Record<string, string> = {
  project: "Project",
  designIntent: "Design intent",
  orientation: "Orientation",
  site: "Site",
  massing: "Massing",
  levels: "Levels",
  structure: "Structure",
  core: "Core",
  program: "Program",
  facade: "Facade",
  roof: "Roof",
  dimensions: "Dimensions",
  mep: "MEP",
  constraints: "Constraints",
  assumptions: "Assumptions",
  generationSeed: "Generation seed",
};

/** camelCase → readable words, with unit suffixes stripped into the formatter. */
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/\bMm\b/g, "")
    .replace(/\bSqm\b/g, "")
    .replace(/\bDeg\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return spaced
    .split(" ")
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word.length === 1
          ? word
          : word.toLowerCase(),
    )
    .join(" ");
}

/** Arrays are addressed by index, but people read names. Find one. */
function nameOfItem(item: unknown, index: number): string {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    for (const key of ["name", "label", "side", "id"]) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return key === "side" ? value.charAt(0).toUpperCase() + value.slice(1) : value;
      }
    }
  }
  // A primitive array element IS its own name — "plumbing", not "#3".
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }
  return `#${index + 1}`;
}

/**
 * The identity of an array element, for pairing before against after.
 *
 * Pairing by POSITION is the trap here. Remove `/levels/1` from a five-storey
 * building and a positional walk pairs L02↔L03, L03↔L04, L04↔L05 and then
 * reports L05 as the removed one — telling the reviewer the top floor was
 * deleted when the second floor was. Since the diff is the last thing shown
 * before a destructive change is accepted, that is the worst possible place to
 * be wrong.
 *
 * `floorNo` is preferred over `name` for levels because it IS the storey's
 * identity: a renumbering genuinely changes which storey a level is, whereas a
 * rename does not.
 */
function keyOfItem(item: unknown, index: number): string {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    for (const key of ["id", "floorNo", "side", "name", "label"]) {
      const value = record[key];
      if (typeof value === "string" || typeof value === "number") {
        return `${key}=${value}`;
      }
    }
  }
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return `value=${String(item)}`;
  }
  return `index=${index}`;
}

/** Keys occurring exactly once on both sides pair up; the rest fall back to order. */
function pairItems(
  before: unknown[],
  after: unknown[],
): {
  matched: Array<{ beforeIndex: number; afterIndex: number }>;
  removed: number[];
  added: number[];
} {
  const countKeys = (items: unknown[]) => {
    const counts = new Map<string, number>();
    items.forEach((item, index) => {
      const key = keyOfItem(item, index);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  };

  const beforeCounts = countKeys(before);
  const afterCounts = countKeys(after);

  const matched: Array<{ beforeIndex: number; afterIndex: number }> = [];
  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();

  const afterByKey = new Map<string, number>();
  after.forEach((item, index) => {
    const key = keyOfItem(item, index);
    if (!afterByKey.has(key)) afterByKey.set(key, index);
  });

  before.forEach((item, beforeIndex) => {
    const key = keyOfItem(item, beforeIndex);
    // Ambiguous keys are left to the positional fallback rather than guessed at.
    if (beforeCounts.get(key) !== 1 || afterCounts.get(key) !== 1) return;
    const afterIndex = afterByKey.get(key);
    if (afterIndex === undefined) return;
    matched.push({ beforeIndex, afterIndex });
    usedBefore.add(beforeIndex);
    usedAfter.add(afterIndex);
  });

  const leftoverBefore = before
    .map((_, index) => index)
    .filter((index) => !usedBefore.has(index));
  const leftoverAfter = after
    .map((_, index) => index)
    .filter((index) => !usedAfter.has(index));

  // Whatever did not pair by identity pairs in order, so a genuine in-place
  // rewrite still reads as a change rather than a delete plus an insert.
  const overlap = Math.min(leftoverBefore.length, leftoverAfter.length);
  for (let i = 0; i < overlap; i += 1) {
    matched.push({ beforeIndex: leftoverBefore[i], afterIndex: leftoverAfter[i] });
  }

  return {
    matched: matched.sort((a, b) => a.afterIndex - b.afterIndex),
    removed: leftoverBefore.slice(overlap),
    added: leftoverAfter.slice(overlap),
  };
}

/* ------------------------------------------------------------------ */
/* Value formatting                                                    */
/* ------------------------------------------------------------------ */

function formatValue(key: string, value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";

  if (typeof value === "number") {
    if (/Mm$/.test(key)) {
      // Below a metre, millimetres read better than a decimal metre.
      return Math.abs(value) >= 1_000
        ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} m`
        : `${value} mm`;
    }
    if (/Sqm/.test(key)) return `${Number(value.toFixed(1)).toLocaleString()} m²`;
    if (/Deg$/.test(key)) return `${value}°`;
    if (/(Ratio|Chance)$/.test(key)) return `${(value * 100).toFixed(0)}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item(s)`;
  return "object";
}

/**
 * Render both sides of a change, and never let rounding collapse them.
 *
 * A glazing ratio moving 0.450 → 0.452 formats as "45% → 45%" — a review row
 * that shows a no-op while asking the user to accept a change. When the pretty
 * forms collide but the values genuinely differ, fall back to exact ones.
 */
function renderPair(
  key: string,
  before: unknown,
  after: unknown,
): { beforeText: string; afterText: string } {
  const beforeText = formatValue(key, before);
  const afterText = formatValue(key, after);
  if (beforeText !== afterText) return { beforeText, afterText };

  const exact = (value: unknown) =>
    value === undefined
      ? "—"
      : typeof value === "number" || typeof value === "string"
        ? String(value)
        : JSON.stringify(value);
  return { beforeText: exact(before), afterText: exact(after) };
}

/* ------------------------------------------------------------------ */
/* Provenance-aware walk                                               */
/* ------------------------------------------------------------------ */

interface ProvenancedShape {
  value: unknown;
  source: ValueSource;
  confidence: number;
  reason: string;
}

function asProvenanced(value: unknown): ProvenancedShape | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const looksRight =
    "value" in record &&
    typeof record.source === "string" &&
    typeof record.confidence === "number" &&
    typeof record.reason === "string";
  return looksRight ? (record as unknown as ProvenancedShape) : null;
}

/**
 * Cap the report: a diff nobody can read is not a diff. The metric deltas and
 * the validation report carry the overall picture when a patch is sweeping.
 */
const MAX_ENTRIES = 120;

function walk(
  before: unknown,
  after: unknown,
  path: string,
  trail: string[],
  key: string,
  out: SpecDiffEntry[],
): void {
  if (out.length >= MAX_ENTRIES) return;

  const beforeProv = asProvenanced(before);
  const afterProv = asProvenanced(after);
  if (beforeProv && afterProv) {
    // Treat a provenanced wrapper as one leaf: the user cares that the grid went
    // 8,400 → 9,000 mm, and separately that it stopped being an assumption.
    if (
      JSON.stringify(beforeProv.value) !== JSON.stringify(afterProv.value) ||
      beforeProv.source !== afterProv.source
    ) {
      out.push({
        path,
        label: trail.join(" · "),
        kind: "changed",
        before: beforeProv.value,
        after: afterProv.value,
        ...renderPair(key, beforeProv.value, afterProv.value),
        ...(beforeProv.source !== afterProv.source
          ? { sourceBefore: beforeProv.source, sourceAfter: afterProv.source }
          : {}),
      });
    }
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const { matched, removed, added } = pairItems(before, after);

    for (const { beforeIndex, afterIndex } of matched) {
      if (out.length >= MAX_ENTRIES) return;
      walk(
        before[beforeIndex],
        after[afterIndex],
        `${path}/${afterIndex}`,
        [...trail, nameOfItem(after[afterIndex], afterIndex)],
        key,
        out,
      );
    }

    for (const index of removed) {
      // Re-checked inside the loop: a bulk removal must not blow past the cap
      // the way an entry guard alone would let it.
      if (out.length >= MAX_ENTRIES) return;
      out.push({
        path: `${path}/${index}`,
        label: [...trail, nameOfItem(before[index], index)].join(" · "),
        kind: "removed",
        before: before[index],
        beforeText: nameOfItem(before[index], index),
        afterText: "—",
      });
    }

    for (const index of added) {
      if (out.length >= MAX_ENTRIES) return;
      out.push({
        path: `${path}/${index}`,
        label: [...trail, nameOfItem(after[index], index)].join(" · "),
        kind: "added",
        after: after[index],
        beforeText: "—",
        afterText: nameOfItem(after[index], index),
      });
    }
    return;
  }

  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const beforeRecord = before as Record<string, unknown>;
    const afterRecord = after as Record<string, unknown>;
    for (const childKey of new Set([
      ...Object.keys(beforeRecord),
      ...Object.keys(afterRecord),
    ])) {
      const childLabel =
        trail.length === 0
          ? (SECTION_LABEL[childKey] ?? humanize(childKey))
          : humanize(childKey);
      walk(
        beforeRecord[childKey],
        afterRecord[childKey],
        `${path}/${childKey}`,
        [...trail, childLabel],
        childKey,
        out,
      );
    }
    return;
  }

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    out.push({
      path,
      label: trail.join(" · "),
      kind: before === undefined ? "added" : after === undefined ? "removed" : "changed",
      before,
      after,
      ...renderPair(key, before, after),
    });
  }
}

export function diffSpecs(before: BuildingSpec, after: BuildingSpec): SpecDiffEntry[] {
  const out: SpecDiffEntry[] = [];
  walk(before, after, "", [], "", out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Metric deltas                                                       */
/* ------------------------------------------------------------------ */

export interface MetricDelta {
  key: keyof BuildingMetrics;
  label: string;
  before: number;
  after: number;
  delta: number;
  /** "count" | "area" | "length" | "ratio" — the UI picks the formatter. */
  unit: "count" | "area" | "length" | "ratio";
  /** True when the change is large enough to be worth the user's attention. */
  significant: boolean;
}

const TRACKED: Array<{
  key: keyof BuildingMetrics;
  label: string;
  unit: MetricDelta["unit"];
}> = [
  { key: "floorCount", label: "Floors", unit: "count" },
  { key: "grossAreaSqm", label: "Gross area", unit: "area" },
  { key: "netAreaSqm", label: "Net area", unit: "area" },
  { key: "buildingHeightM", label: "Height", unit: "length" },
  { key: "circulationRatio", label: "Circulation", unit: "ratio" },
  { key: "coreRatio", label: "Core", unit: "ratio" },
  { key: "windowToWallRatio", label: "Window-to-wall", unit: "ratio" },
  { key: "roomCount", label: "Spaces", unit: "count" },
  { key: "doorCount", label: "Doors", unit: "count" },
  { key: "windowCount", label: "Windows", unit: "count" },
  { key: "columnCount", label: "Columns", unit: "count" },
];

/** Only numeric, comparable metrics — the per-type records are not deltas. */
export function diffMetrics(
  before: BuildingMetrics,
  after: BuildingMetrics,
): MetricDelta[] {
  const out: MetricDelta[] = [];
  for (const { key, label, unit } of TRACKED) {
    const a = before[key];
    const b = after[key];
    if (typeof a !== "number" || typeof b !== "number") continue;
    if (a === b) continue;

    const delta = b - a;
    const relative = a === 0 ? 1 : Math.abs(delta / a);
    out.push({
      key,
      label,
      before: a,
      after: b,
      delta,
      unit,
      // Counts always matter; continuous quantities need to move 1% to qualify,
      // which keeps floating-point noise out of the review.
      significant: unit === "count" || relative >= 0.01,
    });
  }
  return out;
}
