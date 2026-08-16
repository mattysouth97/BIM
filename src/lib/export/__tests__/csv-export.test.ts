import { describe, it, expect } from "vitest";
import { generateBuildingCSV } from "../csv-export";
import type { BuildingExportData } from "../csv-export";

const BASE_BUILDING: BuildingExportData = {
  name: "Test Building",
  address: "123 Main St",
  useType: "office",
  era: "2010s",
  area: 1000,
  floors: 5,
  energyDemand: 150000,
  energyPerArea: 150,
  energyGrade: "B",
  co2Total: 68.91,
  co2PerArea: 68.91,
  wallU: 0.35,
  roofU: 0.25,
  windowU: 1.8,
  airtightness: 3.0,
  fidelityLevel: 2,
  dataQualityScore: 0.85,
};

describe("generateBuildingCSV", () => {
  it("single building produces valid CSV with header + 1 data row", () => {
    const csv = generateBuildingCSV([BASE_BUILDING]);
    const lines = csv.trimEnd().split("\n");
    // BOM + header + 1 data row = 2 lines
    expect(lines).toHaveLength(2);
    // Header starts with BOM and first column
    expect(lines[0]).toMatch(/name/);
    // Data row contains the building name
    expect(lines[1]).toContain("Test Building");
  });

  it("multiple buildings produce header + N data rows", () => {
    const second: BuildingExportData = { ...BASE_BUILDING, name: "Building B" };
    const csv = generateBuildingCSV([BASE_BUILDING, second]);
    const lines = csv.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Test Building");
    expect(lines[2]).toContain("Building B");
  });

  it("values containing commas are wrapped in double-quotes", () => {
    const building: BuildingExportData = {
      ...BASE_BUILDING,
      address: "Seoul, Gangnam-gu",
    };
    const csv = generateBuildingCSV([building]);
    expect(csv).toContain('"Seoul, Gangnam-gu"');
  });

  it("includes retrofit financial columns when provided (P0-02)", () => {
    const building: BuildingExportData = {
      ...BASE_BUILDING,
      retrofitNpvKrw: 6_500_000,
      retrofitEffectiveCapexKrw: 8_000_000,
      retrofitDiscountedPaybackYears: 6.8,
      retrofitAnnualSavingKwh: 40_000,
    };
    const csv = generateBuildingCSV([building]);
    const lines = csv.trimEnd().split("\n");

    expect(lines[0]).toContain("retrofitNpvKrw");
    expect(lines[0]).toContain("retrofitEffectiveCapexKrw");
    expect(lines[0]).toContain("retrofitDiscountedPaybackYears");
    expect(lines[0]).toContain("retrofitAnnualSavingKwh");
    expect(lines[1]).toContain("6500000");
    expect(lines[1]).toContain("6.8");
  });

  it("renders empty cells (not zeros) for absent retrofit financials (P0-02)", () => {
    const csv = generateBuildingCSV([BASE_BUILDING]);
    const lines = csv.trimEnd().split("\n");

    // Row stays aligned with the header — absent retrofit values are explicit
    // empty fields, never fabricated 0s.
    expect(lines[1].split(",").length).toBe(lines[0].split(",").length);
    const cells = lines[1].split(",");
    const headerCells = lines[0].split(",");
    const npvIdx = headerCells.findIndex((h) => h.includes("retrofitNpvKrw"));
    expect(npvIdx).toBeGreaterThan(-1);
    expect(cells[npvIdx]).toBe("");
  });

  it("empty array returns BOM + header line only", () => {
    const csv = generateBuildingCSV([]);
    const lines = csv.trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    // BOM should be present at the start
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toContain("name");
  });
});
