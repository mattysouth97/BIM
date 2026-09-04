/**
 * The climate contract for a monthly quasi-steady-state energy method.
 *
 * ECO2 — the Korean 건축물 에너지효율등급 certification tool — evaluates on
 * ISO 13790 / DIN V 18599 using **monthly mean** weather. That needs, per month,
 * a mean external temperature and solar irradiation **per orientation**. The
 * degree-day kernel this sits beside needs neither: it takes annual HDD/CDD
 * scalars, which is why `energy/climate-data.ts` carries only those.
 *
 * ## Why this module exists rather than an extra field on ClimateData
 *
 * `ClimateData.coolingSeasonSolarKwhPerM2` looks like the solar input a monthly
 * method wants and structurally cannot be it: its own comment says
 * "on vertical glazing, **orientation-averaged**, kWh/m²·**season**". A
 * season total, direction-blind. The field name is true and its implication is
 * false — the same trap as a label that lies beside a correct number, one layer
 * down. Extending that type would have invited exactly that misreading, so the
 * monthly contract is separate and shares nothing with it.
 *
 * ## The discipline this type enforces
 *
 * A region carries 12 temperatures and 12 × 9 irradiation values — **120
 * numbers**. That is 120 places for a silent default to hide, and a plausible
 * wrong number here is undetectable downstream: it produces a believable
 * energy result. So:
 *
 *   1. A climate is **complete or it does not exist**. `defineMonthlyClimate`
 *      validates every one of the 120 and throws on the first that is missing,
 *      non-finite or out of physical range. There is no partial region.
 *   2. **No region ever falls back to another.** Resolution returns a climate
 *      or nothing — never Seoul. `ledger-climate.ts` already holds this line
 *      ("Silently defaulting to Seoul would price a Jeju building against Seoul
 *      degree-days") and this module keeps it.
 *   3. The data set carries **its own provenance**, because the honesty of the
 *      product label depends on it — see `MonthlyClimateProvenance`.
 */

/**
 * The eight compass orientations plus horizontal.
 *
 * Nine, not four: a monthly method resolves gains per façade, and collapsing to
 * N/S/E/W would discard the diagonal exposure that makes the method worth
 * having over degree days. `horizontal` is carried separately because a roof
 * and a rooflight see it, not a wall.
 */
export const ORIENTATIONS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
  "horizontal",
] as const;

export type Orientation = (typeof ORIENTATIONS)[number];

/** January … December. Index 0 is January. */
export type MonthlySeries = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

/**
 * Where the numbers came from — and whether they are ECO2's own.
 *
 * This is not bookkeeping. The product is required to label its output
 * "ECO2 방식 (자체 구현)" and never "ECO2 결과", because an implementation of a
 * method is not the certified tool's result. That label is only honest if a
 * reader can tell whether the *weather* is ECO2's too: a run on ECO2's own
 * standard profile and a run on weather we derived ourselves are different
 * claims, and only one of them can be meaningfully compared against a real
 * ECO2 run.
 *
 * `kind: "derived"` additionally means every discrepancy against a real ECO2
 * result has two possible causes — our method or our weather — with no way to
 * separate them. A validation harness built on derived weather cannot attribute
 * its own failures, which is most of what makes it a harness.
 */
export type MonthlyClimateProvenance =
  | Readonly<{
      kind: "eco2-standard";
      /** ECO2's own region identifier, not a 시도. */
      eco2RegionId: string;
      /** The ECO2 build the profile was taken from, e.g. "ECO2_v20170122". */
      programVersion: string;
      note: string;
    }>
  | Readonly<{
      kind: "derived";
      /** e.g. "KMA ASOS daily observations, 2015-2024". */
      observationSource: string;
      /** The named model that produced per-orientation irradiation. */
      transpositionModel: string;
      /**
       * Why this is not ECO2's own weather, stated so a reader cannot mistake
       * a substitute for the real profile.
       */
      substitutionNote: string;
    }>;

export type MonthlyClimate = Readonly<{
  /** Stable id. For ECO2 profiles this is the ECO2 region, not the 시도. */
  id: string;
  labelKo: string;
  labelEn: string;
  /** Mean external air temperature, °C, one per month. */
  meanExternalTemperatureC: MonthlySeries;
  /**
   * Global solar irradiation on a surface of each orientation,
   * kWh/m²·month. Vertical for the eight compass points, horizontal for
   * `horizontal`.
   */
  solarIrradiationKwhPerM2: Readonly<Record<Orientation, MonthlySeries>>;
  provenance: MonthlyClimateProvenance;
}>;

export class MonthlyClimateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthlyClimateError";
  }
}

const MONTHS = 12;

/**
 * Physical bounds. Deliberately generous — these catch a transcription error, a
 * unit mix-up or an unfilled slot, not an unusual climate. A bound tight enough
 * to reject a real Korean January would be a bound that quietly edits data.
 */
const TEMPERATURE_MIN_C = -50;
const TEMPERATURE_MAX_C = 60;
/**
 * Upper bound on monthly irradiation. Peak global horizontal in Korea is around
 * 160–190 kWh/m²·month; 400 is far above anything real and still catches a
 * W/m² value pasted into a kWh/m² field.
 */
const IRRADIATION_MAX_KWH_PER_M2 = 400;

function assertSeries(
  values: unknown,
  what: string,
  min: number,
  max: number,
): MonthlySeries {
  if (!Array.isArray(values)) {
    throw new MonthlyClimateError(`${what}: expected 12 monthly values, got ${typeof values}.`);
  }
  if (values.length !== MONTHS) {
    throw new MonthlyClimateError(
      `${what}: expected 12 monthly values, got ${values.length}. A partial year is not a climate.`,
    );
  }
  values.forEach((value, index) => {
    const month = index + 1;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new MonthlyClimateError(
        `${what}: month ${month} is ${String(value)}, which is not a finite number.`,
      );
    }
    if (value < min || value > max) {
      throw new MonthlyClimateError(
        `${what}: month ${month} is ${value}, outside the plausible range ${min}…${max}. ` +
          `This is a unit or transcription error, not a climate.`,
      );
    }
  });
  return Object.freeze([...(values as number[])]) as unknown as MonthlySeries;
}

/**
 * Build a climate, or throw.
 *
 * Every one of the 120 numbers is checked here, at construction, because this
 * is the only point where a missing value is still distinguishable from a
 * legitimate zero. Downstream, a zero December irradiation on the north façade
 * and an unfilled slot are the same number.
 */
export function defineMonthlyClimate(input: {
  id: string;
  labelKo: string;
  labelEn: string;
  meanExternalTemperatureC: readonly number[];
  solarIrradiationKwhPerM2: Partial<Record<Orientation, readonly number[]>>;
  provenance: MonthlyClimateProvenance;
}): MonthlyClimate {
  if (!input.id.trim()) {
    throw new MonthlyClimateError("A climate needs a non-empty id.");
  }

  const temperatures = assertSeries(
    input.meanExternalTemperatureC,
    `${input.id} mean external temperature`,
    TEMPERATURE_MIN_C,
    TEMPERATURE_MAX_C,
  );

  const solar = {} as Record<Orientation, MonthlySeries>;
  for (const orientation of ORIENTATIONS) {
    const series = input.solarIrradiationKwhPerM2[orientation];
    if (series === undefined) {
      throw new MonthlyClimateError(
        `${input.id}: no irradiation for orientation "${orientation}". ` +
          `All ${ORIENTATIONS.length} orientations are required — an absent façade ` +
          `is indistinguishable from a shaded one once it reaches the kernel.`,
      );
    }
    solar[orientation] = assertSeries(
      series,
      `${input.id} irradiation ${orientation}`,
      0,
      IRRADIATION_MAX_KWH_PER_M2,
    );
  }

  return Object.freeze({
    id: input.id,
    labelKo: input.labelKo,
    labelEn: input.labelEn,
    meanExternalTemperatureC: temperatures,
    solarIrradiationKwhPerM2: Object.freeze(solar),
    provenance: Object.freeze(input.provenance),
  });
}

/**
 * True when this climate can be meaningfully compared against a real ECO2 run.
 *
 * Only ECO2's own profile can: on derived weather, a discrepancy has two causes
 * and no way to separate them. Callers building a validation harness must check
 * this rather than assuming.
 */
export function isComparableToEco2(climate: MonthlyClimate): boolean {
  return climate.provenance.kind === "eco2-standard";
}

/**
 * The sentence a UI must render beside any number derived from this climate.
 *
 * Returned rather than assembled at the call site so a screen cannot show the
 * result while omitting what weather produced it — the failure this project has
 * hit repeatedly is a true value beside a false or absent explanation.
 */
export function climateProvenanceNoticeKo(climate: MonthlyClimate): string {
  const p = climate.provenance;
  if (p.kind === "eco2-standard") {
    return `기상데이터: ECO2 표준기상데이터 (지역 ${p.eco2RegionId}, ${p.programVersion}).`;
  }
  return (
    `기상데이터: ECO2 표준기상데이터가 아님 — ${p.observationSource} 관측값에 ` +
    `${p.transpositionModel} 모델을 적용해 자체 산출한 값입니다. ${p.substitutionNote}`
  );
}

/** Registry. Empty until real profiles are added — deliberately not seeded. */
const REGISTRY = new Map<string, MonthlyClimate>();

export function registerMonthlyClimate(climate: MonthlyClimate): void {
  if (REGISTRY.has(climate.id)) {
    throw new MonthlyClimateError(`Climate "${climate.id}" is already registered.`);
  }
  REGISTRY.set(climate.id, climate);
}

/**
 * Resolve a climate by id, or return null.
 *
 * **Never falls back to another region.** A caller that cannot resolve must
 * refuse to produce a number, exactly as `resolveLedgerWeatherSource` already
 * refuses rather than defaulting to Seoul. Returning a neighbouring region's
 * weather would produce a believable answer for the wrong place, which is worse
 * than producing none.
 */
export function monthlyClimateById(id: string): MonthlyClimate | null {
  return REGISTRY.get(id) ?? null;
}

/** Ids currently registered, for diagnostics and for a "what do we have" UI. */
export function registeredMonthlyClimateIds(): readonly string[] {
  return Object.freeze([...REGISTRY.keys()].sort());
}

/** Test seam: drop every registration. Not for production paths. */
export function __clearMonthlyClimateRegistry(): void {
  REGISTRY.clear();
}
