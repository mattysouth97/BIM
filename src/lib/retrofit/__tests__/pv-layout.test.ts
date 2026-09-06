// Stage-5 geometric invariants for the PV layout library.
//
// These are the checks the bounding-box grid could never pass: the point of
// the methodology is that a module cannot be drawn where a roof is not, so
// the tests assert containment, spacing and pose against the geometry rather
// than against a count somebody expected.
//
// Built on a hand-written fixture of the stage-1 `roof-planes.json` shape
// until bim-83's artifacts land, per the doc.

import { describe, it, expect } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  layoutPlane,
  layoutRoofPlanes,
  planeExclusion,
  usableAreaFor,
  rackRowPitchM,
  rectangleFits,
  ringAreaSqm,
  polygonAreaSqm,
  toPolygons,
  PV_MODULE_LENGTH_M,
  PV_MODULE_WIDTH_M,
  PV_PANEL_RATED_KWP,
  PV_MODULE_GAP_M,
  PV_SETBACK_FLAT_M,
  PV_SETBACK_PITCHED_M,
  PV_OBSTRUCTION_CLEARANCE_M,
  PV_FIXED_RACK_TILT_DEG,
  PV_LAYOUT_LATITUDE_DEG,
  WINTER_SOLSTICE_DECLINATION_DEG,
  type RoofPlane,
  type RoofPlaneSet,
  type PlanRing,
} from "../pv-layout";
import { calculateSolarPotential } from "../solar-potential";

const MODULE_AREA = PV_MODULE_LENGTH_M * PV_MODULE_WIDTH_M;

/** A rectangular plan ring, counter-clockwise in XZ. */
function rect(x0: number, z0: number, w: number, d: number): PlanRing {
  return [
    [x0, z0],
    [x0 + w, z0],
    [x0 + w, z0 + d],
    [x0, z0 + d],
  ];
}

function flatPlane(over: Partial<RoofPlane> = {}): RoofPlane {
  return {
    id: "plane-flat",
    elementName: "Flat deck",
    elementType: "IfcSlab",
    normal: [0, 1, 0],
    tiltDeg: 0,
    azimuthDeg: null,
    surfaceSqm: 400,
    projectedSqm: 400,
    minElevationM: 10,
    maxElevationM: 10,
    outline: [rect(0, 0, 20, 20)],
    ...over,
  };
}

function pitchedPlane(over: Partial<RoofPlane> = {}): RoofPlane {
  const tilt = 30;
  const t = (tilt * Math.PI) / 180;
  // South is +Z after IFC +Y north becomes web-ifc -Z.
  return {
    id: "plane-south",
    elementName: "Dach-1",
    elementType: "IfcSlab",
    normal: [0, Math.cos(t), Math.sin(t)],
    tiltDeg: tilt,
    azimuthDeg: 180,
    surfaceSqm: 200 / Math.cos(t),
    projectedSqm: 200,
    minElevationM: 6,
    maxElevationM: 9,
    outline: [rect(0, 0, 20, 10)],
    ...over,
  };
}

/** The plan corners of a module, rebuilt from its pose and dimensions. */
function planCorners(
  centre: readonly [number, number, number],
  azimuthDeg: number,
  tiltDeg: number,
  alongU: number,
  alongV: number,
): [number, number][] {
  const a = (azimuthDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dz = -Math.cos(a);
  const sx = dz;
  const sz = -dx;
  const hu = alongU / 2;
  const hv = (alongV * Math.cos((tiltDeg * Math.PI) / 180)) / 2;
  const [cx, , cz] = centre;
  return [
    [cx - sx * hu - dx * hv, cz - sz * hu - dz * hv],
    [cx + sx * hu - dx * hv, cz + sz * hu - dz * hv],
    [cx + sx * hu + dx * hv, cz + sz * hu + dz * hv],
    [cx - sx * hu + dx * hv, cz - sz * hu + dz * hv],
  ];
}

describe("ring and polygon helpers", () => {
  it("does not miss a small enclosed hole or a narrow notch between edge samples", () => {
    const panel = rect(1, 1, 1.7, 1);
    expect(rectangleFits(panel, { outer: rect(0, 0, 5, 5), holes: [rect(1.1, 1.1, 0.02, 0.02)] }, [])).toBe(false);
    expect(rectangleFits(panel, { outer: rect(0, 0, 5, 5) }, [rect(1.1, 1.1, 0.02, 0.02)])).toBe(false);
    const notched: PlanRing = [[0, 0], [1.1, 0], [1.1, 1.2], [1.12, 1.2], [1.12, 0], [5, 0], [5, 5], [0, 5]];
    expect(rectangleFits(panel, { outer: notched }, [])).toBe(false);
  });
  it("measures a rectangle and subtracts its holes", () => {
    expect(ringAreaSqm(rect(0, 0, 20, 10))).toBeCloseTo(200, 9);
    expect(
      polygonAreaSqm({ outer: rect(0, 0, 20, 10), holes: [rect(5, 4, 2, 2)] }),
    ).toBeCloseTo(196, 9);
  });

  it("rejects a rectangle that spans the mouth of a concave region", () => {
    // A C-shape: all four corners of a wide rectangle can sit inside while
    // the middle crosses the notch. Corner-only containment would pass it.
    const c: PlanRing = [
      [0, 0], [10, 0], [10, 3], [4, 3], [4, 7], [10, 7], [10, 10], [0, 10],
    ];
    const spanning = [
      [1, 4], [9, 4], [9, 6], [1, 6],
    ] as [number, number][];
    expect(rectangleFits(spanning, { outer: c }, [])).toBe(false);
    const inside = [
      [1, 4], [3, 4], [3, 6], [1, 6],
    ] as [number, number][];
    expect(rectangleFits(inside, { outer: c }, [])).toBe(true);
  });
});

describe("disconnected pieces belong to the same measured roof plane", () => {
  it("sums all pieces before the area guard and lays out each piece without spanning gaps", () => {
    const outers = [rect(0, 0, 8, 8), rect(15, 0, 8, 8), rect(30, 0, 8, 8)];
    const plane = flatPlane({
      projectedSqm: 192, surfaceSqm: 192,
      outline: outers.map((points) => ({ kind: "outer", points })),
    });
    const layout = layoutPlane(plane);
    expect(layout.excludedReason).toBeNull();
    expect(layout.grossProjectedSqm).toBe(192);
    expect(layout.usableSqm).toBeCloseTo(3 * 6 * 6, 9);
    const singleCount = layoutPlane(flatPlane({ projectedSqm: 64, outline: [outers[0]] })).moduleCount;
    expect(singleCount).toBeGreaterThan(0);
    expect(layout.moduleCount).toBe(singleCount * 3);
    expect(layout.kWp).toBe(layout.moduleCount * PV_PANEL_RATED_KWP);
    for (const outer of outers) {
      const region = usableAreaFor({ ...plane, outline: [outer] }).regions[0];
      expect(layout.modules.some((m) => rectangleFits(
        planCorners(m.centre, m.azimuthDeg, m.tiltDeg, PV_MODULE_LENGTH_M, PV_MODULE_WIDTH_M), region, [],
      ))).toBe(true);
    }
    expect(layout.modules.every((m) => m.planeId === plane.id)).toBe(true);
    expect(new Set(layout.modules.map((m) => m.centre.join(","))).size).toBe(layout.moduleCount);
    expect(layoutPlane(plane)).toEqual(layout);
  });

  it("keeps holes with their containing piece even when hole tags come first", () => {
    const firstHole = rect(3, 3, 2, 2), secondHole = rect(23, 3, 2, 2);
    const plane = flatPlane({
      projectedSqm: 280,
      outline: [
        { kind: "hole", points: secondHole }, { kind: "hole", points: firstHole },
        { kind: "outer", points: rect(0, 0, 12, 12) },
        { kind: "outer", points: rect(20, 0, 12, 12) },
      ],
      obstructions: [{ kind: "plant", elementName: "AHU", plan: rect(8, 8, 2, 2) }],
    });
    const polygons = toPolygons(plane.outline);
    expect(polygons[0].holes).toEqual([firstHole]);
    expect(polygons[1].holes).toEqual([secondHole]);
    const usable = usableAreaFor(plane);
    expect(usable.usableSqm).toBeCloseTo(2 * (100 - 16) - 9, 9);
    expect(280 - usable.subtractions.reduce((s, row) => s + row.areaSqm, 0)).toBeCloseTo(usable.usableSqm, 9);
    for (const m of layoutPlane(plane).modules) {
      const corners = planCorners(m.centre, m.azimuthDeg, m.tiltDeg, PV_MODULE_LENGTH_M, PV_MODULE_WIDTH_M);
      expect(usable.regions.some((region) => rectangleFits(corners, region, usable.blocked))).toBe(true);
    }
  });

  it("charges an obstruction crossing two pieces only for the roof it removes", () => {
    const plane = flatPlane({
      projectedSqm: 200,
      outline: [
        { kind: "outer", points: rect(0, 0, 10, 10) },
        { kind: "outer", points: rect(11, 0, 10, 10) },
      ],
      obstructions: [{ kind: "plant", elementName: "Spanning plant", plan: rect(8, 3, 5, 2) }],
    });
    const usable = usableAreaFor(plane);
    expect(usable.usableSqm).toBeCloseTo(2 * 64 - 9, 9);
    expect(usable.subtractions.find((s) => s.kind === "plant")?.areaSqm).toBeCloseTo(9, 9);
  });

  it("does not double count overlapping obstruction clearances", () => {
    const usable = usableAreaFor(flatPlane({ obstructions: [
      { kind: "plant", elementName: "A", plan: rect(8, 8, 2, 2) },
      { kind: "plant", elementName: "B", plan: rect(9, 8, 2, 2) },
    ] }));
    expect(usable.usableSqm).toBeCloseTo(324 - 12, 9);
    expect(usable.subtractions.filter((s) => s.kind === "plant").map((s) => s.areaSqm)).toEqual([9, 3]);
  });

  it("a narrow piece cannot invert through its setback and become a fake module platform", () => {
    const sliver = rect(0, 0, 0.078, 5.31);
    const clear = rect(10, 0, 8, 8);
    const plane = flatPlane({
      projectedSqm: 64 + 0.078 * 5.31,
      outline: [{ kind: "outer", points: sliver }, { kind: "outer", points: clear }],
    });
    const usable = usableAreaFor(plane);
    expect(usable.regions).toHaveLength(1);
    expect(usable.usableSqm).toBeCloseTo(36, 9);
    expect(layoutPlane(plane).modules.every((m) => m.centre[0] > 10)).toBe(true);
    const rotated = sliver.map(([x, z]) => [(x - z) / Math.SQRT2, (x + z) / Math.SQRT2] as const);
    expect(usableAreaFor(flatPlane({ outline: [rotated] })).regions).toHaveLength(0);
  });
});

describe("the actual rendered box matches the layout footprint and measured plane", () => {
  const cases = [flatPlane(), flatPlane({ tiltDeg: 5, normal: [Math.sin(Math.PI / 36), Math.cos(Math.PI / 36), 0] }),
    pitchedPlane({ projectedSqm: 400, outline: [
      { kind: "outer", points: rect(0, 0, 20, 10) },
      { kind: "outer", points: rect(0, 20, 20, 10) },
    ] }), ...[60, 90, 135, 180, 225, 270, 300].map((azimuthDeg) => {
    const a = azimuthDeg * Math.PI / 180, t = Math.PI / 6;
    return pitchedPlane({ azimuthDeg, normal: [Math.sin(a) * Math.sin(t), Math.cos(t), -Math.cos(a) * Math.sin(t)] });
  })];
  for (const plane of cases) {
    it(`local X=1.7/Z=1.0 corners at tilt ${plane.tiltDeg}, azimuth ${plane.azimuthDeg}`, () => {
      const layout = layoutPlane(plane);
      const pitched = plane.tiltDeg >= 10;
      const [nx, ny, nz] = plane.normal;
      const offset = ny * plane.maxElevationM + Math.min(...toPolygons(plane.outline).flatMap((p) =>
        p.outer.map(([x, z]) => nx * x + nz * z)));
      expect(layout.modules.length).toBeGreaterThan(0);
      for (const panel of layout.modules) {
        const q = new Quaternion(...panel.quaternion);
        const expected = planCorners(panel.centre, panel.azimuthDeg, panel.tiltDeg,
          pitched ? PV_MODULE_WIDTH_M : PV_MODULE_LENGTH_M, pitched ? PV_MODULE_LENGTH_M : PV_MODULE_WIDTH_M);
        const actual = [-1, 1].flatMap((x) => [-1, 1].map((z) =>
          new Vector3(x * PV_MODULE_LENGTH_M / 2, 0, z * PV_MODULE_WIDTH_M / 2)
            .applyQuaternion(q).add(new Vector3(...panel.centre))));
        for (const corner of actual) {
          expect(expected.some(([x, z]) => Math.hypot(corner.x - x, corner.z - z) < 1e-8)).toBe(true);
          const aboveRoof = nx * corner.x + ny * corner.y + nz * corner.z - offset;
          if (pitched) expect(aboveRoof).toBeCloseTo(0, 8);
          else expect(aboveRoof).toBeGreaterThanOrEqual(-1e-8);
        }
        if (!pitched) expect(Math.min(...actual.map((p) => nx * p.x + ny * p.y + nz * p.z - offset))).toBeCloseTo(0, 8);
      }
    });
  }
});

describe("suitability is decided, named, and never silent", () => {
  it("a 63° tiled pitch is a wall in all but name", () => {
    expect(planeExclusion(pitchedPlane({ tiltDeg: 63 }))).toBe("tilt-above-60");
  });

  it("a north-facing pitch is excluded; the same plane facing south is not", () => {
    expect(planeExclusion(pitchedPlane({ azimuthDeg: 0 }))).toBe("north-facing-pitch");
    expect(planeExclusion(pitchedPlane({ azimuthDeg: 20 }))).toBe("north-facing-pitch");
    expect(planeExclusion(pitchedPlane({ azimuthDeg: 315 }))).toBe("north-facing-pitch");
    expect(planeExclusion(pitchedPlane({ azimuthDeg: 180 }))).toBeNull();
    expect(planeExclusion(pitchedPlane({ azimuthDeg: 100 }))).toBeNull();
  });

  it("a FLAT plane is never excluded for azimuth — it has none to face", () => {
    expect(planeExclusion(flatPlane({ azimuthDeg: 0 }))).toBeNull();
  });

  it("a plane smaller than one module is excluded before any geometry runs", () => {
    expect(planeExclusion(flatPlane({ projectedSqm: MODULE_AREA - 0.01 }))).toBe(
      "smaller-than-one-module",
    );
  });

  it("an excluded plane still reports its gross area and its reason", () => {
    const layout = layoutPlane(pitchedPlane({ tiltDeg: 63 }));
    expect(layout.excludedReason).toBe("tilt-above-60");
    expect(layout.moduleCount).toBe(0);
    expect(layout.grossProjectedSqm).toBeCloseTo(200, 6);
    expect(layout.mounting).toBe("none");
  });
});

describe("setback and clearance", () => {
  it("a flat roof loses 1.0 m all round, a pitch 0.3 m", () => {
    const flat = usableAreaFor(flatPlane());
    // 20×20 inset by 1.0 → 18×18.
    expect(flat.usableSqm).toBeCloseTo(18 * 18, 6);
    expect(flat.subtractions[0].kind).toBe("setback");
    expect(flat.subtractions[0].elementName).toContain("A-PV-SETBACK");

    const pitched = usableAreaFor(pitchedPlane());
    const s = PV_SETBACK_PITCHED_M;
    expect(pitched.usableSqm).toBeCloseTo((20 - 2 * s) * (10 - 2 * s), 6);
  });

  it("an obstruction is grown by its clearance and named in the subtractions", () => {
    const plane = flatPlane({
      obstructions: [
        { kind: "plant", elementName: "AHU-1", plan: rect(8, 8, 2, 2) },
      ],
    });
    const usable = usableAreaFor(plane);
    const grown = (2 + 2 * PV_OBSTRUCTION_CLEARANCE_M) ** 2;
    expect(usable.usableSqm).toBeCloseTo(18 * 18 - grown, 6);
    const row = usable.subtractions.find((s) => s.elementName === "AHU-1");
    expect(row?.kind).toBe("plant");
    expect(row?.areaSqm).toBeCloseTo(grown, 6);
  });

  it("the setback figures are the constants, so a change to them is visible here", () => {
    expect(PV_SETBACK_FLAT_M).toBe(1.0);
    expect(PV_SETBACK_PITCHED_M).toBe(0.3);
    expect(PV_OBSTRUCTION_CLEARANCE_M).toBe(0.5);
  });
});

describe("the winter-solstice row pitch", () => {
  it("follows the rule, at the latitude the climate assumption implies", () => {
    const alpha = 90 - PV_LAYOUT_LATITUDE_DEG - WINTER_SOLSTICE_DECLINATION_DEG;
    expect(alpha).toBeCloseTo(28.98, 2);
    const beta = (PV_FIXED_RACK_TILT_DEG * Math.PI) / 180;
    const expected =
      PV_MODULE_WIDTH_M * Math.cos(beta) +
      (PV_MODULE_WIDTH_M * Math.sin(beta)) / Math.tan((alpha * Math.PI) / 180);
    expect(rackRowPitchM()).toBeCloseTo(expected, 9);
    // Sanity: a 1.0 m module at 30° needs well over its own footprint.
    expect(rackRowPitchM()).toBeGreaterThan(PV_MODULE_WIDTH_M * Math.cos(beta));
  });

  it("a lower latitude packs rows tighter, a higher one spreads them", () => {
    expect(rackRowPitchM(20)).toBeLessThan(rackRowPitchM(37.57));
    expect(rackRowPitchM(50)).toBeGreaterThan(rackRowPitchM(37.57));
  });
});

describe("placed modules obey the geometry — the invariants the box grid failed", () => {
  const cases: { name: string; plane: RoofPlane; alongU: number; alongV: number }[] = [
    {
      name: "flat, racked, landscape",
      plane: flatPlane({
        obstructions: [
          { kind: "opening", elementName: "Skylight-1", plan: rect(9, 9, 1.2, 1.2) },
        ],
      }),
      alongU: PV_MODULE_LENGTH_M,
      alongV: PV_MODULE_WIDTH_M,
    },
    {
      name: "pitched, flush, portrait",
      plane: pitchedPlane(),
      alongU: PV_MODULE_WIDTH_M,
      alongV: PV_MODULE_LENGTH_M,
    },
  ];

  for (const { name, plane, alongU, alongV } of cases) {
    it(`${name}: every module's whole rectangle is inside the usable region`, () => {
      const layout = layoutPlane(plane);
      const usable = usableAreaFor(plane);
      expect(layout.moduleCount).toBeGreaterThan(0);
      for (const m of layout.modules) {
        const corners = planCorners(m.centre, m.azimuthDeg, m.tiltDeg, alongU, alongV);
        expect(
          usable.regions.some((region) => rectangleFits(corners, region, usable.blocked)),
          `${name}: a module at ${m.centre.map((n) => n.toFixed(2)).join(",")} is not inside`,
        ).toBe(true);
      }
    });

    it(`${name}: no two modules overlap`, () => {
      const layout = layoutPlane(plane);
      const boxes = layout.modules.map((m) => {
        const c = planCorners(m.centre, m.azimuthDeg, m.tiltDeg, alongU, alongV);
        const xs = c.map((p) => p[0]);
        const zs = c.map((p) => p[1]);
        return {
          minX: Math.min(...xs), maxX: Math.max(...xs),
          minZ: Math.min(...zs), maxZ: Math.max(...zs),
        };
      });
      const eps = 1e-6;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const overlaps =
            a.minX < b.maxX - eps && b.minX < a.maxX - eps &&
            a.minZ < b.maxZ - eps && b.minZ < a.maxZ - eps;
          expect(overlaps, `modules ${i} and ${j} overlap`).toBe(false);
        }
      }
    });

    it(`${name}: placed area never exceeds the usable area`, () => {
      const layout = layoutPlane(plane);
      expect(layout.moduleAreaSqm).toBeLessThanOrEqual(layout.usableSqm + 1e-9);
    });

    it(`${name}: kWp is exactly count × rating`, () => {
      const layout = layoutPlane(plane);
      expect(layout.kWp).toBeCloseTo(layout.moduleCount * PV_PANEL_RATED_KWP, 12);
    });
  }

  it("a flush module's normal IS the plane's normal", () => {
    const plane = pitchedPlane();
    const layout = layoutPlane(plane);
    for (const m of layout.modules) {
      expect(m.tiltDeg).toBeCloseTo(plane.tiltDeg, 9);
      expect(m.azimuthDeg).toBeCloseTo(plane.azimuthDeg!, 9);
    }
  });

  it("a racked module faces south at the rack tilt, whatever the deck does", () => {
    const layout = layoutPlane(flatPlane());
    for (const m of layout.modules) {
      expect(m.tiltDeg).toBe(PV_FIXED_RACK_TILT_DEG);
      expect(m.azimuthDeg).toBe(180);
    }
  });

  it("flat rows are spaced by the solstice rule, so none shades the next", () => {
    const layout = layoutPlane(flatPlane());
    // Distinct north-south row positions. Grouped at 1e-6 m, not at the
    // millimetre: rounding to mm first shortened the measured gap by 0.8 mm
    // and failed this assertion against a spacing that was in fact exact.
    const rows = [...new Set(layout.modules.map((m) => Math.round(m.centre[2] * 1e6)))]
      .sort((a, b) => a - b)
      .map((v) => v / 1e6);
    expect(rows.length).toBeGreaterThan(1);
    const pitch = rackRowPitchM();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i] - rows[i - 1]).toBeGreaterThanOrEqual(pitch - 1e-6);
    }
  });

  it("modules in a row are spaced by their own width plus the gap", () => {
    const layout = layoutPlane(flatPlane());
    const byRow = new Map<number, number[]>();
    for (const m of layout.modules) {
      const key = Math.round(m.centre[2] * 1e6);
      byRow.set(key, [...(byRow.get(key) ?? []), m.centre[0]]);
    }
    const step = PV_MODULE_LENGTH_M + PV_MODULE_GAP_M;
    for (const xs of byRow.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(step - 1e-6);
      }
    }
  });

  it("an obstruction actually removes modules rather than being decorative", () => {
    const clear = layoutPlane(flatPlane());
    const blocked = layoutPlane(
      flatPlane({
        obstructions: [
          { kind: "plant", elementName: "AHU-1", plan: rect(6, 6, 6, 6) },
        ],
      }),
    );
    expect(blocked.moduleCount).toBeLessThan(clear.moduleCount);
    expect(blocked.subtractions.some((s) => s.elementName === "AHU-1")).toBe(true);
  });

  it("a hole in the roof is not built over", () => {
    const withHole = flatPlane({
      outline: [rect(0, 0, 20, 20), rect(8, 8, 4, 4)],
    });
    const layout = layoutPlane(withHole);
    const usable = usableAreaFor(withHole);
    for (const m of layout.modules) {
      const corners = planCorners(m.centre, m.azimuthDeg, m.tiltDeg, PV_MODULE_LENGTH_M, PV_MODULE_WIDTH_M);
      expect(usable.regions.some((region) => rectangleFits(corners, region, usable.blocked))).toBe(true);
    }
    expect(layout.moduleCount).toBeLessThan(layoutPlane(flatPlane()).moduleCount);
  });
});

describe("a building total is the sum of its planes and nothing else", () => {
  it("adds up, and counts the exclusions", () => {
    const result = layoutRoofPlanes({
      kind: "bimfit_reference_building_roof_planes",
      buildingId: "fixture",
      northAssumed: true,
      planes: [
        pitchedPlane({ id: "south", azimuthDeg: 180 }),
        pitchedPlane({ id: "north", azimuthDeg: 0 }),
        flatPlane({ id: "deck" }),
      ],
    });

    expect(result.planes).toHaveLength(3);
    expect(result.excludedPlanes).toBe(1);
    expect(result.planes.find((p) => p.planeId === "north")!.excludedReason).toBe(
      "north-facing-pitch",
    );
    expect(result.totalModules).toBe(
      result.planes.reduce((s, p) => s + p.moduleCount, 0),
    );
    expect(result.totalKWp).toBeCloseTo(result.totalModules * PV_PANEL_RATED_KWP, 12);
    // Both pitches contribute gross area even though one carries no modules —
    // a utilisation table that hid the north face would be the silent drop.
    expect(result.totalGrossProjectedSqm).toBeCloseTo(200 + 200 + 400, 6);
    expect(result.northAssumed).toBe(true);
  });

  it("both faces of a gable are laid out separately, south only", () => {
    const result = layoutRoofPlanes({
      kind: "bimfit_reference_building_roof_planes",
      buildingId: "fzk-like",
      northAssumed: true,
      planes: [
        pitchedPlane({ id: "s", azimuthDeg: 180 }),
        pitchedPlane({ id: "n", azimuthDeg: 0 }),
      ],
    });
    expect(result.planes.find((p) => p.planeId === "s")!.moduleCount).toBeGreaterThan(0);
    expect(result.planes.find((p) => p.planeId === "n")!.moduleCount).toBe(0);
  });
});

describe("the economics price the modules that were drawn", () => {
  // NOTE the `undefined` in every call below: `geometricKWp` is the SIXTH
  // positional argument and the fifth is `electricityPrice`. Writing the kWp
  // in the fifth slot silently prices the system at ₩59/kWh and leaves the
  // size on the ratio path — it happened while writing these tests, and it
  // fails as a wrong number rather than as a type error, so a caller wiring
  // this up should pass the argument by position with care.
  it("a supplied geometric kWp wins over the area × ratio estimate", () => {
    const byRatio = calculateSolarPotential(2667, "flat", "seoul", 130);
    const byCount = calculateSolarPotential(2667, "flat", "seoul", 130, undefined, 59.2);

    // The ratio path turns 2,667 m² into a system nobody drew.
    expect(byRatio.systemSizeKWp).toBeCloseTo((2667 * 0.7) / 5, 6);
    expect(byRatio.systemSizeKWp).toBeGreaterThan(300);
    // The count path is exactly what was laid out.
    expect(byCount.systemSizeKWp).toBe(59.2);

    // And every downstream figure follows the size, not the area.
    expect(byCount.estimatedCost).toBeLessThan(byRatio.estimatedCost);
    expect(byCount.annualGenerationKWh).toBeLessThan(byRatio.annualGenerationKWh);
    expect(byCount.co2Reduction).toBeLessThan(byRatio.co2Reduction);
  });

  it("the description says which basis sized it, so the two cannot be confused", () => {
    expect(calculateSolarPotential(2667, "flat", "seoul", 130, undefined, 59.2).description).toContain(
      "measured roof planes",
    );
    expect(calculateSolarPotential(2667, "flat", "seoul", 130).description).toContain(
      "has not been measured into planes",
    );
  });

  it("a measured roof that fits NOTHING is priced at zero, not at its area", () => {
    // The honest end of the same rule: a roof whose planes carry no module
    // must not be sold a system. `0` is a real answer and must not be read
    // as "no figure supplied".
    const none = calculateSolarPotential(2667, "flat", "seoul", 130, undefined, 0);
    expect(none.systemSizeKWp).toBe(0);
    expect(none.annualGenerationKWh).toBe(0);
    expect(none.estimatedCost).toBe(0);
  });

  it("a laid-out plane's kWp is what the economics is handed", () => {
    const layout = layoutRoofPlanes({
      kind: "bimfit_reference_building_roof_planes",
      buildingId: "fixture",
      northAssumed: true,
      planes: [flatPlane({ id: "deck" })],
    });
    const measure = calculateSolarPotential(
      layout.totalGrossProjectedSqm,
      "flat",
      "seoul",
      130,
      undefined,
      layout.totalKWp,
    );
    expect(measure.systemSizeKWp).toBeCloseTo(layout.totalModules * PV_PANEL_RATED_KWP, 12);
  });
});

describe("against the real stage-1 artifact, not a fixture", () => {
  it.each([
    { id: "bs-medical-dental-clinic", count: 453, gross: 2592.012572, usableSqm: 1693.57875 },
    { id: "schependomlaan", count: 10, gross: 359.965591, usableSqm: 73.8249577442148 },
    { id: "duplex-apartment", count: 14, gross: 132.922236, usableSqm: 80.15519 },
    { id: "fzk-haus", count: 44, gross: 143, usableSqm: 121.52 },
  ])(
    "$id: every piece is counted and every drawn underside clears its measured roof",
    async ({ id, count, gross, usableSqm }) => {
      const raw = (await import(`../../../../public/reference-buildings/${id}/roof-planes.json`)) as { default?: unknown };
      const file = (raw.default ?? raw) as RoofPlaneSet;
      const result = layoutRoofPlanes(file);
      expect(result.totalModules).toBe(count);
      expect(result.totalKWp).toBe(count * PV_PANEL_RATED_KWP);
      expect(result.totalGrossProjectedSqm).toBeCloseTo(gross, 6);
      expect(result.totalUsableSqm).toBeCloseTo(usableSqm, 6);
      for (const plane of file.planes) {
        const layout = result.planes.find((p) => p.planeId === plane.id)!;
        const usable = usableAreaFor(plane);
        const polygons = toPolygons(plane.outline);
        const [nx, ny, nz] = plane.normal;
        const offset = ny * plane.maxElevationM + Math.min(...polygons.flatMap((p) => p.outer.map(([x, z]) => nx * x + nz * z)));
        for (const panel of layout.modules) {
          const q = new Quaternion(...panel.quaternion);
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) =>
            new Vector3(x * PV_MODULE_LENGTH_M / 2, 0, z * PV_MODULE_WIDTH_M / 2)
              .applyQuaternion(q).add(new Vector3(...panel.centre)));
          const plan = corners.map((p) => [p.x, p.z] as [number, number]);
          expect(usable.regions.some((region) => rectangleFits(plan, region, usable.blocked)), `${id}/${plane.id}: rendered footprint`).toBe(true);
          for (const corner of corners) {
            expect(nx * corner.x + ny * corner.y + nz * corner.z - offset, `${id}/${plane.id}: roof clearance`).toBeGreaterThanOrEqual(-1e-6);
          }
        }
      }
    },
  );
  // The source TrueNorth rotation makes these SE130° / NW310°. The existing
  // ±45° north exclusion leaves both eligible, each with its own source pose.
  it("FZK Haus: source-oriented SE and NW pitches are independently fitted", async () => {
    const set = (await import(
      "../../../../public/reference-buildings/fzk-haus/roof-planes.json"
    )) as unknown as { default: RoofPlaneSet };
    const planes = (set.default ?? (set as unknown as RoofPlaneSet)).planes;
    expect(planes).toHaveLength(2);

    const result = layoutRoofPlanes({
      kind: "bimfit_reference_building_roof_planes",
      buildingId: "fzk-haus",
      northAssumed: false,
      planes,
    });

    const south = result.planes.find((p) => p.azimuthDeg === 130)!;
    const north = result.planes.find((p) => p.azimuthDeg === 310)!;

    expect(north.excludedReason).toBeNull();
    expect(north.moduleCount).toBe(22);
    expect(south.mounting).toBe("flush");
    expect(south.moduleCount).toBeGreaterThan(0);
    expect(south.tiltDeg).toBeCloseTo(30, 6);

    // Every module on the south pitch is inside its own usable region.
    const sourcePlane = planes.find((p) => p.azimuthDeg === 130)!;
    const usable = usableAreaFor(sourcePlane);
    for (const m of south.modules) {
      const q = new Quaternion(...m.quaternion);
      const corners = [[-0.85, -0.5], [0.85, -0.5], [0.85, 0.5], [-0.85, 0.5]].map(([x, z]) => {
        const p = new Vector3(x, 0, z).applyQuaternion(q).add(new Vector3(...m.centre));
        return [p.x, p.z] as [number, number];
      });
      expect(usable.regions.some((region) => rectangleFits(corners, region, usable.blocked))).toBe(true);
    }

    expect(result.totalModules).toBe(south.moduleCount + north.moduleCount);
    expect(result.totalKWp).toBeCloseTo(result.totalModules * PV_PANEL_RATED_KWP, 12);
    expect(result.excludedPlanes).toBe(0);
    // Placed area cannot exceed what the roof had to give.
    expect(south.moduleAreaSqm).toBeLessThanOrEqual(south.usableSqm + 1e-9);
  });

  it("a twin plane with an untrustworthy shape is refused by name", () => {
    // bim-24's `partialOverlap` — the area is real, the boundary is inferred.
    const layout = layoutPlane(flatPlane({ partialOverlap: true }));
    expect(layout.excludedReason).toBe("outline-shape-not-trustworthy");
    expect(layout.moduleCount).toBe(0);
    // The area is still reported: it is a real roof, just not one to draw on.
    expect(layout.grossProjectedSqm).toBeCloseTo(400, 6);
  });
});

describe("a plane whose outline and stated area disagree is refused by name", () => {
  it("a sliver ring under a large stated area does not silently return zero", () => {
    // Schependomlaan's `dakvloer-plane-0`: states 130.2 m², ring encloses
    // 0.41 m². Without this the plane lays no modules and reports
    // "no-usable-area-after-setback", which reads as a fact about the roof.
    const broken = flatPlane({
      projectedSqm: 130.2,
      outline: [[[6.957, -7.971], [7.035, -7.98], [7.035, -2.657], [6.957, -2.657]]],
    });
    const layout = layoutPlane(broken);
    expect(layout.excludedReason).toBe("outline-area-disagrees-with-stated");
    expect(layout.moduleCount).toBe(0);
  });

  it("an honest plane is untouched by the guard", () => {
    expect(planeExclusion(flatPlane())).toBeNull();
    expect(planeExclusion(pitchedPlane())).toBeNull();
  });

  it("every plane in every shipped file either passes the guard or is named", async () => {
    for (const id of ["bs-medical-dental-clinic", "duplex-apartment", "fzk-haus"] as const) {
      const raw = (await import(`../../../../public/reference-buildings/${id}/roof-planes.json`)) as { default?: unknown };
      const file = (raw.default ?? raw) as { planes: RoofPlane[] };
      for (const plane of file.planes) {
        expect(
          planeExclusion(plane),
          `${id}/${plane.id} trips the outline guard`,
        ).not.toBe("outline-area-disagrees-with-stated");
      }
    }
  });
});
