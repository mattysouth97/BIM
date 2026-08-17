import { describe, expect, it } from "vitest";

import { generateMassing, polygonBounds, type Polygon } from "../generate/massing";
import { generateWalls } from "../generate/partitions";
import {
  rectArea,
  type CoreLayout,
  type GeneratedWall,
  type PlacedSpace,
  type Rect,
} from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

const FLOOR_NO = 2;
const LEVEL_HEIGHT_M = 3.9;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const rect = (minX: number, minZ: number, maxX: number, maxZ: number): Rect => ({
  minX,
  minZ,
  maxX,
  maxZ,
});

const ringOf = (r: Rect): Polygon => [
  [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
  ],
];

const coreAt = (r: Rect): CoreLayout => ({ rect: r, components: [] });

function space(id: string, r: Rect): PlacedSpace {
  return {
    id,
    programId: "open-office",
    type: "office-open",
    label: id,
    floorNo: FLOOR_NO,
    rect: r,
    areaSqm: rectArea(r),
    isCirculation: false,
    adjacentSpaceIds: [],
    hasExteriorWall: false,
    reachable: true,
  };
}

/** 20 × 12 m plate, central core, four rooms tiling everything around it. */
const PLATE = rect(-10, -6, 10, 6);
const TILED = {
  plate: PLATE,
  platePolygon: ringOf(PLATE),
  core: coreAt(rect(-3, -2, 3, 2)),
  spaces: [
    space("SPACE-L02-001", rect(-10, -6, -3, 6)), // west
    space("SPACE-L02-002", rect(3, -6, 10, 6)), // east
    space("SPACE-L02-003", rect(-3, -6, 3, -2)), // south of core
    space("SPACE-L02-004", rect(-3, 2, 3, 6)), // north of core
  ],
};

/* ------------------------------------------------------------------ */
/* Invariants                                                          */
/* ------------------------------------------------------------------ */

const near = (a: [number, number], b: [number, number]): boolean =>
  Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;

const coincident = (a: GeneratedWall, b: GeneratedWall): boolean =>
  (near(a.start, b.start) && near(a.end, b.end)) ||
  (near(a.start, b.end) && near(a.end, b.start));

const lengthOf = (w: GeneratedWall): number =>
  Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);

const isVertical = (w: GeneratedWall): boolean => Math.abs(w.end[0] - w.start[0]) < 1e-9;

const ascending = (a: number, b: number) => a - b;

/** Every hard invariant in one place, so every fixture is held to all of them. */
function expectWallInvariants(
  walls: GeneratedWall[],
  spaces: PlacedSpace[],
  outerRingSegments: number,
): void {
  const duplicates: string[] = [];
  for (let i = 0; i < walls.length; i += 1) {
    for (let j = i + 1; j < walls.length; j += 1) {
      if (coincident(walls[i], walls[j])) duplicates.push(`${walls[i].id}~${walls[j].id}`);
    }
  }
  expect(duplicates).toEqual([]);

  const degenerate = walls.filter((w) => lengthOf(w) <= 1e-6).map((w) => w.id);
  expect(degenerate).toEqual([]);

  const known = new Set(spaces.map((s) => s.id));
  for (const wall of walls.filter((w) => w.role === "interior")) {
    expect(wall.boundsSpaceIds.length).toBeGreaterThanOrEqual(1);
    expect(wall.boundsSpaceIds.length).toBeLessThanOrEqual(2);
    for (const id of wall.boundsSpaceIds) expect(known.has(id)).toBe(true);
  }

  expect(walls.filter((w) => w.role === "exterior")).toHaveLength(outerRingSegments);

  // Ids are positional and zero-padded to four digits.
  walls.forEach((wall, index) => {
    expect(wall.id).toBe(`WALL-L${FLOOR_NO}-${String(index).padStart(4, "0")}`);
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("generateWalls", () => {
  it("walls a fully tiled level without emitting a single duplicate", async () => {
    const spec = await specFor("A five storey office building.");
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      ...TILED,
    });

    expectWallInvariants(walls, TILED.spaces, 4);

    expect(walls.filter((w) => w.role === "exterior")).toHaveLength(4);
    expect(walls.filter((w) => w.role === "core")).toHaveLength(4);
    // A/C, A/D, B/C and B/D share a face; A/B and C/D are separated by the core.
    expect(walls.filter((w) => w.role === "interior")).toHaveLength(4);

    const partitions = walls.filter((w) => w.role === "interior");
    for (const wall of partitions) expect(wall.boundsSpaceIds).toHaveLength(2);
    expect(partitions.map((w) => w.boundsSpaceIds.join("+")).sort()).toEqual([
      "SPACE-L02-001+SPACE-L02-003",
      "SPACE-L02-001+SPACE-L02-004",
      "SPACE-L02-002+SPACE-L02-003",
      "SPACE-L02-002+SPACE-L02-004",
    ]);
  });

  it("puts one wall on every segment of the plate's outer ring, facing the right way", async () => {
    const spec = await specFor("A five storey office building.");
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      ...TILED,
    });
    const exterior = walls.filter((w) => w.role === "exterior");

    expect(exterior.map((w) => w.side).sort()).toEqual(["east", "north", "south", "west"]);

    // +Z is north, so the low-Z edge is the south elevation.
    const south = exterior.find((w) => w.side === "south");
    expect(south?.start[1]).toBeCloseTo(PLATE.minZ, 9);
    expect(south?.end[1]).toBeCloseTo(PLATE.minZ, 9);

    const north = exterior.find((w) => w.side === "north");
    expect(north?.start[1]).toBeCloseTo(PLATE.maxZ, 9);
    expect(exterior.find((w) => w.side === "east")?.start[0]).toBeCloseTo(PLATE.maxX, 9);
    expect(exterior.find((w) => w.side === "west")?.start[0]).toBeCloseTo(PLATE.minX, 9);

    // The south elevation is shared by the three rooms that reach it.
    expect(south?.boundsSpaceIds).toEqual([
      "SPACE-L02-001",
      "SPACE-L02-002",
      "SPACE-L02-003",
    ]);
    expect(north?.boundsSpaceIds).toEqual([
      "SPACE-L02-001",
      "SPACE-L02-002",
      "SPACE-L02-004",
    ]);
  });

  it("takes thickness from the spec and height from the level", async () => {
    const spec = await specFor("A five storey office building.");
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      ...TILED,
    });

    const exteriorM = spec.dimensions.exteriorWallMm.value / 1000;
    const interiorM = spec.dimensions.interiorWallMm.value / 1000;
    expect(exteriorM).not.toBeCloseTo(interiorM, 4);

    for (const wall of walls) {
      expect(wall.heightM).toBe(LEVEL_HEIGHT_M);
      expect(wall.floorNo).toBe(FLOOR_NO);
      expect(wall.thicknessM).toBeCloseTo(wall.role === "interior" ? interiorM : exteriorM, 9);
    }
  });

  it("encloses a room whose edges abut nothing at all", async () => {
    const spec = await specFor("A five storey office building.");
    const spaces = [space("SPACE-L02-001", rect(-4, -2, 4, 2))];
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      plate: PLATE,
      platePolygon: ringOf(PLATE),
      core: coreAt(rect(6, -2, 9, 2)),
      spaces,
    });

    expectWallInvariants(walls, spaces, 4);

    const interior = walls.filter((w) => w.role === "interior");
    expect(interior).toHaveLength(4);
    for (const wall of interior) {
      expect(wall.boundsSpaceIds).toEqual(["SPACE-L02-001"]);
    }
    // The free run of each of the room's four sides, walled once each.
    expect(interior.map((w) => Number(lengthOf(w).toFixed(3))).sort(ascending)).toEqual([
      4, 4, 8, 8,
    ]);
  });

  it("ignores a shared edge shorter than 0.9 m but still counts it as abutted", async () => {
    const spec = await specFor("A five storey office building.");
    const spaces = [
      space("SPACE-L02-001", rect(-6, -3, -1, 3)),
      space("SPACE-L02-002", rect(-1, -3, 4, -2.5)), // only 0.5 m of contact
    ];
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      plate: PLATE,
      platePolygon: ringOf(PLATE),
      core: coreAt(rect(7, 4, 9, 5.5)),
      spaces,
    });

    expectWallInvariants(walls, spaces, 4);

    // No partition spans the two rooms...
    expect(walls.filter((w) => w.boundsSpaceIds.length === 2)).toEqual([]);

    // ...but the 0.5 m of contact is still enclosure: exactly one wall sits on
    // the x = -1 line, it belongs to the first room, and it covers only the
    // 5.5 m that abuts nothing. The second room's west face needs no wall of
    // its own, and the 0.5 m stub on its east face is below the wall minimum.
    const onSharedLine = walls.filter(
      (w) => isVertical(w) && Math.abs(w.start[0] + 1) < 1e-6,
    );
    expect(onSharedLine).toHaveLength(1);
    expect(onSharedLine[0].boundsSpaceIds).toEqual(["SPACE-L02-001"]);
    expect(lengthOf(onSharedLine[0])).toBeCloseTo(5.5, 9);
    expect(walls.filter((w) => w.role === "interior")).toHaveLength(6);
  });

  it("walls only the outer ring of a courtyard plate", async () => {
    const spec = await specFor(
      "A five story office building arranged around a central courtyard.",
    );
    expect(spec.massing.strategy.value).toBe("courtyard");

    const massing = generateMassing(spec);
    const polygon = massing.plates.find((p) => p.floorNo === FLOOR_NO)!.polygon;
    expect(polygon).toHaveLength(2); // outer ring + void

    const bounds = polygonBounds(polygon);
    const plate = rect(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      plate,
      platePolygon: polygon,
      core: coreAt(rect(bounds.minX + 1, bounds.minZ + 1, bounds.minX + 4, bounds.minZ + 4)),
      spaces: [],
    });

    expectWallInvariants(walls, [], polygon[0].length);

    // Every exterior wall runs between two OUTER-ring vertices. The void ring is
    // deliberately unwalled for now — hole walling is a follow-up (a courtyard
    // face is an exterior condition with its own compass and glazing rules).
    const onOuter = (p: [number, number]) => polygon[0].some((v) => near(v, p));
    for (const wall of walls.filter((w) => w.role === "exterior")) {
      expect(onOuter(wall.start)).toBe(true);
      expect(onOuter(wall.end)).toBe(true);
    }
    const onHole = (p: [number, number]) => polygon[1].some((v) => near(v, p));
    expect(walls.filter((w) => w.role === "exterior").some((w) => onHole(w.start))).toBe(
      false,
    );
  });

  it("is deterministic for the same spec and layout", async () => {
    const first = await specFor("A five storey office building.");
    const second = await specFor("A five storey office building.");

    const a = generateWalls({
      spec: first,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      ...TILED,
    });
    const b = generateWalls({
      spec: second,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      ...TILED,
    });

    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("does not depend on the order the spaces arrive in", async () => {
    const spec = await specFor("A five storey office building.");
    const forwards = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      ...TILED,
    });
    const backwards = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      ...TILED,
      spaces: [...TILED.spaces].reverse(),
    });

    expect(JSON.stringify(backwards)).toEqual(JSON.stringify(forwards));
  });

  it("resolves a core face that lands on the plate edge to one wall", async () => {
    const spec = await specFor("A five storey office building.");
    // An end core pushed hard against the east elevation: the core's east face
    // is the exterior wall, and emitting both would be a coincident duplicate.
    const spaces = [space("SPACE-L02-001", rect(-10, -6, 6, 6))];
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      plate: PLATE,
      platePolygon: ringOf(PLATE),
      core: coreAt(rect(6, -6, 10, 6)),
      spaces,
    });

    expectWallInvariants(walls, spaces, 4);
    // Three core faces survive; the fourth is already the east elevation.
    expect(walls.filter((w) => w.role === "core")).toHaveLength(3);
  });

  it("emits no zero-length walls for a degenerate core", async () => {
    const spec = await specFor("A five storey office building.");
    // space-plan.ts falls back to a centre LINE when the core misses the plate,
    // so a zero-area core rect reaches this pass legitimately. Walling a line
    // used to produce two zero-length walls, which the validator rejects as a
    // P0 ZERO_LENGTH_WALL.
    const spaces = [space("SPACE-L02-001", rect(-10, -6, 10, 6))];
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      plate: PLATE,
      platePolygon: ringOf(PLATE),
      core: coreAt(rect(0, 0, 0, 0)),
      spaces,
    });

    const degenerate = walls.filter(
      (w) => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) < 1e-9,
    );
    expect(degenerate).toEqual([]);
    // No enclosure exists around a line, so no core walls are built at all.
    expect(walls.filter((w) => w.role === "core")).toEqual([]);
    // The envelope is still walled — a degenerate core must not lose the level.
    expect(walls.filter((w) => w.role === "exterior")).toHaveLength(4);
  });

  it("does not let an unwalled line core stand in for a room's own partition", async () => {
    const spec = await specFor("A five storey office building.");
    // The mirror of the test above, and the trap it sets: skipping the core
    // enclosure is only correct if the core also stops counting as coverage.
    // Here a room's east face lies exactly on a line core, so treating the line
    // as enclosure would silently drop the 4 m of partition it spans — leaving a
    // hole no wall closes and no invariant on wall COUNT would catch.
    const spaces = [space("SPACE-L02-001", rect(-10, -6, 0, 6))];
    const walls = generateWalls({
      spec,
      floorNo: FLOOR_NO,
      levelHeightM: LEVEL_HEIGHT_M,
      plate: PLATE,
      platePolygon: ringOf(PLATE),
      core: coreAt(rect(0, -2, 0, 2)),
      spaces,
    });

    expectWallInvariants(walls, spaces, 4);
    expect(walls.filter((w) => w.role === "core")).toEqual([]);

    // The room's full 12 m east face is enclosed, in one run or several.
    const onLine = walls.filter((w) => isVertical(w) && Math.abs(w.start[0]) < 1e-6);
    expect(onLine.reduce((sum, w) => sum + lengthOf(w), 0)).toBeCloseTo(12, 6);
  });
});
