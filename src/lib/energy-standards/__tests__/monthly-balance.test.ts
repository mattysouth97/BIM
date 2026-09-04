import { beforeAll, describe, expect, it } from "vitest";
import { calculateAnnualDemand, normalizeEfficiency } from "@/lib/energy/annual-demand";
import { SEOUL_CLIMATE } from "@/lib/energy/climate-data";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { VENTILATION_ELEMENT_NAME, type HeatLossResult } from "@/lib/energy/heat-loss";
import {
  CLINIC_ASSUMPTIONS,
  CLINIC_GROUND_FLOOR,
  CLINIC_MATERIALS,
  CLINIC_MEASURED_ENVELOPE,
  CLINIC_RECIPE,
  CLINIC_TOTAL_FLOOR_AREA_SQM,
} from "@/lib/reference-buildings/bs-medical-dental-clinic-energy";
import { SEOUL_DERIVED, SEOUL_DERIVED_ID } from "../climate-seoul-derived";
import {
  __clearMonthlyClimateRegistry,
  monthlyClimateById,
  registerMonthlyClimate,
  type MonthlyClimate,
} from "../monthly-climate";
import {
  ACH50_TO_NATURAL_DIVISOR,
  AIR_HEAT_CAPACITY_WH_PER_M3K,
  calculateMonthlyBalance,
  coolingLossUtilisationFactor,
  heatingGainUtilisationFactor,
  INTERNAL_HEAT_CAPACITY_J_PER_M2K,
  MONTHLY_BALANCE_METHOD,
  MonthlyBalanceError,
  type MonthlyBalanceInput,
  type NamedAssumption,
} from "../monthly-balance";

// ── A small, fully specified building for the property tests ──────────────

/**
 * Every optional field is supplied here, so the only kernel assumption a run
 * of this fixture may carry is K-SKY (the stated omission of the sky
 * re-radiation term). The no-silent-default tests below build on that.
 */
const FULLY_SPECIFIED: MonthlyBalanceInput = {
  climate: SEOUL_DERIVED,
  conditionedFloorAreaSqm: 1000,
  volumeM3: 3000,
  opaqueElements: [
    { id: "wall", areaSqm: 800, uValueWPerM2K: 0.4 },
    { id: "roof", areaSqm: 500, uValueWPerM2K: 0.3 },
  ],
  glazing: [
    { id: "win-S", orientation: "S", areaSqm: 100, uValueWPerM2K: 2.0, gValue: 0.5, frameFraction: 0.25, shadingFactor: 0.9 },
    { id: "win-N", orientation: "N", areaSqm: 60, uValueWPerM2K: 2.0, gValue: 0.5, frameFraction: 0.25, shadingFactor: 1.0 },
  ],
  groundFloor: { areaSqm: 500, uValueWPerM2K: 0.25 },
  thermalBridgesWPerK: 20,
  ventilation: { ach50: 4, mechanicalAch: 0.5, heatRecoveryEfficiency: 0.6 },
  internalGains: { occupantsWPerM2: 5, lightingWPerM2: 8, equipmentWPerM2: 6, utilisationFraction: 0.4 },
  heatCapacityClass: "medium",
  heatingSetpointC: 20,
  coolingSetpointC: 26,
  glazingIncidenceFactor: 0.9,
};

const kernelIds = (assumptions: readonly NamedAssumption[]) =>
  assumptions.filter((a) => a.id.startsWith("K-")).map((a) => a.id).sort();

// ── 1. Utilisation factor bounds and limits ───────────────────────────────

describe("utilisation factors (ISO 13790 §12.2.1)", () => {
  const A_VALUES = [1.2, 2.5, 4.0, 8.0];

  it("η_H,gn stays within (0, 1] across a wide sweep of γ", () => {
    for (const a of A_VALUES) {
      for (let g = 1e-6; g < 1e6; g *= 1.37) {
        const eta = heatingGainUtilisationFactor(g, a);
        expect(eta).toBeGreaterThan(0);
        expect(eta).toBeLessThanOrEqual(1);
      }
    }
  });

  it("η_H,gn → 1 as γ → 0, and → 0 as γ → ∞", () => {
    for (const a of A_VALUES) {
      expect(heatingGainUtilisationFactor(1e-9, a)).toBeCloseTo(1, 8);
      expect(heatingGainUtilisationFactor(1e9, a)).toBeLessThan(1e-8);
      expect(heatingGainUtilisationFactor(1e300, a)).toBeLessThan(1e-200);
      expect(heatingGainUtilisationFactor(Number.POSITIVE_INFINITY, a)).toBe(0);
    }
  });

  it("η_C,ls stays within (0, 1], → 1 as γ → ∞ and → 0 as γ → 0", () => {
    for (const a of A_VALUES) {
      for (let g = 1e-6; g < 1e6; g *= 1.37) {
        const eta = coolingLossUtilisationFactor(g, a);
        expect(eta).toBeGreaterThan(0);
        expect(eta).toBeLessThanOrEqual(1);
      }
      expect(coolingLossUtilisationFactor(1e9, a)).toBeCloseTo(1, 8);
      expect(coolingLossUtilisationFactor(1e-9, a)).toBeLessThan(1e-8);
      expect(coolingLossUtilisationFactor(1e-300, a)).toBeLessThan(1e-200);
      expect(coolingLossUtilisationFactor(Number.POSITIVE_INFINITY, a)).toBe(1);
    }
  });

  it("is monotone: more gains per unit loss ⇒ lower η_H, higher η_C", () => {
    const a = 3.1;
    let prevH = 2;
    let prevC = -1;
    for (let g = 0.01; g < 100; g *= 1.1) {
      const h = heatingGainUtilisationFactor(g, a);
      const c = coolingLossUtilisationFactor(g, a);
      expect(h).toBeLessThan(prevH);
      expect(c).toBeGreaterThan(prevC);
      prevH = h;
      prevC = c;
    }
  });

  it("rejects a non-positive numerical parameter", () => {
    expect(() => heatingGainUtilisationFactor(0.5, 0)).toThrow(MonthlyBalanceError);
    expect(() => coolingLossUtilisationFactor(0.5, -1)).toThrow(MonthlyBalanceError);
  });
});

// ── 2. Continuity at γ = 1 ────────────────────────────────────────────────

describe("continuity at γ = 1 (the a/(a+1) branch)", () => {
  it("shows no step across γ = 1 in either factor", () => {
    for (const a of [1.5, 3.14, 6]) {
      const atOne = a / (a + 1);
      expect(heatingGainUtilisationFactor(1, a)).toBe(atOne);
      expect(coolingLossUtilisationFactor(1, a)).toBe(atOne);
      expect(heatingGainUtilisationFactor(1 - 1e-7, a)).toBeCloseTo(atOne, 6);
      expect(heatingGainUtilisationFactor(1 + 1e-7, a)).toBeCloseTo(atOne, 6);
      expect(coolingLossUtilisationFactor(1 - 1e-7, a)).toBeCloseTo(atOne, 6);
      expect(coolingLossUtilisationFactor(1 + 1e-7, a)).toBeCloseTo(atOne, 6);

      // A sweep through the point: consecutive differences must all be small
      // and of one sign — a branch step would show as one large jump.
      let prev = heatingGainUtilisationFactor(0.99, a);
      for (let g = 0.99 + 1e-4; g <= 1.01; g += 1e-4) {
        const cur = heatingGainUtilisationFactor(g, a);
        expect(Math.abs(cur - prev)).toBeLessThan(2e-4);
        expect(cur).toBeLessThan(prev);
        prev = cur;
      }
    }
  });
});

// ── 3 & 4. Monotonicity and energy conservation on a whole building ───────

describe("calculateMonthlyBalance on a fully specified building", () => {
  const base = calculateMonthlyBalance(FULLY_SPECIFIED);

  it("carries the method label and the climate's provenance sentence", () => {
    expect(base.method).toBe("ISO 13790 monthly (자체 구현)");
    expect(base.method).toBe(MONTHLY_BALANCE_METHOD);
    expect(base.method).not.toContain("ECO2 결과");
    expect(base.climateId).toBe(SEOUL_DERIVED_ID);
    expect(base.climateProvenanceNoticeKo).toContain("ECO2 표준기상데이터가 아님");
    expect(base.comparableToEco2).toBe(false);
    expect(base.version).not.toMatch(/^tier1-office-screening-/);
  });

  it("returns twelve months with the real calendar hours", () => {
    expect(base.months).toHaveLength(12);
    expect(base.months.map((m) => m.hours)).toEqual([744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744]);
    expect(base.months.reduce((s, m) => s + m.hours, 0)).toBe(8760);
  });

  it("conserves energy: Σ Q_H,nd ≤ Σ Q_ht and every monthly need is bounded by its own loss", () => {
    expect(base.annual.heatingNeedKwh).toBeLessThanOrEqual(base.annual.heatTransferHeatingKwh);
    for (const m of base.months) {
      expect(m.heatingNeedKwh).toBeGreaterThanOrEqual(0);
      expect(m.coolingNeedKwh).toBeGreaterThanOrEqual(0);
      expect(m.heatingNeedKwh).toBeLessThanOrEqual(Math.max(0, m.heatTransferHeatingKwh) + 1e-9);
      // Cooling need can never exceed the gains plus any inward heat flow.
      expect(m.coolingNeedKwh).toBeLessThanOrEqual(m.totalGainsKwh + Math.max(0, -m.heatTransferCoolingKwh) + 1e-9);
      expect(m.utilisationFactorHeating).toBeGreaterThan(0);
      expect(m.utilisationFactorHeating).toBeLessThanOrEqual(1);
      expect(m.utilisationFactorCooling).toBeGreaterThan(0);
      expect(m.utilisationFactorCooling).toBeLessThanOrEqual(1);
    }
    expect(base.annual.heatingNeedKwh).toBeGreaterThan(0);
    expect(base.annual.coolingNeedKwh).toBeGreaterThan(0);
  });

  it("is monotone in insulation: a lower wall U lowers annual Q_H,nd", () => {
    let prev = Number.POSITIVE_INFINITY;
    for (const u of [1.2, 0.8, 0.4, 0.2, 0.1]) {
      const r = calculateMonthlyBalance({
        ...FULLY_SPECIFIED,
        opaqueElements: [
          { id: "wall", areaSqm: 800, uValueWPerM2K: u },
          { id: "roof", areaSqm: 500, uValueWPerM2K: 0.3 },
        ],
      });
      expect(r.annual.heatingNeedKwh).toBeLessThan(prev);
      prev = r.annual.heatingNeedKwh;
    }
  });

  it("is monotone in south glazing: more area on S raises Q_sol every month", () => {
    let prev = calculateMonthlyBalance(FULLY_SPECIFIED);
    for (const area of [120, 160, 240]) {
      const r = calculateMonthlyBalance({
        ...FULLY_SPECIFIED,
        glazing: [{ ...FULLY_SPECIFIED.glazing[0], areaSqm: area }, FULLY_SPECIFIED.glazing[1]],
      });
      expect(r.annual.solarGainsKwh).toBeGreaterThan(prev.annual.solarGainsKwh);
      r.months.forEach((m, i) => expect(m.solarGainsKwh).toBeGreaterThan(prev.months[i].solarGainsKwh));
      prev = r;
    }
  });

  it("prices the ground floor at the annual-mean ΔT, not the month's", () => {
    // Same hours in January and July ⇒ identical ground term, even though the
    // external temperatures differ by ~26 K. A monthly-ΔT basis could not do this.
    const jan = base.months[0];
    const jul = base.months[6];
    expect(jan.hours).toBe(jul.hours);
    expect(jan.externalTemperatureC).not.toBeCloseTo(jul.externalTemperatureC, 0);
    expect(jan.groundHeatTransferHeatingKwh).toBeCloseTo(jul.groundHeatTransferHeatingKwh, 9);
    const expected =
      (500 * 0.25 * (20 - base.coefficients.annualMeanExternalTemperatureC) * 744) / 1000;
    expect(jan.groundHeatTransferHeatingKwh).toBeCloseTo(expected, 9);
    expect(base.coefficients.groundWPerK).toBeCloseTo(125, 9);
    expect(base.coefficients.annualMeanExternalTemperatureC).toBeCloseTo(11.4, 0);
  });

  it("builds H_ve from ACH50/20 plus heat-recovered mechanical air", () => {
    const expectedAch = 4 / ACH50_TO_NATURAL_DIVISOR + 0.5 * (1 - 0.6);
    expect(base.coefficients.effectiveAirChangesPerHour).toBeCloseTo(expectedAch, 12);
    expect(base.coefficients.ventilationWPerK).toBeCloseTo(AIR_HEAT_CAPACITY_WH_PER_M3K * expectedAch * 3000, 9);
  });

  it("derives the time constant from Table 12 capacity over every coupling incl. ground", () => {
    const H = base.coefficients.envelopeTransmissionWPerK + 20 + base.coefficients.groundWPerK + base.coefficients.ventilationWPerK;
    expect(base.coefficients.internalHeatCapacityJPerK).toBe(INTERNAL_HEAT_CAPACITY_J_PER_M2K.medium * 1000);
    expect(base.coefficients.timeConstantHours).toBeCloseTo(base.coefficients.internalHeatCapacityJPerK / H / 3600, 9);
    expect(base.coefficients.numericalParameterA).toBeCloseTo(1 + base.coefficients.timeConstantHours / 15, 12);
  });

  it("lists only the stated omission when every optional input is supplied", () => {
    expect(kernelIds(base.assumptions)).toEqual(["K-SKY"]);
  });
});

// ── No silent defaults ────────────────────────────────────────────────────

describe("no silent defaults", () => {
  it("throws on a missing climate, naming the field — never Seoul, never a neighbour", () => {
    expect(() => calculateMonthlyBalance({ ...FULLY_SPECIFIED, climate: undefined as unknown as MonthlyClimate }))
      .toThrow(/climate is required/);
    expect(() => calculateMonthlyBalance({ ...FULLY_SPECIFIED, climate: null as unknown as MonthlyClimate }))
      .toThrow(MonthlyBalanceError);
  });

  it("refuses an unregistered climate id rather than substituting one", () => {
    __clearMonthlyClimateRegistry();
    const resolved = monthlyClimateById("KR-Busan-does-not-exist");
    expect(resolved).toBeNull();
    expect(() => calculateMonthlyBalance({ ...FULLY_SPECIFIED, climate: resolved as unknown as MonthlyClimate }))
      .toThrow(MonthlyBalanceError);
  });

  it.each([
    ["conditionedFloorAreaSqm", { conditionedFloorAreaSqm: 0 }],
    ["conditionedFloorAreaSqm", { conditionedFloorAreaSqm: undefined }],
    ["volumeM3", { volumeM3: Number.NaN }],
    ["volumeM3", { volumeM3: -5 }],
    ["opaqueElements[0] (wall).uValueWPerM2K", { opaqueElements: [{ id: "wall", areaSqm: 10, uValueWPerM2K: 0 }] }],
    ["opaqueElements[1].areaSqm", { opaqueElements: [{ id: "a", areaSqm: 10, uValueWPerM2K: 1 }, { id: "", areaSqm: undefined, uValueWPerM2K: 1 }] }],
    ["glazing[0] (w).gValue", { glazing: [{ id: "w", orientation: "S", areaSqm: 10, uValueWPerM2K: 2 }] }],
    ["glazing[0] (w).orientation", { glazing: [{ id: "w", orientation: "south", areaSqm: 10, uValueWPerM2K: 2, gValue: 0.5 }] }],
    ["groundFloor.uValueWPerM2K", { groundFloor: { areaSqm: 10, uValueWPerM2K: undefined } }],
    ["groundFloor is required", { groundFloor: undefined }],
    ["ventilation.ach50", { ventilation: { mechanicalAch: 0 } }],
    ["internalGains.lightingWPerM2", { internalGains: { occupantsWPerM2: 1, equipmentWPerM2: 1 } }],
  ])("throws naming %s", (needle, patch) => {
    expect(() => calculateMonthlyBalance({ ...FULLY_SPECIFIED, ...(patch as Partial<MonthlyBalanceInput>) } as MonthlyBalanceInput))
      .toThrow(needle);
  });

  it("accepts an explicit null ground floor and prices no ground term", () => {
    const r = calculateMonthlyBalance({ ...FULLY_SPECIFIED, groundFloor: null });
    expect(r.coefficients.groundWPerK).toBe(0);
    expect(r.months.every((m) => m.groundHeatTransferHeatingKwh === 0)).toBe(true);
  });

  it("returns every default it used in assumptions[], and nothing it did not use", () => {
    const r = calculateMonthlyBalance({
      climate: SEOUL_DERIVED,
      conditionedFloorAreaSqm: 1000,
      volumeM3: 3000,
      opaqueElements: FULLY_SPECIFIED.opaqueElements,
      glazing: [{ id: "w", orientation: "S", areaSqm: 100, uValueWPerM2K: 2, gValue: 0.5 }],
      groundFloor: null,
      ventilation: { ach50: 4 },
      internalGains: { occupantsWPerM2: 5, lightingWPerM2: 8, equipmentWPerM2: 6 },
    });
    expect(kernelIds(r.assumptions)).toEqual(
      ["K-BRIDGES", "K-CM", "K-FRAME", "K-FW", "K-GAIN-SCHEDULE", "K-HR", "K-MECH-VENT", "K-SETPOINT-C", "K-SETPOINT-H", "K-SHADING", "K-SKY"].sort(),
    );
    // And the defaults are the ones the assumptions claim.
    expect(r.coefficients.thermalBridgesWPerK).toBe(0);
    expect(r.coefficients.internalHeatCapacityJPerK).toBe(165_000 * 1000);
    expect(r.coefficients.effectiveAirChangesPerHour).toBeCloseTo(0.2, 12);
    const cm = r.assumptions.find((a) => a.id === "K-CM");
    expect(cm?.assumes).toContain("165,000");
  });

  it("drops a default's assumption the moment the caller states the value", () => {
    const withFrame = calculateMonthlyBalance({
      ...FULLY_SPECIFIED,
      glazing: FULLY_SPECIFIED.glazing.map((g) => ({ ...g, shadingFactor: undefined })),
    });
    expect(kernelIds(withFrame.assumptions)).toEqual(["K-SHADING", "K-SKY"]);
  });

  it("prepends the caller's carried assumptions", () => {
    const carried = [{ id: "A-TEST", assumes: "x", why: "y" }];
    const r = calculateMonthlyBalance({ ...FULLY_SPECIFIED, carriedAssumptions: carried });
    expect(r.assumptions[0]).toEqual(carried[0]);
    expect(r.assumptions.at(-1)?.id).toBe("K-SKY");
  });
});

// ── 5 & 6. The Clinic ─────────────────────────────────────────────────────

/**
 * The Clinic on SEOUL_DERIVED. Quantities come from the normal path —
 * `envelopeQuantities(CLINIC_RECIPE)`, which returns the measured envelope
 * with `source: "measured"` — and the wall/glazing/door breakdown from
 * `CLINIC_MEASURED_ENVELOPE`. Nothing here is a literal any more (`91d57ad`
 * landed the fields these previously hardcoded).
 *
 * Glazing is the measured aperture used DIRECTLY in the solar term, never
 * re-derived from wall × WWR: the engine's `windows = gross × wwr` shape is
 * its own, and reproducing it here would only add a rounding path between two
 * numbers the file already states.
 */
const CLINIC_QUANTITIES = envelopeQuantities(CLINIC_RECIPE);

/** Weekday/weekend schedules from CLINIC_MATERIALS, time-averaged over a week. */
function scheduleUtilisation(): number {
  const wd = CLINIC_MATERIALS.occupancy.weekdaySchedule.reduce((s, v) => s + v, 0);
  const we = CLINIC_MATERIALS.occupancy.weekendSchedule.reduce((s, v) => s + v, 0);
  return (5 * wd + 2 * we) / (7 * 24);
}

/**
 * The volume `envelopeQuantities` returns — `conditionedVolumeGrossM3`, the
 * air-barrier volume ACH50 is quoted against. NOT `roomVolumeNetM3`, whose
 * room solids stop at the 2.80 m ceilings and omit every plenum (37 % low);
 * the sanity check below asserts the two are not confused.
 *
 * The gross-vs-air-volume caveat (~6 %, slab and structure included in gross)
 * is A-VOLUME's, on the Clinic file. This run does not restate it — two
 * assumptions saying one thing is how they drift apart.
 */
const CLINIC_VOLUME_GROSS_M3 = CLINIC_QUANTITIES.volumeM3;
/** A-VOLUME's ~6 % clause, as a second point for the sanity band only. */
const CLINIC_VOLUME_AIR_APPROX_M3 = CLINIC_VOLUME_GROSS_M3 * 0.94;

const CLINIC_RUN_ASSUMPTIONS: readonly NamedAssumption[] = [
  {
    id: "R-GLAZING-SPLIT",
    assumes: `The measured ${CLINIC_MEASURED_ENVELOPE.glazingApertureSqm} m² glazing aperture split across N/E/S/W in proportion to each façade's net wall area.`,
    why: "The per-orientation glazing split is a separate verification not yet landed. Proportional-to-wall is the uniform-WWR reading of A-WWR-DENOMINATOR; no façade is favoured.",
  },
  {
    id: "R-FRAME-MEASURED",
    assumes: `Frame fraction 1 − ${CLINIC_MEASURED_ENVELOPE.glazingPaneSqm} / ${CLINIC_MEASURED_ENVELOPE.glazingApertureSqm} = ${(1 - CLINIC_MEASURED_ENVELOPE.glazingPaneSqm / CLINIC_MEASURED_ENVELOPE.glazingApertureSqm).toFixed(3)} from the measured pane and aperture areas.`,
    why: "Both areas are in the manifest, so the ISO default of 0.3 is not needed; the measured fraction is used and the kernel's K-FRAME default therefore does not appear.",
  },
  {
    id: "R-GAINS-MAP",
    assumes: "internalHeatGain 15 W/m² entered as occupants+equipment, lighting 9.4 W/m² separately, both time-averaged by the clinic schedule (48/168 = 0.286).",
    why: "CLINIC_MATERIALS states one combined internal gain and a lighting power density; the kernel takes three terms and a utilisation fraction. The mapping is stated rather than implied.",
  },
];

function clinicInput(volumeM3: number): MonthlyBalanceInput {
  const wallU = CLINIC_MATERIALS.envelope.walls[0].uValue;
  const byOrient = CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm;
  const wallTotal = byOrient.N + byOrient.E + byOrient.S + byOrient.W;
  const glazingArea = CLINIC_MEASURED_ENVELOPE.glazingApertureSqm;
  const frameFraction = 1 - CLINIC_MEASURED_ENVELOPE.glazingPaneSqm / glazingArea;
  const win = CLINIC_MATERIALS.envelope.windows;

  return {
    climate: SEOUL_DERIVED,
    conditionedFloorAreaSqm: CLINIC_QUANTITIES.intensityFloorAreaSqm,
    volumeM3,
    opaqueElements: [
      { id: "wall-net", areaSqm: CLINIC_MEASURED_ENVELOPE.exteriorWallNetSqm, uValueWPerM2K: wallU },
      { id: "exterior-doors", areaSqm: CLINIC_MEASURED_ENVELOPE.exteriorDoorSqm, uValueWPerM2K: wallU },
      { id: "roof-weighted", areaSqm: CLINIC_QUANTITIES.roofAreaSqm, uValueWPerM2K: CLINIC_MATERIALS.envelope.roof.uValue },
    ],
    glazing: (["N", "E", "S", "W"] as const).map((o) => ({
      id: `glazing-${o}`,
      orientation: o,
      areaSqm: (glazingArea * byOrient[o]) / wallTotal,
      uValueWPerM2K: win.uValue,
      gValue: win.shgc,
      frameFraction,
    })),
    groundFloor: {
      areaSqm: CLINIC_QUANTITIES.planAreaSqm,
      uValueWPerM2K: CLINIC_GROUND_FLOOR.uValueWPerM2K,
    },
    thermalBridgesWPerK: CLINIC_MATERIALS.envelope.walls[0].thermalBridge ?? 0,
    ventilation: {
      ach50: CLINIC_MATERIALS.envelope.airtightness.ach50,
      mechanicalAch: CLINIC_MATERIALS.hvac.ventilation.airflowRate,
      heatRecoveryEfficiency: CLINIC_MATERIALS.hvac.ventilation.heatRecoveryEfficiency,
    },
    internalGains: {
      occupantsWPerM2: CLINIC_MATERIALS.occupancy.internalHeatGain,
      lightingWPerM2: CLINIC_MATERIALS.lighting.lightingPowerDensity,
      equipmentWPerM2: 0,
      utilisationFraction: scheduleUtilisation(),
    },
    carriedAssumptions: [...CLINIC_ASSUMPTIONS, ...CLINIC_RUN_ASSUMPTIONS],
  };
}

/**
 * The degree-day kernel on the SAME measured areas, through its own
 * annualisation (`calculateAnnualDemand`), not a re-derivation of its formula.
 * No route yet injects the measured envelope, so the engine's element list is
 * assembled here in the shape `calculateHeatLoss` emits.
 */
function degreeDayHeatingRawKwh(volumeM3: number): number {
  const wallU = CLINIC_MATERIALS.envelope.walls[0].uValue;
  const dT = SEOUL_CLIMATE.indoorTemp - SEOUL_CLIMATE.winterDesignTemp;
  const groundDt = SEOUL_CLIMATE.indoorTemp - (CLINIC_MATERIALS.envelope.foundation?.groundTemperature ?? 13.5);
  const ach = CLINIC_MATERIALS.envelope.airtightness.ach50 / 20;
  const el = (element: string, area: number, uValue: number, deltaT: number, h = area * uValue) => ({
    element, area, uValue, hCoefficient: h, deltaT, heatLoss: h * deltaT, heatLossPerSqm: 0,
  });
  const heatLoss: HeatLossResult = {
    elements: [
      el("Walls", CLINIC_MEASURED_ENVELOPE.exteriorWallNetSqm + CLINIC_MEASURED_ENVELOPE.exteriorDoorSqm, wallU, dT),
      el("Windows", CLINIC_MEASURED_ENVELOPE.glazingApertureSqm, CLINIC_MATERIALS.envelope.windows.uValue, dT),
      el("Roof", CLINIC_QUANTITIES.roofAreaSqm, CLINIC_MATERIALS.envelope.roof.uValue, dT),
      el("Ground Floor", CLINIC_QUANTITIES.planAreaSqm, CLINIC_GROUND_FLOOR.uValueWPerM2K, groundDt),
      // The engine's ventilation element: area = volume, uValue = ACH, h = 0.34·ACH·V.
      // Left as area × uValue this is 2.9× too large and swings the ratio to 0.49.
      el(VENTILATION_ELEMENT_NAME, volumeM3, ach, dT, AIR_HEAT_CAPACITY_WH_PER_M3K * ach * volumeM3),
    ],
    totalHeatLoss: 0,
    totalHeatLossPerSqm: 0,
  };
  const demand = calculateAnnualDemand(heatLoss, CLINIC_MATERIALS, CLINIC_RECIPE, SEOUL_CLIMATE);
  // The engine divides the raw need by boiler efficiency; undo that to compare Q_H,nd with Q_H,nd.
  const eta = Math.min(Math.max(normalizeEfficiency(CLINIC_MATERIALS.hvac.heating.efficiency), 0.3), 6);
  return demand.heatingDemand * eta;
}

describe("the Clinic on SEOUL_DERIVED", () => {
  beforeAll(() => {
    __clearMonthlyClimateRegistry();
    registerMonthlyClimate(SEOUL_DERIVED);
  });

  it("resolves the climate from the registry only after it is registered", () => {
    expect(monthlyClimateById(SEOUL_DERIVED_ID)).toBe(SEOUL_DERIVED);
  });

  it("takes its quantities from the measured path, and they reconcile", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    expect(CLINIC_QUANTITIES.source).toBe("measured");
    // Gross wall is opaque + glazing + doors exactly: nothing is un-priced and
    // nothing is counted twice. 2,150.30 + 267.16 + 37.06 = 2,454.52.
    expect(e.grossWallSqm).toBeCloseTo(e.exteriorWallNetSqm + e.glazingApertureSqm + e.exteriorDoorSqm, 9);
    expect(CLINIC_QUANTITIES.grossWallAreaSqm).toBe(e.grossWallSqm);
    // What this kernel prices as opaque + glazing must equal that same gross.
    const opaqueWallPriced = e.exteriorWallNetSqm + e.exteriorDoorSqm;
    expect(opaqueWallPriced + e.glazingApertureSqm).toBeCloseTo(CLINIC_QUANTITIES.grossWallAreaSqm, 9);
    expect(CLINIC_QUANTITIES.roofAreaSqm).toBeCloseTo(e.roofEpdmSqm + e.roofStandingSeamSqm, 9);
    expect(CLINIC_QUANTITIES.planAreaSqm).toBe(e.groundSlabSqm);
    expect(CLINIC_QUANTITIES.intensityFloorAreaSqm).toBe(CLINIC_TOTAL_FLOOR_AREA_SQM);
  });

  it("uses the gross conditioned volume for H_ve, never the room-solid sum", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    expect(CLINIC_VOLUME_GROSS_M3).toBe(e.conditionedVolumeGrossM3);
    expect(CLINIC_VOLUME_GROSS_M3).not.toBe(e.roomVolumeNetM3);
    // The room solids stop at the ceilings; using them would cut H_ve by 37 %.
    expect(e.roomVolumeNetM3 / e.conditionedVolumeGrossM3).toBeCloseTo(0.625, 2);
  });

  it("prices the glazing from the measured aperture, and the WWR field agrees with it", () => {
    const e = CLINIC_MEASURED_ENVELOPE;
    const r = calculateMonthlyBalance(clinicInput(CLINIC_VOLUME_GROSS_M3));
    // The solar term's glazing sums to the measured aperture — no ratio round trip.
    const glazedTotal = clinicInput(CLINIC_VOLUME_GROSS_M3).glazing.reduce((s, g) => s + g.areaSqm, 0);
    expect(glazedTotal).toBeCloseTo(e.glazingApertureSqm, 9);
    // And the engine's own WWR, derived on the file, reproduces that aperture
    // from the gross wall — asserted against the field, never a literal.
    const wwr = CLINIC_MATERIALS.envelope.windows.windowToWallRatio;
    expect(wwr.N).toBeCloseTo(e.glazingApertureSqm / e.grossWallSqm, 12);
    expect(e.grossWallSqm * wwr.N).toBeCloseTo(e.glazingApertureSqm, 9);
    expect(wwr.N).toBeCloseTo(0.10884, 5);
    // H_g agrees with ground-coupling's own fixture (944ac44) by construction.
    expect(r.coefficients.groundWPerK).toBeCloseTo(620.7, 1);
  });

  it("carries the 17 Clinic assumptions, the run's own, and the kernel's, plus the provenance notice", () => {
    const r = calculateMonthlyBalance({ ...clinicInput(CLINIC_VOLUME_GROSS_M3), climate: monthlyClimateById(SEOUL_DERIVED_ID)! });
    expect(CLINIC_ASSUMPTIONS).toHaveLength(18);
    for (const a of CLINIC_ASSUMPTIONS) expect(r.assumptions).toContainEqual(a);
    for (const a of CLINIC_RUN_ASSUMPTIONS) expect(r.assumptions).toContainEqual(a);
    // Everything the run stated explicitly must NOT reappear as a kernel default.
    expect(kernelIds(r.assumptions)).toEqual(["K-CM", "K-FW", "K-SETPOINT-C", "K-SETPOINT-H", "K-SHADING", "K-SKY"]);
    expect(r.method).toBe("ISO 13790 monthly (자체 구현)");
    expect(r.climateProvenanceNoticeKo).toContain("ECO2 표준기상데이터가 아님");
    expect(r.climateProvenanceNoticeKo).toContain("PVGIS");
    expect(r.comparableToEco2).toBe(false);
  });

  it("lands within a factor of ~2 of the degree-day kernel's raw heating figure (sanity band, not equality)", () => {
    for (const volume of [CLINIC_VOLUME_GROSS_M3, CLINIC_VOLUME_AIR_APPROX_M3]) {
      const monthly = calculateMonthlyBalance(clinicInput(volume)).annual.heatingNeedKwh;
      const degreeDay = degreeDayHeatingRawKwh(volume);
      const ratio = monthly / degreeDay;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    }
  });

  it("conserves energy and keeps every utilisation factor in (0, 1]", () => {
    const r = calculateMonthlyBalance(clinicInput(CLINIC_VOLUME_GROSS_M3));
    expect(r.annual.heatingNeedKwh).toBeLessThanOrEqual(r.annual.heatTransferHeatingKwh);
    for (const m of r.months) {
      expect(m.utilisationFactorHeating).toBeGreaterThan(0);
      expect(m.utilisationFactorHeating).toBeLessThanOrEqual(1);
      expect(m.heatingNeedKwh).toBeGreaterThanOrEqual(0);
      expect(m.coolingNeedKwh).toBeGreaterThanOrEqual(0);
    }
    // A Seoul clinic heats in January and cools in July; a kernel that cannot
    // tell the seasons apart is not a monthly kernel.
    expect(r.months[0].heatingNeedKwh).toBeGreaterThan(r.months[6].heatingNeedKwh);
    expect(r.months[6].coolingNeedKwh).toBeGreaterThan(r.months[0].coolingNeedKwh);
  });

  it("reports the monthly and annual figures (read from the test output; not asserted, not tuned)", () => {
    const r = calculateMonthlyBalance(clinicInput(CLINIC_VOLUME_GROSS_M3));
    const f = (n: number) => Math.round(n).toLocaleString("en-US").padStart(9);
    const lines = [
      `Clinic / ${r.climateId} / V=${CLINIC_VOLUME_GROSS_M3} m³ / A_floor=${CLINIC_TOTAL_FLOOR_AREA_SQM} m²`,
      `H_env=${r.coefficients.envelopeTransmissionWPerK.toFixed(1)} W/K  H_g=${r.coefficients.groundWPerK.toFixed(1)}  H_ve=${r.coefficients.ventilationWPerK.toFixed(1)}  τ=${r.coefficients.timeConstantHours.toFixed(1)} h  a=${r.coefficients.numericalParameterA.toFixed(2)}  θ̄_e=${r.coefficients.annualMeanExternalTemperatureC.toFixed(2)} °C`,
      "mon   θ_e     Q_ht,H     Q_sol     Q_int    γ_H    η_H    Q_H,nd    Q_C,nd   [kWh]",
      ...r.months.map((m) =>
        `${String(m.month).padStart(2)}  ${m.externalTemperatureC.toFixed(1).padStart(5)} ${f(m.heatTransferHeatingKwh)} ${f(m.solarGainsKwh)} ${f(m.internalGainsKwh)}  ${m.gainLossRatioHeating.toFixed(2).padStart(5)}  ${m.utilisationFactorHeating.toFixed(3)} ${f(m.heatingNeedKwh)} ${f(m.coolingNeedKwh)}`,
      ),
      `annual Q_H,nd=${f(r.annual.heatingNeedKwh)} kWh (${r.annual.heatingNeedKwhPerM2.toFixed(1)} kWh/m²)  Q_C,nd=${f(r.annual.coolingNeedKwh)} kWh (${r.annual.coolingNeedKwhPerM2.toFixed(1)} kWh/m²)`,
      `annual Q_ht,H=${f(r.annual.heatTransferHeatingKwh)}  Q_sol=${f(r.annual.solarGainsKwh)}  Q_int=${f(r.annual.internalGainsKwh)}`,
      ...[CLINIC_VOLUME_GROSS_M3, CLINIC_VOLUME_AIR_APPROX_M3].map((v) => {
        const m = calculateMonthlyBalance(clinicInput(v)).annual;
        const dd = degreeDayHeatingRawKwh(v);
        return `V=${v}: monthly Q_H,nd=${f(m.heatingNeedKwh)}  Q_C,nd=${f(m.coolingNeedKwh)}  degree-day raw heating=${f(dd)}  ratio=${(m.heatingNeedKwh / dd).toFixed(2)}`;
      }),
      `assumptions carried: ${r.assumptions.length} (${r.assumptions.map((a) => a.id).join(", ")})`,
      `notice: ${r.climateProvenanceNoticeKo}`,
    ];
    console.log(lines.join("\n"));
    expect(r.annual.heatingNeedKwh).toBeGreaterThan(0);
  });
});
