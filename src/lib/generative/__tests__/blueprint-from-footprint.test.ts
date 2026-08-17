// src/lib/generative/__tests__/blueprint-from-footprint.test.ts
//
// A seed blueprint is design authority the moment the user presses generate, so
// it has to survive the same validator a drawn one does — an L-shaped plate
// with a courtyard is the shape that breaks a naive rectangle-only seeder.

import { describe, expect, it } from "vitest";

import {
  FOOTPRINT_SEED_REASON,
  footprintRingsOfRecipe,
  footprintToBlueprint,
} from "@/lib/generative/blueprint/from-footprint";
import {
  parseBlueprintSpec,
  validateBlueprint,
  type BoundaryLoop,
} from "@/lib/generative/blueprint";

/** L-shape, counter-clockwise, metres. 30 × 24 overall with a 12 × 10 bite. */
const L_SHAPE: [number, number][] = [
  [-15, -12],
  [15, -12],
  [15, 2],
  [3, 2],
  [3, 12],
  [-15, 12],
];

/** A courtyard well inside the long wing. */
const COURTYARD: [number, number][] = [
  [-10, -8],
  [-2, -8],
  [-2, -2],
  [-10, -2],
];

function boundsOf(loop: BoundaryLoop) {
  const points = loop.segments.map((s) =>
    s.kind === "polyline" ? s.pointsMm[0] : s.startMm,
  );
  return {
    minX: Math.min(...points.map((p) => p.xMm)),
    maxX: Math.max(...points.map((p) => p.xMm)),
    minZ: Math.min(...points.map((p) => p.zMm)),
    maxZ: Math.max(...points.map((p) => p.zMm)),
  };
}

describe("footprintToBlueprint", () => {
  const spec = footprintToBlueprint({
    name: "L-Block",
    footprintPolygonM: [L_SHAPE, COURTYARD],
    floors: 4,
  });

  it("produces a spec the schema and the validator both accept", () => {
    expect(() => parseBlueprintSpec(spec)).not.toThrow();
    const report = validateBlueprint(spec);
    expect(report.violations).toEqual([]);
    expect(report.blueprintValid).toBe(true);
  });

  it("traces the outer ring at millimetre scale", () => {
    expect(spec.boundaries).toHaveLength(1);
    const boundary = spec.boundaries[0];
    expect(boundary.role).toBe("outline");
    expect(boundary.floorNos).toEqual([1, 2, 3, 4]);
    // Six vertices in, six closing segments out — nothing added, nothing lost.
    expect(boundary.loop.segments).toHaveLength(L_SHAPE.length);
    expect(boundsOf(boundary.loop)).toEqual({
      minX: -15_000,
      maxX: 15_000,
      minZ: -12_000,
      maxZ: 12_000,
    });
  });

  it("reads a hole as a courtyard on the same levels", () => {
    expect(spec.voids).toHaveLength(1);
    const courtyard = spec.voids[0];
    expect(courtyard.kind.value).toBe("courtyard");
    expect(courtyard.floorNos).toEqual([1, 2, 3, 4]);
    expect(courtyard.region.kind).toBe("loop");
    if (courtyard.region.kind !== "loop") throw new Error("region must be a loop");
    expect(boundsOf(courtyard.region.loop)).toEqual({
      minX: -10_000,
      maxX: -2_000,
      minZ: -8_000,
      maxZ: -2_000,
    });
  });

  it("declares that the geometry was derived, not drawn", () => {
    expect(spec.voids[0].kind.source).toBe("DERIVED");
    expect(spec.voids[0].kind.reason).toBe(FOOTPRINT_SEED_REASON);
    expect(spec.coordinateSystem.sourceScaleRatio.source).toBe("DERIVED");
    expect(spec.assumptions.map((a) => a.id)).toContain("seeded-from-footprint");
  });

  it("invents nothing the footprint does not say", () => {
    expect(spec.cores).toEqual([]);
    expect(spec.zones).toEqual([]);
    expect(spec.circulation.nodes).toEqual([]);
    expect(spec.gridSystems).toEqual([]);
  });

  it("is deterministic", () => {
    const again = footprintToBlueprint({
      name: "L-Block",
      footprintPolygonM: [L_SHAPE, COURTYARD],
      floors: 4,
    });
    expect(again).toEqual(spec);
  });

  it("tags the whole plate only when the caller names a program", () => {
    const zoned = footprintToBlueprint({
      name: "L-Block",
      footprintPolygonM: [L_SHAPE],
      floors: 2,
      use: "office-open",
    });
    expect(zoned.zones).toHaveLength(1);
    expect(zoned.zones[0].program.value).toBe("office-open");
    expect(zoned.zones[0].program.source).toBe("DERIVED");
    expect(validateBlueprint(zoned).blueprintValid).toBe(true);
  });

  it("drops a repeated closing vertex rather than emitting a null segment", () => {
    const closed = footprintToBlueprint({
      name: "Closed ring",
      footprintPolygonM: [[...L_SHAPE, L_SHAPE[0]]],
      floors: 1,
    });
    expect(closed.boundaries[0].loop.segments).toHaveLength(L_SHAPE.length);
    expect(validateBlueprint(closed).blueprintValid).toBe(true);
  });

  it("clamps the storey count to what the schema can express", () => {
    const tall = footprintToBlueprint({
      name: "Tall",
      footprintPolygonM: [L_SHAPE],
      floors: 400,
    });
    expect(tall.boundaries[0].floorNos).toHaveLength(120);
    const flat = footprintToBlueprint({
      name: "Flat",
      footprintPolygonM: [L_SHAPE],
      floors: 0,
    });
    expect(flat.boundaries[0].floorNos).toEqual([1]);
  });

  it("drops a degenerate hole but refuses a degenerate outline", () => {
    const slivered = footprintToBlueprint({
      name: "Sliver hole",
      footprintPolygonM: [
        L_SHAPE,
        [
          [0, 0],
          [1, 0],
        ],
      ],
      floors: 1,
    });
    expect(slivered.voids).toEqual([]);
    expect(() =>
      footprintToBlueprint({
        name: "Line",
        footprintPolygonM: [
          [
            [0, 0],
            [1, 0],
          ],
        ],
        floors: 1,
      }),
    ).toThrow(/at least 3/);
  });
});

describe("footprintRingsOfRecipe", () => {
  const rect = { footprintWidth: 20, footprintDepth: 12, footprintPolygon: undefined };

  it("centres the rectangular footprint on the origin, as the twin does", () => {
    expect(footprintRingsOfRecipe(rect)).toEqual([
      [
        [-10, -6],
        [10, -6],
        [10, 6],
        [-10, 6],
      ],
    ]);
  });

  it("prefers an explicit polygon over the box", () => {
    const rings = footprintRingsOfRecipe({ ...rect, footprintPolygon: [L_SHAPE] });
    expect(rings).toEqual([L_SHAPE]);
  });

  it("returns null when there is no usable footprint", () => {
    expect(footprintRingsOfRecipe(undefined)).toBeNull();
    expect(
      footprintRingsOfRecipe({ footprintWidth: 0, footprintDepth: 0 }),
    ).toBeNull();
  });
});
