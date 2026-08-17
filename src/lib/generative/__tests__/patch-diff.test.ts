import { describe, expect, it } from "vitest";

import type { BuildingMetrics } from "../generate/types";
import { diffMetrics, diffSpecs, type SpecDiffEntry } from "../patch/diff";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

/** One realistic, schema-valid spec is cheaper and truer than a hand fixture. */
async function specFor(
  prompt = "A 9 storey office building of 18,000 m² with one basement.",
): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({ prompt, seed: 42 });
  return data;
}

/** Deep copy: every case mutates its own pair, so nothing leaks between tests. */
function clone(spec: BuildingSpec): BuildingSpec {
  return JSON.parse(JSON.stringify(spec)) as BuildingSpec;
}

/** Asserts the path is reported exactly once — duplicates are themselves a bug. */
function entryAt(entries: SpecDiffEntry[], path: string): SpecDiffEntry {
  const found = entries.filter((entry) => entry.path === path);
  expect(found, `expected exactly one entry at ${path}`).toHaveLength(1);
  return found[0];
}

describe("diffSpecs — the null case", () => {
  it("reports nothing at all for two structurally identical specs", async () => {
    const spec = await specFor();
    // A separate object, not the same reference: equality must be by value.
    expect(diffSpecs(spec, clone(spec))).toEqual([]);
  });
});

describe("diffSpecs — scalars", () => {
  it("reports one entry with path, readable trail and formatted values", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    before.core.offsetXMm = 0;
    after.core.offsetXMm = 4_200;

    const entries = diffSpecs(before, after);
    expect(entries).toHaveLength(1);
    const [entry] = entries;

    expect(entry.path).toBe("/core/offsetXMm");
    // The trail is what the review panel prints: section, then humanised key
    // with the unit suffix stripped out (it lives in the formatted text).
    expect(entry.label).toBe("Core · Offset X");
    expect(entry.kind).toBe("changed");
    expect(entry.before).toBe(0);
    expect(entry.after).toBe(4_200);
    expect(entry.beforeText).toBe("0 mm");
    expect(entry.afterText).toBe("4.20 m");
    // No provenance on a bare number, so no source movement is claimed.
    expect(entry.sourceBefore).toBeUndefined();
    expect(entry.sourceAfter).toBeUndefined();
  });

  it("formats millimetres as metres past a metre and as mm below it", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    before.facade.spandrelMm = 400;
    after.facade.spandrelMm = 900;
    before.structure.gridXMm.value = 8_400;
    after.structure.gridXMm.value = 9_000;

    const entries = diffSpecs(before, after);

    // Sub-metre dimensions read as millimetres — "0.40 m" is how detailing gets lost.
    const spandrel = entryAt(entries, "/facade/spandrelMm");
    expect(spandrel.beforeText).toBe("400 mm");
    expect(spandrel.afterText).toBe("900 mm");

    // Past a metre it switches, and a whole-metre value drops the decimals.
    const grid = entryAt(entries, "/structure/gridXMm");
    expect(grid.beforeText).toBe("8.40 m");
    expect(grid.afterText).toBe("9 m");
  });

  it("formats ratio-suffixed keys as percentages", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    const south = before.facade.sides.findIndex((side) => side.side === "south");
    expect(south).toBeGreaterThanOrEqual(0);
    before.facade.sides[south].glazingRatio = 0.4;
    after.facade.sides[south].glazingRatio = 0.52;

    const entry = entryAt(diffSpecs(before, after), `/facade/sides/${south}/glazingRatio`);
    // A glazing ratio nobody reads as "0.52" is a diff nobody checks.
    expect(entry.beforeText).toBe("40%");
    expect(entry.afterText).toBe("52%");
    // Array members are addressed by the elevation they are, not by index. The
    // trail also keeps the container key, so only the item segment is pinned.
    expect(entry.label).toContain(" · South · ");
    expect(entry.label).not.toContain("#");
    expect(entry.label.endsWith("Glazing ratio")).toBe(true);
  });

  it("surfaces a key the model invented rather than silently dropping it", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    // Model output is untrusted: an extra key must show up in the review, since
    // this is the last place a human sees the spec before it is accepted.
    (after.core as unknown as Record<string, unknown>).overrideLock = true;

    const entry = entryAt(diffSpecs(before, after), "/core/overrideLock");
    expect(entry.kind).toBe("added");
    expect(entry.beforeText).toBe("—");
    expect(entry.afterText).toBe("true");
  });
});

describe("diffSpecs — provenanced leaves", () => {
  it("collapses a Provenanced wrapper into a single value-keyed entry", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    before.structure.gridXMm.value = 8_400;
    after.structure.gridXMm.value = 9_000;

    const entries = diffSpecs(before, after);
    // Not four entries for value/source/confidence/reason — one, on the value.
    expect(entries.map((entry) => entry.path)).toEqual(["/structure/gridXMm"]);
    expect(entries[0].before).toBe(8_400);
    expect(entries[0].after).toBe(9_000);
    expect(entries[0].label).toBe("Structure · Grid X");
    expect(entries[0].sourceBefore).toBeUndefined();
    expect(entries[0].sourceAfter).toBeUndefined();
  });

  it("still reports a leaf whose source moved while its value stood still", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    before.structure.gridXMm = { ...before.structure.gridXMm, value: 8_400, source: "DEFAULT", confidence: 0.5 };
    after.structure.gridXMm = { ...after.structure.gridXMm, value: 8_400, source: "USER_PROVIDED", confidence: 1 };

    const entries = diffSpecs(before, after);
    expect(entries).toHaveLength(1);
    const [entry] = entries;

    // An assumption the user confirmed is a real change to the model's standing,
    // even though the number on the drawing is identical.
    expect(entry.kind).toBe("changed");
    expect(entry.beforeText).toBe(entry.afterText);
    expect(entry.sourceBefore).toBe("DEFAULT");
    expect(entry.sourceAfter).toBe("USER_PROVIDED");
  });

  it("ignores confidence and reason churn that changes nothing material", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    after.structure.gridXMm.confidence = 0.11;
    after.structure.gridXMm.reason = "Reworded justification, same grid.";

    // Re-running the reasoning layer rewrites prose constantly; if that counted
    // as a diff, every regeneration would look like a design change.
    expect(diffSpecs(before, after)).toEqual([]);
  });

  it("keeps one entry when a wrapper degrades to a bare value", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    // A malformed patch can replace the whole wrapper. The change must still be
    // one reviewable row, not a burst of orphaned /value, /source rows.
    (after.structure as unknown as Record<string, unknown>).gridXMm = 9_000;

    const entries = diffSpecs(before, after);
    expect(entries.map((entry) => entry.path)).toEqual(["/structure/gridXMm"]);
    expect(entries[0].kind).toBe("changed");
    expect(entries[0].afterText).toBe("9 m");
  });
});

describe("diffSpecs — arrays", () => {
  it("names a changed element after the item, not its index", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    const index = before.levels.findIndex((level) => level.floorNo === 3);
    expect(index).toBeGreaterThanOrEqual(0);
    const name = before.levels[index].name;
    after.levels[index].floorToFloorMm = before.levels[index].floorToFloorMm + 600;

    const entry = entryAt(diffSpecs(before, after), `/levels/${index}`.concat("/floorToFloorMm"));
    expect(entry.label).toBe(`Levels · ${name} · Floor to floor`);
    // The path stays index-addressed so it round-trips back to a patch op.
    expect(entry.path).toBe(`/levels/${index}/floorToFloorMm`);
  });

  it("names a program element after its label", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    const label = before.program[0].label;
    before.program[0].targetAreaSqmPerLevel = 300;
    after.program[0].targetAreaSqmPerLevel = 420;

    const entry = entryAt(diffSpecs(before, after), "/program/0/targetAreaSqmPerLevel");
    expect(entry.label).toBe(`Program · ${label} · Target area per level`);
    expect(entry.beforeText).toBe("300 m²");
    expect(entry.afterText).toBe("420 m²");
  });

  it("reports an appended element as added", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    const top = before.levels[before.levels.length - 1];
    const added = { ...top, floorNo: top.floorNo + 1, name: "Roof", usage: "roof" as const };
    after.levels = [...after.levels, added];

    const entries = diffSpecs(before, after);
    expect(entries).toHaveLength(1);
    const [entry] = entries;

    expect(entry.kind).toBe("added");
    expect(entry.path).toBe(`/levels/${before.levels.length}`);
    expect(entry.label).toBe("Levels · Roof");
    expect(entry.before).toBeUndefined();
    expect(entry.after).toEqual(added);
    expect(entry.beforeText).toBe("—");
    expect(entry.afterText).toBe("Roof");
  });

  it("reports a dropped element as removed", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    const dropped = before.levels[before.levels.length - 1];
    after.levels = after.levels.slice(0, -1);

    const entries = diffSpecs(before, after);
    expect(entries).toHaveLength(1);
    const [entry] = entries;

    expect(entry.kind).toBe("removed");
    expect(entry.path).toBe(`/levels/${before.levels.length - 1}`);
    expect(entry.label).toBe(`Levels · ${dropped.name}`);
    expect(entry.before).toEqual(dropped);
    expect(entry.after).toBeUndefined();
    expect(entry.beforeText).toBe(dropped.name);
    expect(entry.afterText).toBe("—");
  });

  it("caps a sweeping diff so the review stays readable", async () => {
    const base = await specFor();
    const before = clone(base);
    const after = clone(base);
    const levels = Array.from({ length: 60 }, (_, i) => ({
      floorNo: i + 1,
      name: `L${i + 1}`,
      floorToFloorMm: 4_000,
      usage: "occupied" as const,
    }));
    before.levels = levels;
    after.levels = levels.map((level) => ({
      ...level,
      name: `Level ${level.floorNo}`,
      floorToFloorMm: 4_200,
      usage: "amenity" as const,
    }));

    // 180 changed leaves. A diff nobody can read is not a diff, so the walk
    // stops at 120 and lets the metric deltas carry the overall picture.
    expect(diffSpecs(before, after)).toHaveLength(120);
  });
});

/* ------------------------------------------------------------------ */
/* Metric deltas                                                       */
/* ------------------------------------------------------------------ */

const BASE_METRICS: BuildingMetrics = {
  floorCount: 9,
  buildingHeightM: 36,
  grossAreaSqm: 18_000,
  netAreaSqm: 14_400,
  circulationAreaSqm: 2_600,
  circulationRatio: 0.18,
  coreAreaSqm: 900,
  coreRatio: 0.05,
  facadeAreaSqm: 5_200,
  windowAreaSqm: 2_100,
  windowToWallRatio: 0.4,
  roomCount: 120,
  doorCount: 140,
  windowCount: 96,
  columnCount: 180,
  spaceAreaByType: { "office-open": 9_000 },
  spaceCountByType: { "office-open": 40 },
};

function metrics(overrides: Partial<BuildingMetrics>): BuildingMetrics {
  return { ...BASE_METRICS, ...overrides };
}

describe("diffMetrics", () => {
  it("omits everything that did not move", () => {
    expect(diffMetrics(BASE_METRICS, metrics({}))).toEqual([]);
    // circulationAreaSqm is real but untracked, and the per-type records are
    // not comparable numbers — neither may invent a delta row.
    expect(
      diffMetrics(
        BASE_METRICS,
        metrics({ circulationAreaSqm: 4_000, spaceCountByType: { "office-open": 99 } }),
      ),
    ).toEqual([]);
  });

  it("flags a count change however small it is", () => {
    const [delta] = diffMetrics(BASE_METRICS, metrics({ windowCount: 97 }));
    expect(delta.key).toBe("windowCount");
    expect(delta.label).toBe("Windows");
    expect(delta.unit).toBe("count");
    expect(delta.delta).toBe(1);
    // One window is a real object gained or lost — never noise.
    expect(delta.significant).toBe(true);
  });

  it("reports a sub-1% continuous move but does not flag it", () => {
    const [quiet] = diffMetrics(BASE_METRICS, metrics({ windowToWallRatio: 0.4015 }));
    expect(quiet.key).toBe("windowToWallRatio");
    expect(quiet.delta).toBeCloseTo(0.0015, 9);
    // 0.375% — floating-point drift from a regeneration, not a design decision.
    expect(quiet.significant).toBe(false);

    const [loud] = diffMetrics(BASE_METRICS, metrics({ windowToWallRatio: 0.42 }));
    expect(loud.significant).toBe(true);
  });

  it("signs the delta after minus before", () => {
    const [shrunk] = diffMetrics(BASE_METRICS, metrics({ grossAreaSqm: 16_200 }));
    expect(shrunk.before).toBe(18_000);
    expect(shrunk.after).toBe(16_200);
    expect(shrunk.delta).toBe(-1_800);
    expect(shrunk.significant).toBe(true);

    const [grown] = diffMetrics(metrics({ grossAreaSqm: 16_200 }), BASE_METRICS);
    expect(grown.delta).toBe(1_800);
  });

  it("treats any movement away from zero as significant", () => {
    // The 1% rule divides by the before value; a metric that did not exist
    // before must not be dismissed as a rounding error.
    const [delta] = diffMetrics(metrics({ coreRatio: 0 }), metrics({ coreRatio: 0.001 }));
    expect(delta.before).toBe(0);
    expect(delta.significant).toBe(true);
  });

  it("skips metrics that are missing rather than reporting NaN", () => {
    // Metrics can arrive from a partially generated model; a missing key must
    // not become "NaN" in the review panel.
    expect(diffMetrics(BASE_METRICS, {} as BuildingMetrics)).toEqual([]);
  });
});
