import { describe, expect, it } from "vitest";

import {
  cadDocumentToInterpretRequest,
  cadDocumentToSegments,
  fromCadDocument,
} from "../blueprint/from-cad";
import { validateBlueprint } from "../blueprint/validate-blueprint";
import type { CadDocument, CadPolyline, CadText, Vec2 } from "@/lib/cad/doc/types";

/** Closed rectangle CadPolyline, vertices in metres (CadDocument's native frame). */
function rectPolyline(id: string, layer: string, points: Vec2[]): CadPolyline {
  return {
    id,
    layer,
    kind: "polyline",
    vertices: points,
    bulges: points.map(() => 0),
    closed: true,
  };
}

function textEntity(id: string, layer: string, text: string, position: Vec2): CadText {
  return { id, layer, kind: "text", position, height: 0.3, rotation: 0, text };
}

/**
 * A minimal synthetic CadDocument: an L-shaped outline on "A-WALL" (84 m²)
 * with a 2×2 m core square on "A-CORE", plus a text label naming it. Built
 * directly rather than parsed — the type is plain serialisable data, so
 * constructing one is proportionate and avoids a real DXF fixture.
 */
function tinyCadDocument(): CadDocument {
  const wall = rectPolyline("e0", "A-WALL", [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 10 },
    { x: 0, y: 10 },
  ]);
  const core = rectPolyline("e1", "A-CORE", [
    { x: 7, y: 1 },
    { x: 9, y: 1 },
    { x: 9, y: 3 },
    { x: 7, y: 3 },
  ]);
  const label = textEntity("e2", "A-TEXT", "STAIR", { x: 8, y: 2 });

  return {
    id: "tiny",
    layers: [
      { name: "A-WALL", colorIndex: 7, visible: true },
      { name: "A-CORE", colorIndex: 7, visible: true },
      { name: "A-TEXT", colorIndex: 7, visible: true },
    ],
    entities: [wall, core, label],
    unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
    warnings: [],
    stats: { totalParsed: 3, mapped: 3, skipped: {} },
  };
}

describe("cadDocumentToSegments", () => {
  it("converts entity chains to millimetre segments and lifts text as labels", () => {
    const { segments, labels } = cadDocumentToSegments(tinyCadDocument());

    // Two closed 4- and 6-vertex polylines → 6 + 4 = 10 edges.
    expect(segments).toHaveLength(10);
    expect(segments.every((s) => s.layer === "A-WALL" || s.layer === "A-CORE")).toBe(true);

    // metres → millimetres, exactly (no unit re-scaling applied here).
    const wallEdge = segments.find((s) => s.layer === "A-WALL");
    expect(wallEdge?.startMm.xMm).toBeTypeOf("number");
    expect(Number.isInteger(wallEdge!.startMm.xMm)).toBe(true);

    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ text: "STAIR", positionMm: { xMm: 8_000, zMm: 2_000 } });
  });

  it("cadDocumentToInterpretRequest carries the same segments and labels, no rasterisation", () => {
    const doc = tinyCadDocument();
    const direct = cadDocumentToSegments(doc);
    const request = cadDocumentToInterpretRequest(doc, "trace this floor plan");
    expect(request.segments).toEqual(direct.segments);
    expect(request.labels).toEqual(direct.labels);
    expect(request.prompt).toBe("trace this floor plan");
  });
});

describe("fromCadDocument", () => {
  it("reads a boundary and core straight off an explicit layer mapping", () => {
    const spec = fromCadDocument(tinyCadDocument(), {
      boundary: ["A-WALL"],
      core: ["A-CORE"],
    });

    const report = validateBlueprint(spec);
    expect(report.violations.filter((v) => v.severity === "critical")).toEqual([]);
    expect(report.blueprintValid).toBe(true);

    expect(spec.source).toBe("dxf");
    expect(spec.boundaries).toHaveLength(1);
    expect(spec.boundaries[0].loop.segments).toHaveLength(6);

    expect(spec.cores).toHaveLength(1);
    expect(spec.cores[0].contents).toContain("stair");
  });

  it("is deterministic for the same document and mapping", () => {
    const doc = tinyCadDocument();
    const mapping = { boundary: ["A-WALL"], core: ["A-CORE"] };
    const a = fromCadDocument(doc, mapping);
    const b = fromCadDocument(doc, mapping);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("still reads a usable blueprint without any layer mapping, from layer-name hints alone", () => {
    const spec = fromCadDocument(tinyCadDocument());
    expect(validateBlueprint(spec).blueprintValid).toBe(true);
    // "A-CORE" matches the generic /core/i hint even with no explicit mapping.
    expect(spec.cores).toHaveLength(1);
  });
});
