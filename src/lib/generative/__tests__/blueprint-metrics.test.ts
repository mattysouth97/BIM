// Fidelity metrics: does the measurement actually measure?
//
// Every threshold below is CALIBRATED — the engine was run first, the number
// observed, and the assertion written around it with the observed value stated
// in a comment. A threshold nobody ran the engine against is a guess, and a
// guess in a fidelity test is worse than no test: it certifies whatever the
// engine happens to do.
//
// The negative control is the point of the file. A metric that reports "good"
// for a building generated from a DIFFERENT blueprint measures nothing, so an
// L-shaped plan is deliberately measured against a rectangle of EXACTLY the
// same area (825 m²): area deviation stays at 0 for both, and only the
// symmetric difference tells them apart.
//
// Buildings are generated through `compileBlueprintToSpec` + `buildDesign`
// rather than `runBlueprintGeneration`, because the server payload carries the
// recipe and the snapshot but deliberately NOT the `GeneratedBuilding` (it is
// thousands of objects, server-side only) — and `GeneratedBuilding` is what a
// geometric comparison needs.

import { describe, expect, it } from "vitest";

import {
  addAnchor,
  addBoundary,
  addCore,
  addVoid,
  addZone,
  compileBlueprintToSpec,
  emptyBlueprint,
  makePolyLoop,
  makeRectLoop,
  measureBlueprintFidelity,
  type BlueprintSpec,
  type PointMm,
} from "../blueprint";
import { buildDesign, generationIdFor } from "../build";
import { polygonBounds } from "../generate/massing";
import type { GeneratedBuilding } from "../generate/types";

const SEED = 20260817;

const p = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

/** The deterministic half of the engine, with the solver output kept. */
function buildFrom(blueprint: BlueprintSpec, seed = SEED): GeneratedBuilding {
  const { spec, locks } = compileBlueprintToSpec(blueprint, { seed });
  return buildDesign({
    spec,
    buildingPk: "metrics-test",
    generationId: generationIdFor(seed, 0),
    locks,
  }).building;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * L-shaped plan, 40 × 30 m overall with a 25 × 15 m notch removed: 825 m² net
 * against a 1,200 m² bounding box. A plate that silently became its bbox shows
 * up as a 45% area deviation, so the collapse cannot hide.
 */
function lShapedBlueprint(): BlueprintSpec {
  const loop = makePolyLoop("outline", [
    p(0, 0),
    p(40_000, 0),
    p(40_000, 15_000),
    p(15_000, 15_000),
    p(15_000, 30_000),
    p(0, 30_000),
  ]);
  return addBoundary(emptyBlueprint("L Plan"), { loop, floorNos: [1, 2, 3] });
}

/**
 * The negative control: 33 × 25 m = 825 m², the SAME area as the L and on the
 * same levels, but not remotely the same shape.
 */
function equalAreaRectBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Rect Plan"), {
    loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 33_000, depthMm: 25_000 }),
    floorNos: [1, 2, 3],
  });
}

/** 40 × 30 m plate on two levels with a 12 × 9 m courtyard punched through it. */
function courtyardBlueprint(): BlueprintSpec {
  const spec = addBoundary(emptyBlueprint("Courtyard Plan"), {
    loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 40_000, depthMm: 30_000 }),
    floorNos: [1, 2],
  });
  return addVoid(spec, {
    id: "court",
    kind: "courtyard",
    region: {
      kind: "rect",
      originMm: p(20_000, 15_000),
      widthMm: 12_000,
      depthMm: 9_000,
      rotationRad: 0,
    },
    floorNos: [1, 2],
  });
}

/**
 * 40 × 24 m plate, a core drawn OFF the plate centre and held hard, and an
 * anchor on the same point. Off-centre matters: a core at the plate centre
 * would sit at the engine origin, where a displacement of zero proves nothing
 * because both frames put zero there anyway.
 */
function offsetCoreBlueprint(): BlueprintSpec {
  let spec = addBoundary(emptyBlueprint("Offset Core Plan"), {
    loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 40_000, depthMm: 24_000 }),
    floorNos: [1, 2, 3],
  });
  spec = addCore(spec, {
    id: "core-1",
    region: {
      kind: "rect",
      originMm: p(12_000, 8_000),
      widthMm: 9_000,
      depthMm: 7_000,
      rotationRad: 0,
    },
    floorNos: [1, 2, 3],
    hold: { mode: "hard" },
    contents: ["stair", "elevator"],
  });
  spec = addAnchor(spec, {
    id: "anchor-core",
    kind: "core",
    positionMm: p(12_000, 8_000),
  });
  spec = addAnchor(spec, {
    id: "anchor-entrance",
    kind: "entrance",
    positionMm: p(20_000, 0),
    floorNos: [1],
  });
  spec = addAnchor(spec, {
    id: "anchor-view",
    kind: "view-axis",
    positionMm: p(0, 0),
  });
  return spec;
}

/**
 * 40 × 24 m plate with a central core, two programmed zones on levels 2–3, and
 * one relationship of every kind the measurement claims to handle plus one it
 * honestly cannot.
 */
function programmedBlueprint(): BlueprintSpec {
  let spec = addBoundary(emptyBlueprint("Programmed Plan"), {
    loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 40_000, depthMm: 24_000 }),
    floorNos: [1, 2, 3],
  });
  spec = addCore(spec, {
    id: "core-1",
    region: {
      kind: "rect",
      originMm: p(20_000, 12_000),
      widthMm: 9_000,
      depthMm: 7_000,
      rotationRad: 0,
    },
    floorNos: [1, 2, 3],
    contents: ["stair", "elevator"],
  });
  spec = addZone(spec, {
    id: "zone-office",
    program: "office-open",
    region: {
      kind: "rect",
      originMm: p(9_000, 6_000),
      widthMm: 16_000,
      depthMm: 10_000,
      rotationRad: 0,
    },
    floorNos: [2, 3],
    label: "Open office",
  });
  spec = addZone(spec, {
    id: "zone-meeting",
    program: "meeting",
    region: {
      kind: "rect",
      originMm: p(31_000, 18_000),
      widthMm: 12_000,
      depthMm: 8_000,
      rotationRad: 0,
    },
    floorNos: [2, 3],
    label: "Meeting rooms",
  });
  return {
    ...spec,
    relationships: [
      { id: "rel-ext", kind: "REQUIRES_EXTERIOR", fromId: "zone-office", weight: 1 },
      {
        id: "rel-adj",
        kind: "REQUIRES_ADJACENCY",
        fromId: "zone-office",
        toId: "zone-meeting",
        weight: 0.8,
      },
      {
        id: "rel-avoid",
        kind: "AVOID_ADJACENCY",
        fromId: "zone-meeting",
        toId: "zone-office",
        weight: 0.5,
      },
      {
        id: "rel-conn",
        kind: "CONNECTED_TO",
        fromId: "zone-office",
        toId: "zone-meeting",
        weight: 0.6,
      },
      {
        id: "rel-faces",
        kind: "FACES",
        fromId: "zone-office",
        toId: "zone-meeting",
        weight: 0.2,
      },
      // Points at a core, which never becomes a placed space.
      {
        id: "rel-core",
        kind: "ADJACENT_TO",
        fromId: "zone-office",
        toId: "core-1",
        weight: 0.4,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Boundary                                                            */
/* ------------------------------------------------------------------ */

describe("measureBlueprintFidelity — boundary", () => {
  it("reports an L-shaped plan as built exactly, and not as its bounding box", () => {
    const blueprint = lShapedBlueprint();
    const building = buildFrom(blueprint);
    const report = measureBlueprintFidelity(blueprint, building);

    expect(report.measuredFloorNos).toEqual([1, 2, 3]);
    expect(report.boundary.blueprintOnlyFloorNos).toEqual([]);
    expect(report.boundary.generatedOnlyFloorNos).toEqual([]);

    // Observed: 0 on every level — `customPlates` is a straight mm→m copy of the
    // compiled plate, so the outline survives to the millimetre.
    expect(report.boundary.worstAreaDeviationRatio).toBeLessThan(0.001);
    expect(report.boundary.worstSymmetricDifferenceRatio).toBeLessThan(0.001);
    expect(report.boundary.meanSymmetricDifferenceRatio).toBeLessThan(0.001);

    for (const level of report.boundary.levels) {
      // 825 m² of L, not 1,200 m² of bounding box: a collapse would read 1,200.
      expect(level.blueprintAreaSqm).toBeCloseTo(825, 1);
      expect(level.generatedAreaSqm).toBeCloseTo(825, 1);
    }

    // …and the geometry really is smaller than its own extents.
    const bounds = polygonBounds(building.levels[0].polygon);
    const bboxAreaSqm = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    expect(bboxAreaSqm).toBeCloseTo(1_200, 1);
    expect(report.boundary.levels[0].generatedAreaSqm / bboxAreaSqm).toBeLessThan(0.75);
  });

  it("separates a plan from a same-area building of a different shape", () => {
    const l = lShapedBlueprint();
    const faithful = measureBlueprintFidelity(l, buildFrom(l));
    // The L measured against a 33 × 25 m building — 825 m², identical area.
    const control = measureBlueprintFidelity(l, buildFrom(equalAreaRectBlueprint()));

    for (const level of control.boundary.levels) {
      // Observed: 0. Area deviation is blind here, which is exactly why the
      // report never reduces to a single number.
      expect(level.areaDeviationRatio).toBeLessThan(0.001);
    }

    // Observed: 0.651515 against 0 for the faithful build.
    expect(control.boundary.worstSymmetricDifferenceRatio!).toBeGreaterThan(0.5);
    expect(control.boundary.worstSymmetricDifferenceRatio!).toBeGreaterThan(
      faithful.boundary.worstSymmetricDifferenceRatio! + 0.5,
    );
  });

  it("names the levels it could not compare instead of averaging them away", () => {
    const blueprint = lShapedBlueprint();
    // Built from a blueprint whose boundary covers level 1 only.
    const oneLevel = addBoundary(emptyBlueprint("One Level"), {
      loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 40_000, depthMm: 30_000 }),
      floorNos: [1],
    });
    const report = measureBlueprintFidelity(blueprint, buildFrom(oneLevel));

    expect(report.measuredFloorNos).toEqual([1]);
    expect(report.boundary.blueprintOnlyFloorNos).toEqual([2, 3]);
    expect(
      report.notMeasured.filter((entry) => entry.subject === "boundary"),
    ).toHaveLength(2);
    for (const entry of report.notMeasured) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("returns an honest empty report when no boundary encloses anything", () => {
    const report = measureBlueprintFidelity(
      emptyBlueprint("Nothing drawn"),
      buildFrom(lShapedBlueprint()),
    );

    expect(report.boundary.levels).toEqual([]);
    // null, never 0 — a zero deviation here would read as a perfect match.
    expect(report.boundary.worstSymmetricDifferenceRatio).toBeNull();
    expect(report.boundary.meanAreaDeviationRatio).toBeNull();
    expect(report.notMeasured[0].subject).toBe("boundary");
  });
});

/* ------------------------------------------------------------------ */
/* Voids                                                               */
/* ------------------------------------------------------------------ */

describe("measureBlueprintFidelity — voids", () => {
  it("reports a courtyard that survived as retained on every level it spans", () => {
    const blueprint = courtyardBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));

    expect(report.voids.map((v) => v.floorNo)).toEqual([1, 2]);
    for (const item of report.voids) {
      expect(item.voidId).toBe("court");
      expect(item.kind).toBe("courtyard");
      expect(item.voidAreaSqm).toBeCloseTo(108, 1); // 12 × 9 m
      // Observed: retainedRatio 1, builtOverAreaSqm 0 — the plate carries the
      // courtyard as a real hole, so the intersection is empty.
      expect(item.retainedRatio).toBeGreaterThan(0.9);
      expect(item.builtOverAreaSqm).toBeLessThan(item.voidAreaSqm * 0.1);
    }

    // The plate lost exactly the courtyard: 1,200 − 108 m².
    expect(report.boundary.levels[0].generatedAreaSqm).toBeCloseTo(1_092, 1);
  });

  it("reports a courtyard that was built over as lost", () => {
    // Same courtyard, measured against a building that never had one.
    const solid = addBoundary(emptyBlueprint("Solid Plan"), {
      loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 40_000, depthMm: 30_000 }),
      floorNos: [1, 2],
    });
    const report = measureBlueprintFidelity(courtyardBlueprint(), buildFrom(solid));

    for (const item of report.voids) {
      // Observed: 0 — the solid plate covers the whole courtyard.
      expect(item.retainedRatio).toBeLessThan(0.05);
      expect(item.builtOverAreaSqm).toBeCloseTo(108, 1);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Cores + anchors                                                     */
/* ------------------------------------------------------------------ */

describe("measureBlueprintFidelity — cores and anchors", () => {
  it("shows a hard-held off-centre core arriving where it was drawn", () => {
    const blueprint = offsetCoreBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));

    expect(report.cores).toHaveLength(1);
    const core = report.cores[0];
    expect(core.coreId).toBe("core-1");
    expect(core.hold).toEqual({ mode: "hard" });
    expect(core.compiled).toBe(true);

    // The core was drawn at (12 000, 8 000) mm on a 40 × 24 m plate, so the
    // engine frame puts it at (−8, −4) m — not at the origin, where a zero
    // displacement would be an artefact of the transform rather than evidence.
    expect(core.blueprintCentreM[0]).toBeCloseTo(-8, 3);
    expect(core.blueprintCentreM[1]).toBeCloseTo(-4, 3);
    // Observed: 0 m.
    expect(core.displacementM).toBeLessThan(0.05);
  });

  it("measures a core anchor and refuses to invent a number for the rest", () => {
    const blueprint = offsetCoreBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));

    const byId = new Map(report.anchors.map((a) => [a.anchorId, a]));

    const core = byId.get("anchor-core")!;
    expect(core.measured).toBe(true);
    if (core.measured) {
      expect(core.comparedWith).toBe("core-centre");
      // Observed: 0 m — the anchor sits on the drawn core centre, and the core
      // did not move.
      expect(core.displacementM).toBeLessThan(0.05);
    }

    // ENGINE GAP: `generate/openings.ts` puts doors on interior walls only —
    // "Exterior walls carry no doors yet" — so an entrance anchor has nothing to
    // be compared against. Reported as unmeasured with a reason, never as 0 m.
    const entrance = byId.get("anchor-entrance")!;
    expect(entrance.measured).toBe(false);
    if (!entrance.measured) {
      expect(entrance.reason).toMatch(/exterior/i);
    }

    const view = byId.get("anchor-view")!;
    expect(view.measured).toBe(false);
    if (!view.measured) {
      expect(view.reason).toMatch(/view-axis/);
    }

    // Nothing is silently absent: every drawn anchor produced an entry.
    expect(report.anchors).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/* Zones                                                               */
/* ------------------------------------------------------------------ */

describe("measureBlueprintFidelity — zones", () => {
  it("measures how much of a drawn zone the solver actually covered", () => {
    const blueprint = programmedBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));

    expect(report.zones.map((z) => z.zoneId)).toEqual(["zone-office", "zone-meeting"]);

    const office = report.zones[0];
    // The compiler slices a zone id to 48 characters; a short id is itself, and
    // that is the id `PlacedSpace.programId` carries.
    expect(office.programId).toBe("zone-office");
    expect(office.program).toBe("office-open");
    expect(office.zoneAreaSqm).toBeCloseTo(160, 1); // 16 × 10 m
    expect(office.placedSpaceCount).toBe(2); // one per level, 2 and 3

    // Observed: 0.90625 overall — but 0 on level 2 and 0.90625 on level 3,
    // because the solver packed the same program into a different band on each
    // level. The union-across-floors figure the spec defines therefore reads
    // like the BEST level; `floors` is what shows the divergence, which is why
    // both are reported instead of only the headline.
    expect(office.overlapRatio).toBeGreaterThan(0);
    expect(office.overlapRatio).toBeLessThanOrEqual(1);
    expect(office.floors.map((f) => f.floorNo)).toEqual([2, 3]);
    for (const floor of office.floors) {
      expect(floor.overlapRatio).toBeGreaterThanOrEqual(0);
      expect(floor.overlapRatio).toBeLessThanOrEqual(1);
      expect(floor.placedSpaceCount).toBe(1);
    }

    // SPEC GAP, measured rather than asserted away: `compileBlueprintToSpec`
    // carries a zone's AREA, TYPE and LEVELS into the program but discards its
    // POSITION, and the space solver packs bands off the corridor. So a zone
    // lands where the solver put it, not where it was drawn — observed 0 for
    // the meeting zone. The metric reports that; it does not excuse it.
    const meeting = report.zones[1];
    expect(meeting.placedSpaceCount).toBe(2);
    expect(meeting.overlapRatio).toBeLessThan(0.5);
  });

  it("says so when a zone never became a program item", () => {
    // 57 zones: the compiler keeps the first 56 (`zoneFacts.slice(0, 56)`).
    let blueprint = addBoundary(emptyBlueprint("Many Zones"), {
      loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 60_000, depthMm: 40_000 }),
      floorNos: [1],
    });
    for (let i = 0; i < 57; i += 1) {
      blueprint = addZone(blueprint, {
        id: `zone-${String(i).padStart(2, "0")}`,
        program: "office-cellular",
        region: {
          kind: "rect",
          originMm: p(5_000 + (i % 10) * 5_000, 5_000 + Math.floor(i / 10) * 5_000),
          widthMm: 4_000,
          depthMm: 4_000,
          rotationRad: 0,
        },
        floorNos: [1],
      });
    }

    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));
    expect(report.zones).toHaveLength(56);
    const dropped = report.notMeasured.filter((entry) => entry.subject === "zone");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].id).toBe("zone-56");
    expect(dropped[0].reason).toMatch(/program item/);
  });
});

/* ------------------------------------------------------------------ */
/* Topology                                                            */
/* ------------------------------------------------------------------ */

describe("measureBlueprintFidelity — topology", () => {
  it("measures REQUIRES_EXTERIOR rather than shrugging at it", () => {
    const blueprint = programmedBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));

    const exterior = report.topology.relationships.find((r) => r.relationshipId === "rel-ext")!;
    expect(exterior.kind).toBe("REQUIRES_EXTERIOR");
    expect(exterior.toId).toBeNull();
    expect(["satisfied", "violated"]).toContain(exterior.outcome);
    // Observed: satisfied — the open-office band reaches the perimeter.
    expect(exterior.outcome).toBe("satisfied");
    expect(exterior.reason).toBeUndefined();
  });

  it("classifies every relationship it walks and counts only what it measured", () => {
    const blueprint = programmedBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));
    const byId = new Map(report.topology.relationships.map((r) => [r.relationshipId, r]));

    expect(report.topology.relationships).toHaveLength(6);

    // Observed with SEED 20260817: the two zone bands do not touch, so the
    // required adjacency fails and the avoidance succeeds. They are exact
    // complements, which is the invariant worth asserting — the outcome of one
    // is not free to drift from the other.
    const adjacency = byId.get("rel-adj")!;
    const avoidance = byId.get("rel-avoid")!;
    expect(["satisfied", "violated"]).toContain(adjacency.outcome);
    expect(avoidance.outcome).toBe(
      adjacency.outcome === "satisfied" ? "violated" : "satisfied",
    );

    // CONNECTED_TO is adjacency OR a door, so it can never be stricter.
    const connected = byId.get("rel-conn")!;
    if (adjacency.outcome === "satisfied") expect(connected.outcome).toBe("satisfied");

    // FACES has no geometric counterpart, and the report says why.
    const faces = byId.get("rel-faces")!;
    expect(faces.outcome).toBe("not-measurable");
    expect(faces.reason).toMatch(/FACES/);

    // A relationship pointing at a core, which never becomes a placed space.
    const core = byId.get("rel-core")!;
    expect(core.outcome).toBe("not-measurable");
    expect(core.reason).toMatch(/core-1/);

    const { satisfied, violated, notMeasurable } = report.topology.counts;
    expect(satisfied + violated + notMeasurable).toBe(6);
    expect(notMeasurable).toBe(2);
    // The ratio is taken over MEASURABLE relationships only, so the two the
    // engine cannot express neither help nor hurt.
    expect(report.topology.satisfiedRatio).toBeCloseTo(satisfied / (satisfied + violated), 6);
  });

  it("has no ratio at all when nothing was measurable", () => {
    const blueprint = lShapedBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));
    expect(report.topology.relationships).toEqual([]);
    expect(report.topology.satisfiedRatio).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe("measureBlueprintFidelity — contract", () => {
  it("is deterministic and reports no blended score", () => {
    const blueprint = programmedBlueprint();
    const building = buildFrom(blueprint);

    const first = measureBlueprintFidelity(blueprint, building);
    const second = measureBlueprintFidelity(blueprint, buildFrom(blueprint));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    // §55 forbids a single number that averages incommensurable dimensions.
    const keys = Object.keys(first);
    expect(keys).not.toContain("score");
    expect(keys).not.toContain("fidelityScore");
    expect(keys).not.toContain("overall");
  });

  it("does not mutate the blueprint or the building it was given", () => {
    const blueprint = programmedBlueprint();
    const building = buildFrom(blueprint);
    const blueprintBefore = JSON.stringify(blueprint);
    const buildingBefore = JSON.stringify(building);

    measureBlueprintFidelity(blueprint, building);

    expect(JSON.stringify(blueprint)).toBe(blueprintBefore);
    expect(JSON.stringify(building)).toBe(buildingBefore);
  });

  it("uses the compiler's own transform, so a plan drawn far from the origin measures the same", () => {
    const near = courtyardBlueprint();
    // The same drawing, translated 1.2 km east and 800 m north.
    const far: BlueprintSpec = JSON.parse(
      JSON.stringify(near)
        .replace(/"xMm":(-?\d+)/g, (_, v: string) => `"xMm":${Number(v) + 1_200_000}`)
        .replace(/"zMm":(-?\d+)/g, (_, v: string) => `"zMm":${Number(v) + 800_000}`),
    ) as BlueprintSpec;

    const a = measureBlueprintFidelity(near, buildFrom(near));
    const b = measureBlueprintFidelity(far, buildFrom(far));

    expect(b.boundary.levels.map((l) => l.symmetricDifferenceRatio)).toEqual(
      a.boundary.levels.map((l) => l.symmetricDifferenceRatio),
    );
    expect(b.voids.map((v) => v.retainedRatio)).toEqual(
      a.voids.map((v) => v.retainedRatio),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Zone-id de-dup termination (DoS regression)                         */
/* ------------------------------------------------------------------ */

describe("zone-id collision de-dup", () => {
  // Three DISTINCT, schema-valid ids engineered so the old `usedIds.size`
  // suffix reached a fixed point: zone 3's 48-char truncation collides with
  // zone 1's, and the recomputed candidate collides with zone 2 — and, under
  // the old rule, with itself forever after. Found by adversarial review;
  // `compileBlueprintToSpec` and `measureBlueprintFidelity` both spun on this
  // exact trio until `deriveZoneSpecId` gained its own attempt counter.
  const trio = [
    `${"X".repeat(48)}a`,
    `${"X".repeat(44)}-2`,
    `${"X".repeat(48)}b`,
  ];

  function collidingZonesBlueprint(): BlueprintSpec {
    let spec = addBoundary(emptyBlueprint("Dedup Plan"), {
      loop: makeRectLoop("outline", {
        xMm: 0,
        zMm: 0,
        widthMm: 40_000,
        depthMm: 24_000,
      }),
      floorNos: [1],
    });
    trio.forEach((id, index) => {
      spec = addZone(spec, {
        id,
        program: "office-open",
        region: {
          kind: "rect",
          originMm: p(8_000 + index * 12_000, 12_000),
          widthMm: 8_000,
          depthMm: 8_000,
          rotationRad: 0,
        },
        floorNos: [1],
      });
    });
    return spec;
  }

  it("terminates and derives three distinct program ids", () => {
    const { spec } = compileBlueprintToSpec(collidingZonesBlueprint(), {
      seed: SEED,
    });
    const zoneItems = spec.program.filter((item) => item.id.startsWith("XXXX"));
    expect(zoneItems).toHaveLength(3);
    expect(new Set(zoneItems.map((item) => item.id)).size).toBe(3);
  });

  it("maps every colliding zone in the fidelity report", () => {
    const blueprint = collidingZonesBlueprint();
    const report = measureBlueprintFidelity(blueprint, buildFrom(blueprint));
    expect(report.zones).toHaveLength(3);
    expect(new Set(report.zones.map((zone) => zone.programId)).size).toBe(3);
    // The report's derived ids must be the compiler's — same helper, same ids.
    const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
    const compiledIds = new Set(spec.program.map((item) => item.id));
    for (const zone of report.zones) {
      expect(compiledIds.has(zone.programId)).toBe(true);
    }
  });
});
