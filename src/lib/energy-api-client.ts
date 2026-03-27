import { useAppStore } from "@/store/app-store";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface MonthlyConsumption {
  month: number;
  /** Electricity in kWh */
  electricity: number;
  /** Gas in MJ */
  gas: number;
}

export interface EnergyConsumptionResult {
  monthly: MonthlyConsumption[];
}

export interface EnergyGradeResult {
  /** Certified energy grade (e.g. "1+", "2") */
  grade: string;
  /** Primary energy demand in kWh/m2yr */
  demand: number;
}

export interface MonthlyWeather {
  month: number;
  avgTemp: number;
}

export interface WeatherDataResult {
  monthly: MonthlyWeather[];
}

// ─────────────────────────────────────────────
// Internal fetch helper
// ─────────────────────────────────────────────

async function energyFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T | null> {
  const apiKey = useAppStore.getState().apiKey;
  if (!apiKey) return null;

  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Public API functions
// ─────────────────────────────────────────────

/** Gas MJ to kWh conversion factor */
const MJ_TO_KWH = 1 / 3.6;

/**
 * Fetch monthly energy consumption for a building.
 * Returns null if API has no data for this building.
 */
export async function fetchEnergyConsumption(
  pk: string,
  year?: number,
): Promise<EnergyConsumptionResult | null> {
  const currentYear = year ?? new Date().getFullYear() - 1;
  const result = await energyFetch<{
    items: Array<{
      useYm?: string;
      elctyUsQty?: number | string;
      gasUsQty?: number | string;
    }>;
    totalCount: number;
  }>("/api/energy/consumption", {
    mgmBldrgstPk: pk,
    year: currentYear,
    numOfRows: 12,
  });

  if (!result || !result.items || result.items.length === 0) return null;

  const monthly: MonthlyConsumption[] = result.items.map((item) => {
    const ym = String(item.useYm ?? "");
    const monthStr = ym.length >= 6 ? ym.slice(4, 6) : "0";
    return {
      month: parseInt(monthStr, 10) || 0,
      electricity: parseFloat(String(item.elctyUsQty ?? "0")) || 0,
      gas: parseFloat(String(item.gasUsQty ?? "0")) || 0,
    };
  });

  return { monthly };
}

/**
 * Fetch certified energy grade for a building.
 * Returns null if building has no energy rating certification.
 */
export async function fetchEnergyGrade(
  pk: string,
): Promise<EnergyGradeResult | null> {
  const result = await energyFetch<{
    items: Array<{
      engEffcGrdNm?: string;
      totEngyDmndQty?: number | string;
    }>;
    totalCount: number;
  }>("/api/energy/grade", {
    mgmBldrgstPk: pk,
  });

  if (!result || !result.items || result.items.length === 0) return null;

  const item = result.items[0];
  const grade = String(item.engEffcGrdNm ?? "").trim();
  const demand = parseFloat(String(item.totEngyDmndQty ?? "0")) || 0;

  if (!grade) return null;

  return { grade, demand };
}

/**
 * Fetch weather data (monthly average temperatures) for degree-day calculation.
 * Returns null if weather API is unavailable (may need separate key).
 */
export async function fetchWeatherData(
  year?: number,
): Promise<WeatherDataResult | null> {
  const currentYear = year ?? new Date().getFullYear() - 1;
  const result = await energyFetch<{
    items: Array<{
      tm?: string;
      avgTa?: number | string;
    }>;
    totalCount: number;
  }>("/api/weather", {
    startDt: `${currentYear}0101`,
    endDt: `${currentYear}1231`,
    stnId: 108, // Seoul
  });

  if (!result || !result.items || result.items.length === 0) return null;

  // Aggregate daily data to monthly averages
  const monthAccum: Record<number, { sum: number; count: number }> = {};

  for (const item of result.items) {
    const dateStr = String(item.tm ?? "");
    if (dateStr.length < 6) continue;
    const month = parseInt(dateStr.slice(4, 6), 10);
    const temp = parseFloat(String(item.avgTa ?? ""));
    if (isNaN(temp) || month < 1 || month > 12) continue;

    if (!monthAccum[month]) monthAccum[month] = { sum: 0, count: 0 };
    monthAccum[month].sum += temp;
    monthAccum[month].count += 1;
  }

  const monthly: MonthlyWeather[] = [];
  for (let m = 1; m <= 12; m++) {
    const acc = monthAccum[m];
    monthly.push({
      month: m,
      avgTemp: acc && acc.count > 0 ? acc.sum / acc.count : 0,
    });
  }

  return { monthly };
}

/**
 * Compute total annual kWh from monthly consumption data.
 * Converts gas from MJ to kWh and adds to electricity.
 */
export function computeAnnualKwh(monthly: MonthlyConsumption[]): number {
  return monthly.reduce(
    (total, m) => total + m.electricity + m.gas * MJ_TO_KWH,
    0,
  );
}
