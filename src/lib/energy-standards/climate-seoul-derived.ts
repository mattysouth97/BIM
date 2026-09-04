/**
 * Seoul — a DERIVED monthly climate. Not ECO2's own weather.
 *
 * Region chosen to unblock the monthly kernel. It is not arbitrary: Seoul is
 * ECO2's most-used region, it is the repo's existing default elsewhere, and it
 * is a humid-continental analogue of the Clinic's nominal site. But note what
 * it is NOT — **ECO2 has no US regions.** Its 66 standard regions are Korean,
 * built by 건설기술연구원 from ten years of observation. Running a US building
 * on Korean weather is a substitution, and one this file is written to keep
 * visible rather than let a reader discover from a number.
 *
 * ## Where these numbers come from
 *
 * PVGIS v5.2 (European Commission JRC), radiation database PVGIS-ERA5, at
 * 37.5665 N, 126.9780 E:
 *
 *  - **Temperature** — monthly means of the hourly `T2m` in PVGIS's TMY for
 *    that point.
 *  - **Irradiation** — transposed here from the same TMY's hourly `Gb(n)`
 *    (beam normal), `Gd(h)` (diffuse horizontal) and `G(h)` (global
 *    horizontal) onto eight vertical planes, by the **isotropic (Liu-Jordan)**
 *    model with ground albedo 0.2:
 *
 *        I_vertical = Gb(n)·max(cos θ, 0) + Gd(h)·0.5 + G(h)·ρ·0.5
 *
 *    where θ is the angle of incidence from solar position (declination,
 *    equation of time, hour angle). Only the *diffuse sky distribution* is
 *    modelled; beam is exact from the measured split. PVGIS's own `MRcalc`
 *    endpoint was tried first and **silently ignores its `aspect`/`azimuth`
 *    parameter** — every orientation came back identical at azimuth 0, which
 *    is why this is computed here instead.
 *
 * ## Two deviations, recorded rather than smoothed
 *
 * 1. **~1.3 K cold bias.** Annual mean here is 11.4 °C against a KMA
 *    1991-2020 Seoul normal near 12.7 °C. ERA5 is a reanalysis on a coarse
 *    grid and does not resolve Seoul's urban heat island, while the KMA normal
 *    is a city-centre station. Heating demand from this file will therefore
 *    run high and cooling low.
 * 2. **December is an outlier.** PVGIS selected **2012** as its representative
 *    December, a month that was exceptionally cold in Korea; the mean is
 *    −5.2 °C against a normal near 0 °C. That is TMY behaving as designed
 *    (a real month, chosen) but it is not a typical December, and December
 *    heating from this file is materially overstated.
 * 3. Horizontal annual irradiation is 1,536 kWh/m², roughly **17 % above** the
 *    ~1,314 kWh/m² commonly published for Seoul.
 *
 * None of these are fatal for a screening comparison, and all three are fatal
 * for a validation claim: **do not compare a run on this climate against a real
 * ECO2 result and attribute the difference to the method.** `isComparableToEco2`
 * returns false for exactly this reason.
 */

import { defineMonthlyClimate, type MonthlyClimate } from "./monthly-climate";

/** Jan…Dec. PVGIS-ERA5 TMY hourly T2m, monthly means, °C. */
const MEAN_TEMPERATURE_C = [
  -1.8, -0.5, 2.5, 11.8, 17.7, 21.9, 24.2, 24.5, 19.8, 13.4, 8.1, -5.2,
] as const;

/** Jan…Dec, kWh/m²·month. Horizontal measured; verticals transposed (see above). */
const IRRADIATION = {
  horizontal: [82.3, 97.4, 161.4, 165.8, 198.4, 197.0, 138.3, 114.1, 138.5, 115.3, 55.6, 72.1],
  N: [23.4, 27.5, 39.1, 45.7, 55.8, 57.9, 50.1, 41.8, 36.4, 30.7, 19.1, 20.4],
  NE: [23.8, 29.6, 51.7, 63.8, 80.1, 80.1, 59.1, 51.0, 46.0, 34.9, 19.5, 20.4],
  E: [51.0, 58.0, 93.1, 90.0, 103.4, 98.2, 68.3, 63.0, 73.0, 63.8, 32.3, 44.5],
  SE: [96.2, 93.4, 126.0, 100.7, 102.4, 91.9, 67.7, 66.5, 93.5, 98.6, 53.4, 90.1],
  S: [121.4, 112.1, 138.0, 96.6, 84.9, 73.0, 62.1, 62.9, 102.0, 121.1, 65.6, 115.2],
  SW: [91.1, 86.8, 117.9, 98.1, 97.6, 91.1, 73.4, 65.6, 93.5, 101.2, 51.8, 85.4],
  W: [48.1, 54.2, 87.8, 87.7, 99.0, 98.7, 76.6, 62.6, 74.6, 67.2, 31.4, 41.7],
  NW: [24.8, 30.9, 52.3, 63.1, 78.8, 81.6, 65.1, 51.3, 48.2, 37.0, 19.9, 21.1],
} as const;

export const SEOUL_DERIVED_ID = "KR-Seoul-PVGIS-ERA5-derived";

export const SEOUL_DERIVED: MonthlyClimate = defineMonthlyClimate({
  id: SEOUL_DERIVED_ID,
  labelKo: "서울 (자체 산출 기상데이터)",
  labelEn: "Seoul (derived weather, not ECO2 standard)",
  meanExternalTemperatureC: [...MEAN_TEMPERATURE_C],
  solarIrradiationKwhPerM2: {
    horizontal: [...IRRADIATION.horizontal],
    N: [...IRRADIATION.N],
    NE: [...IRRADIATION.NE],
    E: [...IRRADIATION.E],
    SE: [...IRRADIATION.SE],
    S: [...IRRADIATION.S],
    SW: [...IRRADIATION.SW],
    W: [...IRRADIATION.W],
    NW: [...IRRADIATION.NW],
  },
  provenance: {
    kind: "derived",
    observationSource: "PVGIS v5.2 PVGIS-ERA5 TMY at 37.5665N 126.9780E (irradiation years 2005-2020)",
    transpositionModel: "isotropic sky (Liu-Jordan), albedo 0.2, beam from measured Gb(n)",
    substitutionNote:
      "ECO2 표준기상데이터가 아닙니다. 연평균 기온이 KMA 1991-2020 서울 평년값보다 약 1.3K 낮고 " +
      "(ERA5가 도시열섬을 해상하지 못함), 12월은 이례적으로 추웠던 2012년이 대표월로 선택되어 " +
      "평년보다 약 5K 낮으며, 수평면 연간 일사량은 통상 공표값보다 약 17% 높습니다. " +
      "실제 ECO2 결과와의 차이를 계산 방법의 차이로 귀속시킬 수 없습니다.",
  },
});
