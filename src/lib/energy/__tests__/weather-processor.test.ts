import { describe, it, expect } from "vitest";
import { processWeatherData, type DailyWeather } from "../weather-processor";

/** Build N days of data with a fixed avgTemp, starting from Jan 1. */
function makeDays(count: number, avgTemp: number): DailyWeather[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2023${String(Math.floor(i / 30) + 1).padStart(2, "0")}${String((i % 30) + 1).padStart(2, "0")}`,
    avgTemp,
    maxTemp: avgTemp + 3,
    minTemp: avgTemp - 3,
  }));
}

describe("processWeatherData", () => {
  it("returns zeros for empty input", () => {
    const result = processWeatherData([], 2023);
    expect(result.year).toBe(2023);
    expect(result.hdd).toBe(0);
    expect(result.cdd).toBe(0);
    expect(result.avgTemp).toBe(0);
    expect(result.dataCompleteness).toBe(0);
  });

  it("computes correct HDD for all-cold days (base 18°C)", () => {
    // Base is 18.0 to match the static climate-data tables (they are swapped
    // for each other transparently). 365 days at 0°C → 18 HDD each.
    const days = makeDays(365, 0);
    const result = processWeatherData(days, 2023);
    expect(result.hdd).toBeCloseTo(365 * 18.0, 0);
    expect(result.cdd).toBe(0);
    expect(result.dataCompleteness).toBeCloseTo(1.0, 2);
  });

  it("computes correct CDD for all-warm days (base 24°C)", () => {
    // 365 days at exactly 30°C → each day contributes 6.0 CDD
    const days = makeDays(365, 30);
    const result = processWeatherData(days, 2023);
    expect(result.cdd).toBeCloseTo(365 * 6.0, 0);
    expect(result.hdd).toBe(0);
  });

  it("HDD is 0 when all days are above heating base (18°C)", () => {
    const days = makeDays(365, 25);
    const result = processWeatherData(days, 2023);
    expect(result.hdd).toBe(0);
    expect(result.cdd).toBeGreaterThan(0);
  });

  it("CDD is 0 when all days are below cooling base (24°C)", () => {
    const days = makeDays(365, 10);
    const result = processWeatherData(days, 2023);
    expect(result.cdd).toBe(0);
    expect(result.hdd).toBeGreaterThan(0);
  });

  it("dataCompleteness is ~0.548 for 200 days out of 365", () => {
    const days = makeDays(200, 10);
    const result = processWeatherData(days, 2023);
    expect(result.dataCompleteness).toBeCloseTo(200 / 365, 3);
    // 200/365 ≈ 0.548
    expect(result.dataCompleteness).toBeCloseTo(0.548, 2);
  });

  it("dataCompleteness is 1.0 for exactly 365 days", () => {
    const days = makeDays(365, 15);
    const result = processWeatherData(days, 2023);
    expect(result.dataCompleteness).toBeCloseTo(1.0, 3);
  });

  it("uses heating base 18°C (consistent with static climate tables)", () => {
    // 1 day at exactly the base accumulates 0 HDD; 1 day at 17°C → 1.0 HDD.
    const atBase = processWeatherData(
      [{ date: "20230101", avgTemp: 18.0, maxTemp: 21, minTemp: 15 }], 2023);
    expect(atBase.hdd).toBe(0);
    const below = processWeatherData(
      [{ date: "20230102", avgTemp: 17.0, maxTemp: 20, minTemp: 14 }], 2023);
    expect(below.hdd).toBeCloseTo(1.0, 1);
  });

  it("excludes KMA sentinel/garbage days from sums and completeness", () => {
    const days = [
      ...makeDays(100, 10),                                             // valid
      { date: "20230601", avgTemp: -99, maxTemp: -99, minTemp: -99 },   // sentinel
      { date: "20230602", avgTemp: NaN, maxTemp: 0, minTemp: 0 },       // missing
    ];
    const result = processWeatherData(days, 2023);
    expect(result.hdd).toBeCloseTo(100 * 8.0, 0); // sentinel's ~117 HDD excluded
    expect(result.dataCompleteness).toBeCloseTo(100 / 365, 3);
  });

  it("leap years use 366 days for completeness", () => {
    const result = processWeatherData(makeDays(366, 10), 2024);
    expect(result.dataCompleteness).toBeCloseTo(1.0, 3);
  });

  it("correctly uses cooling base 24°C", () => {
    // 1 day at 25°C → 1.0 CDD
    const days: DailyWeather[] = [{ date: "20230701", avgTemp: 25.0, maxTemp: 28, minTemp: 22 }];
    const result = processWeatherData(days, 2023);
    expect(result.cdd).toBeCloseTo(1.0, 1);
    expect(result.hdd).toBe(0);
  });

  it("correctly handles mixed hot and cold days", () => {
    const coldDays = makeDays(100, 5);   // 100 × (18 - 5)  = 1300 HDD
    const hotDays = makeDays(50, 28);    // 50  × (28 - 24) = 200  CDD
    const mildDays = makeDays(50, 20);   // mild: no HDD, no CDD
    const allDays = [...coldDays, ...hotDays, ...mildDays];
    const result = processWeatherData(allDays, 2023);
    expect(result.hdd).toBeCloseTo(100 * 13.0, 0);
    expect(result.cdd).toBeCloseTo(50 * 4.0, 0);
  });

  it("preserves the year in the output", () => {
    const result = processWeatherData(makeDays(10, 10), 2022);
    expect(result.year).toBe(2022);
  });

  it("avgTemp is mean of input avgTemps", () => {
    const days: DailyWeather[] = [
      { date: "20230101", avgTemp: 10, maxTemp: 13, minTemp: 7 },
      { date: "20230102", avgTemp: 20, maxTemp: 23, minTemp: 17 },
    ];
    const result = processWeatherData(days, 2023);
    expect(result.avgTemp).toBeCloseTo(15.0, 1);
  });
});
