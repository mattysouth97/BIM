"use client";

// src/hooks/use-weather-data.ts
// TanStack Query hook for fetching previous year's KMA ASOS daily weather data
// and computing HDD/CDD via weather-processor.

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import {
  processWeatherData,
  type DailyWeather,
  type WeatherSummary,
} from "@/lib/energy/weather-processor";

export interface WeatherDataParams {
  /** KMA ASOS station ID (e.g. 108 = Seoul). Takes priority over coords. */
  stnId?: number;
  /** Latitude — used only when stnId is not provided */
  lat?: number;
  /** Longitude — used only when stnId is not provided */
  lng?: number;
  /** Override the target year. Defaults to previous calendar year. */
  year?: number;
}

/** Raw item shape returned by /api/weather (KMA ASOS daily) */
interface KmaAsosDailyItem {
  tm?: string | number;
  avgTa?: string | number;
  maxTa?: string | number;
  minTa?: string | number;
}

interface WeatherApiResponse {
  items: KmaAsosDailyItem[];
  totalCount: number;
}

async function fetchWeatherSummary(
  params: WeatherDataParams,
  apiKey: string,
): Promise<WeatherSummary> {
  const year = params.year ?? new Date().getFullYear() - 1;
  const stnId = params.stnId ?? 108; // default Seoul

  const query = new URLSearchParams({
    startDt: `${year}0101`,
    endDt: `${year}1231`,
    stnId: String(stnId),
    dataCd: "ASOS",
    dateCd: "DAY",
    numOfRows: "365",
    pageNo: "1",
  });

  const response = await fetch(`/api/weather?${query.toString()}`, {
    headers: { "x-api-key": apiKey },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Weather API error ${response.status}`);
  }

  const data = (await response.json()) as WeatherApiResponse;
  const items = data.items ?? [];

  const days: DailyWeather[] = [];
  for (const item of items) {
    const dateStr = String(item.tm ?? "");
    const avgTemp = parseFloat(String(item.avgTa ?? ""));
    const maxTemp = parseFloat(String(item.maxTa ?? ""));
    const minTemp = parseFloat(String(item.minTa ?? ""));

    if (dateStr.length < 8 || isNaN(avgTemp)) continue;

    days.push({
      date: dateStr,
      avgTemp,
      maxTemp: isNaN(maxTemp) ? avgTemp : maxTemp,
      minTemp: isNaN(minTemp) ? avgTemp : minTemp,
    });
  }

  return processWeatherData(days, year);
}

/**
 * Fetch the previous year's daily weather data from KMA ASOS and compute
 * HDD/CDD using Korean standard base temperatures (18.3°C / 24°C).
 *
 * Requires an API key in the app store. Returns null data when no key is set.
 * Stale time: 30 minutes (weather data for a past year never changes).
 */
export function useWeatherData(params: WeatherDataParams = {}) {
  const apiKey = useAppStore((s) => s.apiKey);

  return useQuery<WeatherSummary | null, Error>({
    queryKey: ["weather", params.stnId ?? params.lat, params.lng, params.year],
    queryFn: () => {
      if (!apiKey) return Promise.resolve(null);
      return fetchWeatherSummary(params, apiKey);
    },
    enabled: !!apiKey,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
