// src/lib/energy/consumption-normalizer.ts
// Normalizes raw monthly energy consumption API records into comparable annual kWh values.
// Unit conversions:
//   Gas (MJ)             → kWh: divide by 3.6
//   Electric (kWh)       → kWh: no conversion
//   District heating (Gcal) → kWh: multiply by 1163

export interface MonthlyConsumptionRecord {
  /** 4-digit year, e.g. 2023 */
  useYr: string;
  /** 2-digit month, e.g. "01"–"12" */
  useMonth: string;
  /** Energy type code: "전기" | "가스" | "지역난방" (or other) */
  engyKindNm: string;
  /** Consumption value in the unit specified by engyKindNm */
  useQnt: number;
}

export interface AnnualConsumption {
  year: number;
  electric_kwh: number;
  gas_kwh: number;
  district_kwh: number;
  total_kwh: number;
}

/** Convert gas MJ → kWh */
const MJ_TO_KWH = 1 / 3.6;

/** Convert district heating Gcal → kWh */
const GCAL_TO_KWH = 1163;

function toKwh(engyKindNm: string, useQnt: number): { electric: number; gas: number; district: number } {
  const kind = engyKindNm.trim();
  if (kind === "전기") {
    return { electric: useQnt, gas: 0, district: 0 };
  }
  if (kind === "가스") {
    return { electric: 0, gas: useQnt * MJ_TO_KWH, district: 0 };
  }
  if (kind === "지역난방") {
    return { electric: 0, gas: 0, district: useQnt * GCAL_TO_KWH };
  }
  // Unknown energy type — ignore
  return { electric: 0, gas: 0, district: 0 };
}

/**
 * Normalize an array of monthly consumption records into annual totals (kWh).
 * Groups by year, sums each energy type, converts all to kWh.
 * Returns empty array when input is empty.
 */
export function normalizeConsumption(
  records: MonthlyConsumptionRecord[]
): AnnualConsumption[] {
  if (records.length === 0) return [];

  const byYear = new Map<
    number,
    { electric: number; gas: number; district: number }
  >();

  for (const record of records) {
    const year = parseInt(record.useYr, 10);
    if (isNaN(year)) continue;

    const converted = toKwh(record.engyKindNm, record.useQnt ?? 0);
    const existing = byYear.get(year) ?? { electric: 0, gas: 0, district: 0 };

    byYear.set(year, {
      electric: existing.electric + converted.electric,
      gas: existing.gas + converted.gas,
      district: existing.district + converted.district,
    });
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, { electric, gas, district }]) => ({
      year,
      electric_kwh: electric,
      gas_kwh: gas,
      district_kwh: district,
      total_kwh: electric + gas + district,
    }));
}
