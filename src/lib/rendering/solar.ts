// src/lib/rendering/solar.ts
// Compact solar-position model (NOAA-style) for the viewport sun.
// Scene convention: +Y up, +Z south (building front), +X west.

import type { TimeOfDayPreset, WeatherPreset } from "./types";

export const SEOUL_WGS84 = { lat: 37.5665, lon: 126.978 } as const;

export interface SunState {
  azimuthDeg: number;
  elevationDeg: number;
  /** Unit vector pointing FROM the origin TOWARD the sun. */
  direction: readonly [number, number, number];
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  sunIntensity: number;
  skyIntensity: number;
  groundIntensity: number;
  exposure: number;
  sunColor: string;
  skyColor: string;
  groundColor: string;
  fogDensity: number;
  fogColor: string;
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

function wrap360(d: number): number {
  return ((d % 360) + 360) % 360;
}

/**
 * Solar azimuth (0 = north, 90 = east) and elevation for a civil datetime.
 * Longitude is east-positive. Date is interpreted as local mean solar time
 * offset by the longitude from UTC (caller should pass a UTC Date).
 */
export function computeSunAngles(
  latDeg: number,
  lonDeg: number,
  date: Date,
): { azimuthDeg: number; elevationDeg: number } {
  const lat = toRad(latDeg);
  const d = date;
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (d.getTime() - start) / 86_400_000;
  const hourUTC = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;

  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourUTC - 12) / 24);
  const eqTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
  const decl = 0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma);

  const timeOffset = eqTime + 4 * lonDeg;
  const trueSolarMin = hourUTC * 60 + timeOffset;
  let hourAngle = toRad(trueSolarMin / 4 - 180);
  if (hourAngle < -Math.PI) hourAngle += 2 * Math.PI;
  if (hourAngle > Math.PI) hourAngle -= 2 * Math.PI;

  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.min(1, Math.max(-1, sinEl)));

  const cosAz = (Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.sin(lat) * Math.cos(hourAngle))
    / Math.cos(elevation);
  let azimuth = Math.acos(Math.min(1, Math.max(-1, cosAz)));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;

  return {
    azimuthDeg: wrap360((azimuth * 180) / Math.PI),
    elevationDeg: (elevation * 180) / Math.PI,
  };
}

/**
 * Convert solar azimuth/elevation into the scene's +Z-south frame.
 * Azimuth 0 = north = −Z; 90 = east = −X; 180 = south = +Z.
 */
export function sunDirectionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
): readonly [number, number, number] {
  const az = toRad(azimuthDeg);
  const el = toRad(elevationDeg);
  const cosEl = Math.cos(el);
  const x = -Math.sin(az) * cosEl;
  const y = Math.sin(el);
  const z = -Math.cos(az) * cosEl;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

const PRESET_CLOCK: Record<TimeOfDayPreset, { hour: number; minute: number }> = {
  "08:00": { hour: 8, minute: 0 },
  "12:00": { hour: 12, minute: 0 },
  "16:00": { hour: 16, minute: 0 },
  golden: { hour: 17, minute: 40 },
  overcast: { hour: 12, minute: 0 },
  night: { hour: 21, minute: 30 },
};

export function dateForPreset(preset: TimeOfDayPreset, year = 2026, monthIndex = 8, day = 22): Date {
  const clock = PRESET_CLOCK[preset];
  // Korea is UTC+9. Store as UTC so computeSunAngles sees the correct solar time.
  return new Date(Date.UTC(year, monthIndex, day, clock.hour - 9, clock.minute, 0));
}

export function evaluateSun(
  preset: TimeOfDayPreset,
  weather: WeatherPreset,
  lat = SEOUL_WGS84.lat,
  lon = SEOUL_WGS84.lon,
): SunState {
  const effectivePreset = weather === "overcast" && preset !== "night" ? "overcast" : preset;
  const { azimuthDeg, elevationDeg } = computeSunAngles(lat, lon, dateForPreset(effectivePreset));
  const direction = sunDirectionFromAngles(azimuthDeg, Math.max(elevationDeg, -2));

  const night = preset === "night" || elevationDeg < -0.5;
  const overcast = weather === "overcast" || weather === "rain" || preset === "overcast";
  const fog = weather === "fog";
  const rain = weather === "rain";
  const golden = preset === "golden";

  if (night) {
    return {
      azimuthDeg,
      elevationDeg,
      direction,
      turbidity: 1.2,
      rayleigh: 0.4,
      mieCoefficient: 0.003,
      mieDirectionalG: 0.7,
      sunIntensity: 0.08,
      skyIntensity: 0.12,
      groundIntensity: 0.04,
      exposure: 0.55,
      sunColor: "#c8d4e8",
      skyColor: "#0b1220",
      groundColor: "#0a0c10",
      fogDensity: fog ? 0.018 : 0.006,
      fogColor: "#0c121c",
    };
  }

  if (overcast) {
    return {
      azimuthDeg,
      elevationDeg,
      direction,
      turbidity: 12,
      rayleigh: 2.2,
      mieCoefficient: 0.012,
      mieDirectionalG: 0.6,
      sunIntensity: rain ? 0.5 : 0.75,
      skyIntensity: 0.48,
      groundIntensity: 0.24,
      exposure: 0.78,
      sunColor: "#e8ecef",
      skyColor: "#9aa8b4",
      groundColor: "#6a6560",
      fogDensity: rain ? 0.012 : fog ? 0.02 : 0.008,
      fogColor: "#a8b4be",
    };
  }

  return {
    azimuthDeg,
    elevationDeg,
    direction,
    turbidity: golden ? 8 : 3.2,
    rayleigh: golden ? 1.8 : 1.35,
    mieCoefficient: golden ? 0.01 : 0.005,
    mieDirectionalG: 0.82,
    sunIntensity: golden ? 1.9 : 2.35,
    skyIntensity: 0.38,
    groundIntensity: 0.16,
    exposure: golden ? 0.82 : 0.74,
    sunColor: golden ? "#ffb070" : "#fff1d6",
    skyColor: golden ? "#c4b8d8" : "#7eafd9",
    groundColor: golden ? "#8a6a48" : "#5a5346",
    fogDensity: fog ? 0.014 : 0.0022,
    fogColor: golden ? "#d2b48c" : "#9eb9d4",
  };
}
