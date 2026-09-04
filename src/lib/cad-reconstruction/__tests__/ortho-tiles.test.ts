import { describe, expect, it } from "vitest";

import {
  MAX_ORTHO_TILES,
  lngLatToTile,
  pickOrthoZoom,
  tileBounds,
  tilesCovering,
} from "../ortho-tiles";

/** Seoul City Hall, the building used for the live checks. */
const LNG = 126.9784;
const LAT = 37.5667;

describe("lngLatToTile", () => {
  it("puts the whole world in one tile at zoom 0", () => {
    const t = lngLatToTile(LNG, LAT, 0);
    expect(Math.floor(t.x)).toBe(0);
    expect(Math.floor(t.y)).toBe(0);
  });

  it("places the null island at the centre of the world at zoom 1", () => {
    const t = lngLatToTile(0, 0, 1);
    expect(t.x).toBeCloseTo(1, 6);
    expect(t.y).toBeCloseTo(1, 6);
  });

  it("nests each zoom inside its parent — the pyramid is consistent", () => {
    // Asserting a hand-computed tile index would just restate the formula.
    // Subdivision is an independent structural property: the tile containing a
    // point at z+1 must be one of the four children of the tile at z.
    for (let z = 12; z < 19; z++) {
      const parent = lngLatToTile(LNG, LAT, z);
      const child = lngLatToTile(LNG, LAT, z + 1);
      expect(Math.floor(child.x) >> 1).toBe(Math.floor(parent.x));
      expect(Math.floor(child.y) >> 1).toBe(Math.floor(parent.y));
    }
  });

  it("agrees with an independently computed Mercator y for Seoul", () => {
    // y from the closed form written the other way round (sinh⁻¹ of tan φ),
    // which is a different expression of the same projection.
    const z = 18;
    const phi = (LAT * Math.PI) / 180;
    const expectedY = ((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * 2 ** z;
    expect(lngLatToTile(LNG, LAT, z).y).toBeCloseTo(expectedY, 6);
  });

  it("returns fractional coordinates, so a caller can place a point in a tile", () => {
    const t = lngLatToTile(LNG, LAT, 18);
    expect(t.x % 1).toBeGreaterThan(0);
    expect(t.y % 1).toBeGreaterThan(0);
  });
});

describe("tileBounds", () => {
  it("round-trips: the tile a point falls in contains that point", () => {
    for (const z of [12, 16, 18, 19]) {
      const t = lngLatToTile(LNG, LAT, z);
      const b = tileBounds({ z, x: Math.floor(t.x), y: Math.floor(t.y) });
      expect(LNG).toBeGreaterThanOrEqual(b.west);
      expect(LNG).toBeLessThanOrEqual(b.east);
      expect(LAT).toBeGreaterThanOrEqual(b.south);
      expect(LAT).toBeLessThanOrEqual(b.north);
    }
  });

  it("covers the whole world at zoom 0", () => {
    const b = tileBounds({ z: 0, x: 0, y: 0 });
    expect(b.west).toBeCloseTo(-180, 6);
    expect(b.east).toBeCloseTo(180, 6);
    // Web Mercator clips at ±85.0511°.
    expect(b.north).toBeCloseTo(85.0511, 3);
    expect(b.south).toBeCloseTo(-85.0511, 3);
  });

  it("gives adjacent tiles a shared edge, with no gap and no overlap", () => {
    const a = tileBounds({ z: 18, x: 223966, y: 101718 });
    const right = tileBounds({ z: 18, x: 223967, y: 101718 });
    const below = tileBounds({ z: 18, x: 223966, y: 101719 });
    expect(a.east).toBeCloseTo(right.west, 12);
    expect(a.south).toBeCloseTo(below.north, 12);
  });
});

describe("tilesCovering", () => {
  const bbox = { west: 126.9778, south: 37.5664, east: 126.979, north: 37.5669 };

  it("returns every tile the box touches", () => {
    const tiles = tilesCovering(bbox, 18);
    expect(tiles.length).toBeGreaterThan(0);
    // Union of the returned tiles must contain all four corners.
    const covers = (lng: number, lat: number) =>
      tiles.some((t) => {
        const b = tileBounds(t);
        return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
      });
    expect(covers(bbox.west, bbox.south)).toBe(true);
    expect(covers(bbox.east, bbox.north)).toBe(true);
    expect(covers(bbox.west, bbox.north)).toBe(true);
    expect(covers(bbox.east, bbox.south)).toBe(true);
  });

  it("never asks for more tiles than the cap, whatever the box", () => {
    const world = { west: -180, south: -80, east: 180, north: 80 };
    expect(tilesCovering(world, 18).length).toBeLessThanOrEqual(MAX_ORTHO_TILES);
  });

  it("is empty for a degenerate or inverted box rather than looping", () => {
    expect(tilesCovering({ west: 10, south: 10, east: 5, north: 5 }, 18)).toEqual([]);
    expect(tilesCovering({ west: NaN, south: 0, east: 1, north: 1 }, 18)).toEqual([]);
  });

  it("is deterministic and free of duplicates", () => {
    const a = tilesCovering(bbox, 18);
    const b = tilesCovering(bbox, 18);
    expect(a).toEqual(b);
    expect(new Set(a.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(a.length);
  });
});

describe("pickOrthoZoom", () => {
  it("chooses a deeper zoom for a smaller building", () => {
    expect(pickOrthoZoom(20, LAT)).toBeGreaterThan(pickOrthoZoom(400, LAT));
  });

  it("stays inside the levels the imagery actually has", () => {
    for (const span of [5, 50, 500, 5000, 50000]) {
      const z = pickOrthoZoom(span, LAT);
      expect(z).toBeGreaterThanOrEqual(14);
      expect(z).toBeLessThanOrEqual(19);
      expect(Number.isInteger(z)).toBe(true);
    }
  });

  it("is total on a degenerate span", () => {
    expect(Number.isInteger(pickOrthoZoom(0, LAT))).toBe(true);
    expect(Number.isInteger(pickOrthoZoom(-1, LAT))).toBe(true);
    expect(Number.isInteger(pickOrthoZoom(NaN, LAT))).toBe(true);
  });
});
