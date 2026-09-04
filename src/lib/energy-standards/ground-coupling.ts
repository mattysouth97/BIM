/**
 * ISO 13370 ground heat transfer — the ground floor is not an air-to-air U.
 *
 * `calculateAssembly` answers "what does this layer stack resist, between
 * inside air and outside air". A floor on the ground faces neither: heat
 * leaves it sideways and downwards through soil whose temperature is not the
 * outdoor air temperature, along paths whose length depends on how big and
 * how compact the floor is. Feeding a ground slab through `calculateAssembly`
 * is not a value with a caveat — it is the wrong physics, and it fails in the
 * dangerous direction. For the Clinic's 150 mm uninsulated slab it returns
 * 3.87 W/m²K where ISO 13370 gives 0.24, a 16x overstatement of U and
 * ~9.5 kW/K on that floor area.
 *
 * The existing engine is NOT simply making that error, and the difference
 * matters. `heat-loss.ts` already pushes the ground floor at a reduced ΔT
 * (indoor vs a 13.5 °C ground temperature, commented "ISO 13370 simplified")
 * rather than at the outdoor design ΔT. But that compensates for the wrong
 * thing: it substitutes a warmer sink while still omitting the soil's own
 * resistance, which is most of what ISO 13370 computes. End to end on the
 * Clinic slab, at indoor 20 °C, the engine's 3.873 × 6.5 K = 25.2 W/m²
 * against ISO 13370's 0.238 × 7.5 K = 1.8 W/m² — still **14x**, about
 * 267 MWh/yr of heating demand that does not exist once the engine
 * annualizes it over its 4380-hour ground season. A reduced ΔT is not a
 * substitute for the soil path.
 *
 * Implements the slab-on-ground case of ISO 13370:2007 §9.1/§9.3:
 *
 *   B' = A / (0.5 P)                     characteristic dimension
 *   d_t = w + λ_g (R_si + R_f + R_se)    total equivalent thickness
 *
 *   d_t < B'  (uninsulated / poorly insulated)
 *       U = (2 λ_g / (π B' + d_t)) · ln(π B' / d_t + 1)
 *   d_t >= B' (well insulated)
 *       U = λ_g / (0.457 B' + d_t)
 *
 * Traceability row PHY-GROUND in docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md.
 *
 * Scope, stated rather than implied: slab-on-ground only. Suspended floors and
 * heated/unheated basements are §9.2 and §9.4 and are NOT covered — the caller
 * gets a throw, not a plausible-looking number for the wrong floor type.
 */

/**
 * ISO 13370 specifies the surface resistances that belong inside d_t. They are
 * the standard's own values, deliberately NOT the 에너지절약설계기준 해설서
 * constants that `assembly.ts` uses: the correlation these formulas come from
 * was fitted with these. Mixing a Korean surface resistance into an ISO 13370
 * equivalent thickness would be a category error, not a 1% difference.
 */
export const GROUND_RSI = 0.17;
export const GROUND_RSE = 0.04;

/** ISO 13370 Annex A soil conductivities, W/(m·K). */
export const SOIL_CONDUCTIVITY = {
  "clay-or-silt": 1.5,
  "sand-or-gravel": 2.0,
  "homogeneous-rock": 3.5,
} as const;

export type SoilCategory = keyof typeof SOIL_CONDUCTIVITY;

/**
 * The standard's own instruction when the soil is unknown: use 2.0. Recorded as
 * a named constant so a caller can cite the default rather than inline a 2.
 */
export const DEFAULT_SOIL_CONDUCTIVITY = SOIL_CONDUCTIVITY["sand-or-gravel"];

export type GroundFloorInput = Readonly<{
  /** A — the ground floor area, m². */
  areaSqm: number;
  /** P — the *exposed* perimeter only: the part adjoining the external environment, m. */
  exposedPerimeterM: number;
  /** w — total thickness of the wall at the slab edge, all layers included, m. */
  wallThicknessM: number;
  /**
   * R_f — the floor construction's own resistance (slab, all-over insulation
   * above/below/within it, floor covering), m²K/W. EXCLUDES surface
   * resistances: those enter separately through d_t.
   */
  floorResistanceM2KPerW: number;
  /** λ_g. Defaults to ISO 13370's own unknown-soil value of 2.0 W/(m·K). */
  soilConductivityWPerMK?: number;
}>;

export type GroundFloorResult = Readonly<{
  uValueWPerM2K: number;
  /** H_g = A·U, W/K. With no edge insulation the Ψ_g perimeter term is zero. */
  heatTransferCoefficientWPerK: number;
  /** B' = A / (0.5 P), m. */
  characteristicDimensionM: number;
  /** d_t, m. */
  equivalentThicknessM: number;
  /** Which branch of §9.3 applied — the two are not continuous in intent. */
  regime: "uninsulated" | "well-insulated";
  soilConductivityWPerMK: number;
}>;

export class GroundCouplingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroundCouplingError";
  }
}

const positive = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new GroundCouplingError(`${name} must be a positive finite number (got ${value}).`);
  }
};

const nonNegative = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new GroundCouplingError(`${name} must be a non-negative finite number (got ${value}).`);
  }
};

/**
 * Equivalent steady-state U for a slab on ground, per ISO 13370:2007 §9.3.
 *
 * Throws rather than guessing: a diagnostic tool that cannot answer must say
 * so, because a plausible ground U is indistinguishable from a correct one
 * once it has been multiplied by a floor area and put in a report.
 */
export function slabOnGroundUValue(input: GroundFloorInput): GroundFloorResult {
  const {
    areaSqm,
    exposedPerimeterM,
    wallThicknessM,
    floorResistanceM2KPerW,
    soilConductivityWPerMK = DEFAULT_SOIL_CONDUCTIVITY,
  } = input;

  positive(areaSqm, "areaSqm");
  positive(exposedPerimeterM, "exposedPerimeterM");
  positive(soilConductivityWPerMK, "soilConductivityWPerMK");
  nonNegative(wallThicknessM, "wallThicknessM");
  nonNegative(floorResistanceM2KPerW, "floorResistanceM2KPerW");

  const characteristicDimensionM = areaSqm / (0.5 * exposedPerimeterM);
  const equivalentThicknessM =
    wallThicknessM +
    soilConductivityWPerMK * (GROUND_RSI + floorResistanceM2KPerW + GROUND_RSE);

  const B = characteristicDimensionM;
  const dt = equivalentThicknessM;

  const uValueWPerM2K =
    dt < B
      ? ((2 * soilConductivityWPerMK) / (Math.PI * B + dt)) * Math.log((Math.PI * B) / dt + 1)
      : soilConductivityWPerMK / (0.457 * B + dt);

  return {
    uValueWPerM2K,
    heatTransferCoefficientWPerK: areaSqm * uValueWPerM2K,
    characteristicDimensionM,
    equivalentThicknessM,
    regime: dt < B ? "uninsulated" : "well-insulated",
    soilConductivityWPerMK,
  };
}

/**
 * The same slab across ISO 13370's three soil categories.
 *
 * Soil is almost never stated in a drawing set, and it moves the answer by a
 * factor of two. Reporting a bound the caller can disclose beats reporting a
 * single number whose precision is fictional.
 */
export function slabOnGroundUValueRange(
  input: Omit<GroundFloorInput, "soilConductivityWPerMK">
): Readonly<{ low: GroundFloorResult; nominal: GroundFloorResult; high: GroundFloorResult }> {
  return {
    low: slabOnGroundUValue({ ...input, soilConductivityWPerMK: SOIL_CONDUCTIVITY["clay-or-silt"] }),
    nominal: slabOnGroundUValue({ ...input, soilConductivityWPerMK: DEFAULT_SOIL_CONDUCTIVITY }),
    high: slabOnGroundUValue({
      ...input,
      soilConductivityWPerMK: SOIL_CONDUCTIVITY["homogeneous-rock"],
    }),
  };
}
