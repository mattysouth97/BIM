import { describe, expect, it } from "vitest";

import {
  BlueprintSpecSchema,
  BoundaryLoopSchema,
  blueprintToolInputSchema,
  parseBlueprintSpec,
  safeParseBlueprintSpec,
  segmentEnd,
  segmentStart,
  type BlueprintSpec,
} from "../blueprint/blueprint-spec";
import {
  addAnchor,
  addBoundary,
  addCirculationEdge,
  addCirculationNode,
  addCore,
  addVoid,
  addZone,
  emptyBlueprint,
  makePolyLoop,
  makeRectLoop,
  userValue,
} from "../blueprint/builders";
import { validateBlueprint } from "../blueprint/validate-blueprint";

function drawnBlueprint(): BlueprintSpec {
  let spec = emptyBlueprint("Riverside Studio");
  spec = addBoundary(spec, {
    loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 18_000 }),
    floorNos: [1, 2, 3],
  });
  spec = addVoid(spec, {
    id: "atrium",
    kind: "atrium",
    region: {
      kind: "rect",
      originMm: { xMm: 15_000, zMm: 9_000 },
      widthMm: 6_000,
      depthMm: 6_000,
      rotationRad: 0,
    },
    floorNos: [2, 3],
  });
  spec = addCore(spec, {
    id: "core",
    region: {
      kind: "loop",
      loop: makeRectLoop("core-loop", {
        xMm: 3_000,
        zMm: 3_000,
        widthMm: 6_000,
        depthMm: 6_000,
      }),
    },
    floorNos: [1, 2, 3],
    contents: ["stair", "elevator"],
  });
  spec = addAnchor(spec, {
    id: "front-door",
    kind: "entrance",
    positionMm: { xMm: 15_000, zMm: 0 },
  });
  spec = addZone(spec, {
    id: "ground-lobby",
    program: "lobby",
    region: { kind: "loopRef", loopId: "plate" },
    floorNos: [1],
    memberIds: ["front-door"],
  });
  spec = addCirculationNode(spec, {
    id: "n-entry",
    kind: "entrance",
    positionMm: { xMm: 15_000, zMm: 0 },
    floorNos: [1],
  });
  spec = addCirculationNode(spec, {
    id: "n-core",
    kind: "stair",
    positionMm: { xMm: 6_000, zMm: 6_000 },
    floorNos: [1, 2, 3],
  });
  return addCirculationEdge(spec, {
    id: "e-entry-core",
    fromNodeId: "n-entry",
    toNodeId: "n-core",
    widthMm: 2_400,
  });
}

describe("BlueprintSpec schema", () => {
  it("parses an empty blueprint and survives a JSON round trip", () => {
    const spec = emptyBlueprint("Riverside Studio");
    expect(spec.id).toBe("riverside-studio");
    expect(spec.fidelityMode).toBe("guided");

    const roundTripped = parseBlueprintSpec(JSON.parse(JSON.stringify(spec)));
    expect(roundTripped).toEqual(spec);
  });

  it("parses a fully drawn blueprint and survives a JSON round trip", () => {
    const spec = drawnBlueprint();
    const roundTripped = parseBlueprintSpec(JSON.parse(JSON.stringify(spec)));
    expect(roundTripped).toEqual(spec);
  });

  it("keeps every user-drawn value at USER_PROVIDED confidence 1", () => {
    const spec = drawnBlueprint();
    expect(spec.voids[0].kind).toEqual({
      value: "atrium",
      source: "USER_PROVIDED",
      confidence: 1,
      reason: expect.any(String),
    });
    expect(spec.anchors[0].kind.source).toBe("USER_PROVIDED");
    expect(spec.zones[0].program.value).toBe("lobby");
    expect(userValue(42).confidence).toBe(1);
  });

  it("rejects storey 0, which the compiler would silently drop", () => {
    const spec = drawnBlueprint();
    spec.boundaries[0].floorNos = [0];
    expect(safeParseBlueprintSpec(spec).success).toBe(false);
  });

  it("rejects fractional millimetre coordinates", () => {
    const spec = drawnBlueprint();
    spec.anchors[0].positionMm = { xMm: 1_500.5, zMm: 0 };
    expect(safeParseBlueprintSpec(spec).success).toBe(false);
  });

  it("rejects a soft hold that omits its tolerance", () => {
    const spec = drawnBlueprint();
    (spec.cores[0] as { hold: unknown }).hold = { mode: "soft" };
    expect(safeParseBlueprintSpec(spec).success).toBe(false);
  });

  it("rejects an unknown fidelity mode", () => {
    const spec = drawnBlueprint();
    (spec as { fidelityMode: string }).fidelityMode = "literal";
    expect(safeParseBlueprintSpec(spec).success).toBe(false);
  });

  it("rejects a loop with no segments", () => {
    expect(BoundaryLoopSchema.safeParse({ id: "x", segments: [] }).success).toBe(false);
  });

  it("exposes uniform endpoints across every curve kind", () => {
    const loop = makeRectLoop("r", { xMm: 0, zMm: 0, widthMm: 100, depthMm: 100 });
    expect(segmentStart(loop.segments[0])).toEqual({ xMm: 0, zMm: 0 });
    expect(segmentEnd(loop.segments[0])).toEqual({ xMm: 100, zMm: 0 });

    const polyline = BoundaryLoopSchema.parse({
      id: "p",
      segments: [
        {
          kind: "polyline",
          pointsMm: [
            { xMm: 0, zMm: 0 },
            { xMm: 10, zMm: 0 },
            { xMm: 10, zMm: 10 },
          ],
        },
      ],
    });
    expect(segmentStart(polyline.segments[0])).toEqual({ xMm: 0, zMm: 0 });
    expect(segmentEnd(polyline.segments[0])).toEqual({ xMm: 10, zMm: 10 });
  });
});

/* ------------------------------------------------------------------ */
/* Tool contract                                                       */
/* ------------------------------------------------------------------ */

/** Every object node in the emitted JSON Schema, `$defs` included. */
function objectNodes(node: unknown, path: string): Array<[string, Record<string, unknown>]> {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => objectNodes(child, `${path}/${i}`));
  }
  if (node === null || typeof node !== "object") return [];

  const record = node as Record<string, unknown>;
  const found: Array<[string, Record<string, unknown>]> =
    record.type === "object" ? [[path, record]] : [];
  for (const [key, value] of Object.entries(record)) {
    found.push(...objectNodes(value, `${path}/${key}`));
  }
  return found;
}

describe("blueprintToolInputSchema", () => {
  it("emits a draft-07 JSON Schema usable as a Claude tool contract", () => {
    const schema = blueprintToolInputSchema();
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "boundaries",
        "circulation",
        "coordinateSystem",
        "fidelityMode",
        "relationships",
        "uncertainty",
      ]),
    );
  });

  it("closes every object in the tree so the model cannot invent keys", () => {
    const nodes = objectNodes(blueprintToolInputSchema(), "#");
    expect(nodes.length).toBeGreaterThan(20);

    const open = nodes.filter(([, node]) => node.additionalProperties !== false);
    expect(open.map(([path]) => path)).toEqual([]);
  });

  it("can emit a schema for any sub-schema, matching toolInputSchema's signature", () => {
    const schema = blueprintToolInputSchema(BoundaryLoopSchema);
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("describes the same shape the parser accepts", () => {
    const emitted = blueprintToolInputSchema(BlueprintSpecSchema);
    const properties = emitted.properties as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(
      Object.keys(BlueprintSpecSchema.shape).sort(),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

describe("blueprint builders", () => {
  it("produces a spec that parses and validates clean", () => {
    const spec = drawnBlueprint();
    expect(safeParseBlueprintSpec(spec).success).toBe(true);

    const report = validateBlueprint(spec);
    expect(report.violations).toEqual([]);
    expect(report.blueprintValid).toBe(true);
  });

  it("closes rectangles and polygons without the caller repeating a point", () => {
    const rect = makeRectLoop("r", { xMm: 0, zMm: 0, widthMm: 10, depthMm: 20 });
    expect(rect.segments).toHaveLength(4);
    expect(segmentEnd(rect.segments[3])).toEqual(segmentStart(rect.segments[0]));

    const poly = makePolyLoop("p", [
      { xMm: 0, zMm: 0 },
      { xMm: 10, zMm: 0 },
      { xMm: 10, zMm: 10 },
      { xMm: 0, zMm: 10 },
      { xMm: -5, zMm: 5 },
    ]);
    expect(poly.segments).toHaveLength(5);
    expect(segmentEnd(poly.segments[4])).toEqual(segmentStart(poly.segments[0]));
  });

  it("refuses a degenerate polygon", () => {
    expect(() =>
      makePolyLoop("p", [
        { xMm: 0, zMm: 0 },
        { xMm: 10, zMm: 0 },
      ]),
    ).toThrow(/at least 3 points/);
  });

  it("never mutates the spec it is given", () => {
    const before = emptyBlueprint("Riverside Studio");
    const snapshot = JSON.stringify(before);
    addAnchor(before, { id: "a", kind: "entrance", positionMm: { xMm: 0, zMm: 0 } });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("derives a stable id from the name with no clock or random source", () => {
    expect(emptyBlueprint("Riverside Studio").id).toBe(
      emptyBlueprint("Riverside  Studio!").id,
    );
    expect(emptyBlueprint("한강 프로젝트").id).toBe("blueprint");
  });
});
