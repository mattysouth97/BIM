import { describe, expect, it } from "vitest";
import {
  SEOUL_WGS84,
  computeSunAngles,
  dateForPreset,
  evaluateSun,
  sunDirectionFromAngles,
} from "../solar";

describe("solar position", () => {
  it("places noon near the south in Seoul at the equinox", () => {
    const noon = dateForPreset("12:00", 2026, 8, 22);
    const { azimuthDeg, elevationDeg } = computeSunAngles(SEOUL_WGS84.lat, SEOUL_WGS84.lon, noon);
    expect(elevationDeg).toBeGreaterThan(40);
    expect(elevationDeg).toBeLessThan(60);
    const southDelta = Math.min(Math.abs(azimuthDeg - 180), Math.abs(azimuthDeg - 180 + 360));
    expect(southDelta).toBeLessThan(25);
  });

  it("places morning sun in the east", () => {
    const morning = dateForPreset("08:00", 2026, 8, 22);
    const { azimuthDeg, elevationDeg } = computeSunAngles(SEOUL_WGS84.lat, SEOUL_WGS84.lon, morning);
    expect(elevationDeg).toBeGreaterThan(10);
    expect(azimuthDeg).toBeGreaterThan(70);
    expect(azimuthDeg).toBeLessThan(130);
  });

  it("maps south azimuth to +Z in the scene frame", () => {
    const [x, y, z] = sunDirectionFromAngles(180, 45);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(z).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("maps east azimuth to −X", () => {
    const [x, y, z] = sunDirectionFromAngles(90, 0);
    expect(x).toBeCloseTo(-1, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(0, 5);
  });

  it("dims the sun at night and under overcast", () => {
    const noon = evaluateSun("12:00", "clear");
    const night = evaluateSun("night", "clear");
    const overcast = evaluateSun("12:00", "overcast");
    expect(night.sunIntensity).toBeLessThan(noon.sunIntensity);
    expect(overcast.sunIntensity).toBeLessThan(noon.sunIntensity);
    expect(overcast.turbidity).toBeGreaterThan(noon.turbidity);
  });

  it("raises wet-weather fog without changing the solar algorithm", () => {
    const rain = evaluateSun("12:00", "rain");
    const clear = evaluateSun("12:00", "clear");
    expect(rain.fogDensity).toBeGreaterThan(clear.fogDensity);
  });
});
