// CAD file → BlueprintSpec, through the REAL DXF parser.
//
// The fixture below is a hand-written DXF: an L-shaped outer wall, a core
// rectangle, a programmed room, a title-block rectangle parked off the plan,
// and a text label. Nothing here is a synthetic CadDocument — the point is that
// the bytes a user uploads survive parsing, unit conversion, loop detection and
// classification with the drawing's shape intact.

import { describe, expect, it } from "vitest";

import { mapDxfTextToDoc } from "@/lib/cad/doc/map-dxf-to-doc";
import type { CadDocument } from "@/lib/cad/doc/types";
import {
  DEFAULT_ZONE_PROGRAM,
  decideUnits,
  guessLayerAssignments,
  importCadDocument,
  summariseLayers,
  toCadLayerMapping,
  type CadLayerAssignments,
} from "../blueprint/import-cad-file";
import { validateBlueprint } from "../blueprint/validate-blueprint";
import { loopPoints } from "@/components/generative/schematic/schematic-geometry";

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

/** Raw DXF group codes for one closed LWPOLYLINE. Coordinates in file units. */
function lwPolyline(layer: string, points: Array<[number, number]>): string[] {
  const out = ["0", "LWPOLYLINE", "8", layer, "90", String(points.length), "70", "1"];
  for (const [x, y] of points) out.push("10", String(x), "20", String(y));
  return out;
}

/**
 * A DXF declaring millimetres ($INSUNITS = 4). The round trip is therefore
 * exact: the parser scales mm → m, the importer scales m → mm, and the
 * blueprint must carry the same numbers the file did.
 */
function fixtureDxf({ insunits }: { insunits?: number } = { insunits: 4 }): string {
  const lines: string[] = ["0", "SECTION", "2", "HEADER"];
  if (insunits !== undefined) lines.push("9", "$INSUNITS", "70", String(insunits));
  lines.push("0", "ENDSEC");
  lines.push(
    "0", "SECTION", "2", "ENTITIES",
    // L-shaped outer wall — 336 m², with one reflex corner at (12000, 12000).
    ...lwPolyline("A-WALL", [
      [0, 0],
      [20_000, 0],
      [20_000, 12_000],
      [12_000, 12_000],
      [12_000, 20_000],
      [0, 20_000],
    ]),
    // 4 × 4 m core, inside the wide leg of the L.
    ...lwPolyline("A-CORE", [
      [14_000, 2_000],
      [18_000, 2_000],
      [18_000, 6_000],
      [14_000, 6_000],
    ]),
    // 8 × 8 m room.
    ...lwPolyline("A-ZONE", [
      [2_000, 2_000],
      [10_000, 2_000],
      [10_000, 10_000],
      [2_000, 10_000],
    ]),
    // Title block, parked clear of the plan — a loop, but not part of it.
    ...lwPolyline("A-GRID", [
      [30_000, 0],
      [40_000, 0],
      [40_000, 6_000],
      [30_000, 6_000],
    ]),
    // Annotation on its own layer, sitting inside the core.
    "0", "TEXT", "8", "A-TEXT", "10", "16000", "20", "4000", "40", "300", "1", "STAIR",
    // An entity type the CAD reader has no equivalent for.
    "0", "SOLID", "8", "A-WALL", "10", "0", "20", "0",
    "0", "ENDSEC",
  );
  lines.push("0", "EOF");
  return lines.join("\n");
}

function fixtureDoc(options?: { insunits?: number }): CadDocument {
  return mapDxfTextToDoc(fixtureDxf(options ?? { insunits: 4 }), "plan.dxf");
}

/** What the dialog would pre-fill, before the user confirms or changes it. */
function guessed(doc: CadDocument): CadLayerAssignments {
  return guessLayerAssignments(doc);
}

/* ------------------------------------------------------------------ */
/* Heuristics                                                          */
/* ------------------------------------------------------------------ */

describe("layer heuristics", () => {
  it("reads a role off each layer name and leaves the rest out", () => {
    const summaries = summariseLayers(fixtureDoc());
    const byName = new Map(summaries.map((s) => [s.name, s]));

    expect(byName.get("A-WALL")).toMatchObject({
      guess: { role: "boundary" },
      basis: "layer-name",
    });
    expect(byName.get("A-CORE")).toMatchObject({
      guess: { role: "core" },
      basis: "layer-name",
    });
    expect(byName.get("A-ZONE")).toMatchObject({
      guess: { role: "zone", program: DEFAULT_ZONE_PROGRAM },
      basis: "layer-name",
    });
    // No keyword matched, and a boundary was already found by name — so the
    // title block stays out rather than being nominated for anything.
    expect(byName.get("A-GRID")).toMatchObject({ guess: { role: "ignore" }, basis: "no-match" });
    expect(byName.get("A-TEXT")).toMatchObject({ guess: { role: "ignore" }, basis: "no-match" });
  });

  it("counts entities, closed shapes and the largest closed area per layer", () => {
    const byName = new Map(summariseLayers(fixtureDoc()).map((s) => [s.name, s]));

    // The SOLID never parses, so it is not counted as an entity on A-WALL.
    expect(byName.get("A-WALL")).toMatchObject({ entityCount: 1, closedShapeCount: 1 });
    expect(byName.get("A-WALL")!.largestClosedAreaSqm).toBeCloseTo(336, 3);
    expect(byName.get("A-CORE")!.largestClosedAreaSqm).toBeCloseTo(16, 3);
    expect(byName.get("A-TEXT")).toMatchObject({ entityCount: 1, textCount: 1, closedShapeCount: 0 });
  });

  it("matches layer names case-insensitively and prefers the specific role", () => {
    const doc = mapDxfTextToDoc(
      [
        "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
        "0", "SECTION", "2", "ENTITIES",
        ...lwPolyline("core-wall", [[0, 0], [1_000, 0], [1_000, 1_000]]),
        ...lwPolyline("외벽", [[0, 0], [1_000, 0], [1_000, 1_000]]),
        ...lwPolyline("Corridor-01", [[0, 0], [1_000, 0], [1_000, 1_000]]),
        ...lwPolyline("공간-A", [[0, 0], [1_000, 0], [1_000, 1_000]]),
        ...lwPolyline("ATRIUM", [[0, 0], [1_000, 0], [1_000, 1_000]]),
        "0", "ENDSEC", "0", "EOF",
      ].join("\n"),
      "names.dxf",
    );
    const roles = Object.fromEntries(
      summariseLayers(doc).map((s) => [s.name, s.guess.role]),
    );

    // "core-wall" carries both keywords; core is the more specific reading.
    expect(roles["core-wall"]).toBe("core");
    expect(roles["외벽"]).toBe("boundary");
    expect(roles["Corridor-01"]).toBe("circulation");
    expect(roles["공간-A"]).toBe("zone");
    expect(roles["ATRIUM"]).toBe("void");
  });

  it("nominates the largest closed shape as boundary ONLY when no name suggests one", () => {
    const doc = mapDxfTextToDoc(
      [
        "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
        "0", "SECTION", "2", "ENTITIES",
        ...lwPolyline("0", [[0, 0], [20_000, 0], [20_000, 20_000], [0, 20_000]]),
        ...lwPolyline("DETAIL", [[1_000, 1_000], [3_000, 1_000], [3_000, 3_000]]),
        "0", "ENDSEC", "0", "EOF",
      ].join("\n"),
      "unnamed.dxf",
    );
    const byName = new Map(summariseLayers(doc).map((s) => [s.name, s]));

    expect(byName.get("0")).toMatchObject({
      guess: { role: "boundary" },
      basis: "largest-closed-shape",
    });
    expect(byName.get("DETAIL")!.guess.role).toBe("ignore");
  });

  it("translates assignments into the layer convention the interpreter consumes", () => {
    const mapping = toCadLayerMapping({
      "A-WALL": { role: "boundary" },
      "A-CORE": { role: "core" },
      "A-ATRIUM": { role: "void" },
      "A-CORR": { role: "circulation" },
      "A-ZONE": { role: "zone", program: "laboratory" },
      "A-GRID": { role: "ignore" },
    });

    expect(mapping).toEqual({
      boundary: ["A-WALL"],
      core: ["A-CORE"],
      void: ["A-ATRIUM"],
      circulation: ["A-CORR"],
      zone: { "A-ZONE": "laboratory" },
      ignore: ["A-GRID"],
    });
  });
});

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

describe("unit decision", () => {
  it("honours a declared $INSUNITS and calls the scale calibrated", () => {
    const units = decideUnits(fixtureDoc({ insunits: 4 }));
    expect(units).toMatchObject({
      insUnits: 4,
      unitScaleToMeters: 0.001,
      metersToMillimetres: 1000,
      declared: true,
    });
    expect(units.assumption).toBeUndefined();
    expect(units.calibrationConfidence).toBeGreaterThan(0.9);
  });

  it("records an assumption when the file declares no units", () => {
    const units = decideUnits(fixtureDoc({ insunits: undefined }));
    expect(units.declared).toBe(false);
    expect(units.insUnits).toBeUndefined();
    expect(units.assumption).toMatch(/no \$INSUNITS header/i);
    // Below validate-blueprint's 0.5 floor, so the editor raises the issue.
    expect(units.calibrationConfidence).toBeLessThan(0.5);
  });

  it("carries the assumption into the blueprint as an uncertainty, not silence", () => {
    const doc = fixtureDoc({ insunits: undefined });
    const outcome = importCadDocument(doc, guessed(doc));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.blueprint.coordinateSystem.calibrated).toBe(false);
    expect(outcome.blueprint.coordinateSystem.method).toBe("assumed");
    expect(
      outcome.blueprint.uncertainty.some((u) => /assumed metre unit/i.test(u.interpretation)),
    ).toBe(true);
    expect(
      validateBlueprint(outcome.blueprint).violations.some(
        (v) => v.code === "SCALE_UNCALIBRATED",
      ),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

describe("importCadDocument", () => {
  it("produces a valid blueprint that keeps the L, in millimetres", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, guessed(doc), { fileName: "plan.dxf" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { blueprint } = outcome;
    const report = validateBlueprint(blueprint);
    expect(report.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(blueprint.source).toBe("dxf");
    expect(blueprint.coordinateSystem.units).toBe("mm");

    // The L survives: six vertices, one of them reflex.
    expect(blueprint.boundaries).toHaveLength(1);
    const ring = loopPoints(blueprint.boundaries[0].loop);
    expect(ring).toHaveLength(6);

    const xs = ring.map((p) => p.xMm).sort((a, b) => a - b);
    const zs = ring.map((p) => p.zMm).sort((a, b) => a - b);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(20_000);
    expect(zs[zs.length - 1]).toBe(20_000);
    // The notch corner is present, so the plate is not a bounding box.
    expect(ring.some((p) => p.xMm === 12_000 && p.zMm === 12_000)).toBe(true);
    expect(reflexCount(ring)).toBe(1);
  });

  it("reads the core and its label, and the room as a programmed zone", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, guessed(doc));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.blueprint.cores).toHaveLength(1);
    // The label lives on A-TEXT, which is ignored for geometry — its text is
    // still read, which is what identifies the core as a stair.
    expect(outcome.blueprint.cores[0].contents).toContain("stair");

    expect(outcome.blueprint.zones).toHaveLength(1);
    expect(outcome.blueprint.zones[0].program.value).toBe(DEFAULT_ZONE_PROGRAM);
    expect(outcome.blueprint.zones[0].program.source).toBe("INFERRED");
  });

  it("honours a program the user picked for a zone layer", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, {
      ...guessed(doc),
      "A-ZONE": { role: "zone", program: "laboratory" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.blueprint.zones[0].program.value).toBe("laboratory");
  });

  it("reports layers, roles, loops per role and the unit decision", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, guessed(doc), { fileName: "plan.dxf" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { report } = outcome;
    expect(report.fileName).toBe("plan.dxf");
    expect(report.layers.map((l) => l.name)).toEqual([
      "A-CORE",
      "A-GRID",
      "A-TEXT",
      "A-WALL",
      "A-ZONE",
    ]);
    expect(report.mapping).toContainEqual({
      layer: "A-WALL",
      role: "boundary",
      entityCount: 1,
    });
    expect(report.mapping).toContainEqual({
      layer: "A-ZONE",
      role: "zone",
      program: DEFAULT_ZONE_PROGRAM,
      entityCount: 1,
    });

    // The title block is on an ignored layer, so it never becomes a loop.
    expect(report.loops).toEqual({
      detected: 3,
      boundary: 1,
      void: 0,
      core: 1,
      zone: 1,
      circulation: 0,
      outsideBoundary: 0,
    });
    expect(report.boundaryLayer).toBe("A-WALL");
    expect(report.boundaryAreaSqm).toBeCloseTo(336, 3);
    expect(report.units.declared).toBe(true);
  });

  it("says exactly what was skipped and why", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, guessed(doc));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // A-GRID: one geometry entity dropped. A-TEXT: text only, kept as a label,
    // so it is NOT reported as skipped.
    expect(outcome.report.skipped).toContainEqual({
      reason: "layer-ignored",
      subject: "A-GRID",
      count: 1,
    });
    expect(
      outcome.report.skipped.some((s) => s.subject === "A-TEXT"),
    ).toBe(false);
    // The SOLID never mapped — the parser's own count, passed through.
    expect(outcome.report.skipped).toContainEqual({
      reason: "unsupported-dxf-type",
      subject: "SOLID",
      count: 1,
    });
  });

  it("reports a loop that falls outside the boundary instead of absorbing it", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, {
      ...guessed(doc),
      // The title block is no longer ignored, so it is detected — and dropped.
      "A-GRID": { role: "zone", program: "storage" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.report.loops.detected).toBe(4);
    expect(outcome.report.loops.outsideBoundary).toBe(1);
    expect(outcome.report.skipped).toContainEqual({
      reason: "loop-outside-boundary",
      subject: "closed loops",
      count: 1,
    });
    // Dropped, not silently merged into the plan.
    expect(outcome.blueprint.zones).toHaveLength(1);
  });

  it("reads a void layer as a hole, kind still marked as an area inference", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, {
      ...guessed(doc),
      "A-ZONE": { role: "void" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.blueprint.voids).toHaveLength(1);
    expect(outcome.blueprint.voids[0].kind.value).toBe("courtyard");
    expect(
      outcome.blueprint.uncertainty.some((u) =>
        /kind \(courtyard\) was inferred/.test(u.interpretation),
      ),
    ).toBe(true);
  });

  it("reads a circulation layer as movement space, not an invented graph", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, {
      ...guessed(doc),
      "A-ZONE": { role: "circulation" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.blueprint.zones[0].program.value).toBe("circulation");
    expect(outcome.report.loops.circulation).toBe(1);
    // No circulation nodes were fabricated from an outline.
    expect(outcome.blueprint.circulation.nodes).toHaveLength(0);
  });

  it("is deterministic: the same file and mapping give an identical blueprint", () => {
    const first = importCadDocument(fixtureDoc(), guessed(fixtureDoc()));
    const second = importCadDocument(fixtureDoc(), guessed(fixtureDoc()));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(JSON.stringify(first.blueprint)).toBe(JSON.stringify(second.blueprint));
    expect(JSON.stringify(first.report)).toBe(JSON.stringify(second.report));
  });
});

/* ------------------------------------------------------------------ */
/* Honest failure                                                      */
/* ------------------------------------------------------------------ */

describe("import failures", () => {
  it("refuses to run without a boundary layer, and names the reason", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, { ...guessed(doc), "A-WALL": { role: "ignore" } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NO_BOUNDARY_LAYER");
    // The report still describes the file, so the dialog is not left blank.
    expect(outcome.report.layers).toHaveLength(5);
  });

  it("does not substitute another layer's loop when the boundary layer has none", () => {
    const doc = fixtureDoc();
    const outcome = importCadDocument(doc, {
      ...guessed(doc),
      // A-TEXT holds no geometry at all, so nothing on it can close.
      "A-WALL": { role: "ignore" },
      "A-TEXT": { role: "boundary" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("BOUNDARY_LAYER_HAS_NO_CLOSED_LOOP");
    expect(outcome.error.message).toContain("A-TEXT");
  });

  it("reports zero closed loops rather than inventing a rectangle", () => {
    const openDoc = mapDxfTextToDoc(
      [
        "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
        "0", "SECTION", "2", "ENTITIES",
        // Three walls of a room: it looks closed to a human, and is not.
        "0", "LINE", "8", "A-WALL", "10", "0", "20", "0", "11", "10000", "21", "0",
        "0", "LINE", "8", "A-WALL", "10", "10000", "20", "0", "11", "10000", "21", "8000",
        "0", "LINE", "8", "A-WALL", "10", "10000", "20", "8000", "11", "0", "21", "8000",
        "0", "ENDSEC", "0", "EOF",
      ].join("\n"),
      "open.dxf",
    );
    const outcome = importCadDocument(openDoc, guessed(openDoc));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NO_CLOSED_LOOPS");
    expect(outcome.error.message).toContain("A-WALL");
  });

  it("reports an empty drawing as empty", () => {
    const empty = mapDxfTextToDoc(
      ["0", "SECTION", "2", "ENTITIES", "0", "ENDSEC", "0", "EOF"].join("\n"),
      "empty.dxf",
    );
    const outcome = importCadDocument(empty, {});
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NO_ENTITIES");
  });
});

/* ------------------------------------------------------------------ */

/** Reflex (concave) corners of a CCW-or-CW ring — the L's signature. */
function reflexCount(ring: Array<{ xMm: number; zMm: number }>): number {
  let positive = 0;
  let negative = 0;
  const crosses: number[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const c = ring[(i + 2) % ring.length];
    const cross =
      (b.xMm - a.xMm) * (c.zMm - b.zMm) - (b.zMm - a.zMm) * (c.xMm - b.xMm);
    crosses.push(cross);
    if (cross > 0) positive += 1;
    if (cross < 0) negative += 1;
  }
  // The minority sign is the concave one, whichever way the ring winds.
  const concaveSign = positive >= negative ? -1 : 1;
  return crosses.filter((cross) => Math.sign(cross) === concaveSign).length;
}
