// src/lib/retrofit/twin-roof-planes.ts
// The twin's roof, as planes — the input side of PV placement stage 4.
//
// The model pages get their planes measured from the IFC at build time
// (stage 1, `roof-planes.json`). The twin has no IFC: it has a recipe, whose
// per-storey plates P2-30 already resolved. This turns those plates into the
// same `RoofPlane` shape, so `pv-layout.ts` has ONE input type and both
// viewers feed it the same thing.
//
// It does NOT lay out modules, exclude planes, inset setbacks or subtract
// obstructions. That is stages 2–3, one library, shared. A second layout here
// would be the bounding-box bug wearing a different name.
//
// ## Why the areas cannot drift from the frame
//
// The roof area on screen comes from `envelopeQuantities(recipe).roofAreaSqm`,
// which walks the storeys as "the top plate, plus every terrace a setback
// exposes, clamped at zero where a storey overhangs" (envelope-quantities.ts
// :198-210). This walks the SAME storeys in the SAME order and takes each
// plate's area from the SAME exported `floorPlateAreaSqm`, so
// `Σ projectedSqm === roofAreaSqm` by construction rather than by agreement.
// A test pins it. If it ever fails, the planes and the m² beside them have
// become two different roofs, which is exactly the failure the legend would
// then be reporting confidently.
//
// ## The one place a terrace is an approximation, stated
//
// A terrace plane's outline is the LOWER storey's rings with the storey above
// punched out as a hole. That is exact when the upper plate sits inside the
// lower one — the setback case, which is what produces a terrace at all — and
// its area is then `lower − upper`, the same number the walk adds. Where two
// plates only partially overlap, the walk's `max(0, here − next)` and this
// ring-and-hole outline stop describing the same region: the area stays right
// and the SHAPE is then a claim this module cannot support from plate areas
// alone. `partialOverlap` marks those planes so the layout does not silently
// place modules over a neighbouring storey's roof, and so the legend can say
// which planes are shaped by inference.

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { floorPlateAreaSqm } from "@/lib/energy/envelope-quantities";
import { finishedRoofTopY } from "@/lib/procedural/roof-surface";

/** A closed ring in plan, metres. Outer counter-clockwise, holes clockwise. */
export type PlanRing = [number, number][];

/**
 * One roof plane. Structurally the stage-1 `roof-planes.json` plane, so
 * `pv-layout.ts` takes a twin plane and a measured plane through one door.
 * Keep it assignable to P1's type — if bim-83's JSON gains a field, add it
 * here as optional rather than forking the shape.
 */
export interface RoofPlane {
  /** Stable id within the building. */
  id: string;
  /** What produced it — a storey label for the twin, an IFC name for a model. */
  elementName: string;
  elementType: string;
  /** Unit normal. Every twin plane is flat, so [0, 1, 0]. */
  normal: [number, number, number];
  /** acos(n·ŷ) in degrees. 0 for every twin plane. */
  tiltDeg: number;
  /** Bearing of the downslope direction. `null` on a flat plane — it has none. */
  azimuthDeg: number | null;
  /** Σ triangle areas (m²). Equal to `projectedSqm` while tilt is 0. */
  surfaceSqm: number;
  /** Σ |n·ŷ| × area (m²) — the plan area the layout packs into. */
  projectedSqm: number;
  minElevationM: number;
  maxElevationM: number;
  /** Outer ring first, then holes. */
  outline: PlanRing[];
  /**
   * True when the outline is inferred from plate areas that only partially
   * overlap, so its SHAPE is not established even though its area is. Absent
   * on measured planes.
   */
  partialOverlap?: boolean;
}

/** Ray-cast point-in-ring, boundary counted as inside. */
function pointInRing(px: number, pz: number, ring: PlanRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi === pz && xi === px) return true;
    const straddles = zi > pz !== zj > pz;
    if (straddles && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Whether every vertex of `upper` lies within `lowerOuter`.
 *
 * This is the containment the ring-and-hole outline depends on, tested
 * geometrically. An earlier version of this compared the outline's area
 * against the walk's `max(0, here − next)` — but those are the same
 * arithmetic on the same two numbers, so the check could never fire and the
 * flag named a condition it did not measure. The test caught it. Vertex
 * containment is conservative (it misses an upper edge bulging across a
 * concave lower boundary between vertices), which is the right direction:
 * it can under-report a shaped-by-inference plane, never invent one.
 */
function ringsContainedIn(upper: PlanRing[], lowerOuter: PlanRing): boolean {
  return upper.every((ring) =>
    ring.every(([x, z]) => pointInRing(x, z, lowerOuter)),
  );
}

function isUsablePolygon(
  rings: [number, number][][] | undefined,
): rings is [number, number][][] {
  return Array.isArray(rings) && rings.length > 0 && rings[0].length >= 3;
}

/**
 * The base plate `envelopeQuantities` falls back to when a storey resolved no
 * plate of its own. Mirrors `basePlateOf` (envelope-quantities.ts:100), which
 * is private there; the areas still come from the exported
 * `floorPlateAreaSqm`, so this only ever supplies the SHAPE.
 */
function basePlateOf(recipe: BuildingRecipe): PlanRing[] {
  if (isUsablePolygon(recipe.footprintPolygon)) return recipe.footprintPolygon;
  const hw = recipe.footprintWidth / 2;
  const hd = recipe.footprintDepth / 2;
  return [
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ],
  ];
}

function plateRingsOf(recipe: BuildingRecipe, floor: FloorSpec): PlanRing[] {
  return isUsablePolygon(floor.plate) ? floor.plate : basePlateOf(recipe);
}

/** Top of a storey in metres — where the terrace it exposes actually sits. */
function storeyTopM(floor: FloorSpec): number {
  return floor.y + floor.height;
}

/**
 * Roof planes for a procedural twin.
 *
 * One plane for the top plate, and one per terrace a setback exposes. A
 * storey that overhangs the one below exposes no roof and yields no plane —
 * the same clamp the area walk applies, so a zero-area plane never reaches
 * the layout.
 */
export function twinRoofPlanes(recipe: BuildingRecipe): RoofPlane[] {
  const above = recipe.floors.filter((f) => f.type !== "below");
  if (above.length === 0) return [];

  const planes: RoofPlane[] = [];
  const flat = (
    id: string,
    elementName: string,
    projectedSqm: number,
    elevationM: number,
    outline: PlanRing[],
    partialOverlap?: boolean,
  ): RoofPlane => ({
    id,
    elementName,
    elementType: "TwinPlate",
    normal: [0, 1, 0],
    tiltDeg: 0,
    // A flat plane has no downslope direction, so it has no bearing. Reporting
    // 0° here would read as "due north" to anything that trusts the field.
    azimuthDeg: null,
    surfaceSqm: projectedSqm,
    projectedSqm,
    minElevationM: elevationM,
    maxElevationM: elevationM,
    outline,
    ...(partialOverlap ? { partialOverlap: true } : {}),
  });

  // The top plate, at the finished roof datum — the same height the twin
  // already stands its panels on (`finishedRoofTopY`), so the modules do not
  // move when the layout changes.
  const topFloor = above[above.length - 1];
  const topArea = floorPlateAreaSqm(recipe, topFloor);
  if (topArea > 0) {
    planes.push(
      flat(
        "twin-roof-top",
        topFloor.label ?? `${topFloor.floorNo}F`,
        topArea,
        finishedRoofTopY(recipe),
        plateRingsOf(recipe, topFloor),
      ),
    );
  }

  // Terraces, in the walk's own order.
  for (let i = 0; i < above.length - 1; i++) {
    const here = floorPlateAreaSqm(recipe, above[i]);
    const next = floorPlateAreaSqm(recipe, above[i + 1]);
    const exposed = Math.max(0, here - next);
    if (exposed <= 0) continue;

    const lowerRings = plateRingsOf(recipe, above[i]);
    const upperRings = plateRingsOf(recipe, above[i + 1]);
    // Outer ring of the storey below, with the storey above punched out.
    const outline: PlanRing[] = [lowerRings[0], ...upperRings];

    // The ring-and-hole outline describes `lower − upper` exactly only when
    // the upper plate sits inside the lower one — the setback case. Test that
    // geometrically; where it fails the AREA is still the walk's but the SHAPE
    // is inference, and the layout must not treat it as measured roof.
    const partialOverlap = !ringsContainedIn(upperRings, lowerRings[0]);

    planes.push(
      flat(
        `twin-roof-terrace-${above[i].floorNo}`,
        `${above[i].label ?? `${above[i].floorNo}F`} 테라스`,
        exposed,
        storeyTopM(above[i]),
        outline,
        partialOverlap,
      ),
    );
  }

  return planes;
}

/** Σ projectedSqm — must equal `envelopeQuantities(recipe).roofAreaSqm`. */
export function totalProjectedSqm(planes: readonly RoofPlane[]): number {
  return planes.reduce((sum, p) => sum + p.projectedSqm, 0);
}
