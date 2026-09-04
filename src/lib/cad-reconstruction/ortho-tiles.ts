// src/lib/cad-reconstruction/ortho-tiles.ts
//
// Slippy-map tile arithmetic for the aerial overlay.
//
// The overlay exists so a person can SEE the reconstructed outline sitting on
// the real roof and judge it. It is a verification aid, not a measurement: no
// value in the model is derived from the imagery, and nothing here produces a
// candidate outline. That distinction is the whole reason the overlay is safe
// to add — an image cannot silently become evidence.
//
// Standard Web Mercator XYZ, which is what VWorld's WMTS serves. Pure.

export interface TileRef {
  z: number;
  x: number;
  y: number;
}

export interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Imagery levels VWorld's Satellite layer actually serves. */
export const MIN_ORTHO_ZOOM = 14;
export const MAX_ORTHO_ZOOM = 19;
/**
 * A hard ceiling on tiles per overlay. Each tile is a proxied network request,
 * so an accidental world-sized bbox must cost a bounded amount, not a flood.
 */
export const MAX_ORTHO_TILES = 24;

const TILE_PX = 256;

/**
 * Fractional tile coordinates. The integer part is the tile; the fraction is
 * where inside it the point falls, which is what lets a caller place geometry.
 */
export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  // Web Mercator is undefined at the poles; clamping keeps this total.
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

export function tileBounds(tile: TileRef): LngLatBounds {
  const n = 2 ** tile.z;
  const lngOf = (x: number) => (x / n) * 360 - 180;
  const latOf = (y: number) => {
    const t = Math.PI * (1 - (2 * y) / n);
    return (180 / Math.PI) * Math.atan(Math.sinh(t));
  };
  return {
    west: lngOf(tile.x),
    east: lngOf(tile.x + 1),
    north: latOf(tile.y),
    south: latOf(tile.y + 1),
  };
}

/** Every tile touching `bbox`, capped at MAX_ORTHO_TILES. */
export function tilesCovering(bbox: LngLatBounds, z: number): TileRef[] {
  const { west, south, east, north } = bbox;
  if (![west, south, east, north].every(Number.isFinite)) return [];
  if (east < west || north < south) return [];

  const topLeft = lngLatToTile(west, north, z);
  const bottomRight = lngLatToTile(east, south, z);
  const n = 2 ** z;

  const x0 = Math.max(0, Math.floor(topLeft.x));
  const x1 = Math.min(n - 1, Math.floor(bottomRight.x));
  const y0 = Math.max(0, Math.floor(topLeft.y));
  const y1 = Math.min(n - 1, Math.floor(bottomRight.y));

  const tiles: TileRef[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tiles.length >= MAX_ORTHO_TILES) return tiles;
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/**
 * The deepest zoom at which the building still fits in a couple of tiles.
 *
 * Ground resolution at latitude φ is 156543.03 · cos φ / 2^z metres per pixel,
 * so this solves for the zoom whose tile spans at least the building and then
 * takes the next level down for detail.
 */
export function pickOrthoZoom(spanMeters: number, lat: number): number {
  const span = Number.isFinite(spanMeters) && spanMeters > 0 ? spanMeters : 50;
  const clampedLat = Math.max(-85, Math.min(85, Number.isFinite(lat) ? lat : 0));
  const metresPerPixelAtZ0 = (156543.03392 * Math.cos((clampedLat * Math.PI) / 180));
  // Aim for the building filling roughly one tile width.
  const target = Math.log2((metresPerPixelAtZ0 * TILE_PX) / span);
  const z = Math.round(target);
  return Math.max(MIN_ORTHO_ZOOM, Math.min(MAX_ORTHO_ZOOM, z));
}
