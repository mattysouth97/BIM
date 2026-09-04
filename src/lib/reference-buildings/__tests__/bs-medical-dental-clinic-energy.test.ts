import { describe, expect, it } from "vitest";
import {
  CLINIC_ASSUMPTIONS,
  CLINIC_GROUND_FLOOR,
  CLINIC_GROUND_FLOOR_RANGE,
  CLINIC_MATERIALS,
  CLINIC_MEASURED_ENVELOPE,
  CLINIC_RECIPE,
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
  it("uses the slab-on-ground U of ~0.237, not calculateAssembly's 3.87", () => {
    expect(CLINIC_MATERIALS.envelope.groundFloor.uValue).toBeCloseTo(0.2368, 3);
    expect(CLINIC_MATERIALS.envelope.groundFloor.uValue).toBeLessThan(0.5);
    expect(CLINIC_GROUND_FLOOR.regime).toBe("uninsulated");
  });

  it("bounds it by soil, and the bound spans a factor of two", () => {
    expect(CLINIC_GROUND_FLOOR_RANGE.low.uValueWPerM2K).toBeCloseTo(0.185, 2);
    expect(CLINIC_GROUND_FLOOR_RANGE.high.uValueWPerM2K).toBeCloseTo(0.376, 2);
  });

  it("adds no ground-contact resistance on top — the soil is already in the U", () => {
    expect(CLINIC_MATERIALS.envelope.groundFloor.groundContactResistance).toBe(0);
  });
});

describe("the WWR reproduces the measured aperture", () => {
  it("against the NET wall area the engine actually carries", () => {
    const wwr = CLINIC_MATERIALS.envelope.windows.windowToWallRatio;
    const glazing = CLINIC_MEASURED_ENVELOPE.exteriorWallNetSqm * wwr.S;
    expect(glazing).toBeCloseTo(CLINIC_MEASURED_ENVELOPE.glazingApertureSqm, 1);
  });

  it("is NOT the 10.9 % gross-wall figure, which would understate glazing ~12 %", () => {
    const wwr = CLINIC_MATERIALS.envelope.windows.windowToWallRatio.S;
    expect(wwr).toBeGreaterThan(0.12);
    expect(0.109 * CLINIC_MEASURED_ENVELOPE.exteriorWallNetSqm).toBeLessThan(
      CLINIC_MEASURED_ENVELOPE.glazingApertureSqm * 0.9,
    );
  });
});

describe("the roof is area-weighted across two very different roofs", () => {
  it("lands between the EPDM and standing-seam values, nearer the EPDM", () => {
    const u = CLINIC_MATERIALS.envelope.roof.uValue;
    expect(u).toBeGreaterThan(0.317);
    expect(u).toBeLessThan(3.45);
    expect(u).toBeCloseTo(0.767, 2);
  });

  it("standing seam is 14 % of the area and most of the loss", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    const share = e.roofStandingSeamSqm / (e.roofEpdmSqm + e.roofStandingSeamSqm);
    expect(share).toBeCloseTo(0.143, 2);
    const seamLoss = 3.45 * e.roofStandingSeamSqm;
    const epdmLoss = 0.317 * e.roofEpdmSqm;
    expect(seamLoss).toBeGreaterThan(epdmLoss);
  });
});

describe("every non-measured value is a named assumption", () => {
  const ids = CLINIC_ASSUMPTIONS.map((a) => a.id);

  it.each([
    "A-CLIMATE",
    "A-STUD-CAVITY",
    "A-STEEL-BRIDGE",
    "A-SEAM-ROOF",
    "A-SOIL",
    "A-GROUND-DT",
    "A-WWR-DENOMINATOR",
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
