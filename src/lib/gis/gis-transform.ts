import proj4 from "proj4";

export const KOREA_BOUNDS = {
  minLat: 33,
  maxLat: 43,
  minLng: 124,
  maxLng: 132,
} as const;

export class GisCoordinateError extends Error {
  constructor(lng: number, lat: number) {
    super(
      `Coordinate [${lng}, ${lat}] is outside Korean peninsula bounds ` +
        `(lat ${KOREA_BOUNDS.minLat}–${KOREA_BOUNDS.maxLat}, ` +
        `lng ${KOREA_BOUNDS.minLng}–${KOREA_BOUNDS.maxLng})`
    );
    this.name = "GisCoordinateError";
  }
}

function assertKoreaBounds(lng: number, lat: number): void {
  if (
    lat < KOREA_BOUNDS.minLat ||
    lat > KOREA_BOUNDS.maxLat ||
    lng < KOREA_BOUNDS.minLng ||
    lng > KOREA_BOUNDS.maxLng
  ) {
    throw new GisCoordinateError(lng, lat);
  }
}

export interface SceneProjection {
  /** Convert WGS84 [lng, lat] to local [x, z] meters relative to scene origin. */
  project(lng: number, lat: number): [number, number];
  /** Convert local [x, z] meters back to WGS84 [lng, lat]. */
  unproject(x: number, z: number): [number, number];
  /** Scene origin in WGS84. */
  origin: { lng: number; lat: number };
}

/**
 * Create a site-specific Transverse Mercator projection centered on the given origin.
 * All output coordinates are in meters relative to the origin — suitable for direct
 * use as Three.js x, z values without float32 precision loss.
 *
 * The origin should be the centroid of the queried building's cadastral footprint.
 *
 * @param originLng - Scene origin longitude (WGS84). Must be within Korean peninsula bounds.
 * @param originLat - Scene origin latitude (WGS84). Must be within Korean peninsula bounds.
 * @throws {GisCoordinateError} If origin coordinates are outside Korean peninsula bounds.
 */
export function createSceneProjection(
  originLng: number,
  originLat: number
): SceneProjection {
  assertKoreaBounds(originLng, originLat);

  // Site-specific Transverse Mercator centered on scene origin.
  // x_0=0, y_0=0 means the origin projects to (0, 0) — no manual subtraction needed.
  const tmDef =
    `+proj=tmerc +lat_0=${originLat} +lon_0=${originLng} ` +
    `+k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;

  const converter = proj4("EPSG:4326", tmDef);

  return {
    origin: { lng: originLng, lat: originLat },

    /**
     * Convert WGS84 [lng, lat] to local [x, z] meters relative to scene origin.
     * x = east, z = north (caller maps to Three.js axes; Three.js Y is up).
     * @throws {GisCoordinateError} If input coordinates are outside Korean peninsula bounds.
     */
    project(lng: number, lat: number): [number, number] {
      assertKoreaBounds(lng, lat);
      const [x, y] = converter.forward([lng, lat]);
      // proj4 TM: forward([lng, lat]) → [easting, northing]
      // We return [easting, northing] as [x, z] for Three.js use
      return [x, y];
    },

    /**
     * Convert local [x, z] meters back to WGS84 [lng, lat].
     * Does not validate output against KOREA_BOUNDS — callers projecting
     * small local offsets (e.g. ±50m) near a valid origin will always be in-bounds.
     */
    unproject(x: number, z: number): [number, number] {
      const [lng, lat] = converter.inverse([x, z]) as [number, number];
      return [lng, lat];
    },
  };
}
