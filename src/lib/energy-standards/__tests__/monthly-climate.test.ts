import { afterEach, describe, expect, it } from "vitest";
import {
  __clearMonthlyClimateRegistry,
  climateProvenanceNoticeKo,
  defineMonthlyClimate,
  isComparableToEco2,
  monthlyClimateById,
  MonthlyClimateError,
  ORIENTATIONS,
  registerMonthlyClimate,
  registeredMonthlyClimateIds,
  type Orientation,
} from "../monthly-climate";

const twelve = (v: number) => Array.from({ length: 12 }, () => v);

const allOrientations = (v: number) =>
  Object.fromEntries(ORIENTATIONS.map((o) => [o, twelve(v)])) as unknown as Record<
    Orientation,
    readonly number[]
  >;

const ECO2_PROVENANCE = {
  kind: "eco2-standard" as const,
  eco2RegionId: "KR-11-SEOUL",
  programVersion: "ECO2_v20170122",
  note: "Standard profile as distributed with the program.",
};

const DERIVED_PROVENANCE = {
  kind: "derived" as const,
  observationSource: "KMA ASOS daily observations, 2015-2024",
  transpositionModel: "isotropic sky (Liu-Jordan)",
  substitutionNote: "ECO2 표준기상데이터를 확보하지 못해 대체한 값입니다.",
};

const validInput = () => ({
  id: "test-region",
  labelKo: "시험지역",
  labelEn: "Test region",
  meanExternalTemperatureC: twelve(12),
  solarIrradiationKwhPerM2: allOrientations(50),
  provenance: ECO2_PROVENANCE,
});

afterEach(() => __clearMonthlyClimateRegistry());

describe("a climate is complete or it does not exist", () => {
  it("builds when all 120 values are present", () => {
    const c = defineMonthlyClimate(validInput());
    expect(c.meanExternalTemperatureC).toHaveLength(12);
    for (const o of ORIENTATIONS) expect(c.solarIrradiationKwhPerM2[o]).toHaveLength(12);
    // 12 temperatures + 9 orientations × 12 = 120 numbers.
    const count =
      c.meanExternalTemperatureC.length +
      ORIENTATIONS.reduce((n, o) => n + c.solarIrradiationKwhPerM2[o].length, 0);
    expect(count).toBe(120);
  });

  it("refuses a partial year — 11 months is not a climate", () => {
    expect(() =>
      defineMonthlyClimate({
        ...validInput(),
        meanExternalTemperatureC: twelve(12).slice(0, 11),
      }),
    ).toThrow(MonthlyClimateError);
  });

  it.each(ORIENTATIONS)("refuses a climate missing the %s orientation", (missing) => {
    const solar = allOrientations(50);
    delete (solar as Record<string, unknown>)[missing];
    expect(() =>
      defineMonthlyClimate({ ...validInput(), solarIrradiationKwhPerM2: solar }),
    ).toThrow(MonthlyClimateError);
  });

  it("names the offending month rather than failing anonymously", () => {
    const temps = twelve(12);
    temps[6] = Number.NaN;
    expect(() =>
      defineMonthlyClimate({ ...validInput(), meanExternalTemperatureC: temps }),
    ).toThrow(/month 7/);
  });

  it("names the offending orientation rather than failing anonymously", () => {
    const solar = allOrientations(50);
    (solar as Record<string, number[]>).SW = twelve(50);
    (solar as Record<string, number[]>).SW[2] = -1;
    expect(() =>
      defineMonthlyClimate({ ...validInput(), solarIrradiationKwhPerM2: solar }),
    ).toThrow(/SW/);
  });
});

describe("bounds catch unit errors, not unusual weather", () => {
  it("accepts a genuinely cold Korean January", () => {
    const temps = twelve(12);
    temps[0] = -12.5;
    expect(() =>
      defineMonthlyClimate({ ...validInput(), meanExternalTemperatureC: temps }),
    ).not.toThrow();
  });

  it("accepts a real peak monthly irradiation", () => {
    const solar = allOrientations(50);
    (solar as Record<string, number[]>).horizontal = twelve(50);
    (solar as Record<string, number[]>).horizontal[5] = 185;
    expect(() =>
      defineMonthlyClimate({ ...validInput(), solarIrradiationKwhPerM2: solar }),
    ).not.toThrow();
  });

  it("rejects a W/m² value pasted into a kWh/m² field", () => {
    const solar = allOrientations(50);
    (solar as Record<string, number[]>).S = twelve(50);
    (solar as Record<string, number[]>).S[5] = 820; // W/m², not kWh/m²·month
    expect(() =>
      defineMonthlyClimate({ ...validInput(), solarIrradiationKwhPerM2: solar }),
    ).toThrow(/unit or transcription error/);
  });

  it("rejects negative irradiation", () => {
    const solar = allOrientations(-5);
    expect(() =>
      defineMonthlyClimate({ ...validInput(), solarIrradiationKwhPerM2: solar }),
    ).toThrow(MonthlyClimateError);
  });

  it("accepts a legitimate zero — a north façade in December is not an error", () => {
    const solar = allOrientations(50);
    (solar as Record<string, number[]>).N = twelve(50);
    (solar as Record<string, number[]>).N[11] = 0;
    expect(() =>
      defineMonthlyClimate({ ...validInput(), solarIrradiationKwhPerM2: solar }),
    ).not.toThrow();
  });
});

describe("resolution never falls back", () => {
  it("returns null for an unknown region rather than a neighbour", () => {
    registerMonthlyClimate(defineMonthlyClimate(validInput()));
    expect(monthlyClimateById("test-region")).not.toBeNull();
    // The whole point: a Jeju building must not be priced on Seoul weather.
    expect(monthlyClimateById("KR-50-JEJU")).toBeNull();
  });

  it("refuses a duplicate registration rather than silently replacing one", () => {
    registerMonthlyClimate(defineMonthlyClimate(validInput()));
    expect(() => registerMonthlyClimate(defineMonthlyClimate(validInput()))).toThrow(
      MonthlyClimateError,
    );
  });

  it("ships with an empty registry — no region is seeded by default", () => {
    expect(registeredMonthlyClimateIds()).toEqual([]);
  });
});

describe("provenance carries whether the weather is ECO2's own", () => {
  it("marks an ECO2 standard profile as comparable to a real ECO2 run", () => {
    const c = defineMonthlyClimate(validInput());
    expect(isComparableToEco2(c)).toBe(true);
    expect(climateProvenanceNoticeKo(c)).toContain("ECO2 표준기상데이터");
    expect(climateProvenanceNoticeKo(c)).toContain("ECO2_v20170122");
  });

  it("marks derived weather as NOT comparable, and says so in the notice", () => {
    const c = defineMonthlyClimate({ ...validInput(), provenance: DERIVED_PROVENANCE });
    expect(isComparableToEco2(c)).toBe(false);
    // The notice must state the negative explicitly. A reader who sees only
    // "ECO2 방식" must not be left to assume ECO2's own climate came with it.
    expect(climateProvenanceNoticeKo(c)).toContain("ECO2 표준기상데이터가 아님");
    expect(climateProvenanceNoticeKo(c)).toContain("isotropic sky (Liu-Jordan)");
  });

  it("always names the transposition model on derived weather", () => {
    const c = defineMonthlyClimate({ ...validInput(), provenance: DERIVED_PROVENANCE });
    if (c.provenance.kind !== "derived") throw new Error("expected derived");
    expect(c.provenance.transpositionModel.length).toBeGreaterThan(0);
    expect(c.provenance.observationSource.length).toBeGreaterThan(0);
  });
});

describe("the shape is deliberately not ClimateData's", () => {
  it("carries nine orientations, not four — diagonals are why the method beats degree days", () => {
    expect(ORIENTATIONS).toContain("NE");
    expect(ORIENTATIONS).toContain("SW");
    expect(ORIENTATIONS).toContain("horizontal");
    expect(ORIENTATIONS).toHaveLength(9);
  });

  it("is monthly, so no field can be a season total", () => {
    const c = defineMonthlyClimate(validInput());
    // ClimateData.coolingSeasonSolarKwhPerM2 is a season total, orientation-
    // averaged. Nothing here can degrade into that shape: every series is 12
    // long and keyed by orientation.
    for (const o of ORIENTATIONS) expect(c.solarIrradiationKwhPerM2[o]).toHaveLength(12);
  });
});
