/**
 * ISO 13790 monthly quasi-steady-state heat balance — the method ECO2 runs.
 *
 * This is an implementation of the METHOD (ISO 13790:2008 §7 monthly, the same
 * family as DIN V 18599 that ECO2 evaluates on). It is not ECO2, and nothing it
 * returns may be labelled "ECO2 결과". The result carries
 * `method: "ISO 13790 monthly (자체 구현)"` and the climate's provenance
 * sentence for exactly that reason: a reader must be able to tell, from the
 * result object alone, that both the method and the weather are ours.
 *
 * ## The balance, per month m
 *
 *     H_tr   = Σ U_i·A_i  (opaque + glazing)  + H_tb            [W/K]
 *     H_ve   = 0.34 Wh/m³K · ACH_eff · V                         [W/K]
 *     H_g    = U_g,ISO13370 · A_g                                [W/K]
 *
 *     Q_ht,m = (H_tr + H_ve)·(θ_int − θ_e,m)·t_m  +  H_g·(θ_int − θ̄_e,year)·t_m
 *     Q_sol  = Σ_glazing  F_sh · F_w·g_n · (1 − F_F) · A_w · I_m,orient
 *     Q_int  = (q_occ + q_light + q_equip) · f_use · A_floor · t_m
 *     Q_gn   = Q_int + Q_sol
 *
 *     γ = Q_gn / Q_ht ;  τ = C_m / (H_tr + H_ve + H_g) / 3600 h ;  a = a_0 + τ/τ_0
 *     η_H,gn = (1 − γ^a) / (1 − γ^(a+1))        (γ ≠ 1; a/(a+1) at γ = 1)
 *     Q_H,nd = max(0, Q_ht,H − η_H,gn·Q_gn)
 *
 *     η_C,ls = (1 − γ^−a) / (1 − γ^−(a+1))      (γ ≠ 1; a/(a+1) at γ = 1; 1 for γ < 0)
 *     Q_C,nd = max(0, Q_gn − η_C,ls·Q_ht,C)
 *
 * Heating and cooling evaluate Q_ht at their own set-points (θ_int,H and
 * θ_int,C), as ISO 13790 §7.2.1.1 / §7.2.1.2 do; there is no single Q_ht.
 *
 * ## The ground floor is a separate term on purpose
 *
 * `slabOnGroundUValue` (ISO 13370 §9.3) already contains the soil path; its U
 * pairs with the ANNUAL-MEAN external temperature, because the correlation it
 * comes from is the steady-state term of the ground heat transfer. Folding
 * that U into H_tr against the month's temperature would over-price the ground
 * in January and under-price it in July for no physical reason. So the ground
 * term is (θ_int − θ̄_e,year), never (θ_int − θ_e,m). `calculateAssembly` is
 * never used for a ground floor here — the brief records the 14× end-to-end
 * error that produces.
 *
 * ## No silent defaults
 *
 * Twelve months × several terms is a great many places for a plausible wrong
 * number to hide. Every required input throws, naming the field. Every input
 * that may default does so ONLY through `withDefault`, which records the
 * default in the returned `assumptions[]`. A default that is not in that list
 * is a defect, and the test suite asserts the list against the inputs that
 * were omitted.
 *
 * Pure module: numbers in, numbers out. No React, no store, no route.
 */

import {
  climateProvenanceNoticeKo,
  ORIENTATIONS,
  type MonthlyClimate,
  type Orientation,
} from "./monthly-climate";

export const MONTHLY_BALANCE_METHOD = "ISO 13790 monthly (자체 구현)" as const;

/**
 * A distinct version string. The Tier-1 acceptance gate keys on the
 * `tier1-office-screening-` prefix; this must never share it.
 */
export const MONTHLY_BALANCE_VERSION = "iso13790-monthly-1" as const;

/** ρ_a·c_a for air, Wh/(m³·K). The same constant `heat-loss.ts` uses. */
export const AIR_HEAT_CAPACITY_WH_PER_M3K = 0.34;

/** ACH50 → natural infiltration ACH divisor (LBL N-factor). Never "simplify" away. */
export const ACH50_TO_NATURAL_DIVISOR = 20;

/** ISO 13790 Table 12 — monthly method numerical parameters. */
export const ISO13790_A0 = 1.0;
export const ISO13790_TAU0_HOURS = 15;

/**
 * |γ − 1| below which the utilisation factors switch to their first-order
 * expansion. At 1e-8 the expansion's O(ε²) error is ~1e-16 — below double
 * precision — while the closed forms have already lost ~8 digits to
 * cancellation.
 */
const NEAR_ONE = 1e-8;

/**
 * ISO 13790 Table 12 — internal heat capacity per m² of conditioned floor
 * area, J/(m²·K), by building class.
 */
export const INTERNAL_HEAT_CAPACITY_J_PER_M2K = {
  "very-light": 80_000,
  light: 110_000,
  medium: 165_000,
  heavy: 260_000,
  "very-heavy": 370_000,
} as const;

export type HeatCapacityClass = keyof typeof INTERNAL_HEAT_CAPACITY_J_PER_M2K;

/** Non-leap calendar. ISO 13790 integrates over the real month length. */
export const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
export const HOURS_PER_MONTH = DAYS_PER_MONTH.map((d) => d * 24) as readonly number[];

export type NamedAssumption = Readonly<{ id: string; assumes: string; why: string }>;

export type OpaqueElementInput = Readonly<{
  /** Stable id so a loss can be traced back to the surface ("wall-N", "roof-epdm"). */
  id: string;
  areaSqm: number;
  uValueWPerM2K: number;
}>;

export type GlazingElementInput = Readonly<{
  id: string;
  orientation: Orientation;
  areaSqm: number;
  uValueWPerM2K: number;
  /** g_gl,n — normal-incidence total solar energy transmittance (SHGC). Required. */
  gValue: number;
  /** F_F — frame fraction of the aperture area. Defaults to 0.3 (disclosed). */
  frameFraction?: number;
  /** F_sh — external shading reduction factor. Defaults to 1.0 (disclosed). */
  shadingFactor?: number;
}>;

/**
 * The ground floor as an ISO 13370 coupling. Pass `null` to state explicitly
 * that the building has no ground contact — an omitted field is not accepted,
 * because an absent ground floor and a forgotten one are the same zero.
 */
export type GroundFloorInput = Readonly<{
  areaSqm: number;
  /** U from `slabOnGroundUValue` (ISO 13370). NOT from `calculateAssembly`. */
  uValueWPerM2K: number;
}>;

export type MonthlyBalanceInput = Readonly<{
  climate: MonthlyClimate;
  /** A_floor — conditioned floor area, m². Drives Q_int and C_m. */
  conditionedFloorAreaSqm: number;
  /** V — conditioned volume, m³. Drives H_ve. */
  volumeM3: number;
  opaqueElements: readonly OpaqueElementInput[];
  glazing: readonly GlazingElementInput[];
  groundFloor: GroundFloorInput | null;
  /** H_tb — linear thermal bridge total, W/K. Defaults to 0 (disclosed). */
  thermalBridgesWPerK?: number;
  ventilation: Readonly<{
    /** Blower-door result. Required — no register or drawing states it. */
    ach50: number;
    /** Mechanical supply, air changes per hour. Defaults to 0 (disclosed). */
    mechanicalAch?: number;
    /** Heat-recovery efficiency on the mechanical part, 0..0.95. Defaults to 0 (disclosed). */
    heatRecoveryEfficiency?: number;
  }>;
  internalGains: Readonly<{
    /** q_occ — occupants, W/m² of conditioned floor area, at full occupancy. Required. */
    occupantsWPerM2: number;
    /** q_light, W/m². Required. */
    lightingWPerM2: number;
    /** q_equip, W/m². Required. */
    equipmentWPerM2: number;
    /** Time-averaged fraction of the installed gains (0..1). Defaults to 1.0 (disclosed). */
    utilisationFraction?: number;
  }>;
  /** ISO 13790 Table 12 class. Defaults to "medium" (disclosed). */
  heatCapacityClass?: HeatCapacityClass;
  /** θ_int,set,H, °C. Defaults to 20 (disclosed). */
  heatingSetpointC?: number;
  /** θ_int,set,C, °C. Defaults to 26 (disclosed). */
  coolingSetpointC?: number;
  /**
   * F_w — correction for non-scattering glazing (ISO 13790 §11.4.2), applied
   * to g_gl,n. Defaults to 0.9 (disclosed).
   */
  glazingIncidenceFactor?: number;
  /**
   * Assumptions the caller already carries (a building's own named list). They
   * are returned ahead of the kernel's, so one result holds every assumption
   * that shaped its number.
   */
  carriedAssumptions?: readonly NamedAssumption[];
}>;

export type MonthlyBalanceRow = Readonly<{
  /** 1..12 */
  month: number;
  hours: number;
  externalTemperatureC: number;
  /** Q_ht at the heating set-point, kWh (transmission + ventilation + ground). */
  heatTransferHeatingKwh: number;
  /** Q_ht at the cooling set-point, kWh. May be negative when outside is warmer. */
  heatTransferCoolingKwh: number;
  /** The ground-floor share of heatTransferHeatingKwh, kWh (annual-mean ΔT basis). */
  groundHeatTransferHeatingKwh: number;
  solarGainsKwh: number;
  internalGainsKwh: number;
  totalGainsKwh: number;
  /** γ_H = Q_gn / Q_ht,H. Infinity when Q_ht,H is 0, negative when outside is warmer. */
  gainLossRatioHeating: number;
  /** η_H,gn ∈ (0, 1]. */
  utilisationFactorHeating: number;
  gainLossRatioCooling: number;
  /** η_C,ls ∈ (0, 1]. */
  utilisationFactorCooling: number;
  /** Q_H,nd, kWh, ≥ 0. */
  heatingNeedKwh: number;
  /** Q_C,nd, kWh, ≥ 0. */
  coolingNeedKwh: number;
}>;

export type MonthlyBalanceResult = Readonly<{
  method: typeof MONTHLY_BALANCE_METHOD;
  version: typeof MONTHLY_BALANCE_VERSION;
  climateId: string;
  /** The sentence that must be rendered beside any number below. */
  climateProvenanceNoticeKo: string;
  /** True only on ECO2's own weather; false means differences cannot be attributed. */
  comparableToEco2: boolean;
  coefficients: Readonly<{
    /** Σ U·A over opaque + glazing, W/K (excludes bridges and ground). */
    envelopeTransmissionWPerK: number;
    thermalBridgesWPerK: number;
    /** H_g, W/K — ISO 13370 U × area. Priced at annual-mean ΔT, listed separately. */
    groundWPerK: number;
    ventilationWPerK: number;
    effectiveAirChangesPerHour: number;
    internalHeatCapacityJPerK: number;
    timeConstantHours: number;
    /** a_H = a_C = a_0 + τ/τ_0. */
    numericalParameterA: number;
    annualMeanExternalTemperatureC: number;
  }>;
  months: readonly MonthlyBalanceRow[];
  annual: Readonly<{
    heatingNeedKwh: number;
    coolingNeedKwh: number;
    heatTransferHeatingKwh: number;
    solarGainsKwh: number;
    internalGainsKwh: number;
    heatingNeedKwhPerM2: number;
    coolingNeedKwhPerM2: number;
  }>;
  /** Carried assumptions first, then every default this run actually used. */
  assumptions: readonly NamedAssumption[];
}>;

export class MonthlyBalanceError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "MonthlyBalanceError";
  }
}

// ── Input discipline ──────────────────────────────────────────────────────

function requirePositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new MonthlyBalanceError(
      `${field} must be a positive finite number (got ${String(value)}). ` +
        `The kernel does not default it.`,
      field,
    );
  }
  return value;
}

function requireNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new MonthlyBalanceError(
      `${field} must be a non-negative finite number (got ${String(value)}). ` +
        `The kernel does not default it.`,
      field,
    );
  }
  return value;
}

function requireUnitInterval(value: unknown, field: string): number {
  const v = requireNonNegative(value, field);
  if (v > 1) {
    throw new MonthlyBalanceError(`${field} must lie in 0..1 (got ${v}).`, field);
  }
  return v;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MonthlyBalanceError(`${field} must be a finite number (got ${String(value)}).`, field);
  }
  return value;
}

/**
 * The only way a default enters this kernel. It returns the value AND records
 * the default in the assumptions list when the caller supplied nothing, so the
 * two cannot drift apart.
 */
function withDefault<T>(
  supplied: T | undefined,
  fallback: T,
  assumption: NamedAssumption,
  sink: NamedAssumption[],
): T {
  if (supplied === undefined) {
    sink.push(assumption);
    return fallback;
  }
  return supplied;
}

// ── Utilisation factors (ISO 13790 §12.2.1.1 / §12.2.1.2) ─────────────────

/**
 * η_H,gn — gain utilisation factor for heating.
 *
 * Written in two algebraically equal forms so that neither γ → 0 nor γ → ∞
 * produces Infinity/Infinity: for γ > 1 the numerator and denominator are
 * multiplied through by γ^−(a+1). Limits: γ → 0 ⇒ 1; γ → ∞ ⇒ 0; γ = 1 ⇒ a/(a+1).
 * γ ≤ 0 (no gains, or heat flowing inward) is defined as 1 by the standard.
 */
export function heatingGainUtilisationFactor(gamma: number, a: number): number {
  if (!Number.isFinite(a) || a <= 0) {
    throw new MonthlyBalanceError(`numerical parameter a must be positive (got ${a}).`);
  }
  if (!Number.isFinite(gamma)) return gamma > 0 ? 0 : 1;
  if (gamma <= 0) return 1;
  // Within a few ULP-multiples of γ = 1 both closed forms are 0/0 and the
  // numerator quantises to a handful of ULPs — a sweep across 1 then shows a
  // step of ~1e-3 that the standard's function does not have. The first-order
  // expansion η ≈ a/(a+1)·(1 − ε/2) is exact to O(ε²) there.
  const eps = gamma - 1;
  if (Math.abs(eps) < NEAR_ONE) return (a / (a + 1)) * (1 - eps / 2);
  if (gamma < 1) {
    return (1 - Math.pow(gamma, a)) / (1 - Math.pow(gamma, a + 1));
  }
  // γ > 1: (1 − γ^a)/(1 − γ^(a+1)) · γ^−(a+1)/γ^−(a+1)
  const inv = 1 / gamma;
  return (Math.pow(inv, a + 1) - inv) / (Math.pow(inv, a + 1) - 1);
}

/**
 * η_C,ls — loss utilisation factor for cooling.
 *
 * Limits: γ → ∞ ⇒ 1 (every loss is useful); γ → 0 ⇒ 0; γ = 1 ⇒ a/(a+1).
 * γ < 0 (outside warmer than the cooling set-point) is 1 per the standard —
 * Q_ht is then negative and the whole of it becomes cooling need.
 */
export function coolingLossUtilisationFactor(gamma: number, a: number): number {
  if (!Number.isFinite(a) || a <= 0) {
    throw new MonthlyBalanceError(`numerical parameter a must be positive (got ${a}).`);
  }
  // +∞ (no losses at all) and −∞ (heat flowing inward) both make every loss useful.
  if (!Number.isFinite(gamma)) return 1;
  if (gamma < 0) return 1;
  if (gamma === 0) return 0;
  // Same cancellation guard as the heating factor; here η rises with γ, so
  // the first-order term is +ε/2.
  const eps = gamma - 1;
  if (Math.abs(eps) < NEAR_ONE) return (a / (a + 1)) * (1 + eps / 2);
  if (gamma > 1) {
    return (1 - Math.pow(gamma, -a)) / (1 - Math.pow(gamma, -(a + 1)));
  }
  // 0 < γ < 1: multiply through by γ^(a+1) so γ^−a cannot overflow.
  return (Math.pow(gamma, a + 1) - gamma) / (Math.pow(gamma, a + 1) - 1);
}

// ── The balance ───────────────────────────────────────────────────────────

export function calculateMonthlyBalance(input: MonthlyBalanceInput): MonthlyBalanceResult {
  if (input === null || typeof input !== "object") {
    throw new MonthlyBalanceError("input must be an object.");
  }
  const climate = input.climate;
  if (!climate || typeof climate !== "object" || !("meanExternalTemperatureC" in climate)) {
    throw new MonthlyBalanceError(
      "climate is required. There is no default climate — never Seoul, never a neighbour. " +
        "Resolve one with monthlyClimateById and refuse to compute when it returns null.",
      "climate",
    );
  }

  const assumptions: NamedAssumption[] = [...(input.carriedAssumptions ?? [])];

  const floorArea = requirePositive(input.conditionedFloorAreaSqm, "conditionedFloorAreaSqm");
  const volume = requirePositive(input.volumeM3, "volumeM3");

  if (!Array.isArray(input.opaqueElements)) {
    throw new MonthlyBalanceError("opaqueElements must be an array (may be empty).", "opaqueElements");
  }
  if (!Array.isArray(input.glazing)) {
    throw new MonthlyBalanceError("glazing must be an array (may be empty).", "glazing");
  }
  if (input.groundFloor === undefined) {
    throw new MonthlyBalanceError(
      "groundFloor is required: pass an ISO 13370 coupling, or null to state that " +
        "the building has no ground contact. An omitted ground floor is a silent zero.",
      "groundFloor",
    );
  }
  if (!input.ventilation || typeof input.ventilation !== "object") {
    throw new MonthlyBalanceError("ventilation is required.", "ventilation");
  }
  if (!input.internalGains || typeof input.internalGains !== "object") {
    throw new MonthlyBalanceError("internalGains is required.", "internalGains");
  }

  // Transmission — opaque
  let envelopeTransmission = 0;
  input.opaqueElements.forEach((el, i) => {
    const tag = `opaqueElements[${i}]${el?.id ? ` (${el.id})` : ""}`;
    envelopeTransmission +=
      requirePositive(el?.areaSqm, `${tag}.areaSqm`) *
      requirePositive(el?.uValueWPerM2K, `${tag}.uValueWPerM2K`);
  });

  // Transmission — glazing, and the per-element solar aperture
  const defaultFrameFraction = 0.3;
  const defaultShading = 1.0;
  let usedDefaultFrame = false;
  let usedDefaultShading = false;
  const glazingIncidence = withDefault(input.glazingIncidenceFactor, 0.9, {
    id: "K-FW",
    assumes: "F_w = 0.9 — ISO 13790 §11.4.2 correction from normal-incidence g to the monthly effective g.",
    why: "The caller supplied g_gl,n (a normal-incidence SHGC) and no F_w. 0.9 is the standard's own default for non-scattering glazing.",
  }, assumptions);
  requireUnitInterval(glazingIncidence, "glazingIncidenceFactor");

  const apertures: Array<{ orientation: Orientation; effectiveAreaSqm: number }> = [];
  input.glazing.forEach((g, i) => {
    const tag = `glazing[${i}]${g?.id ? ` (${g.id})` : ""}`;
    const area = requirePositive(g?.areaSqm, `${tag}.areaSqm`);
    const u = requirePositive(g?.uValueWPerM2K, `${tag}.uValueWPerM2K`);
    const gValue = requireUnitInterval(g?.gValue, `${tag}.gValue`);
    if (!(ORIENTATIONS as readonly string[]).includes(String(g?.orientation))) {
      throw new MonthlyBalanceError(
        `${tag}.orientation must be one of ${ORIENTATIONS.join(", ")} (got ${String(g?.orientation)}).`,
        `${tag}.orientation`,
      );
    }
    envelopeTransmission += area * u;
    let frame = g.frameFraction;
    if (frame === undefined) {
      frame = defaultFrameFraction;
      usedDefaultFrame = true;
    }
    requireUnitInterval(frame, `${tag}.frameFraction`);
    let shading = g.shadingFactor;
    if (shading === undefined) {
      shading = defaultShading;
      usedDefaultShading = true;
    }
    requireUnitInterval(shading, `${tag}.shadingFactor`);
    apertures.push({
      orientation: g.orientation,
      effectiveAreaSqm: shading * glazingIncidence * gValue * (1 - frame) * area,
    });
  });
  if (usedDefaultFrame) {
    assumptions.push({
      id: "K-FRAME",
      assumes: `Frame fraction F_F = ${defaultFrameFraction} on every glazing element that did not state one.`,
      why: "Aperture areas are opening sizes, not glass sizes. 0.3 is the ISO 13790 / DIN V 18599 default in the absence of a frame take-off.",
    });
  }
  if (usedDefaultShading) {
    assumptions.push({
      id: "K-SHADING",
      assumes: `No external shading (F_sh = ${defaultShading}) on every glazing element that did not state one.`,
      why: "No overhang, fin or neighbouring-building obstruction was described. Unshaded is the conservative reading for cooling and the optimistic one for heating; both are disclosed by this line.",
    });
  }

  const thermalBridges = withDefault(input.thermalBridgesWPerK, 0, {
    id: "K-BRIDGES",
    assumes: "Thermal bridge term H_tb = 0 W/K.",
    why: "No linear transmittance take-off was supplied. The term exists in the balance and is zero here, which is stated rather than folded into an inflated U.",
  }, assumptions);
  requireNonNegative(thermalBridges, "thermalBridgesWPerK");

  // Ground — ISO 13370 U, annual-mean ΔT. Never calculateAssembly, never the month's θ_e.
  let groundH = 0;
  if (input.groundFloor !== null) {
    groundH =
      requirePositive(input.groundFloor.areaSqm, "groundFloor.areaSqm") *
      requirePositive(input.groundFloor.uValueWPerM2K, "groundFloor.uValueWPerM2K");
  }

  // Ventilation
  const ach50 = requireNonNegative(input.ventilation.ach50, "ventilation.ach50");
  const mechanicalAch = withDefault(input.ventilation.mechanicalAch, 0, {
    id: "K-MECH-VENT",
    assumes: "No mechanical ventilation air change (0 ACH).",
    why: "No supply airflow was stated. Infiltration alone (ACH50/20) carries the ventilation term.",
  }, assumptions);
  requireNonNegative(mechanicalAch, "ventilation.mechanicalAch");
  const heatRecovery = withDefault(input.ventilation.heatRecoveryEfficiency, 0, {
    id: "K-HR",
    assumes: "No heat recovery on mechanical ventilation (η_hr = 0).",
    why: "No recovery efficiency was stated. Zero is the value that does not invent a device.",
  }, assumptions);
  requireUnitInterval(heatRecovery, "ventilation.heatRecoveryEfficiency");
  const effectiveAch = ach50 / ACH50_TO_NATURAL_DIVISOR + mechanicalAch * (1 - heatRecovery);
  const ventilationH = AIR_HEAT_CAPACITY_WH_PER_M3K * effectiveAch * volume;

  // Internal gains
  const qOcc = requireNonNegative(input.internalGains.occupantsWPerM2, "internalGains.occupantsWPerM2");
  const qLight = requireNonNegative(input.internalGains.lightingWPerM2, "internalGains.lightingWPerM2");
  const qEquip = requireNonNegative(input.internalGains.equipmentWPerM2, "internalGains.equipmentWPerM2");
  const utilisation = withDefault(input.internalGains.utilisationFraction, 1, {
    id: "K-GAIN-SCHEDULE",
    assumes: "Internal gains present at their full installed value every hour of the year (utilisation 1.0).",
    why: "No occupancy schedule was supplied. Full-time gains overstate Q_int for any building that closes at night; the caller should pass a time-averaged fraction.",
  }, assumptions);
  requireUnitInterval(utilisation, "internalGains.utilisationFraction");
  const internalGainsWPerM2 = (qOcc + qLight + qEquip) * utilisation;

  // Heat capacity and dynamic parameter
  const capacityClass = withDefault(input.heatCapacityClass, "medium" as HeatCapacityClass, {
    id: "K-CM",
    assumes: `ISO 13790 Table 12 "medium" internal heat capacity, ${INTERNAL_HEAT_CAPACITY_J_PER_M2K.medium.toLocaleString("en-US")} J/(m²·K) × floor area.`,
    why: "No construction class was stated. C_m sets the time constant and hence how much of the month's gains are usable; medium is the standard's middle class, not a measured property of this building.",
  }, assumptions);
  const perM2 = INTERNAL_HEAT_CAPACITY_J_PER_M2K[capacityClass];
  if (perM2 === undefined) {
    throw new MonthlyBalanceError(
      `heatCapacityClass must be one of ${Object.keys(INTERNAL_HEAT_CAPACITY_J_PER_M2K).join(", ")} (got ${String(capacityClass)}).`,
      "heatCapacityClass",
    );
  }
  const heatCapacity = perM2 * floorArea;
  const totalH = envelopeTransmission + thermalBridges + groundH + ventilationH;
  if (totalH <= 0) {
    throw new MonthlyBalanceError(
      "The building has no heat transfer coefficient at all (no envelope, no ground, no air change). " +
        "A balance with H = 0 has no time constant; refusing rather than dividing by zero.",
    );
  }
  const timeConstantHours = heatCapacity / totalH / 3600;
  const a = ISO13790_A0 + timeConstantHours / ISO13790_TAU0_HOURS;

  // Set-points
  const heatingSetpoint = withDefault(input.heatingSetpointC, 20, {
    id: "K-SETPOINT-H",
    assumes: "Heating set-point 20 °C.",
    why: "No set-point was stated. 20 °C is the value the degree-day kernel's Seoul climate also uses, which keeps the two comparable.",
  }, assumptions);
  requireFiniteNumber(heatingSetpoint, "heatingSetpointC");
  const coolingSetpoint = withDefault(input.coolingSetpointC, 26, {
    id: "K-SETPOINT-C",
    assumes: "Cooling set-point 26 °C.",
    why: "No set-point was stated. 26 °C matches the degree-day kernel's indoorCoolTemp.",
  }, assumptions);
  requireFiniteNumber(coolingSetpoint, "coolingSetpointC");
  if (coolingSetpoint < heatingSetpoint) {
    throw new MonthlyBalanceError(
      `coolingSetpointC (${coolingSetpoint}) must not be below heatingSetpointC (${heatingSetpoint}).`,
      "coolingSetpointC",
    );
  }

  assumptions.push({
    id: "K-SKY",
    assumes: "No extra-flux term for thermal radiation to the sky (ISO 13790 §11.3.5 Φ_r = 0).",
    why: "The sky-radiation correction needs surface emissivity and a form factor per element that were not supplied. Omitting it slightly overstates solar gains on every surface; it is an omission of the method, stated so it is not mistaken for a result.",
  });

  // Annual-mean external temperature, day-weighted — the ground term's basis.
  const temps = climate.meanExternalTemperatureC;
  const annualMeanExternalC =
    temps.reduce((sum, t, i) => sum + t * DAYS_PER_MONTH[i], 0) /
    DAYS_PER_MONTH.reduce((s, d) => s + d, 0);

  const airH = envelopeTransmission + thermalBridges + ventilationH;

  const months: MonthlyBalanceRow[] = temps.map((thetaE, i) => {
    const hours = HOURS_PER_MONTH[i];

    // Ground: annual-mean basis (ISO 13370 steady-state term), NOT the month's θ_e.
    const groundHeating = (groundH * (heatingSetpoint - annualMeanExternalC) * hours) / 1000;
    const groundCooling = (groundH * (coolingSetpoint - annualMeanExternalC) * hours) / 1000;

    const qHtHeating = (airH * (heatingSetpoint - thetaE) * hours) / 1000 + groundHeating;
    const qHtCooling = (airH * (coolingSetpoint - thetaE) * hours) / 1000 + groundCooling;

    let qSol = 0;
    for (const ap of apertures) {
      qSol += ap.effectiveAreaSqm * climate.solarIrradiationKwhPerM2[ap.orientation][i];
    }
    const qInt = (internalGainsWPerM2 * floorArea * hours) / 1000;
    const qGn = qInt + qSol;

    // Heating
    let gammaH: number;
    if (qHtHeating > 0) gammaH = qGn / qHtHeating;
    else if (qHtHeating === 0) gammaH = qGn > 0 ? Number.POSITIVE_INFINITY : 0;
    else gammaH = qGn / qHtHeating; // negative: outside warmer than the set-point
    const etaH = qHtHeating > 0 ? heatingGainUtilisationFactor(gammaH, a) : 1;
    const heatingNeed = qHtHeating > 0 ? Math.max(0, qHtHeating - etaH * qGn) : 0;

    // Cooling
    let gammaC: number;
    if (qHtCooling > 0) gammaC = qGn / qHtCooling;
    else if (qHtCooling === 0) gammaC = qGn > 0 ? Number.POSITIVE_INFINITY : 0;
    else gammaC = qGn / qHtCooling;
    const etaC = coolingLossUtilisationFactor(gammaC, a);
    const coolingNeed = Math.max(0, qGn - etaC * qHtCooling);

    return Object.freeze({
      month: i + 1,
      hours,
      externalTemperatureC: thetaE,
      heatTransferHeatingKwh: qHtHeating,
      heatTransferCoolingKwh: qHtCooling,
      groundHeatTransferHeatingKwh: groundHeating,
      solarGainsKwh: qSol,
      internalGainsKwh: qInt,
      totalGainsKwh: qGn,
      gainLossRatioHeating: gammaH,
      utilisationFactorHeating: etaH,
      gainLossRatioCooling: gammaC,
      utilisationFactorCooling: etaC,
      heatingNeedKwh: heatingNeed,
      coolingNeedKwh: coolingNeed,
    });
  });

  const sum = (pick: (row: MonthlyBalanceRow) => number) =>
    months.reduce((total, row) => total + pick(row), 0);
  const heatingNeedKwh = sum((r) => r.heatingNeedKwh);
  const coolingNeedKwh = sum((r) => r.coolingNeedKwh);

  return Object.freeze({
    method: MONTHLY_BALANCE_METHOD,
    version: MONTHLY_BALANCE_VERSION,
    climateId: climate.id,
    climateProvenanceNoticeKo: climateProvenanceNoticeKo(climate),
    comparableToEco2: climate.provenance.kind === "eco2-standard",
    coefficients: Object.freeze({
      envelopeTransmissionWPerK: envelopeTransmission,
      thermalBridgesWPerK: thermalBridges,
      groundWPerK: groundH,
      ventilationWPerK: ventilationH,
      effectiveAirChangesPerHour: effectiveAch,
      internalHeatCapacityJPerK: heatCapacity,
      timeConstantHours,
      numericalParameterA: a,
      annualMeanExternalTemperatureC: annualMeanExternalC,
    }),
    months: Object.freeze(months),
    annual: Object.freeze({
      heatingNeedKwh,
      coolingNeedKwh,
      heatTransferHeatingKwh: sum((r) => r.heatTransferHeatingKwh),
      solarGainsKwh: sum((r) => r.solarGainsKwh),
      internalGainsKwh: sum((r) => r.internalGainsKwh),
      heatingNeedKwhPerM2: heatingNeedKwh / floorArea,
      coolingNeedKwhPerM2: coolingNeedKwh / floorArea,
    }),
    assumptions: Object.freeze(assumptions),
  });
}
