// src/lib/generative/blueprint/from-footprint.ts
//
// A building's own footprint → a BlueprintSpec the schematic editor can open.
//
// This is the "start a new design from THIS building" seed: the outline the
// user is already looking at becomes the boundary, its courtyards become void
// intents, and nothing else is invented. Cores, circulation, zones and grids
// stay empty because the footprint says nothing about them — a seed that filled
// them in would be putting words in the drawing's mouth.
//
// UNITS IN: metres, `[outer, ...holes]` rings of `[x, z]` — the convention of
// `BuildingRecipe.footprintPolygon` and of the slab outlines in the BIM graph.
// UNITS OUT: millimetres, integers — the BlueprintSpec convention. ×1000 and
// rounding happen at exactly one place (`toPointsMm`).
//
// PROVENANCE: the user did not draw this. `builders.ts` stamps everything it
// makes USER_PROVIDED, which would be false here, so every provenanced value
// this module produces is re-stamped DERIVED with one shared reason, and the
// blueprint carries an assumption saying where its geometry came from.
//
// Determinism: no Math.random, no Date.now — ids are positional, so the same
// footprint always yields the same blueprint.

import type { BuildingRecipe } from "@/lib/procedural/types";
import type { Provenanced, SpaceType } from "../spec/building-spec";
import { addBoundary, addVoid, addZone, emptyBlueprint, makePolyLoop } from "./builders";
import type { BlueprintSpec, PointMm } from "./blueprint-spec";

/** Stated on every value this module derives, and in the assumption list. */
export const FOOTPRINT_SEED_REASON = "Seeded from the building's footprint";

/** `FloorNoSchema` runs 1–120 above grade; a seed must not exceed it. */
const MAX_SEED_FLOORS = 120;

export interface FootprintToBlueprintInput {
  /** Blueprint name — normally the building's own name. */
  name: string;
  /** `[outer, ...holes]` rings of `[x, z]` metres, local to the building. */
  footprintPolygonM: readonly (readonly (readonly [number, number])[])[];
  /** Above-grade storey count. Clamped to 1–120; the schema allows no more. */
  floors: number;
  /** Program for the whole plate, when the caller genuinely knows it. */
  use?: SpaceType;
}

/**
 * The footprint a recipe actually describes, or null when it describes none.
 *
 * A recipe carries its plate either as an explicit polygon (CAD import, a
 * generated design) or as the `footprintWidth × footprintDepth` box every other
 * consumer centres on the origin — `defaultGrids` and the facade generator both
 * read it that way, so the seed does too. Null means the caller must not offer
 * the action at all: there is nothing to trace.
 */
export function footprintRingsOfRecipe(
  recipe: Pick<BuildingRecipe, "footprintPolygon" | "footprintWidth" | "footprintDepth"> | undefined,
): [number, number][][] | null {
  if (!recipe) return null;
  const polygon = recipe.footprintPolygon;
  if (polygon && polygon.length > 0 && polygon[0].length >= 3) {
    return polygon.map((ring) => ring.map(([x, z]): [number, number] => [x, z]));
  }
  const { footprintWidth: w, footprintDepth: d } = recipe;
  if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) return null;
  return [
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ],
  ];
}

function derived<T>(value: T): Provenanced<T> {
  return { value, source: "DERIVED", confidence: 1, reason: FOOTPRINT_SEED_REASON };
}

/**
 * Ring → millimetre points, closing vertex dropped.
 *
 * `makePolyLoop` adds the closing segment itself, so a ring that repeats its
 * first point would gain a zero-length segment. Consecutive duplicates go for
 * the same reason: they survive tessellation as nothing and only make the
 * segment list longer than the drawing.
 */
function toPointsMm(ring: readonly (readonly [number, number])[]): PointMm[] {
  const points: PointMm[] = [];
  for (const [x, z] of ring) {
    const point = { xMm: Math.round(x * 1000), zMm: Math.round(z * 1000) };
    const last = points[points.length - 1];
    if (last && last.xMm === point.xMm && last.zMm === point.zMm) continue;
    points.push(point);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first.xMm === last.xMm && first.zMm === last.zMm) {
    points.pop();
  }
  return points;
}

/**
 * Build the seed. Throws only on geometry that cannot be a plan at all — an
 * outer ring with fewer than three distinct vertices encloses no area, and a
 * blueprint whose boundary is a line is not a weaker seed but an unusable one.
 * Degenerate HOLES are dropped instead: the plate is still valid without them.
 */
export function footprintToBlueprint(input: FootprintToBlueprintInput): BlueprintSpec {
  const [outerRing, ...holeRings] = input.footprintPolygonM;
  const outer = toPointsMm(outerRing ?? []);
  if (outer.length < 3) {
    throw new Error(
      `footprintToBlueprint("${input.name}"): the outer ring has ${outer.length} distinct vertex/vertices; a boundary needs at least 3.`,
    );
  }

  const floorCount = Math.min(
    MAX_SEED_FLOORS,
    Math.max(1, Math.round(Number.isFinite(input.floors) ? input.floors : 1)),
  );
  const floorNos = Array.from({ length: floorCount }, (_, i) => i + 1);

  let spec = emptyBlueprint(input.name);
  spec = addBoundary(spec, {
    loop: makePolyLoop("footprint-outline", outer),
    floorNos,
    role: "outline",
  });

  // A hole in the plate is a courtyard: it is open to the sky over the whole
  // stack, which is what the footprint actually shows. An atrium (roofed, often
  // partial) would be a claim the footprint cannot support.
  let voidIndex = 0;
  for (const ring of holeRings) {
    const hole = toPointsMm(ring);
    if (hole.length < 3) continue;
    voidIndex += 1;
    spec = addVoid(spec, {
      id: `footprint-courtyard-${voidIndex}`,
      kind: "courtyard",
      region: { kind: "loop", loop: makePolyLoop(`footprint-courtyard-${voidIndex}-loop`, hole) },
      floorNos,
      label: `Courtyard ${voidIndex}`,
    });
  }

  if (input.use) {
    spec = addZone(spec, {
      id: "footprint-program",
      program: input.use,
      region: { kind: "loopRef", loopId: "footprint-outline" },
      floorNos,
      memberIds: [],
    });
  }

  return {
    ...spec,
    coordinateSystem: {
      ...spec.coordinateSystem,
      sourceScaleRatio: derived(spec.coordinateSystem.sourceScaleRatio.value),
    },
    voids: spec.voids.map((item) => ({ ...item, kind: derived(item.kind.value) })),
    zones: spec.zones.map((item) => ({ ...item, program: derived(item.program.value) })),
    assumptions: [
      {
        id: "seeded-from-footprint",
        label: FOOTPRINT_SEED_REASON,
        statement:
          "The boundary and any courtyards were taken from the existing building's footprint. Cores, circulation and zoning were not — draw them before generating.",
        source: "DERIVED",
        confidence: 1,
      },
    ],
  };
}
