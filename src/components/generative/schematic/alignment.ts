// src/components/generative/schematic/alignment.ts
//
// Putting the schematic and the generated model in the same coordinate frame.
//
// `blueprint/compile.ts` re-origins the design: every plate is translated so the
// LARGEST plate's bounding-box centre sits at (0, 0), because the downstream
// massing frame is centred on the footprint. Draw the blueprint at its authored
// coordinates on top of a model built from it and the two would sit metres
// apart — which would look like the generator ignored the drawing.
//
// The shift is therefore MEASURED rather than assumed: compare the compiled
// plate's bounding box with the boundary that produced it, and the difference
// is the translation, whatever rule the compiler used to choose it. When the
// compiled spec carries no custom plates (a parametric fallback), the rule is
// reproduced directly from the blueprint instead.

import type { BlueprintSpec } from "@/lib/generative/blueprint";
import type { BuildingSpec } from "@/lib/generative/spec/building-spec";

import { boundaryBoundsForFloor } from "./schematic-geometry";
import type { BoundsMm } from "./view-transform";

export interface BlueprintShiftMm {
  xMm: number;
  zMm: number;
  /**
   * How it was obtained. "measured" compared input and output; "derived"
   * reproduced the compiler's rule; "none" means there was nothing to align.
   */
  method: "measured" | "derived" | "none";
}

const NO_SHIFT: BlueprintShiftMm = { xMm: 0, zMm: 0, method: "none" };

function boundsOfRing(ring: readonly (readonly [number, number])[]): BoundsMm | null {
  if (ring.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

const areaOf = (b: BoundsMm) => (b.maxX - b.minX) * (b.maxZ - b.minZ);
const centreOf = (b: BoundsMm) => ({
  xMm: (b.minX + b.maxX) / 2,
  zMm: (b.minZ + b.maxZ) / 2,
});

/** The compiler's own rule: negate the largest plate's bbox centre. */
function derivedShift(blueprint: BlueprintSpec): BlueprintShiftMm {
  const floorNos = [
    ...new Set(blueprint.boundaries.flatMap((boundary) => boundary.floorNos)),
  ].sort((a, b) => a - b);

  let best: BoundsMm | null = null;
  for (const floorNo of floorNos) {
    const bounds = boundaryBoundsForFloor(blueprint, floorNo);
    if (!bounds) continue;
    if (!best || areaOf(bounds) > areaOf(best)) best = bounds;
  }
  if (!best) return NO_SHIFT;

  const centre = centreOf(best);
  return { xMm: -centre.xMm, zMm: -centre.zMm, method: "derived" };
}

export function blueprintShiftMm(
  blueprint: BlueprintSpec,
  spec: BuildingSpec | null,
): BlueprintShiftMm {
  const plates = spec?.massing.customPlates?.value ?? [];

  let bestPlateBounds: BoundsMm | null = null;
  let bestFloorNos: number[] = [];
  for (const plate of plates) {
    const bounds = boundsOfRing(plate.polygonMm[0] ?? []);
    if (!bounds) continue;
    if (!bestPlateBounds || areaOf(bounds) > areaOf(bestPlateBounds)) {
      bestPlateBounds = bounds;
      bestFloorNos = plate.floorNos;
    }
  }

  if (bestPlateBounds) {
    for (const floorNo of bestFloorNos) {
      const raw = boundaryBoundsForFloor(blueprint, floorNo);
      if (!raw) continue;
      const compiled = centreOf(bestPlateBounds);
      const authored = centreOf(raw);
      return {
        xMm: Math.round(compiled.xMm - authored.xMm),
        zMm: Math.round(compiled.zMm - authored.zMm),
        method: "measured",
      };
    }
  }

  return derivedShift(blueprint);
}

/** Blueprint millimetres → model metres, in the model's own frame. */
export function toModelMetres(
  point: { xMm: number; zMm: number },
  shift: BlueprintShiftMm,
): { x: number; z: number } {
  return { x: (point.xMm + shift.xMm) / 1000, z: (point.zMm + shift.zMm) / 1000 };
}
