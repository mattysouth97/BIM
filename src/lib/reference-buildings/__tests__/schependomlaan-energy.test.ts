import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, VENTILATION_ELEMENT_NAME } from "@/lib/energy/heat-loss";
import { getClimateData } from "@/lib/energy/climate-data";
import type { ReferenceBuildingManifest } from "../manifest";
import {
  SCHEPENDOMLAAN_ASSUMPTIONS,
  SCHEPENDOMLAAN_CAVITY_WALL,
  SCHEPENDOMLAAN_CAVITY_WALL_120MM_LEAF,
  SCHEPENDOMLAAN_GROUND_FLOOR,
  SCHEPENDOMLAAN_GROUND_FLOOR_AT_STATED_RC,
  SCHEPENDOMLAAN_GROUND_FLOOR_RANGE,
  SCHEPENDOMLAAN_GROUND_STATED_RC,
  SCHEPENDOMLAAN_INPUT_STATE,
  SCHEPENDOMLAAN_MATERIALS,
  SCHEPENDOMLAAN_MEASURED_ENVELOPE,
  SCHEPENDOMLAAN_PENDING_MEASUREMENTS,
  SCHEPENDOMLAAN_RECIPE,
  SCHEPENDOMLAAN_ROOF,
  SCHEPENDOMLAAN_ROOF_STATED_RC,
  SCHEPENDOMLAAN_ROOF_STATED_RC_U,
  SCHEPENDOMLAAN_STOREYS,
  SCHEPENDOMLAAN_TOTAL_FLOOR_AREA_SQM,
  SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM,
  SCHEPENDOMLAAN_WWR_BY_SECTOR,
} from "../schependomlaan-energy";

const manifest = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public/reference-buildings/schependomlaan/manifest.json"),
    "utf8",
  ),
) as ReferenceBuildingManifest;

describe("the file says, unmissably, which state it is in", () => {
  // The single most important property of this deliverable. Six envelope
  // areas are stand-ins, and `envelopeQuantities` will report `source:
  // "measured"` for all of them because it cannot tell the difference — it
  // only refuses zeros and NaNs. So the declaration has to be explicit, and
  // it has to be machine-readable, or the next reader takes a guess for a
  // measurement.
  it("declares the placeholder state", () => {
    expect(SCHEPENDOMLAAN_INPUT_STATE).toBe("awaiting_lane_b_measurements");
  });

  it("the state and the pending table agree, so neither can drift", () => {
    const pending = SCHEPENDOMLAAN_PENDING_MEASUREMENTS.length > 0;
    expect(pending).toBe(SCHEPENDOMLAAN_INPUT_STATE === "awaiting_lane_b_measurements");
  });

  it("names the exact manifest field each placeholder awaits", () => {
    // Lane B emits these names. Naming them here makes the swap a value
    // change and not a rename, and lets a reader find what is missing.
    expect(SCHEPENDOMLAAN_PENDING_MEASUREMENTS.map((p) => p.manifestField).sort()).toEqual([
      "areas.exteriorDoorSqm",
      "areas.glazingApertureSqm",
      "areas.glazingByOrientationSqm",
      "areas.groundPerimeterM",
      "areas.groundSlabSqm",
      "areas.roofProjectedSqm",
    ]);
  });

  it("every placeholder says how it was derived and which way it is wrong", () => {
    for (const p of SCHEPENDOMLAAN_PENDING_MEASUREMENTS) {
      expect(p.derivedFrom.length, p.manifestField).toBeGreaterThan(40);
      expect(p.biasDirection.length, p.manifestField).toBeGreaterThan(40);
      expect(p.placeholderValue, p.manifestField).toBeGreaterThan(0);
    }
  });

  it("marks each envelope field measured, placeholder, or derived from one", () => {
    const p = SCHEPENDOMLAAN_MEASURED_ENVELOPE.provenance;
    expect(p.exteriorWallNetSqm).toBe("manifest");
    expect(p.conditionedVolumeGrossM3).toBe("manifest");
    expect(p.glazingApertureSqm).toBe("placeholder");
    expect(p.roofProjectedSqm).toBe("placeholder");
    expect(p.groundSlabSqm).toBe("placeholder");
    expect(p.groundPerimeterM).toBe("placeholder");
    // Gross wall is measured wall + two placeholders, which is neither.
    expect(p.grossWallSqm).toBe("derived_from_placeholder");
  });

  it("the recipe's own basis string leads with the word, not with a caveat at the end", () => {
    expect(SCHEPENDOMLAAN_RECIPE.measuredEnvelope?.basis).toMatch(/^PARTLY PLACEHOLDER/);
  });

  it("the placeholders are still positive numbers, because envelopeQuantities refuses zeros", () => {
    // envelope-quantities.ts throws on a non-positive measured field, so a
    // placeholder cannot signal itself by being 0 or NaN. That is exactly why
    // the state has to be declared out of band.
    expect(() => envelopeQuantities(SCHEPENDOMLAAN_RECIPE)).not.toThrow();
    expect(envelopeQuantities(SCHEPENDOMLAAN_RECIPE).source).toBe("measured");
  });
});

describe("measured geometry survives intact, and matches the shipped manifest", () => {
  it("reads against the artifact the app serves, not a fixture", () => {
    expect(manifest.id).toBe("schependomlaan");
    expect(manifest.assemblies?.length).toBe(28);
  });

  it("floor area is the manifest's 965.67 and the four storeys sum to it", () => {
    expect(SCHEPENDOMLAAN_RECIPE.officialFloorAreaSqm).toBe(SCHEPENDOMLAAN_TOTAL_FLOOR_AREA_SQM);
    expect(manifest.areas.totalFloorAreaSqm).toBe(SCHEPENDOMLAAN_TOTAL_FLOOR_AREA_SQM);
    const s = SCHEPENDOMLAAN_STOREYS;
    expect(
      s.groundFloor.floorAreaSqm +
        s.firstFloor.floorAreaSqm +
        s.secondFloor.floorAreaSqm +
        s.thirdFloor.floorAreaSqm,
    ).toBeCloseTo(SCHEPENDOMLAAN_TOTAL_FLOOR_AREA_SQM, 1);
  });

  it("wall areas by sector reconcile to the net total, diagonals included", () => {
    const o = SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM;
    const sum = Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorWallNetSqm, 1);
    expect(o).toEqual(manifest.areas.exteriorWallByOrientationSqm);
    // Zero by measurement, not by omission — the manifest's orientation note
    // records that all 122 inner-leaf walls are cardinal.
    expect(o.NE + o.SE + o.SW + o.NW).toBe(0);
  });

  it("above- and below-roof wall areas reconcile to the same total", () => {
    const e = SCHEPENDOMLAAN_MEASURED_ENVELOPE;
    expect(e.exteriorWallBelowRoofSqm + e.exteriorWallAboveRoofSqm).toBeCloseTo(
      e.exteriorWallNetSqm,
      1,
    );
  });

  it("four occupied storeys at 3.00 m; the fundering and dak datums are not storeys", () => {
    expect(SCHEPENDOMLAAN_RECIPE.floors).toHaveLength(4);
    expect(SCHEPENDOMLAAN_RECIPE.floors[0].isGroundFloor).toBe(true);
    expect(SCHEPENDOMLAAN_RECIPE.floors.map((f) => f.y)).toEqual([0, 3, 6, 9]);
    for (const f of SCHEPENDOMLAAN_RECIPE.floors) expect(f.height).toBe(3);
    expect(SCHEPENDOMLAAN_RECIPE.totalHeight).toBe(12);
    // The manifest lists six rows and counts four storeys; both are right.
    expect(manifest.storeys).toHaveLength(6);
    expect(manifest.counts.storeys).toBe(4);
  });

  it("the walls' surface areas are the measured ones, not derived", () => {
    const byOrientation = Object.fromEntries(
      SCHEPENDOMLAAN_MATERIALS.envelope.walls.map((w) => [w.orientation, w.surfaceArea]),
    );
    expect(byOrientation).toEqual({
      N: SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM.N,
      E: SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM.E,
      S: SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM.S,
      W: SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM.W,
    });
  });

  it("volumes are the manifest's, and gross exceeds the room solids", () => {
    const e = SCHEPENDOMLAAN_MEASURED_ENVELOPE;
    expect(e.conditionedVolumeGrossM3).toBe(manifest.areas.conditionedVolumeGrossM3);
    expect(e.roomVolumeNetM3).toBe(manifest.areas.roomVolumeNetM3);
    expect(e.conditionedVolumeGrossM3).toBeGreaterThan(e.roomVolumeNetM3);
    // Gross = Σ storey floor area × 3.00 m, and every term is in the manifest.
    const byStorey = SCHEPENDOMLAAN_TOTAL_FLOOR_AREA_SQM * 3;
    expect(e.conditionedVolumeGrossM3).toBeCloseTo(byStorey, 0);
  });
});

describe("the cavity wall is an inference, and it is built from the three stated leaves", () => {
  it("solves to U 0.2889 W/m²K, Rc 3.309 — inside the brief's 0.28-0.33", () => {
    expect(SCHEPENDOMLAAN_CAVITY_WALL.uValueWPerM2K).toBeCloseTo(0.2889, 3);
    expect(SCHEPENDOMLAAN_CAVITY_WALL.uValueWPerM2K).toBeGreaterThan(0.28);
    expect(SCHEPENDOMLAAN_CAVITY_WALL.uValueWPerM2K).toBeLessThan(0.33);
    // Rc excludes the surface resistances; the Dutch figure the model's
    // sibling assemblies quote in their own names is that one.
    const rc =
      SCHEPENDOMLAAN_CAVITY_WALL.totalResistanceM2KPerW -
      SCHEPENDOMLAAN_CAVITY_WALL.surface.rsi -
      SCHEPENDOMLAAN_CAVITY_WALL.surface.rse;
    expect(rc).toBeCloseTo(3.3088, 3);
    // Short of the 3.5 the 2012 Bouwbesluit required for walls, as modelled.
    expect(rc).toBeLessThan(3.5);
  });

  it("is a horizontal-flow assembly, not a roof borrowing the wrong surface row", () => {
    expect(SCHEPENDOMLAAN_CAVITY_WALL.surface.direction).toBe("horizontal");
  });

  it("the 120 mm inner leaf is recorded and differs by under 1 %", () => {
    const a = SCHEPENDOMLAAN_CAVITY_WALL.uValueWPerM2K;
    const b = SCHEPENDOMLAAN_CAVITY_WALL_120MM_LEAF.uValueWPerM2K;
    expect(b).toBeCloseTo(0.2868, 3);
    expect(Math.abs(a - b) / a).toBeLessThan(0.01);
  });

  it("the insulation is nearly the whole wall, so its λ is the wall's U", () => {
    const cavity = SCHEPENDOMLAAN_CAVITY_WALL.layers.find((l) => l.id.includes("glaswol"));
    expect(cavity!.shareOfTotal).toBeGreaterThan(0.85);
  });

  it("the three leaves the model states really are three separate assemblies", () => {
    const names = (manifest.assemblies ?? []).map((a) => a.name);
    expect(names).toContain("IFC_kalkzandsteen_100mm");
    expect(names).toContain("IFC_isolatie_110mm_glaswol");
    expect(names).toContain("IFC_baksteen_roodbruin_100mm_staand");
    // and no assembly that is the wall
    expect(names.some((n) => /spouwmuur|cavity/i.test(n))).toBe(false);
  });
});

describe("the roof: solved against the Rc its own name states", () => {
  it("solves to U 0.1776 with UPWARD surface resistances", () => {
    expect(SCHEPENDOMLAAN_ROOF.uValueWPerM2K).toBeCloseTo(0.1776, 3);
    expect(SCHEPENDOMLAAN_ROOF.surface.direction).toBe("upward");
    expect(SCHEPENDOMLAAN_MATERIALS.envelope.roof.uValue).toBe(SCHEPENDOMLAAN_ROOF.uValueWPerM2K);
  });

  it("the horizontal row would have read better than the roof is", () => {
    // ISO 6946 Table 2 is direction-dependent: upward Rsi is smaller, so a
    // roof solved on the horizontal row gets resistance it does not have.
    const horizontalRT = SCHEPENDOMLAAN_ROOF.totalResistanceM2KPerW - 0.086 + 0.11;
    expect(1 / horizontalRT).toBeLessThan(SCHEPENDOMLAAN_ROOF.uValueWPerM2K);
  });

  it("solved Rc 5.50 against a stated Rc 4.00 — a 37 % disagreement, disclosed", () => {
    const rc =
      SCHEPENDOMLAAN_ROOF.totalResistanceM2KPerW -
      SCHEPENDOMLAAN_ROOF.surface.rsi -
      SCHEPENDOMLAAN_ROOF.surface.rse;
    expect(rc).toBeCloseTo(5.5024, 3);
    expect(SCHEPENDOMLAAN_ROOF_STATED_RC).toBe(4);
    expect(Math.abs(rc - SCHEPENDOMLAAN_ROOF_STATED_RC) / SCHEPENDOMLAAN_ROOF_STATED_RC).toBeGreaterThan(0.1);
    // The solved figure is the optimistic one, and the assumption says so.
    expect(SCHEPENDOMLAAN_ROOF.uValueWPerM2K).toBeLessThan(SCHEPENDOMLAAN_ROOF_STATED_RC_U);
    const a = SCHEPENDOMLAAN_ASSUMPTIONS.find((x) => x.id === "A-ROOF-RC-CONFLICT")!;
    expect(a.why).toMatch(/OPTIMISTIC|optimistic/);
  });

  it("the model's own name for that assembly carries the Rc this test compares against", () => {
    const roof = (manifest.assemblies ?? []).find((a) => a.name.startsWith("IFC_dakplaat"));
    expect(roof?.name).toBe("IFC_dakplaat_geisoleerd_Rc=4,00");
  });
});

describe("the ground floor is ISO 13370, not air-to-air", () => {
  it("uses the slab-on-ground U, an order of magnitude below any air-to-air read", () => {
    expect(SCHEPENDOMLAAN_MATERIALS.envelope.groundFloor.uValue).toBeCloseTo(0.1637, 3);
    expect(SCHEPENDOMLAAN_MATERIALS.envelope.groundFloor.uValue).toBeLessThan(0.5);
  });

  it("bounds it by soil", () => {
    expect(SCHEPENDOMLAAN_GROUND_FLOOR_RANGE.low.uValueWPerM2K).toBeCloseTo(0.1495, 3);
    expect(SCHEPENDOMLAAN_GROUND_FLOOR_RANGE.high.uValueWPerM2K).toBeCloseTo(0.1918, 3);
    expect(SCHEPENDOMLAAN_GROUND_FLOOR.uValueWPerM2K).toBe(
      SCHEPENDOMLAAN_GROUND_FLOOR_RANGE.nominal.uValueWPerM2K,
    );
  });

  it("records the stated-Rc reading too, which is 16 % worse", () => {
    expect(SCHEPENDOMLAAN_GROUND_STATED_RC).toBe(3);
    expect(SCHEPENDOMLAAN_GROUND_FLOOR_AT_STATED_RC.uValueWPerM2K).toBeCloseTo(0.1905, 3);
    expect(SCHEPENDOMLAAN_GROUND_FLOOR_AT_STATED_RC.uValueWPerM2K).toBeGreaterThan(
      SCHEPENDOMLAAN_GROUND_FLOOR.uValueWPerM2K,
    );
  });

  it("adds no ground-contact resistance on top — the soil is already in the U", () => {
    expect(SCHEPENDOMLAAN_MATERIALS.envelope.groundFloor.groundContactResistance).toBe(0);
  });

  // Deliberately no assertion on `regime`. d_t 8.29 sits just under B' 8.69,
  // and both terms are placeholders: the branch may legitimately flip when
  // Lane B lands the real slab area and perimeter.
});

describe("the WWR is derived from its parts, against GROSS wall", () => {
  it("gross is opaque + glazing + doors, and doors are their own term", () => {
    const e = SCHEPENDOMLAAN_MEASURED_ENVELOPE;
    expect(e.grossWallSqm).toBeCloseTo(426.63 + 115.5 + 40, 2);
    expect(e.exteriorDoorSqm).toBe(40);
    expect(e.glazingApertureSqm).toBe(115.5);
  });

  it("net never exceeds gross, on the whole wall and on every sector", () => {
    const e = SCHEPENDOMLAAN_MEASURED_ENVELOPE;
    expect(e.exteriorWallNetSqm).toBeLessThanOrEqual(e.grossWallSqm);
    for (const s of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const) {
      const wall = SCHEPENDOMLAAN_WALL_BY_SECTOR_SQM[s];
      const glazing = e.glazingByOrientationSqm[s];
      expect(glazing, s).toBeGreaterThanOrEqual(0);
      expect(wall, s).toBeLessThanOrEqual(wall + glazing);
      expect(SCHEPENDOMLAAN_WWR_BY_SECTOR[s], s).toBeLessThan(1);
    }
    // The per-sector glazing sums back to the whole aperture, so the pro-rata
    // split loses nothing.
    const sum = Object.values(e.glazingByOrientationSqm).reduce<number>((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(e.glazingApertureSqm, 6);
  });

  it("gross × wwr lands on the aperture, for every orientation", () => {
    const q = envelopeQuantities(SCHEPENDOMLAAN_RECIPE);
    const wwr = SCHEPENDOMLAAN_MATERIALS.envelope.windows.windowToWallRatio;
    for (const o of ["N", "S", "E", "W"] as const) {
      expect(q.grossWallAreaSqm * wwr[o]).toBeCloseTo(
        SCHEPENDOMLAAN_MEASURED_ENVELOPE.glazingApertureSqm,
        1,
      );
    }
  });

  it("what remains after the windows is the opaque wall plus the doors, nothing lost", () => {
    const q = envelopeQuantities(SCHEPENDOMLAAN_RECIPE);
    const wwr = SCHEPENDOMLAAN_MATERIALS.envelope.windows.windowToWallRatio.S;
    const opaque = q.grossWallAreaSqm - q.grossWallAreaSqm * wwr;
    expect(opaque).toBeCloseTo(
      SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorWallNetSqm +
        SCHEPENDOMLAAN_MEASURED_ENVELOPE.exteriorDoorSqm,
      1,
    );
  });

  it("the net-wall denominator, which some reader will reach for, is 12 % too large", () => {
    const e = SCHEPENDOMLAAN_MEASURED_ENVELOPE;
    const netRatio = e.glazingApertureSqm / e.exteriorWallNetSqm;
    expect(netRatio * e.grossWallSqm).toBeGreaterThan(e.glazingApertureSqm * 1.1);
  });

  it("carries a per-sector WWR on all eight keys, ready for Lane B", () => {
    const s = SCHEPENDOMLAAN_WWR_BY_SECTOR;
    expect(Object.keys(s).sort()).toEqual(["E", "N", "NE", "NW", "S", "SE", "SW", "W"]);
    // Uniform TODAY, because the placeholder is spread pro rata to the wall.
    // The four cardinals must agree; that is what "uniform" means and it is
    // what stops being true the moment real per-sector glazing lands.
    const cardinals = [s.N, s.E, s.S, s.W];
    for (const v of cardinals) expect(v).toBeCloseTo(cardinals[0], 6);
    // A sector with no wall has no ratio rather than a division by zero.
    expect(s.NE).toBe(0);
  });

  it("does NOT hand four different per-sector ratios to the engine", () => {
    // heat-loss.ts takes the UNWEIGHTED mean of the four cardinals, so
    // per-sector ratios would give a 148.90 m² wall and a 74.12 m² wall equal
    // weight and would not reproduce the aperture. Pinned so a later change
    // to wire the sectors in has to fix the mean first.
    const wwr = SCHEPENDOMLAAN_MATERIALS.envelope.windows.windowToWallRatio;
    expect(new Set([wwr.N, wwr.E, wwr.S, wwr.W]).size).toBe(1);
  });
});

describe("the recipe's envelope is the measured/placeholder one, and heat-loss receives it intact", () => {
  it("envelopeQuantities returns the object, not an extrusion of the footprint", () => {
    const q = envelopeQuantities(SCHEPENDOMLAAN_RECIPE);
    expect(q.source).toBe("measured");
    expect(q.grossWallAreaSqm).toBeCloseTo(SCHEPENDOMLAAN_MEASURED_ENVELOPE.grossWallSqm, 2);
    expect(q.roofAreaSqm).toBeCloseTo(SCHEPENDOMLAAN_MEASURED_ENVELOPE.roofProjectedSqm, 2);
    expect(q.planAreaSqm).toBeCloseTo(SCHEPENDOMLAAN_MEASURED_ENVELOPE.groundSlabSqm, 2);
    expect(q.volumeM3).toBeCloseTo(SCHEPENDOMLAAN_MEASURED_ENVELOPE.conditionedVolumeGrossM3, 2);
    expect(q.intensityFloorAreaSqm).toBe(SCHEPENDOMLAAN_TOTAL_FLOOR_AREA_SQM);
  });

  it("the square footprint, extruded, would have been a different building", () => {
    const { measuredEnvelope: _measured, ...bare } = SCHEPENDOMLAAN_RECIPE;
    const extruded = envelopeQuantities(bare);
    expect(extruded.source).toBe("bbox");
    // 4 × 17.39 × 12.00 = 834 m² against the building's own 582.13.
    expect(extruded.grossWallAreaSqm).toBeGreaterThan(
      1.3 * SCHEPENDOMLAAN_MEASURED_ENVELOPE.grossWallSqm,
    );
  });

  it("heat-loss elements carry the envelope's own areas", () => {
    const result = calculateHeatLoss(
      SCHEPENDOMLAAN_MATERIALS,
      SCHEPENDOMLAAN_RECIPE,
      getClimateData(undefined),
    );
    const area = (name: string) => result.elements.find((e) => e.element === name)?.area;
    expect(area("Windows")).toBeCloseTo(115.5, 1);
    expect(area("Walls")).toBeCloseTo(426.63 + 40, 1);
    expect(area("Roof")).toBeCloseTo(302.24, 1);
    expect(area("Ground Floor")).toBeCloseTo(302.24, 1);
    expect(area(VENTILATION_ELEMENT_NAME)).toBeCloseTo(2897.04, 1);
  });
});

describe("airtightness states its own conversion", () => {
  it("ACH50 2.05 reproduces the NTA 8800 qv;10 of 0.6 dm³/s·m²", () => {
    const q10LitrePerS = 0.6 * SCHEPENDOMLAAN_TOTAL_FLOOR_AREA_SQM;
    const q50CubicMPerH = q10LitrePerS * Math.pow(5, 0.65) * 3.6;
    const n50 = q50CubicMPerH / SCHEPENDOMLAAN_MEASURED_ENVELOPE.conditionedVolumeGrossM3;
    expect(n50).toBeCloseTo(SCHEPENDOMLAAN_MATERIALS.envelope.airtightness.ach50, 2);
  });

  it("the engine's ACH50/20 divisor puts it at a natural 0.10 h⁻¹", () => {
    expect(SCHEPENDOMLAAN_MATERIALS.envelope.airtightness.ach50 / 20).toBeCloseTo(0.1025, 3);
  });
});

describe("every non-measured value is a named assumption", () => {
  const ids = SCHEPENDOMLAAN_ASSUMPTIONS.map((a) => a.id);

  it.each([
    "A-PLACEHOLDER-STATE",
    "A-GLAZING-AREA-PLACEHOLDER",
    "A-DOORS-AREA-PLACEHOLDER",
    "A-ROOF-AREA-PLACEHOLDER",
    "A-GROUND-AREA-PLACEHOLDER",
    "A-WWR-UNIFORM-PLACEHOLDER",
    "A-WWR-DENOMINATOR",
    "A-WWR-ENGINE-MEAN",
    "A-DOORS",
    "A-GROUND-DT",
    "A-CAVITY-WALL",
    "A-CAVITY-AIR-GAP",
    "A-KALKZANDSTEEN-LAMBDA",
    "A-ROOF-RC-CONFLICT",
    "A-ROOF-FRAME-BRIDGE",
    "A-ROOF-AIR-LAYER",
    "A-GROUND-RC-CONFLICT",
    "A-HOLLOW-CORE",
    "A-SUSPENDED-FLOOR",
    "A-SOIL",
    "A-LAYER-LAMBDAS",
    "A-GLAZING",
    "A-AIRTIGHT",
    "A-VOLUME",
    "A-HVAC",
    "A-LPD",
    "A-OCCUPANCY",
    "A-CLIMATE",
    "A-ENVELOPE-ASSEMBLY-SET",
    "A-WALL-LEAVES-SHOWN-SEPARATELY",
    "A-GROUND-ROW-IS-AIR-TO-AIR",
    "A-WALL-SET-SCOPE",
    "A-NORTH",
    "A-NO-FOOTPRINT",
    "A-ENVELOPE-SOURCE",
    "A-ERA",
  ])("%s is declared", (id) => {
    expect(ids).toContain(id);
  });

  it("ids are unique", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every assumption says why it cannot be measured", () => {
    for (const a of SCHEPENDOMLAAN_ASSUMPTIONS) {
      expect(a.why.length, a.id).toBeGreaterThan(40);
    }
  });

  it("the climate assumption says the town IS stated — this is not the Clinic's case", () => {
    const a = SCHEPENDOMLAAN_ASSUMPTIONS.find((x) => x.id === "A-CLIMATE")!;
    expect(a.why).toMatch(/Nijmegen/);
    expect(a.why).toMatch(/IS stated|is stated/);
  });

  it("the framed-cavity bridges are disclosed, not tuned away", () => {
    const bridge = SCHEPENDOMLAAN_ASSUMPTIONS.find((x) => x.id === "A-ROOF-FRAME-BRIDGE")!;
    expect(bridge.why).toMatch(/5\.3\.1/);
    const air = SCHEPENDOMLAAN_ASSUMPTIONS.find((x) => x.id === "A-ROOF-AIR-LAYER")!;
    expect(air.why).toMatch(/SUBDIVIDED|subdivided/);
  });

  it("the airtightness assumption shows the conversion rather than asserting a number", () => {
    const a = SCHEPENDOMLAAN_ASSUMPTIONS.find((x) => x.id === "A-AIRTIGHT")!;
    expect(a.why).toMatch(/0\.65/);
    expect(a.why).toMatch(/20/);
  });
});
