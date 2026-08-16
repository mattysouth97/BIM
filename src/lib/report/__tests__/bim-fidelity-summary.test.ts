// src/lib/report/__tests__/bim-fidelity-summary.test.ts
// Pure unit tests for buildBimFidelitySummary / buildBimFidelitySections.

import { describe, it, expect } from "vitest";
import {
  buildBimFidelitySummary,
  buildBimFidelitySections,
} from "../bim-fidelity-summary";
import { ENGINE_CONSTANTS } from "@/lib/engine";
import type { BimEngineResult, ElementConfidence } from "@/lib/engine";

function makeElement(overrides: Partial<ElementConfidence> & { expressId: number }): ElementConfidence {
  return {
    kind: "wall",
    sconf: 0.9,
    geomScore: 0.9,
    heightScore: 0.9,
    topologyPenalty: 0,
    ...overrides,
  };
}

function makeResult(elements: ElementConfidence[]): BimEngineResult {
  const hitlFlags = elements
    .filter((e) => e.sconf < ENGINE_CONSTANTS.HITL_THRESHOLD)
    .map((e) => ({ expressId: e.expressId, kind: e.kind, sconf: e.sconf, reason: "test" }));

  return {
    ifcBytes: new Uint8Array(),
    model: {
      pk: "p1",
      title: "Test",
      footprint: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      footprintSource: "cad-converted",
      floors: 1,
      floorsSource: "cad-converted",
      storeyHeightM: 3.3,
      totalHeightM: 3.3,
      heightSource: "cad-converted",
      wallThicknessM: 0.3,
      facade: null,
      facadeSource: "era-estimate",
    },
    elements,
    hitlFlags,
    conflicts: [],
    validation: { checks: [], passed: true },
  };
}

describe("buildBimFidelitySummary", () => {
  it("returns null when the engine result is null (AFF-6: no real footprint)", () => {
    expect(buildBimFidelitySummary(null)).toBeNull();
  });

  it("computes overall fidelity as the average sconf across all elements", () => {
    const result = makeResult([
      makeElement({ expressId: 1, kind: "wall", sconf: 1.0 }),
      makeElement({ expressId: 2, kind: "wall", sconf: 0.5 }),
    ]);
    const summary = buildBimFidelitySummary(result);
    expect(summary).not.toBeNull();
    expect(summary!.overallFidelity).toBeCloseTo(0.75, 6);
    expect(summary!.totalElements).toBe(2);
  });

  it("hitlFlagCount mirrors result.hitlFlags.length exactly", () => {
    const result = makeResult([
      makeElement({ expressId: 1, kind: "wall", sconf: 1.0 }),
      makeElement({ expressId: 2, kind: "window", sconf: 0.5 }), // below threshold
      makeElement({ expressId: 3, kind: "door", sconf: 0.5 }), // below threshold
    ]);
    const summary = buildBimFidelitySummary(result);
    expect(summary!.hitlFlagCount).toBe(2);
    expect(summary!.hitlFlagCount).toBe(result.hitlFlags.length);
  });

  it("splits each category into measured (>= HITL_THRESHOLD) vs estimated (< HITL_THRESHOLD)", () => {
    const result = makeResult([
      makeElement({ expressId: 1, kind: "wall", sconf: 0.95 }), // measured
      makeElement({ expressId: 2, kind: "wall", sconf: 0.5 }), // estimated
      makeElement({ expressId: 3, kind: "slab", sconf: ENGINE_CONSTANTS.HITL_THRESHOLD }), // exactly at threshold -> measured
      makeElement({ expressId: 4, kind: "window", sconf: 0.5 }), // estimated (windows always < threshold)
      makeElement({ expressId: 5, kind: "door", sconf: 0.5 }), // estimated
    ]);
    const summary = buildBimFidelitySummary(result)!;

    const byKind = Object.fromEntries(summary.categories.map((c) => [c.kind, c]));
    expect(byKind.wall).toEqual({ kind: "wall", measured: 1, estimated: 1, total: 2 });
    expect(byKind.slab).toEqual({ kind: "slab", measured: 1, estimated: 0, total: 1 });
    expect(byKind.window).toEqual({ kind: "window", measured: 0, estimated: 1, total: 1 });
    expect(byKind.door).toEqual({ kind: "door", measured: 0, estimated: 1, total: 1 });
  });

  it("always includes all four categories in a fixed order, even with zero elements in some", () => {
    const result = makeResult([makeElement({ expressId: 1, kind: "wall", sconf: 1.0 })]);
    const summary = buildBimFidelitySummary(result)!;
    expect(summary.categories.map((c) => c.kind)).toEqual(["wall", "slab", "window", "door"]);
    const byKind = Object.fromEntries(summary.categories.map((c) => [c.kind, c]));
    expect(byKind.slab).toEqual({ kind: "slab", measured: 0, estimated: 0, total: 0 });
  });

  it("overallFidelity is 0 (not NaN) for an empty elements array", () => {
    const result = makeResult([]);
    const summary = buildBimFidelitySummary(result)!;
    expect(summary.overallFidelity).toBe(0);
    expect(summary.totalElements).toBe(0);
    expect(Number.isNaN(summary.overallFidelity)).toBe(false);
  });
});

describe("buildBimFidelitySections", () => {
  it("returns a single honest 'unavailable' text section when summary is null", () => {
    const sections = buildBimFidelitySections(null);
    expect(sections).toHaveLength(1);
    expect(sections[0].content.type).toBe("text");
    expect((sections[0].content as { type: "text"; text: string }).text).toMatch(
      /unavailable/i
    );
    // Never fabricate numbers when unavailable.
    expect(JSON.stringify(sections[0])).not.toMatch(/\d+%/);
  });

  it("renders an overview key-value section + a category table when summary is present", () => {
    const result = makeResult([
      makeElement({ expressId: 1, kind: "wall", sconf: 1.0 }),
      makeElement({ expressId: 2, kind: "window", sconf: 0.5 }),
    ]);
    const summary = buildBimFidelitySummary(result);
    const sections = buildBimFidelitySections(summary);

    expect(sections).toHaveLength(2);
    expect(sections[0].content.type).toBe("key-value");
    expect(sections[1].content.type).toBe("table");

    const kv = sections[0].content as { type: "key-value"; items: { label: string; value: string }[] };
    const overallItem = kv.items.find((i) => i.label === "Overall Fidelity");
    expect(overallItem?.value).toBe("75.0%");
    const hitlItem = kv.items.find((i) => i.label === "HITL-Flagged Elements");
    expect(hitlItem?.value).toBe("1");

    const table = sections[1].content as { type: "table"; headers: string[]; rows: string[][] };
    expect(table.headers).toEqual(["Category", "Measured", "Estimated", "Total"]);
    // 4 rows: Walls, Slabs, Windows, Door.
    expect(table.rows).toHaveLength(4);
    const wallRow = table.rows.find((r) => r[0] === "Walls");
    expect(wallRow).toEqual(["Walls", "1", "0", "1"]);
    const windowRow = table.rows.find((r) => r[0] === "Windows");
    expect(windowRow).toEqual(["Windows", "0", "1", "1"]);
  });
});
