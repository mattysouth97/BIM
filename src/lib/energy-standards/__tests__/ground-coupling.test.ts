import { describe, expect, it } from "vitest";
import { calculateAssembly } from "../assembly";
import {
  DEFAULT_SOIL_CONDUCTIVITY,
  GROUND_RSE,
  GROUND_RSI,
  GroundCouplingError,
  SOIL_CONDUCTIVITY,
  slabOnGroundUValue,
  slabOnGroundUValueRange,
} from "../ground-coupling";

/**
 * The Clinic's ground floor, from the IFC extraction:
 *   A = 2605.7 m², exposed P = 217.01 m, wall thickness at the edge 267 mm,
 *   150 mm cast in-situ concrete, uninsulated (the model states no edge or
 *   under-slab insulation, so none is assumed).
 */
const CLINIC = {
  areaSqm: 2605.7,
  exposedPerimeterM: 217.01,
  wallThicknessM: 0.267,
  floorResistanceM2KPerW: 0.15 / 2.3,
} as const;

describe("ISO 13370 constants", () => {
  it("uses the standard's own surface resistances, not the Korean 해설서 ones", () => {
    // assembly.ts uses 0.15/0.043 downward. These formulas were fitted with
    // ISO's, and mixing the two inside d_t is a category error.
    expect(GROUND_RSI).toBe(0.17);
    expect(GROUND_RSE).toBe(0.04);
  });

  it("defaults unknown soil to 2.0 W/mK, as the standard instructs", () => {
    expect(DEFAULT_SOIL_CONDUCTIVITY).toBe(2.0);
    expect(SOIL_CONDUCTIVITY["clay-or-silt"]).toBe(1.5);
    expect(SOIL_CONDUCTIVITY["homogeneous-rock"]).toBe(3.5);
  });
});

describe("slab on ground — the Clinic", () => {
  const result = slabOnGroundUValue(CLINIC);

  it("derives B' = A / (0.5 P) = 24.0 m", () => {
    expect(result.characteristicDimensionM).toBeCloseTo(24.015, 3);
  });

  it("derives d_t = w + λ(Rsi + Rf + Rse) = 0.817 m at the default soil", () => {
    // 0.267 + 2.0 × (0.17 + 0.0652 + 0.04)
    expect(result.equivalentThicknessM).toBeCloseTo(0.8174, 4);
  });

  it("takes the uninsulated branch, because d_t is far below B'", () => {
    expect(result.regime).toBe("uninsulated");
    expect(result.equivalentThicknessM).toBeLessThan(result.characteristicDimensionM);
  });

  it("gives U = 0.238 W/m²K and H_g = 620 W/K", () => {
    expect(result.uValueWPerM2K).toBeCloseTo(0.2379, 4);
    expect(result.heatTransferCoefficientWPerK).toBeCloseTo(620, 0);
  });

  it("bounds the answer at 0.186–0.377 across ISO 13370's soil categories", () => {
    const range = slabOnGroundUValueRange(CLINIC);
    expect(range.low.uValueWPerM2K).toBeCloseTo(0.1859, 4);
    expect(range.nominal.uValueWPerM2K).toBeCloseTo(0.2379, 4);
    expect(range.high.uValueWPerM2K).toBeCloseTo(0.3773, 4);
    // Soil alone moves it by a factor of two. A single figure would be fiction.
    expect(range.high.uValueWPerM2K / range.low.uValueWPerM2K).toBeGreaterThan(2);
  });
});

describe("why this module exists", () => {
  it("the air-to-air path overstates the same slab by more than 15x", () => {
    const wrong = calculateAssembly(
      [{ id: "slab", thicknessM: 0.15, conductivityWPerMK: 2.3 }],
      "downward"
    );
    const right = slabOnGroundUValue(CLINIC);

    expect(wrong.uValueWPerM2K).toBeCloseTo(3.873, 3);
    expect(wrong.uValueWPerM2K / right.uValueWPerM2K).toBeGreaterThan(15);

    // In heat-loss terms, on this floor area, that is ~9.5 kW/K that does not exist.
    const phantom = CLINIC.areaSqm * (wrong.uValueWPerM2K - right.uValueWPerM2K);
    expect(phantom).toBeGreaterThan(9000);
  });

  it("the engine's reduced ground ΔT does not rescue it — still ~14x end to end", () => {
    // heat-loss.ts pushes the ground floor at (indoor − DEFAULT_GROUND_TEMP 13.5)
    // rather than the outdoor design ΔT. That swaps in a warmer sink but still
    // omits the soil resistance, which is most of what ISO 13370 computes.
    const INDOOR = 20;
    const ENGINE_GROUND_TEMP = 13.5; // heat-loss.ts DEFAULT_GROUND_TEMP
    const ANNUAL_MEAN_OUTDOOR = 12.5; // the temperature ISO 13370's steady part pairs with

    const engineFlux =
      calculateAssembly([{ id: "slab", thicknessM: 0.15, conductivityWPerMK: 2.3 }], "downward")
        .uValueWPerM2K *
      (INDOOR - ENGINE_GROUND_TEMP);
    const isoFlux =
      slabOnGroundUValue(CLINIC).uValueWPerM2K * (INDOOR - ANNUAL_MEAN_OUTDOOR);

    expect(engineFlux).toBeCloseTo(25.2, 1);
    expect(isoFlux).toBeCloseTo(1.78, 2);
    expect(engineFlux / isoFlux).toBeGreaterThan(13);
    expect(engineFlux / isoFlux).toBeLessThan(15);
  });
});

describe("behaviour that must not drift", () => {
  it("a bigger, more compact floor loses less per m² — the whole point of B'", () => {
    const small = slabOnGroundUValue({ ...CLINIC, areaSqm: 100, exposedPerimeterM: 40 });
    const large = slabOnGroundUValue({ ...CLINIC, areaSqm: 10_000, exposedPerimeterM: 400 });
    expect(large.uValueWPerM2K).toBeLessThan(small.uValueWPerM2K);
  });

  it("adding floor insulation lowers U monotonically", () => {
    let previous = Infinity;
    for (const rf of [0.065, 0.5, 1.0, 2.0, 4.0]) {
      const u = slabOnGroundUValue({ ...CLINIC, floorResistanceM2KPerW: rf }).uValueWPerM2K;
      expect(u).toBeLessThan(previous);
      previous = u;
    }
  });

  it("crosses into the well-insulated branch once d_t reaches B'", () => {
    // A small floor with heavy insulation: d_t grows past B'.
    const heavy = slabOnGroundUValue({
      areaSqm: 25,
      exposedPerimeterM: 20,
      wallThicknessM: 0.3,
      floorResistanceM2KPerW: 8.0,
    });
    expect(heavy.regime).toBe("well-insulated");
    expect(heavy.uValueWPerM2K).toBeGreaterThan(0);
  });

  it("stays continuous across the branch boundary", () => {
    // At d_t == B' the two expressions must not disagree materially, or the
    // choice of branch would become a visible discontinuity in a sweep.
    const base = { areaSqm: 100, exposedPerimeterM: 40, wallThicknessM: 0.3 };
    const Bprime = base.areaSqm / (0.5 * base.exposedPerimeterM);
    // Solve R_f so that d_t lands exactly on B'.
    const rf = (Bprime - base.wallThicknessM) / 2.0 - GROUND_RSI - GROUND_RSE;
    const just = slabOnGroundUValue({ ...base, floorResistanceM2KPerW: rf });
    const under = slabOnGroundUValue({ ...base, floorResistanceM2KPerW: rf * 0.999 });
    expect(just.regime).toBe("well-insulated");
    expect(under.regime).toBe("uninsulated");
    expect(Math.abs(just.uValueWPerM2K - under.uValueWPerM2K)).toBeLessThan(0.01);
  });
});

describe("refuses rather than guesses", () => {
  it("rejects a zero or negative perimeter", () => {
    expect(() => slabOnGroundUValue({ ...CLINIC, exposedPerimeterM: 0 })).toThrow(
      GroundCouplingError
    );
  });

  it("rejects a non-finite area", () => {
    expect(() => slabOnGroundUValue({ ...CLINIC, areaSqm: Number.NaN })).toThrow(
      GroundCouplingError
    );
  });

  it("rejects a negative floor resistance", () => {
    expect(() => slabOnGroundUValue({ ...CLINIC, floorResistanceM2KPerW: -1 })).toThrow(
      GroundCouplingError
    );
  });

  it("allows a zero wall thickness and a zero floor resistance — both are physical", () => {
    expect(() =>
      slabOnGroundUValue({ ...CLINIC, wallThicknessM: 0, floorResistanceM2KPerW: 0 })
    ).not.toThrow();
  });
});
