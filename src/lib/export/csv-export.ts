// src/lib/export/csv-export.ts
// Export building data as UTF-8 BOM CSV for Korean Excel compatibility.
// Pure functions — no React, no side effects.

/** UTF-8 BOM prefix for Korean Excel compatibility */
const BOM = "\uFEFF";

export interface BuildingExportData {
  name: string;
  address: string;
  useType: string;
  era: string;
  area: number;
  floors: number;
  energyDemand: number;
  energyPerArea: number;
  energyGrade: string;
  co2Total: number;
  co2PerArea: number;
  wallU: number;
  roofU: number;
  windowU: number;
  airtightness: number;
  fidelityLevel: number;
  dataQualityScore: number;
  // P0-02 — retrofit scenario financials (optional; absent ⇒ empty cells,
  // never fabricated zeros).
  retrofitNpvKrw?: number;
  retrofitEffectiveCapexKrw?: number;
  retrofitDiscountedPaybackYears?: number | null;
  retrofitAnnualSavingKwh?: number;
}

const HEADERS: (keyof BuildingExportData)[] = [
  "name",
  "address",
  "useType",
  "era",
  "area",
  "floors",
  "energyDemand",
  "energyPerArea",
  "energyGrade",
  "co2Total",
  "co2PerArea",
  "wallU",
  "roofU",
  "windowU",
  "airtightness",
  "fidelityLevel",
  "dataQualityScore",
  "retrofitNpvKrw",
  "retrofitEffectiveCapexKrw",
  "retrofitDiscountedPaybackYears",
  "retrofitAnnualSavingKwh",
];

/**
 * Escape a single CSV field value.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 * Internal double-quotes are escaped by doubling them.
 */
function escapeField(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a UTF-8 BOM CSV string from an array of building records.
 * First row is the header. Each subsequent row is one building.
 * Returns header-only (with BOM) for an empty array.
 */
export function generateBuildingCSV(buildings: BuildingExportData[]): string {
  const headerRow = HEADERS.map(escapeField).join(",");

  if (buildings.length === 0) {
    return BOM + headerRow + "\n";
  }

  const dataRows = buildings.map((b) =>
    // Absent/null optional fields render as explicit empty cells.
    HEADERS.map((key) => escapeField(b[key] ?? "")).join(",")
  );

  return BOM + [headerRow, ...dataRows].join("\n") + "\n";
}
