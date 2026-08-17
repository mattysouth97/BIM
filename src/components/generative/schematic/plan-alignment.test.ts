// The two pieces of arithmetic the schematic UI cannot be trusted without:
// the pan/zoom transform, and the blueprint↔model alignment that makes the
// overlay a proof rather than a coincidence.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addVoid,
  compileBlueprintToSpec,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
} from "@/lib/generative/blueprint";

import { blueprintShiftMm, toModelMetres } from "./alignment";
import { blueprintBounds, loopPoints, schematicShapes } from "./schematic-geometry";
import {
  fitTransform,
  toScreen,
  toWorld,
  zoomAt,
  type ViewTransform,
} from "./view-transform";

/** A plate deliberately far from the origin: alignment must not be a no-op. */
function offsetPlate(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Offset plate"), {
    loop: makeRectLoop("plate", {
      xMm: 100_000,
      zMm: 60_000,
      widthMm: 30_000,
      depthMm: 20_000,
    }),
    floorNos: [1, 2],
  });
}

describe("view transform", () => {
  const view: ViewTransform = { scale: 1 / 20, offsetX: 100, offsetY: 40 };

  it("round-trips world → screen → world", () => {
    const world = { xMm: 12_345, zMm: -6_789 };
    const back = toWorld(view, toScreen(view, world));
    expect(back.xMm).toBeCloseTo(world.xMm, 6);
    expect(back.zMm).toBeCloseTo(world.zMm, 6);
  });

  it("keeps the anchored pixel under the cursor while zooming", () => {
    const anchor = { x: 240, y: 180 };
    const before = toWorld(view, anchor);
    const zoomed = zoomAt(view, 1.6, anchor);
    const after = toWorld(zoomed, anchor);
    expect(zoomed.scale).toBeGreaterThan(view.scale);
    expect(after.xMm).toBeCloseTo(before.xMm, 6);
    expect(after.zMm).toBeCloseTo(before.zMm, 6);
  });

  it("fits an extent into the viewport, centred", () => {
    const bounds = { minX: 0, maxX: 30_000, minZ: 0, maxZ: 20_000 };
    const fitted = fitTransform(bounds, 800, 600, 40);
    const min = toScreen(fitted, { xMm: bounds.minX, zMm: bounds.minZ });
    const max = toScreen(fitted, { xMm: bounds.maxX, zMm: bounds.maxZ });

    expect(min.x).toBeGreaterThanOrEqual(39.9);
    expect(max.x).toBeLessThanOrEqual(760.1);
    expect((min.x + max.x) / 2).toBeCloseTo(400, 6);
    expect((min.y + max.y) / 2).toBeCloseTo(300, 6);
  });

  it("does not divide by zero on an empty drawing", () => {
    const fitted = fitTransform(null, 800, 600);
    expect(Number.isFinite(fitted.scale)).toBe(true);
    expect(fitted.scale).toBeGreaterThan(0);
  });
});

describe("blueprint geometry", () => {
  it("reads a rectangle loop back as four distinct corners", () => {
    const spec = offsetPlate();
    const points = loopPoints(spec.boundaries[0].loop);
    expect(points).toHaveLength(4);
    expect(blueprintBounds(spec)).toEqual({
      minX: 100_000,
      maxX: 130_000,
      minZ: 60_000,
      maxZ: 80_000,
    });
  });

  it("exposes a void as its own hatched shape", () => {
    const withVoid = addVoid(offsetPlate(), {
      id: "atrium-1",
      kind: "atrium",
      region: {
        kind: "rect",
        originMm: { xMm: 115_000, zMm: 70_000 },
        widthMm: 6_000,
        depthMm: 4_000,
        rotationRad: 0,
      },
      floorNos: [1, 2],
    });
    const shapes = schematicShapes(withVoid);
    const shape = shapes.find((s) => s.kind === "void");
    expect(shape?.detail).toBe("atrium");
    expect(shape?.pointsMm).toHaveLength(4);
  });
});

describe("blueprint ↔ model alignment", () => {
  it("measures the shift the compiler applied, so the overlay lands on the model", () => {
    const blueprint = offsetPlate();
    const { spec } = compileBlueprintToSpec(blueprint, { seed: 1 });

    const shift = blueprintShiftMm(blueprint, spec);
    expect(shift.method).toBe("measured");

    // The plate centre of the drawing lands on the model's origin.
    const centre = toModelMetres({ xMm: 115_000, zMm: 70_000 }, shift);
    expect(centre.x).toBeCloseTo(0, 3);
    expect(centre.z).toBeCloseTo(0, 3);

    // And a drawn corner lands on the compiled plate's corner.
    const plate = spec.massing.customPlates?.value[0];
    expect(plate).toBeTruthy();
    const xs = (plate?.polygonMm[0] ?? []).map(([x]) => x);
    const corner = toModelMetres({ xMm: 100_000, zMm: 60_000 }, shift);
    expect(Math.min(...xs) / 1000).toBeCloseTo(corner.x, 3);
  });

  it("falls back to the compiler's own rule when there are no custom plates", () => {
    const blueprint = offsetPlate();
    const shift = blueprintShiftMm(blueprint, null);
    expect(shift.method).toBe("derived");
    expect(shift.xMm).toBe(-115_000);
    expect(shift.zMm).toBe(-70_000);
  });

  it("reports honestly when there is nothing to align", () => {
    expect(blueprintShiftMm(emptyBlueprint("blank"), null)).toEqual({
      xMm: 0,
      zMm: 0,
      method: "none",
    });
  });
});
