import { describe, it, expect } from "vitest";
import { createSceneProjection, GisCoordinateError, KOREA_BOUNDS } from "./gis-transform";

/**
 * Haversine formula: returns geodesic distance in meters between two WGS84 points.
 */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Seoul centroid used as origin in most tests
const SEOUL_LNG = 126.978;
const SEOUL_LAT = 37.5665;

describe("createSceneProjection", () => {
  it("Test 1: origin projects to [~0, ~0]", () => {
    const proj = createSceneProjection(SEOUL_LNG, SEOUL_LAT);
    const [x, z] = proj.project(SEOUL_LNG, SEOUL_LAT);
    expect(Math.abs(x)).toBeLessThan(0.001);
    expect(Math.abs(z)).toBeLessThan(0.001);
  });

  it("Test 2: round-trip 2km NE — error < 1m", () => {
    const proj = createSceneProjection(SEOUL_LNG, SEOUL_LAT);
    // ~2km NE of Seoul centroid (approx 0.018° ≈ 2km)
    const origLng = SEOUL_LNG + 0.018;
    const origLat = SEOUL_LAT + 0.018;
    const [x, z] = proj.project(origLng, origLat);
    const [roundLng, roundLat] = proj.unproject(x, z);
    const errorMeters = haversineMeters(origLat, origLng, roundLat, roundLng);
    expect(errorMeters).toBeLessThan(1);
  });

  it("Test 3: out-of-bounds longitude throws GisCoordinateError", () => {
    const proj = createSceneProjection(SEOUL_LNG, SEOUL_LAT);
    expect(() => proj.project(100, 35)).toThrow(GisCoordinateError);
  });

  it("Test 4: out-of-bounds latitude throws GisCoordinateError", () => {
    const proj = createSceneProjection(SEOUL_LNG, SEOUL_LAT);
    expect(() => proj.project(127, 20)).toThrow(GisCoordinateError);
  });

  it("Test 5: unproject +50m from origin returns WGS84 coords inside KOREA_BOUNDS", () => {
    const originLng = 127;
    const originLat = 37;
    const proj = createSceneProjection(originLng, originLat);
    const [lng, lat] = proj.unproject(50, 50);
    expect(lat).toBeGreaterThanOrEqual(KOREA_BOUNDS.minLat);
    expect(lat).toBeLessThanOrEqual(KOREA_BOUNDS.maxLat);
    expect(lng).toBeGreaterThanOrEqual(KOREA_BOUNDS.minLng);
    expect(lng).toBeLessThanOrEqual(KOREA_BOUNDS.maxLng);
  });
});

describe("GisCoordinateError", () => {
  it("has name 'GisCoordinateError' and includes offending coordinate in message", () => {
    const err = new GisCoordinateError(100, 35);
    expect(err.name).toBe("GisCoordinateError");
    expect(err.message).toContain("100");
    expect(err.message).toContain("35");
  });
});

describe("createSceneProjection — origin bounds check", () => {
  it("throws GisCoordinateError when origin is outside Korean peninsula", () => {
    expect(() => createSceneProjection(100, 35)).toThrow(GisCoordinateError);
  });
});
