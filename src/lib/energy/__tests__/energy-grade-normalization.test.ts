import { describe, it, expect } from "vitest";
import { normalizeEnergyGrade } from "../energy-grade";
import type { EnergyGrade } from "../energy-grade";

const CASES: Array<{ label: string; enumValue: EnergyGrade }> = [
  { label: "1+++등급", enumValue: "1+++" },
  { label: "1++등급", enumValue: "1++" },
  { label: "1+등급", enumValue: "1+" },
  { label: "1등급", enumValue: "1" },
  { label: "2등급", enumValue: "2" },
  { label: "3등급", enumValue: "3" },
  { label: "4등급", enumValue: "4" },
  { label: "5등급", enumValue: "5" },
  { label: "6등급", enumValue: "6" },
  { label: "7등급", enumValue: "7" },
];

describe("normalizeEnergyGrade", () => {
  it.each(CASES)(
    "normalizes Korean label '$label' and enum value '$enumValue' to the same bucket",
    ({ label, enumValue }) => {
      expect(normalizeEnergyGrade(label)).toBe(enumValue);
      expect(normalizeEnergyGrade(enumValue)).toBe(enumValue);
    }
  );

  it("tolerates the fuller GRADE_LABELS annotation form", () => {
    expect(normalizeEnergyGrade("1+++등급 (제로에너지수준)")).toBe("1+++");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEnergyGrade("  1등급  ")).toBe("1");
  });

  it("returns null for unrecognized input", () => {
    expect(normalizeEnergyGrade("not-a-grade")).toBeNull();
    expect(normalizeEnergyGrade("")).toBeNull();
  });
});
