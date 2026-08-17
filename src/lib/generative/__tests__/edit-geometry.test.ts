import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addCore,
  addPlacement,
  emptyBlueprint,
  formatAreaM2,
  formatMetres,
  makeRectLoop,
  moveObjectVertex,
  objectVertices,
  ringAreaMm2,
  translateObject,
} from "../blueprint";

const plate = () =>
  addBoundary(emptyBlueprint("Edit geometry"), {
    loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 20_000 }),
    floorNos: [1, 2, 3],
  });

describe("live dimension helpers", () => {
  it("formats millimetres as metres and areas as square metres", () => {
    expect(formatMetres(6_000)).toBe("6.00 m");
    expect(formatMetres(12_500)).toBe("12.5 m");
    expect(formatAreaM2(30_000 * 20_000)).toBe("600.0 m²");
  });

  it("measures a closed rectangle with the shoelace formula", () => {
    expect(
      ringAreaMm2([
        { xMm: 0, zMm: 0 },
        { xMm: 10_000, zMm: 0 },
        { xMm: 10_000, zMm: 4_000 },
        { xMm: 0, zMm: 4_000 },
      ]),
    ).toBe(40_000_000);
  });
});

describe("translateObject / moveObjectVertex", () => {
  it("slides a plate by a millimetre delta without mutating the input", () => {
    const spec = plate();
    const next = translateObject(spec, "plate", 2_000, -1_000);
    expect(spec.boundaries[0].loop.segments[0]).toMatchObject({
      startMm: { xMm: 0, zMm: 0 },
    });
    const verts = objectVertices(next, "plate");
    expect(verts?.[0]).toEqual({ xMm: 2_000, zMm: -1_000 });
    expect(verts?.[2]).toEqual({ xMm: 32_000, zMm: 19_000 });
  });

  it("is a no-op for a zero delta or an unknown id", () => {
    const spec = plate();
    expect(translateObject(spec, "plate", 0, 0)).toBe(spec);
    expect(translateObject(spec, "missing", 100, 0)).toEqual(spec);
  });

  it("reshapes an axis-aligned core by holding the opposite corner", () => {
    const spec = addCore(plate(), {
      id: "core-1",
      region: {
        kind: "rect",
        originMm: { xMm: 10_000, zMm: 8_000 },
        widthMm: 6_000,
        depthMm: 4_000,
        rotationRad: 0,
      },
      floorNos: [1],
      contents: ["stair"],
    });
    // Rect vertices: BL, BR, TR, TL. Drag BR (+x, -z from origin-centred box).
    const verts = objectVertices(spec, "core-1");
    expect(verts).toHaveLength(4);
    const next = moveObjectVertex(spec, "core-1", 1, { xMm: 16_000, zMm: 4_000 });
    const region = next.cores[0].region;
    expect(region.kind).toBe("rect");
    if (region.kind !== "rect") return;
    expect(region.widthMm).toBe(9_000);
    expect(region.depthMm).toBe(6_000);
    expect(region.originMm).toEqual({ xMm: 11_500, zMm: 7_000 });
  });

  it("moves a schematic placement as a single point", () => {
    const spec = addPlacement(plate(), {
      id: "col-1",
      familyId: "column-struct-round-450",
      tool: "column",
      positionMm: { xMm: 6_000, zMm: 4_000 },
      floorNos: [1],
    });
    const next = translateObject(spec, "col-1", 500, 500);
    expect(next.placements?.[0].positionMm).toEqual({ xMm: 6_500, zMm: 4_500 });
  });
});
