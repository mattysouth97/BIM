import { describe, expect, it } from "vitest";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, VENTILATION_ELEMENT_NAME } from "@/lib/energy/heat-loss";
import { getClimateData } from "@/lib/energy/climate-data";
import {
  CLINIC_ASSUMPTIONS,
  CLINIC_GROUND_FLOOR,
  CLINIC_GROUND_FLOOR_RANGE,
  CLINIC_MATERIALS,
  CLINIC_MEASURED_ENVELOPE,
  CLINIC_RECIPE,
  CLINIC_ROOF_AREA_SQM,
  CLINIC_ROOF_EPDM_EXPOSED_SQM,
  CLINIC_TOTAL_FLOOR_AREA_SQM,
} from "../bs-medical-dental-clinic-energy";

describe("measured geometry survives intact", () => {
  it("floor area is the corrected 4,314.2, not the 6,935.8 area-plan total", () => {
    expect(CLINIC_RECIPE.officialFloorAreaSqm).toBe(CLINIC_TOTAL_FLOOR_AREA_SQM);
    expect(CLINIC_TOTAL_FLOOR_AREA_SQM).toBeCloseTo(2525.67 + 1723.69 + 64.83, 0);
  });

  it("wall areas by orientation reconcile to the net total", () => {
    const o = CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm;
    expect(o.N + o.E + o.S + o.W).toBeCloseTo(CLINIC_MEASURED_ENVELOPE.exteriorWallNetSqm, 1);
  });

  it("above- and below-roof wall areas reconcile to the same total", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    expect(e.exteriorWallBelowRoofSqm + e.exteriorWallAboveRoofSqm).toBeCloseTo(e.exteriorWallNetSqm, 1);
  });

  it("two occupied storeys, footing and roof datums excluded", () => {
    expect(CLINIC_RECIPE.floors).toHaveLength(2);
    expect(CLINIC_RECIPE.floors[0].isGroundFloor).toBe(true);
    expect(CLINIC_RECIPE.floors[1].y).toBeCloseTo(4.57, 2);
    expect(CLINIC_RECIPE.floors[0].height + CLINIC_RECIPE.floors[1].height).toBeCloseTo(9.25, 2);
  });

  it("the walls' surface areas are the measured ones, not derived", () => {
    const byOrientation = Object.fromEntries(
      CLINIC_MATERIALS.envelope.walls.map((w) => [w.orientation, w.surfaceArea]),
    );
    expect(byOrientation).toEqual(CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm);
  });
});

describe("the ground floor is ISO 13370, not air-to-air", () => {
  it("uses the slab-on-ground U of ~0.240, not calculateAssembly's 3.87", () => {
    // 2,577.42 m² over 217.01 m: B' = 23.75, d_t = 0.817. Read 0.2368 while
    // the 43.66 m² outdoor pad was inside the area (A-GROUND-PAD).
    expect(CLINIC_MATERIALS.envelope.groundFloor.uValue).toBeCloseTo(0.2399, 3);
    expect(CLINIC_MATERIALS.envelope.groundFloor.uValue).toBeLessThan(0.5);
    expect(CLINIC_GROUND_FLOOR.regime).toBe("uninsulated");
  });

  it("bounds it by soil, and the bound spans a factor of two", () => {
    expect(CLINIC_GROUND_FLOOR_RANGE.low.uValueWPerM2K).toBeCloseTo(0.1875, 3);
    expect(CLINIC_GROUND_FLOOR_RANGE.high.uValueWPerM2K).toBeCloseTo(0.3803, 3);
  });

  it("the excluded pad is named, and the slab is smaller by exactly it", () => {
    expect(CLINIC_MEASURED_ENVELOPE.groundSlabSqm).toBeCloseTo(2621.08 - 43.66, 2);
    const pad = CLINIC_ASSUMPTIONS.find((a) => a.id === "A-GROUND-PAD");
    expect(pad?.assumes).toContain("43.66");
    expect(pad?.assumes).toContain("221475");
  });

  it("adds no ground-contact resistance on top — the soil is already in the U", () => {
    expect(CLINIC_MATERIALS.envelope.groundFloor.groundContactResistance).toBe(0);
  });
});

describe("the WWR reproduces the measured aperture through the engine's own arithmetic", () => {
  // heat-loss.ts: windows = gross × wwr; opaque = gross − windows. So the
  // ratio is checked against the gross the engine is handed, and the opaque
  // remainder is checked too — a ratio that lands the windows on the aperture
  // while dropping 263 m² of wall would pass the first assertion alone.
  it("gross × wwr lands on the measured aperture, for every orientation", () => {
    const q = envelopeQuantities(CLINIC_RECIPE);
    const wwr = CLINIC_MATERIALS.envelope.windows.windowToWallRatio;
    for (const o of ["N", "S", "E", "W"] as const) {
      expect(q.grossWallAreaSqm * wwr[o]).toBeCloseTo(
        CLINIC_MEASURED_ENVELOPE.glazingApertureSqm,
        1,
      );
    }
  });

  it("what remains after the windows is the opaque wall plus the doors, nothing lost", () => {
    const q = envelopeQuantities(CLINIC_RECIPE);
    const wwr = CLINIC_MATERIALS.envelope.windows.windowToWallRatio.S;
    const opaque = q.grossWallAreaSqm - q.grossWallAreaSqm * wwr;
    expect(opaque).toBeCloseTo(
      CLINIC_MEASURED_ENVELOPE.exteriorWallNetSqm + CLINIC_MEASURED_ENVELOPE.exteriorDoorSqm,
      1,
    );
  });

  it("is the ~10.7 % figure — glazing over the whole wall plane, doors included", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    const wwr = CLINIC_MATERIALS.envelope.windows.windowToWallRatio.S;
    expect(wwr).toBeCloseTo(e.glazingApertureSqm / e.grossWallSqm, 6);
    expect(wwr).toBeGreaterThan(0.1);
    expect(wwr).toBeLessThan(0.12);
    // The net-wall ratio some readers will reach for. Against the gross the
    // engine carries it would put the windows more than 10 % too large.
    const netRatio = e.glazingApertureSqm / e.exteriorWallNetSqm;
    expect(netRatio * e.grossWallSqm).toBeGreaterThan(e.glazingApertureSqm * 1.1);
  });

  it("the per-sector glazing split sums to the aperture, and the door split to the doors", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    const g = e.glazingByOrientationSqm;
    expect(g.N + g.E + g.S + g.W).toBeCloseTo(e.glazingApertureSqm, 1);
    const d = e.exteriorDoorByOrientationSqm;
    expect(d.N + d.E + d.S + d.W).toBeCloseTo(e.exteriorDoorSqm, 1);
  });
});

describe("the recipe's envelope is the measured one, and the heat-loss model receives it intact", () => {
  it("envelopeQuantities returns the measurement, not an extrusion of the bounding box", () => {
    const q = envelopeQuantities(CLINIC_RECIPE);
    expect(q.source).toBe("measured");
    expect(q.grossWallAreaSqm).toBeCloseTo(CLINIC_MEASURED_ENVELOPE.grossWallSqm, 2);
    expect(q.roofAreaSqm).toBeCloseTo(CLINIC_ROOF_AREA_SQM, 2);
    expect(q.planAreaSqm).toBeCloseTo(CLINIC_MEASURED_ENVELOPE.groundSlabSqm, 2);
    expect(q.volumeM3).toBeCloseTo(CLINIC_MEASURED_ENVELOPE.conditionedVolumeGrossM3, 2);
    expect(q.intensityFloorAreaSqm).toBe(CLINIC_TOTAL_FLOOR_AREA_SQM);
  });

  it("the bounding box, extruded, would have been a different building", () => {
    const { measuredEnvelope: _measured, ...bare } = CLINIC_RECIPE;
    const extruded = envelopeQuantities(bare);
    expect(extruded.source).toBe("bbox");
    // 2 × (52.66 + 56.90) × 9.25 = 2,027 m² of wall for an L-shaped plan
    // with a 240 m² clerestory — under by a fifth, and the roof over by 12 %.
    expect(extruded.grossWallAreaSqm).toBeLessThan(0.85 * CLINIC_MEASURED_ENVELOPE.grossWallSqm);
    expect(extruded.roofAreaSqm).toBeGreaterThan(1.1 * CLINIC_ROOF_AREA_SQM);
  });

  it("heat-loss elements carry the measured areas: windows = aperture, walls = net + doors, roof = outer surface, ground = counted slab union", () => {
    const result = calculateHeatLoss(CLINIC_MATERIALS, CLINIC_RECIPE, getClimateData(undefined));
    const area = (name: string) => result.elements.find((e) => e.element === name)?.area;
    const e = CLINIC_MEASURED_ENVELOPE;
    expect(area("Windows")).toBeCloseTo(e.glazingApertureSqm, 1);
    expect(area("Walls")).toBeCloseTo(e.exteriorWallNetSqm + e.exteriorDoorSqm, 1);
    // EPDM surface less the deck under the barrel, plus the barrels' surface.
    expect(area("Roof")).toBeCloseTo(
      e.roofEpdmSurfaceSqm - e.roofEpdmUnderBarrelSqm + e.roofSeamSurfaceSqm,
      1,
    );
    expect(area("Roof")).toBeCloseTo(CLINIC_ROOF_AREA_SQM, 1);
    expect(area("Ground Floor")).toBeCloseTo(e.groundSlabSqm, 1);
    expect(area(VENTILATION_ELEMENT_NAME)).toBeCloseTo(20701.55, 1);
  });

  it("the gross volume is the engine's, and it is larger than the room solids by the plenums", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    expect(e.conditionedVolumeGrossM3).toBeGreaterThan(e.roomVolumeNetM3);
    expect(e.conditionedVolumeGrossM3).toBeGreaterThan(19610);
    expect(e.conditionedVolumeGrossM3).toBeLessThan(24240);
    // What the manifest says: floor × f2f per storey, the three voids'
    // solids, and the lift shaft's solid above its storey (9.25 m tall,
    // 4.356 m², nothing modelled above it).
    const byStorey = 2525.67 * 4.57 + 1723.69 * 4.68 + 64.83 * 3.4;
    const voids = 183.26 + 347.85 + 324.62;
    const liftAboveStorey = 36.13 - 4.356 * 4.57;
    expect(e.conditionedVolumeGrossM3).toBeCloseTo(byStorey + voids + liftAboveStorey, 0);
  });
});

describe("the roof is area-weighted across two very different roofs", () => {
  it("lands between the EPDM and standing-seam values, nearer the EPDM", () => {
    const u = CLINIC_MATERIALS.envelope.roof.uValue;
    expect(u).toBeGreaterThan(0.317);
    expect(u).toBeLessThan(3.45);
    // (0.317 × 2,212.38 + 3.45 × 455.00) / 2,667.38
    expect(u).toBeCloseTo((701.32446 + 1569.75) / 2667.38, 4);
    expect(u).toBeCloseTo(0.8514, 3);
  });

  it("standing seam is 17 % of the area and most of the loss", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    const share = e.roofSeamSurfaceSqm / CLINIC_ROOF_AREA_SQM;
    expect(share).toBeCloseTo(0.1706, 3);
    const seamLoss = 3.45 * e.roofSeamSurfaceSqm;
    const epdmLoss = 0.317 * CLINIC_ROOF_EPDM_EXPOSED_SQM;
    expect(seamLoss).toBeGreaterThan(epdmLoss);
    expect(seamLoss / (seamLoss + epdmLoss)).toBeCloseTo(0.691, 2);
  });

  it("the roof is the outer surface: seam surface exceeds its shadow, and the deck under the barrel is out", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    // Five barrels at 13.5–18.3°: surface / shadow-union = 455.00 / 384.44.
    expect(e.roofSeamSurfaceSqm).toBeGreaterThan(384.44);
    expect(e.roofSeamSurfaceSqm).toBeCloseTo(455.0, 2);
    expect(CLINIC_ROOF_EPDM_EXPOSED_SQM).toBeCloseTo(2286.93 - 74.55, 2);
    expect(CLINIC_ROOF_AREA_SQM).toBeCloseTo(2667.38, 2);
    // The retired 382.28 was 764.56 ÷ 2, and A-SEAM-AREA must say so.
    const seam = CLINIC_ASSUMPTIONS.find((a) => a.id === "A-SEAM-AREA");
    expect(seam?.why).toContain("764.56 ÷ 2");
    expect(seam?.assumes).toContain("455.00");
  });
});

describe("every non-measured value is a named assumption", () => {
  const ids = CLINIC_ASSUMPTIONS.map((a) => a.id);

  it.each([
    "A-CLIMATE",
    "A-STUD-CAVITY",
    "A-STEEL-BRIDGE",
    "A-SEAM-ROOF",
    "A-SEAM-AREA",
    "A-ROOF-WEIGHT",
    "A-GROUND-PAD",
    "A-SOIL",
    "A-GROUND-DT",
    "A-WWR-DENOMINATOR",
    "A-DOORS",
    "A-VOLUME",
    "A-WWR-LOW",
    "A-GLAZING",
    "A-AIRTIGHT",
    "A-HVAC",
    "A-LPD",
    "A-OCCUPANCY",
    "A-ENVELOPE-SOURCE",
  ])("%s is declared", (id) => {
    expect(ids).toContain(id);
  });

  it("every assumption says why it cannot be measured", () => {
    for (const a of CLINIC_ASSUMPTIONS) {
      expect(a.why.length, a.id).toBeGreaterThan(40);
    }
  });

  it("the stud-cavity assumption states its own magnitude", () => {
    const a = CLINIC_ASSUMPTIONS.find((x) => x.id === "A-STUD-CAVITY")!;
    expect(a.why).toMatch(/0\.404.*0\.218|halve/);
  });

  it("the WWR-low assumption tells a reader not to correct it", () => {
    const a = CLINIC_ASSUMPTIONS.find((x) => x.id === "A-WWR-LOW")!;
    expect(a.why).toMatch(/not normalise|Do not normalise/i);
  });
});
