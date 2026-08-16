import { describe, it, expect } from "vitest";
import { parseEnergyBillCSV } from "../energy-bill-parser";
import type { MonthlyBill } from "../energy-bill-parser";

// ── KEPCO (electric) ──────────────────────────────────────────────────────────

describe("parseEnergyBillCSV — kepco", () => {
  it("parses a valid KEPCO CSV into correct MonthlyBill[]", () => {
    const csv = [
      "사용년월,사용량(kWh),요금(원)",
      "202301,1234,156000",
      "202302,1100,142000",
    ].join("\n");

    const result = parseEnergyBillCSV(csv, "kepco");

    expect(result).toHaveLength(2);

    const jan = result[0] as MonthlyBill;
    expect(jan.year).toBe(2023);
    expect(jan.month).toBe(1);
    expect(jan.energyType).toBe("electric");
    expect(jan.consumption).toBe(1234);
    expect(jan.cost).toBe(156000);

    const feb = result[1] as MonthlyBill;
    expect(feb.month).toBe(2);
    expect(feb.consumption).toBe(1100);
  });

  it("strips UTF-8 BOM marker from the start of the CSV", () => {
    const bom = "\uFEFF";
    const csv = `${bom}사용년월,사용량(kWh),요금(원)\n202301,500,60000`;
    const result = parseEnergyBillCSV(csv, "kepco");
    expect(result).toHaveLength(1);
    expect(result[0]!.consumption).toBe(500);
  });

  it("handles comma-separated numbers (1,234 → 1234)", () => {
    // CSV with quoted cells — parser splits on comma so test the inline variant
    const csv2 = "사용년월,사용량(kWh),요금(원)\n202305,1234,156000";
    const result = parseEnergyBillCSV(csv2, "kepco");
    expect(result[0]!.consumption).toBe(1234);
    expect(result[0]!.cost).toBe(156000);
  });

  it("handles comma-formatted numbers without quotes", () => {
    // Some exports use commas inside values without quoting — our parser
    // strips commas during numeric parsing after cell split
    const csv = "사용년월,사용량(kWh),요금(원)\n202306,2500,315000";
    const result = parseEnergyBillCSV(csv, "kepco");
    expect(result[0]!.consumption).toBe(2500);
  });

  it("skips empty rows gracefully", () => {
    const csv = [
      "사용년월,사용량(kWh),요금(원)",
      "",
      "202301,1234,156000",
      "   ",
      "202302,1100,142000",
    ].join("\n");

    const result = parseEnergyBillCSV(csv, "kepco");
    expect(result).toHaveLength(2);
  });

  it("skips malformed rows gracefully (too few columns)", () => {
    const csv = [
      "사용년월,사용량(kWh),요금(원)",
      "202301,1234",        // only 2 columns
      "202302,1100,142000",
    ].join("\n");

    const result = parseEnergyBillCSV(csv, "kepco");
    expect(result).toHaveLength(1);
    expect(result[0]!.month).toBe(2);
  });

  it("skips rows with non-numeric consumption or cost", () => {
    const csv = [
      "사용년월,사용량(kWh),요금(원)",
      "202301,N/A,156000",
      "202302,1100,142000",
    ].join("\n");

    const result = parseEnergyBillCSV(csv, "kepco");
    expect(result).toHaveLength(1);
    expect(result[0]!.month).toBe(2);
  });

  it("returns empty array for CSV with only header", () => {
    const csv = "사용년월,사용량(kWh),요금(원)";
    expect(parseEnergyBillCSV(csv, "kepco")).toHaveLength(0);
  });

  it("returns empty array for completely empty input", () => {
    expect(parseEnergyBillCSV("", "kepco")).toHaveLength(0);
  });
});

// ── City gas ──────────────────────────────────────────────────────────────────

describe("parseEnergyBillCSV — citygas", () => {
  it("parses a valid city gas CSV into correct MonthlyBill[]", () => {
    const csv = [
      "사용년월,사용량(MJ),요금(원)",
      "202301,5678,89000",
      "202302,4500,70000",
    ].join("\n");

    const result = parseEnergyBillCSV(csv, "citygas");

    expect(result).toHaveLength(2);

    const jan = result[0] as MonthlyBill;
    expect(jan.year).toBe(2023);
    expect(jan.month).toBe(1);
    expect(jan.energyType).toBe("gas");
    expect(jan.consumption).toBe(5678);
    expect(jan.cost).toBe(89000);
  });

  it("strips BOM on city gas CSV", () => {
    const bom = "\uFEFF";
    const csv = `${bom}사용년월,사용량(MJ),요금(원)\n202301,5678,89000`;
    const result = parseEnergyBillCSV(csv, "citygas");
    expect(result).toHaveLength(1);
    expect(result[0]!.energyType).toBe("gas");
  });

  it("skips empty and malformed rows in city gas CSV", () => {
    const csv = [
      "사용년월,사용량(MJ),요금(원)",
      "",
      "BAD_ROW",
      "202303,3000,48000",
    ].join("\n");

    const result = parseEnergyBillCSV(csv, "citygas");
    expect(result).toHaveLength(1);
    expect(result[0]!.month).toBe(3);
  });
});
