import { describe, expect, it } from "vitest";

import {
  addAnchor,
  addBoundary,
  addCore,
  addVoid,
  addZone,
  compileBlueprintToSpec,
  emptyBlueprint,
  makePolyLoop,
  makeRectLoop,
  TESSELLATION_TOLERANCE_MM,
  type BlueprintSpec,
  type PointMm,
} from "../blueprint";
import { pointInPolygon, toLocalPoint, type Polygon as GeomPolygon } from "../geom";
import { generateMassing, polygonArea, polygonBounds, ringArea } from "../generate/massing";
import { generateGrid, generateStructure } from "../generate/structure";
import type { GeneratedLevel, Rect } from "../generate/types";
import {
  BuildingSpecSchema,
  toolInputSchema,
  type BuildingSpec,
} from "../spec/building-spec";

const SEED = 20260817;

const p = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

/** Signed shoelace — massing exports only the absolute area. */
function signedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

/** Edge directions of a ring, folded to [0, 180) degrees. */
function edgeAnglesDeg(ring: [number, number][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    if (Math.hypot(x2 - x1, z2 - z1) < 1) continue;
    const deg = (Math.atan2(z2 - z1, x2 - x1) * 180) / Math.PI;
    out.push(((deg % 180) + 180) % 180);
  }
  return out;
}

const hasAngle = (angles: number[], target: number, toleranceDeg = 0.5): boolean =>
  angles.some((angle) => Math.abs(angle - target) <= toleranceDeg);

/** Levels + plate rect straight from the massing, as `structure.test.ts` does. */
function contextFor(spec: BuildingSpec): { levels: GeneratedLevel[]; plate: Rect } {
  const massing = generateMassing(spec);
  const bounds = polygonBounds(massing.primary);
  const plate: Rect = {
    minX: bounds.minX,
    minZ: bounds.minZ,
    maxX: bounds.maxX,
    maxZ: bounds.maxZ,
  };

  let elevationM = 0;
  const levels = massing.plates
    .slice()
    .sort((a, b) => a.floorNo - b.floorNo)
    .map((plateForLevel) => {
      const levelSpec =
        spec.levels.find((l) => l.floorNo === plateForLevel.floorNo) ?? spec.levels[0];
      const heightM = levelSpec.floorToFloorMm / 1000;
      const level: GeneratedLevel = {
        floorNo: plateForLevel.floorNo,
        name: levelSpec.name,
        elevationM,
        heightM,
        usage: levelSpec.usage,
        polygon: plateForLevel.polygon,
        plateAreaSqm: plateForLevel.areaSqm,
      };
      elevationM += heightM;
      return level;
    });

  return { levels, plate };
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * L-shaped plan, 40 × 30 m overall with a 25 × 15 m notch removed from the
 * north-east. Net 825 m² against a 1,200 m² bounding box, so a plate that
 * silently became its bbox is impossible to miss.
 */
function lShapedBlueprint(): BlueprintSpec {
  const loop = makePolyLoop("outline", [
    p(0, 0),
    p(40_000, 0),
    p(40_000, 15_000),
    p(15_000, 15_000),
    p(15_000, 30_000),
    p(0, 30_000),
  ]);
  return addBoundary(emptyBlueprint("L Plan"), { loop, floorNos: [1, 2, 3] });
}

function courtyardBlueprint(): BlueprintSpec {
  const loop = makeRectLoop("outline", {
    xMm: 0,
    zMm: 0,
    widthMm: 40_000,
    depthMm: 30_000,
  });
  const withBoundary = addBoundary(emptyBlueprint("Courtyard Plan"), {
    loop,
    floorNos: [1, 2],
  });
  return addVoid(withBoundary, {
    id: "court",
    kind: "courtyard",
    region: {
      kind: "rect",
      originMm: p(20_000, 15_000),
      widthMm: 12_000,
      depthMm: 9_000,
      rotationRad: 0,
    },
    floorNos: [1, 2],
  });
}

const WING_ROTATION_RAD = Math.PI / 6;
const WING_ORIGIN = p(18_000, 2_000);

/** Rotate a wing-local point into plan coordinates, integer millimetres. */
function wingPoint(xMm: number, zMm: number): PointMm {
  const cos = Math.cos(WING_ROTATION_RAD);
  const sin = Math.sin(WING_ROTATION_RAD);
  return p(
    Math.round(WING_ORIGIN.xMm + xMm * cos - zMm * sin),
    Math.round(WING_ORIGIN.zMm + xMm * sin + zMm * cos),
  );
}

/**
 * Two overlapping wings: one on the world axes, one rotated 30°, plus a local
 * grid in the rotated wing's own frame.
 */
function twoWingBlueprint(): BlueprintSpec {
  const wingA = makeRectLoop("wing-a", {
    xMm: 0,
    zMm: 0,
    widthMm: 30_000,
    depthMm: 12_000,
  });
  const wingB = makePolyLoop("wing-b", [
    wingPoint(0, 0),
    wingPoint(24_000, 0),
    wingPoint(24_000, 10_000),
    wingPoint(0, 10_000),
  ]);

  let spec = emptyBlueprint("Two Wings");
  spec = addBoundary(spec, { loop: wingA, floorNos: [1, 2] });
  spec = addBoundary(spec, { loop: wingB, floorNos: [1, 2], role: "wing" });
  return {
    ...spec,
    gridSystems: [
      {
        id: "wing-b-grid",
        regionLoopId: "wing-b",
        originMm: WING_ORIGIN,
        rotationRad: WING_ROTATION_RAD,
        xSpacingsMm: [8_000, 8_000],
        zSpacingsMm: [8_000],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

function objectNodes(node: unknown, path: string): Array<[string, Record<string, unknown>]> {
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => objectNodes(item, `${path}/${index}`));
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

describe("BuildingSpec schema — custom massing and local grids", () => {
  it("offers 'custom' as a massing strategy", () => {
    const schema = toolInputSchema(BuildingSpecSchema) as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const strategy = (
      (properties.massing.properties as Record<string, Record<string, unknown>>).strategy
        .properties as Record<string, Record<string, unknown>>
    ).value;
    expect(strategy.enum).toContain("custom");
  });

  it("keeps every object in the tree closed to invented keys", () => {
    const nodes = objectNodes(toolInputSchema(BuildingSpecSchema), "#");
    const open = nodes.filter(([, node]) => node.additionalProperties !== false);
    expect(open.map(([path]) => path)).toEqual([]);
  });

  it("leaves customPlates and localGrids optional, so existing specs still parse", () => {
    const schema = toolInputSchema(BuildingSpecSchema) as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.massing.required).not.toContain("customPlates");
    expect(properties.structure.required).not.toContain("localGrids");
  });

  it("rejects a custom plate ring with fewer than three vertices", () => {
    const spec = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED }).spec;
    const broken = structuredClone(spec);
    broken.massing.customPlates!.value[0].polygonMm[0] = [
      [0, 0],
      [1_000, 0],
    ];
    expect(BuildingSpecSchema.safeParse(broken).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Boundaries → plates                                                 */
/* ------------------------------------------------------------------ */

describe("compileBlueprintToSpec — boundaries", () => {
  it("keeps an L-shaped plan L-shaped instead of filling the notch", () => {
    const { spec } = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED });

    expect(spec.massing.strategy.value).toBe("custom");
    const plates = spec.massing.customPlates?.value ?? [];
    expect(plates).toHaveLength(1);
    expect(plates[0].floorNos).toEqual([1, 2, 3]);

    const outer = plates[0].polygonMm[0];
    expect(outer).toHaveLength(6);

    // Recentred on the plate's bbox centre, so the notch corner is the test.
    const expected: [number, number][] = [
      [-20_000, -15_000],
      [20_000, -15_000],
      [20_000, 0],
      [-5_000, 0],
      [-5_000, 15_000],
      [-20_000, 15_000],
    ];
    for (const [ex, ez] of expected) {
      const hit = outer.some(
        ([x, z]) =>
          Math.abs(x - ex) <= TESSELLATION_TOLERANCE_MM &&
          Math.abs(z - ez) <= TESSELLATION_TOLERANCE_MM,
      );
      expect(hit, `missing vertex ${ex},${ez}`).toBe(true);
    }

    // 825 m² of L, not 1,200 m² of bounding box.
    const massing = generateMassing(spec);
    expect(polygonArea(massing.primary)).toBeCloseTo(825, 1);
    expect(spec.massing.widthMm.value).toBe(40_000);
    expect(spec.massing.depthMm.value).toBe(30_000);
  });

  it("gives every level named by the boundary its own plate", () => {
    const { spec } = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED });
    expect(spec.levels.map((l) => l.floorNo)).toEqual([1, 2, 3]);

    const massing = generateMassing(spec);
    expect(massing.plates.map((p) => p.floorNo)).toEqual([1, 2, 3]);
    expect(massing.variesByLevel).toBe(false);
    for (const plate of massing.plates) {
      expect(plate.areaSqm).toBeCloseTo(825, 1);
    }
  });

  it("carries a drawn void through as a real hole in the plate", () => {
    const { spec } = compileBlueprintToSpec(courtyardBlueprint(), { seed: SEED });

    const plates = spec.massing.customPlates?.value ?? [];
    expect(plates[0].polygonMm).toHaveLength(2);

    const massing = generateMassing(spec);
    expect(massing.primary).toHaveLength(2);
    // 40 × 30 minus a 12 × 9 courtyard.
    expect(polygonArea(massing.primary)).toBeCloseTo(1_200 - 108, 1);
    expect(ringArea(massing.primary[1])).toBeCloseTo(108, 1);
  });

  it("winds the outer ring counter-clockwise and every hole clockwise", () => {
    const { spec } = compileBlueprintToSpec(courtyardBlueprint(), { seed: SEED });
    const massing = generateMassing(spec);
    expect(signedArea(massing.primary[0])).toBeGreaterThan(0);
    expect(signedArea(massing.primary[1])).toBeLessThan(0);
  });

  it("refuses a blueprint with no boundary rather than inventing a footprint", () => {
    expect(() => compileBlueprintToSpec(emptyBlueprint("Nothing"), { seed: SEED })).toThrow(
      /no usable boundary/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Rotated wings                                                       */
/* ------------------------------------------------------------------ */

describe("compileBlueprintToSpec — rotated wings", () => {
  it("preserves both wings' orientations in one plate", () => {
    const { spec } = compileBlueprintToSpec(twoWingBlueprint(), { seed: SEED });
    const outer = (spec.massing.customPlates?.value ?? [])[0].polygonMm[0];
    const angles = edgeAnglesDeg(outer);

    expect(hasAngle(angles, 0)).toBe(true); // wing A, world axes
    expect(hasAngle(angles, 90)).toBe(true);
    expect(hasAngle(angles, 30)).toBe(true); // wing B, rotated
    expect(hasAngle(angles, 120)).toBe(true);

    // A bounding box would have exactly four edges at 0/90.
    expect(outer.length).toBeGreaterThan(4);
  });

  it("carries the blueprint grid through as a local structural grid", () => {
    const { spec } = compileBlueprintToSpec(twoWingBlueprint(), { seed: SEED });
    const grids = spec.structure.localGrids?.value ?? [];
    expect(grids).toHaveLength(1);
    expect(grids[0].id).toBe("wing-b-grid");
    expect(grids[0].rotationRad).toBeCloseTo(WING_ROTATION_RAD, 12);
    expect(grids[0].xSpacingsMm).toEqual([8_000, 8_000]);
    expect(grids[0].regionPolygonMm).toBeDefined();
    // The primary bay reads off the same grid.
    expect(spec.structure.gridXMm.value).toBe(8_000);
  });

  it("marches the wing's columns along the rotated lattice", () => {
    const { spec } = compileBlueprintToSpec(twoWingBlueprint(), { seed: SEED });
    const { levels, plate } = contextFor(spec);
    const grids = generateGrid({ spec, plate });
    const { columns } = generateStructure({ spec, levels, grids, plate });

    const grid = (spec.structure.localGrids?.value ?? [])[0];
    const frame = {
      originX: grid.originMm.x / 1000,
      originZ: grid.originMm.z / 1000,
      rotationRad: grid.rotationRad,
    };

    const local = columns.filter((c) => c.gridRef.startsWith("wing-b-grid:"));
    expect(local.length).toBeGreaterThan(0);

    const xNodes = [0, 8, 16];
    const zNodes = [0, 8];
    for (const column of local) {
      const [u, v] = toLocalPoint(frame, [column.x, column.z]);
      expect(xNodes.some((n) => Math.abs(n - u) < 1e-6), `local u=${u}`).toBe(true);
      expect(zNodes.some((n) => Math.abs(n - v) < 1e-6), `local v=${v}`).toBe(true);
      // Off the world axes: a global-grid column could not sit here.
      expect(Math.abs(column.x - Math.round(column.x)) + Math.abs(column.z)).toBeGreaterThan(0);
    }

    // The wing's own bay, measured in the world, is still 8 m.
    const byName = new Map(local.map((c) => [c.gridRef, c]));
    const a1 = byName.get("wing-b-grid:A-1");
    const b1 = byName.get("wing-b-grid:B-1");
    expect(a1).toBeDefined();
    expect(b1).toBeDefined();
    expect(Math.hypot(b1!.x - a1!.x, b1!.z - a1!.z)).toBeCloseTo(8, 6);
    // …and it runs at 30°, not along +X.
    expect((Math.atan2(b1!.z - a1!.z, b1!.x - a1!.x) * 180) / Math.PI).toBeCloseTo(30, 6);
  });

  it("yields the claimed region to the local grid instead of doubling up", () => {
    const { spec } = compileBlueprintToSpec(twoWingBlueprint(), { seed: SEED });
    const { levels, plate } = contextFor(spec);
    const grids = generateGrid({ spec, plate });
    const { columns, beams } = generateStructure({ spec, levels, grids, plate });

    const grid = (spec.structure.localGrids?.value ?? [])[0];
    const region: GeomPolygon = grid.regionPolygonMm!.map((ring) =>
      ring.map(([x, z]): [number, number] => [x / 1000, z / 1000]),
    );

    const global = columns.filter((c) => !c.gridRef.includes(":"));
    expect(global.length).toBeGreaterThan(0);
    for (const column of global) {
      expect(pointInPolygon([column.x, column.z], region, 1e-9)).toBe(false);
    }

    // Beams stay inside their family: every span matches a bay of one grid.
    const localBay = 8;
    for (const beam of beams) {
      const length = Math.hypot(beam.end[0] - beam.start[0], beam.end[1] - beam.start[1]);
      const globalBay =
        Math.abs(length - spec.structure.gridXMm.value / 1000) < 1e-6 ||
        Math.abs(length - spec.structure.gridZMm.value / 1000) < 1e-6;
      expect(globalBay || Math.abs(length - localBay) < 1e-6).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Program, levels, core                                               */
/* ------------------------------------------------------------------ */

describe("compileBlueprintToSpec — inferred content", () => {
  it("turns zones into program items sized from their real area", () => {
    let blueprint = lShapedBlueprint();
    blueprint = addZone(blueprint, {
      id: "labs",
      program: "laboratory",
      region: {
        kind: "rect",
        originMm: p(10_000, 7_000),
        widthMm: 20_000,
        depthMm: 10_000,
        rotationRad: 0,
      },
      floorNos: [2, 3],
      label: "Lab Floor",
    });

    const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
    const lab = spec.program.find((item) => item.id === "labs");
    expect(lab).toBeDefined();
    expect(lab!.type).toBe("laboratory");
    expect(lab!.levels).toEqual([2, 3]);
    // 20 m × 10 m of drawn zone, per level — not multiplied by the level count.
    expect(lab!.targetAreaSqmPerLevel).toBeCloseTo(200, 1);

    // A laboratory zone makes this a research building.
    expect(spec.project.use).toBe("research");

    // Circulation and restrooms exist even though nobody drew them.
    expect(spec.program.some((item) => item.type === "corridor")).toBe(true);
    expect(spec.program.some((item) => item.type === "restroom")).toBe(true);
  });

  it("defaults to office and still emits a valid program with no zones", () => {
    const { spec } = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED });
    expect(spec.project.use).toBe("office");
    expect(spec.program.length).toBeGreaterThan(0);
    expect(spec.program.every((item) => item.levels.length > 0)).toBe(true);
    expect(spec.levels.every((level) => level.floorNo !== 0)).toBe(true);
  });

  it("sites the core from the drawn core intent", () => {
    const blueprint = addCore(lShapedBlueprint(), {
      id: "core-1",
      region: {
        kind: "rect",
        originMm: p(8_000, 7_000),
        widthMm: 9_000,
        depthMm: 6_000,
        rotationRad: 0,
      },
      floorNos: [1, 2, 3],
    });

    const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(spec.core.widthMm.value).toBe(9_000);
    expect(spec.core.depthMm.value).toBe(6_000);
    // Blueprint centre (8000, 7000) against a plate centred on (20000, 15000).
    expect(spec.core.offsetXMm).toBeCloseTo(-12_000, 0);
    expect(spec.core.offsetZMm).toBeCloseTo(-8_000, 0);
    expect(spec.core.widthMm.source).toBe("USER_PROVIDED");
  });

  it("falls back to a sized core when the blueprint drew none", () => {
    const { spec } = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED });
    expect(spec.core.offsetXMm).toBe(0);
    expect(spec.core.offsetZMm).toBe(0);
    expect(spec.core.widthMm.source).toBe("DERIVED");
    expect(spec.assumptions.some((a) => a.id === "core")).toBe(true);
  });

  it("marks natively drawn geometry USER_PROVIDED and inferred content otherwise", () => {
    const { spec } = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED });
    expect(spec.massing.customPlates?.source).toBe("USER_PROVIDED");
    expect(spec.massing.customPlates?.confidence).toBe(1);

    const traced: BlueprintSpec = {
      ...lShapedBlueprint(),
      source: "image",
      coordinateSystem: {
        units: "mm",
        sourceScaleRatio: {
          value: 100,
          source: "INFERRED",
          confidence: 0.6,
          reason: "Read from a title block.",
        },
        method: "known-element",
        calibrated: true,
        calibrationConfidence: 0.6,
      },
    };
    const tracedSpec = compileBlueprintToSpec(traced, { seed: SEED }).spec;
    expect(tracedSpec.massing.customPlates?.source).toBe("INFERRED");
    expect(tracedSpec.massing.customPlates?.confidence).toBeCloseTo(0.6, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Locks                                                               */
/* ------------------------------------------------------------------ */

describe("compileBlueprintToSpec — fidelity locks", () => {
  it("emits no locks for a guided blueprint", () => {
    expect(compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED }).locks).toEqual([]);
  });

  it("locks massing for an exact boundary and core for an exact core", () => {
    let blueprint = addBoundary(emptyBlueprint("Exact Plan"), {
      loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 20_000 }),
      floorNos: [1, 2],
      fidelity: "exact",
    });
    blueprint = addCore(blueprint, {
      id: "core-1",
      region: {
        kind: "rect",
        originMm: p(15_000, 10_000),
        widthMm: 8_000,
        depthMm: 6_000,
        rotationRad: 0,
      },
      floorNos: [1, 2],
    });
    blueprint = {
      ...blueprint,
      fidelityOverrides: [
        { targetId: "core-1", mode: "exact", reason: "The core was measured." },
      ],
    };

    const { locks } = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(locks).toEqual(["system:core", "system:massing"]);
    // The grammar `session/locks.ts` parses: "<kind>:<payload>".
    for (const token of locks) {
      expect(token).toMatch(/^system:[a-z]+$/);
    }
  });

  it("does not mutate the spec to express a lock", () => {
    const blueprint = addBoundary(emptyBlueprint("Exact Plan"), {
      loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 20_000 }),
      floorNos: [1],
      fidelity: "exact",
    });
    const { spec, locks } = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(locks).toContain("system:massing");
    expect(JSON.stringify(spec)).not.toContain("system:massing");
  });
});

/* ------------------------------------------------------------------ */
/* Custom massing                                                      */
/* ------------------------------------------------------------------ */

describe("generateMassing — custom plates", () => {
  const rect = (halfW: number, halfD: number): [number, number][][] => [
    [
      [-halfW, -halfD],
      [halfW, -halfD],
      [halfW, halfD],
      [-halfW, halfD],
    ],
  ];

  /** Levels 1–4, plates drawn only on 1 and 3. */
  function steppedSpec(): BuildingSpec {
    const base = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED }).spec;
    const levels = [1, 2, 3, 4].map((floorNo) => ({
      floorNo,
      name: `L0${floorNo}`,
      floorToFloorMm: 3_900,
      usage: "occupied" as const,
    }));
    return BuildingSpecSchema.parse({
      ...base,
      levels,
      massing: {
        ...base.massing,
        customPlates: {
          ...base.massing.customPlates!,
          value: [
            { floorNos: [1], polygonMm: rect(20_000, 15_000) },
            { floorNos: [3], polygonMm: rect(10_000, 10_000) },
          ],
        },
      },
    });
  }

  it("gives an unnamed level the nearest named plate, preferring the one below", () => {
    const massing = generateMassing(steppedSpec());
    const areaOf = (floorNo: number) =>
      massing.plates.find((p) => p.floorNo === floorNo)!.areaSqm;

    expect(areaOf(1)).toBeCloseTo(40 * 30, 6);
    expect(areaOf(3)).toBeCloseTo(20 * 20, 6);
    // Level 2 is equidistant from 1 and 3; the tie goes downwards.
    expect(areaOf(2)).toBeCloseTo(areaOf(1), 9);
    // Level 4 continues the last plate that was actually drawn.
    expect(areaOf(4)).toBeCloseTo(areaOf(3), 9);
    expect(massing.variesByLevel).toBe(true);
    expect(massing.primary).toBe(
      massing.plates.find((p) => p.floorNo === 1)!.polygon,
    );
  });

  it("repairs the winding of a clockwise plate rather than rejecting it", () => {
    const base = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED }).spec;
    const reversed = base.massing.customPlates!.value[0].polygonMm[0].slice().reverse();
    const spec = BuildingSpecSchema.parse({
      ...base,
      massing: {
        ...base.massing,
        customPlates: {
          ...base.massing.customPlates!,
          value: [{ floorNos: [1, 2, 3], polygonMm: [reversed] }],
        },
      },
    });

    const massing = generateMassing(spec);
    expect(signedArea(massing.primary[0])).toBeGreaterThan(0);
    expect(polygonArea(massing.primary)).toBeCloseTo(825, 1);
  });

  it("falls back to the declared bounding box when no plates arrived", () => {
    const base = compileBlueprintToSpec(lShapedBlueprint(), { seed: SEED }).spec;
    const spec = BuildingSpecSchema.parse({
      ...base,
      massing: { ...base.massing, customPlates: undefined },
    });

    const massing = generateMassing(spec);
    expect(massing.primary).toHaveLength(1);
    expect(massing.primary[0]).toHaveLength(4);
    expect(polygonArea(massing.primary)).toBeCloseTo(40 * 30, 6);
    expect(massing.variesByLevel).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Contract + determinism                                              */
/* ------------------------------------------------------------------ */

describe("compileBlueprintToSpec — contract", () => {
  it("produces a spec the schema accepts", () => {
    for (const blueprint of [lShapedBlueprint(), courtyardBlueprint(), twoWingBlueprint()]) {
      const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
      expect(() => BuildingSpecSchema.parse(spec)).not.toThrow();
      expect(spec.units).toBe("mm");
      expect(spec.generationSeed).toBe(SEED);
    }
  });

  it("satisfies the massing invariants every strategy shares", () => {
    for (const blueprint of [lShapedBlueprint(), courtyardBlueprint(), twoWingBlueprint()]) {
      const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
      const massing = generateMassing(spec);

      expect(massing.plates.map((p) => p.floorNo)).toEqual(
        spec.levels.map((l) => l.floorNo).sort((a, b) => a - b),
      );
      const largest = massing.plates.reduce((a, b) => (b.areaSqm > a.areaSqm ? b : a));
      expect(massing.primary).toBe(largest.polygon);

      const bounds = polygonBounds(massing.primary);
      expect(massing.widthM).toBeCloseTo(bounds.maxX - bounds.minX, 9);
      expect(massing.depthM).toBeCloseTo(bounds.maxZ - bounds.minZ, 9);
      for (const plate of massing.plates) {
        expect(plate.areaSqm).toBeCloseTo(polygonArea(plate.polygon), 9);
        expect(plate.areaSqm).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic for the same blueprint and seed", () => {
    const blueprint = twoWingBlueprint();
    const a = compileBlueprintToSpec(blueprint, { seed: SEED, prompt: "as drawn" });
    const b = compileBlueprintToSpec(blueprint, { seed: SEED, prompt: "as drawn" });
    expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
    expect(a.locks).toEqual(b.locks);

    // …and so is everything the spec drives.
    const first = generateMassing(a.spec);
    const second = generateMassing(b.spec);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("does not mutate the blueprint it was given", () => {
    const blueprint = twoWingBlueprint();
    const before = JSON.stringify(blueprint);
    compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(JSON.stringify(blueprint)).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* Entrance anchors                                                    */
/* ------------------------------------------------------------------ */

/** 40 × 30 m rectangle drawn from the origin corner, levels 1–2. */
function rectBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Entrance Plan"), {
    loop: makeRectLoop("outline", { xMm: 0, zMm: 0, widthMm: 40_000, depthMm: 30_000 }),
    floorNos: [1, 2],
  });
}

describe("compileBlueprintToSpec — entrance anchors", () => {
  // +Z is north (`generate/partitions.ts`), so the high-Z edge of the drawn
  // rectangle is its north elevation.
  const cases: Array<[string, PointMm, string]> = [
    ["north", p(20_000, 29_500), "north"],
    ["south", p(20_000, 500), "south"],
    ["east", p(39_500, 15_000), "east"],
    ["west", p(500, 15_000), "west"],
  ];

  for (const [edge, positionMm, facade] of cases) {
    it(`puts the entrance on the ${edge} facade when that is where it was drawn`, () => {
      const blueprint = addAnchor(rectBlueprint(), {
        id: "front-door",
        kind: "entrance",
        positionMm,
      });
      const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
      expect(spec.orientation.primaryEntranceFacade).toBe(facade);
    });
  }

  it("reads a door marker dropped just outside the wall line", () => {
    const blueprint = addAnchor(rectBlueprint(), {
      id: "front-door",
      kind: "entrance",
      positionMm: p(20_000, 30_800),
    });
    const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(spec.orientation.primaryEntranceFacade).toBe("north");
  });

  it("keeps the south default when no entrance anchor was drawn", () => {
    for (const blueprint of [lShapedBlueprint(), rectBlueprint()]) {
      const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
      expect(spec.orientation.primaryEntranceFacade).toBe("south");
      const entrance = spec.assumptions.find((a) => a.id === "entrance");
      expect(entrance?.source).toBe("DEFAULT");
    }
  });

  it("ignores anchors that are not entrances", () => {
    const blueprint = addAnchor(rectBlueprint(), {
      id: "north-core",
      kind: "core",
      positionMm: p(20_000, 29_500),
    });
    const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(spec.orientation.primaryEntranceFacade).toBe("south");
  });

  it("lets a hard anchor beat a soft one drawn earlier", () => {
    let blueprint = addAnchor(rectBlueprint(), {
      id: "maybe-west",
      kind: "entrance",
      positionMm: p(500, 15_000),
      hold: { mode: "soft", toleranceMm: 5_000 },
    });
    blueprint = addAnchor(blueprint, {
      id: "definitely-north",
      kind: "entrance",
      positionMm: p(20_000, 29_500),
      hold: { mode: "hard" },
    });

    const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(spec.orientation.primaryEntranceFacade).toBe("north");
    // The extras are neither obeyed nor silently dropped.
    expect(spec.assumptions.some((a) => a.id === "entrance-secondary")).toBe(true);
  });

  it("takes the first of two equally held entrances and says so", () => {
    let blueprint = addAnchor(rectBlueprint(), {
      id: "east-door",
      kind: "entrance",
      positionMm: p(39_500, 15_000),
    });
    blueprint = addAnchor(blueprint, {
      id: "west-door",
      kind: "entrance",
      positionMm: p(500, 15_000),
    });

    const { spec } = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(spec.orientation.primaryEntranceFacade).toBe("east");
    expect(spec.assumptions.some((a) => a.id === "entrance-secondary")).toBe(true);
  });

  it("files the entrance as user-drawn, not as an assumption to review", () => {
    const drawn = addAnchor(rectBlueprint(), {
      id: "front-door",
      kind: "entrance",
      positionMm: p(20_000, 29_500),
    });
    const { spec } = compileBlueprintToSpec(drawn, { seed: SEED });
    // Nothing to review: the user drew it, so no assumption is filed.
    expect(spec.assumptions.find((a) => a.id === "entrance")).toBeUndefined();

    const traced: BlueprintSpec = {
      ...drawn,
      source: "image",
      coordinateSystem: {
        units: "mm",
        sourceScaleRatio: {
          value: 100,
          source: "INFERRED",
          confidence: 0.6,
          reason: "Read from a title block.",
        },
        method: "known-element",
        calibrated: true,
        calibrationConfidence: 0.6,
      },
    };
    const tracedSpec = compileBlueprintToSpec(traced, { seed: SEED }).spec;
    expect(tracedSpec.orientation.primaryEntranceFacade).toBe("north");
    const entrance = tracedSpec.assumptions.find((a) => a.id === "entrance");
    expect(entrance?.source).toBe("INFERRED");
    expect(entrance?.confidence).toBeCloseTo(0.6, 6);
  });

  it("still produces a schema-valid, deterministic spec", () => {
    const blueprint = addAnchor(rectBlueprint(), {
      id: "front-door",
      kind: "entrance",
      positionMm: p(20_000, 29_500),
    });
    const a = compileBlueprintToSpec(blueprint, { seed: SEED });
    const b = compileBlueprintToSpec(blueprint, { seed: SEED });
    expect(() => BuildingSpecSchema.parse(a.spec)).not.toThrow();
    expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
  });
});
