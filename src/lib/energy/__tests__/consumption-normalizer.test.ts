import { describe, it, expect } from "vitest";
import {
  normalizeConsumption,
  type MonthlyConsumptionRecord,
} from "../consumption-normalizer";

// Unit conversion constants
const MJ_TO_KWH = 1 / 3.6; // ≈ 0.27778
const GCAL_TO_KWH = 1163;

function makeRecord(
  useYr: string,
  useMonth: string,
  engyKindNm: string,
  useQnt: number
): MonthlyConsumptionRecord {
  return { useYr, useMonth, engyKindNm, useQnt };
}

describe("normalizeConsumption", () => {
  it("returns empty array for empty input", () => {
    expect(normalizeConsumption([])).toEqual([]);
  });

  it("converts 1 MJ gas → 0.2778 kWh (within tolerance)", () => {
    const records = [makeRecord("2023", "01", "가스", 1)];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].gas_kwh).toBeCloseTo(MJ_TO_KWH, 10);
    expect(result[0].electric_kwh).toBe(0);
    expect(result[0].district_kwh).toBe(0);
  });

  it("converts 1 Gcal district heating → 1163 kWh", () => {
    const records = [makeRecord("2023", "01", "지역난방", 1)];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].district_kwh).toBe(GCAL_TO_KWH);
    expect(result[0].electric_kwh).toBe(0);
    expect(result[0].gas_kwh).toBe(0);
  });

  it("passes electric kWh through unchanged", () => {
    const records = [makeRecord("2023", "01", "전기", 500)];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].electric_kwh).toBe(500);
    expect(result[0].gas_kwh).toBe(0);
    expect(result[0].district_kwh).toBe(0);
  });

  it("groups all 3 energy types into one annual total", () => {
    const records = [
      makeRecord("2023", "01", "전기", 1200),
      makeRecord("2023", "02", "가스", 3600), // 3600 MJ = 1000 kWh
      makeRecord("2023", "03", "지역난방", 1), // 1 Gcal = 1163 kWh
    ];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2023);
    expect(result[0].electric_kwh).toBe(1200);
    expect(result[0].gas_kwh).toBeCloseTo(1000, 5);
    expect(result[0].district_kwh).toBe(GCAL_TO_KWH);
    expect(result[0].total_kwh).toBeCloseTo(1200 + 1000 + GCAL_TO_KWH, 5);
  });

  it("groups multiple months per year and sums correctly", () => {
    const records = [
      makeRecord("2023", "01", "전기", 100),
      makeRecord("2023", "02", "전기", 200),
      makeRecord("2023", "03", "전기", 300),
    ];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].electric_kwh).toBe(600);
  });

  it("produces separate entries per year sorted ascending", () => {
    const records = [
      makeRecord("2022", "06", "전기", 400),
      makeRecord("2021", "06", "전기", 200),
      makeRecord("2023", "06", "전기", 600),
    ];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(3);
    expect(result[0].year).toBe(2021);
    expect(result[1].year).toBe(2022);
    expect(result[2].year).toBe(2023);
  });

  it("handles partial data — only electric, no gas or district", () => {
    const records = [
      makeRecord("2023", "01", "전기", 300),
      makeRecord("2023", "02", "전기", 350),
    ];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].gas_kwh).toBe(0);
    expect(result[0].district_kwh).toBe(0);
    expect(result[0].electric_kwh).toBe(650);
    expect(result[0].total_kwh).toBe(650);
  });

  it("ignores unknown energy types", () => {
    const records = [
      makeRecord("2023", "01", "전기", 100),
      makeRecord("2023", "02", "기타에너지", 9999),
    ];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].electric_kwh).toBe(100);
    expect(result[0].total_kwh).toBe(100);
  });

  it("handles zero useQnt values without NaN", () => {
    const records = [
      makeRecord("2023", "01", "전기", 0),
      makeRecord("2023", "02", "가스", 0),
    ];
    const result = normalizeConsumption(records);
    expect(result).toHaveLength(1);
    expect(result[0].total_kwh).toBe(0);
    expect(isNaN(result[0].total_kwh)).toBe(false);
  });
});
