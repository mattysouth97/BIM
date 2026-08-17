import { describe, expect, it } from "vitest";

import {
  interpretSegmentsToBlueprint,
  type LabelInputMm,
  type SegmentInputMm,
} from "../blueprint/from-segments";
import { validateBlueprint } from "../blueprint/validate-blueprint";
import type { BoundaryLoop, PointMm } from "../blueprint/blueprint-spec";

const pt = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

/** Chain closed line segments through consecutive points, wrapping to the first. */
function ring(points: PointMm[], layer?: string): SegmentInputMm[] {
  return points.map((start, i) => ({
    startMm: start,
    endMm: points[(i + 1) % points.length],
    ...(layer ? { layer } : {}),
  }));
}

function vertexSet(loop: BoundaryLoop): Set<string> {
  return new Set(
    loop.segments.map((s) => {
      if (s.kind !== "line") throw new Error("expected a straight loop for this fixture");
      return `${s.startMm.xMm},${s.startMm.zMm}`;
    }),
  );
}

/** An L-shaped outline (84 m²) with a 2×2 m core square cut into it, on layer A-CORE. */
function lWithCoreSegments(): { segments: SegmentInputMm[]; labels: LabelInputMm[] } {
  const outline = ring([
    pt(0, 0),
    pt(10_000, 0),
    pt(10_000, 6_000),
    pt(6_000, 6_000),
    pt(6_000, 10_000),
    pt(0, 10_000),
  ]);
  const core = ring(
    [pt(7_000, 1_000), pt(9_000, 1_000), pt(9_000, 3_000), pt(7_000, 3_000)],
    "A-CORE",
  );
  const labels: LabelInputMm[] = [{ text: "STAIR", positionMm: pt(8_000, 2_000) }];
  return { segments: [...outline, ...core], labels };
}

describe("interpretSegmentsToBlueprint — boundary + core", () => {
  it("reads the L outline as the boundary and the layered inner loop as the core", () => {
    const { segments, labels } = lWithCoreSegments();
    const spec = interpretSegmentsToBlueprint(segments, labels);

    const report = validateBlueprint(spec);
    expect(report.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(report.blueprintValid).toBe(true);

    expect(spec.boundaries).toHaveLength(1);
    expect(spec.boundaries[0].loop.segments).toHaveLength(6);
    expect(vertexSet(spec.boundaries[0].loop)).toEqual(
      new Set(["0,0", "10000,0", "10000,6000", "6000,6000", "6000,10000", "0,10000"]),
    );

    expect(spec.cores).toHaveLength(1);
    expect(spec.cores[0].contents).toContain("stair");
    expect(spec.voids).toHaveLength(0);
    expect(spec.zones).toHaveLength(0);
  });

  it("is deterministic — identical input always yields an identical spec", () => {
    const { segments, labels } = lWithCoreSegments();
    const a = interpretSegmentsToBlueprint(segments, labels);
    const b = interpretSegmentsToBlueprint(segments, labels);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("throws honestly when no closed loop exists — never fabricates a boundary", () => {
    const dangling: SegmentInputMm[] = [{ startMm: pt(0, 0), endMm: pt(1_000, 0) }];
    expect(() => interpretSegmentsToBlueprint(dangling)).toThrow(/no closed loop/i);
  });
});

describe("interpretSegmentsToBlueprint — void classification by area", () => {
  it("classifies a small unlabelled loop as a shaft and a large one as a courtyard", () => {
    const boundary = ring([pt(0, 0), pt(20_000, 0), pt(20_000, 20_000), pt(0, 20_000)]);
    const shaft = ring([pt(2_000, 2_000), pt(4_000, 2_000), pt(4_000, 4_000), pt(2_000, 4_000)]);
    const courtyard = ring([
      pt(10_000, 10_000),
      pt(16_000, 10_000),
      pt(16_000, 16_000),
      pt(10_000, 16_000),
    ]);

    const spec = interpretSegmentsToBlueprint([...boundary, ...shaft, ...courtyard]);

    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    expect(spec.voids).toHaveLength(2);
    expect(spec.cores).toHaveLength(0);
    expect(spec.zones).toHaveLength(0);

    const kinds = new Set(spec.voids.map((v) => v.kind.value));
    expect(kinds).toEqual(new Set(["shaft", "courtyard"]));

    // Every void kind here came from area alone — genuinely uncertain, and
    // recorded as such rather than presented as read fact.
    expect(spec.uncertainty.length).toBeGreaterThanOrEqual(2);
    for (const item of spec.uncertainty) {
      expect(item.evidence).toBe("geometry");
    }
  });

  it("drops a loop outside the boundary with an honest uncertainty note, not a crash", () => {
    const boundary = ring([pt(0, 0), pt(10_000, 0), pt(10_000, 10_000), pt(0, 10_000)]);
    const outsider = ring([
      pt(50_000, 50_000),
      pt(52_000, 50_000),
      pt(52_000, 52_000),
      pt(50_000, 52_000),
    ]);

    const spec = interpretSegmentsToBlueprint([...boundary, ...outsider]);

    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    expect(spec.voids).toHaveLength(0);
    expect(spec.cores).toHaveLength(0);
    const boundaryId = spec.boundaries[0].loop.id;
    expect(spec.uncertainty.some((u) => u.targetId === boundaryId)).toBe(true);
  });
});

describe("interpretSegmentsToBlueprint — zones from labels", () => {
  it("names and programs a zone from a contained text label, with no layer hint at all", () => {
    const boundary = ring([pt(0, 0), pt(20_000, 0), pt(20_000, 20_000), pt(0, 20_000)]);
    const room = ring([pt(2_000, 2_000), pt(8_000, 2_000), pt(8_000, 8_000), pt(2_000, 8_000)]);
    const labels: LabelInputMm[] = [
      { text: "OPEN OFFICE AREA", positionMm: pt(5_000, 5_000) },
    ];

    const spec = interpretSegmentsToBlueprint([...boundary, ...room], labels);

    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    expect(spec.zones).toHaveLength(1);
    expect(spec.zones[0].program.value).toBe("office-open");
    expect(spec.zones[0].label).toBe("OPEN OFFICE AREA");
    expect(spec.voids).toHaveLength(0);
  });
});

describe("interpretSegmentsToBlueprint — layerRoles overrides", () => {
  it("prefers the explicitly-mapped boundary layer over the largest loop", () => {
    const bigUnlayered = ring([pt(0, 0), pt(20_000, 0), pt(20_000, 20_000), pt(0, 20_000)]);
    const smallWalled = ring(
      [pt(30_000, 30_000), pt(34_000, 30_000), pt(34_000, 34_000), pt(30_000, 34_000)],
      "A-WALL",
    );

    const spec = interpretSegmentsToBlueprint(
      [...bigUnlayered, ...smallWalled],
      [],
      { layerRoles: { boundary: ["A-WALL"] } },
    );

    expect(vertexSet(spec.boundaries[0].loop)).toEqual(
      new Set(["30000,30000", "34000,30000", "34000,34000", "30000,34000"]),
    );
    // The larger, unmapped loop cannot be inside the (smaller) chosen boundary.
    const boundaryId = spec.boundaries[0].loop.id;
    expect(spec.uncertainty.some((u) => u.targetId === boundaryId)).toBe(true);
    expect(validateBlueprint(spec).blueprintValid).toBe(true);
  });

  it("takes an explicit zoneProgramByLayer mapping over any keyword or area guess", () => {
    const boundary = ring([pt(0, 0), pt(20_000, 0), pt(20_000, 20_000), pt(0, 20_000)]);
    const room = ring(
      [pt(2_000, 2_000), pt(8_000, 2_000), pt(8_000, 8_000), pt(2_000, 8_000)],
      "A-ROOM-LAB",
    );

    const spec = interpretSegmentsToBlueprint(
      [...boundary, ...room],
      [],
      { layerRoles: { zoneProgramByLayer: { "A-ROOM-LAB": "laboratory" } } },
    );

    expect(spec.zones).toHaveLength(1);
    expect(spec.zones[0].program.value).toBe("laboratory");
    expect(spec.zones[0].program.confidence).toBe(0.9);
    expect(spec.voids).toHaveLength(0);
    expect(validateBlueprint(spec).blueprintValid).toBe(true);
  });
});
