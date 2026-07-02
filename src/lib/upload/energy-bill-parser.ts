export interface MonthlyBill {
  year: number;
  month: number;
  energyType: 'electric' | 'gas' | 'district';
  consumption: number; // kWh for electric, MJ for gas, Gcal for district
  cost: number; // KRW
}

/**
 * Strip UTF-8 BOM marker if present.
 */
function stripBOM(str: string): string {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

/**
 * Parse a numeric string that may contain comma separators (e.g. "1,234" → 1234).
 * Returns NaN if the value is not a valid number after stripping commas.
 */
function parseNumber(value: string): number {
  return Number(value.trim().replace(/,/g, ''));
}

/**
 * Parse year/month from a 6-digit string like "202301".
 * Returns null if the format is invalid.
 */
function parseYearMonth(raw: string): { year: number; month: number } | null {
  const s = raw.trim();
  if (!/^\d{6}$/.test(s)) return null;
  const year = parseInt(s.slice(0, 4), 10);
  const month = parseInt(s.slice(4, 6), 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Detect whether a CSV line looks like a header row.
 * Returns true if the first cell contains non-numeric Korean text.
 */
function isHeaderRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const first = cells[0].trim();
  // A data row always starts with a 6-digit year-month code
  return !/^\d{6}$/.test(first);
}

/**
 * Parse Korean utility bill CSV.
 *
 * KEPCO (한전) format:
 *   Header: 사용년월, 사용량(kWh), 요금(원)
 *   Data:   202301, 1234, 156000
 *
 * City gas format:
 *   Header: 사용년월, 사용량(MJ), 요금(원)
 *   Data:   202301, 5678, 89000
 */
export function parseEnergyBillCSV(csvContent: string, format: 'kepco' | 'citygas'): MonthlyBill[] {
  const energyType: MonthlyBill['energyType'] = format === 'kepco' ? 'electric' : 'gas';
  const cleaned = stripBOM(csvContent);
  const lines = cleaned.split(/\r?\n/);
  const bills: MonthlyBill[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // skip empty rows

    const cells = trimmed.split(',');
    if (cells.length < 3) continue; // malformed row — skip

    if (isHeaderRow(cells)) continue; // skip header

    const ym = parseYearMonth(cells[0]);
    if (!ym) continue; // unparseable year-month — skip

    const consumption = parseNumber(cells[1]);
    const cost = parseNumber(cells[2]);

    // Skip rows where essential numerics are invalid
    if (isNaN(consumption) || isNaN(cost)) continue;

    bills.push({
      year: ym.year,
      month: ym.month,
      energyType,
      consumption,
      cost,
    });
  }

  return bills;
}
