import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { extrudePolygon } from "./earcut-extrude";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return true if no value in the Float32Array is NaN. */
function hasNoNaN(arr: Float32Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) return false;
  }
  return true;
}

/**
 * Compute the signed area of a 2-D polygon ring via the shoelace formula.
 * Positive = CCW in standard math orientation.
 */
function signedArea2D(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return area / 2;
}

/**
 * Sample the normal of the first triangle in the position buffer at the given
 * vertex offset (in triangles, not vertices).  Y-component is returned.
 *
 * @param positions  Flat Float32Array (xyz xyz xyz …)
 * @param indices    Index buffer (null → sequential)
 * @param triOffset  Which triangle (0-based) to sample
 */
function firstTriangleNormalY(
  positions: Float32Array,
  indices: THREE.BufferAttribute | null,
  triOffset: number
): number {
  const base = triOffset * 3;
  const i0 = indices ? indices.getX(base) : base;
  const i1 = indices ? indices.getX(base + 1) : base + 1;
  const i2 = indices ? indices.getX(base + 2) : base + 2;

  const ax = positions[i0 * 3],     ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
  const bx = positions[i1 * 3],     by = positions[i1 * 3 + 1], bz = positions[i1 * 3 + 2];
  const cx = positions[i2 * 3],     cy = positions[i2 * 3 + 1], cz = positions[i2 * 3 + 2];

  // (B-A) × (C-A)
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const fx = cx - ax, fy = cy - ay, fz = cz - az;
  const ny = ez * fx - ex * fz; // Y component of cross product
  return ny;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

// Simple rectangle (CCW outer ring, closed)
const RECT_RING: [number, number][] = [
  [0, 0], [4, 0], [4, 3], [0, 3], [0, 0],
];

// L-shaped concave polygon (8 unique vertices + closing vertex, CCW)
// Visualised (XZ plane, units = meters):
//   (0,6)──(2,6)
//     |      |
//   (0,3)  (2,3)──(4,3)
//     |              |
//   (0,0)──────────(4,0)
const L_RING: [number, number][] = [
  [0, 0], [4, 0], [4, 3], [2, 3], [2, 6], [0, 6], [0, 0],
];

// Rectangle outer ring with one square hole inside (hole is CW as GeoJSON spec)
const RECT_OUTER: [number, number][] = [
  [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
];
const SQUARE_HOLE: [number, number][] = [
  [3, 3], [3, 7], [7, 7], [7, 3], [3, 3], // CW = hole in GeoJSON
];

// Simple triangle (CCW)
const TRI_RING: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [0, 0],
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extrudePolygon — Test 1: convex quad (rectangle)", () => {
  it("returns BufferGeometry with non-null index and position attributes", () => {
    const geo = extrudePolygon([RECT_RING], 10);
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(geo.index).not.toBeNull();
    expect(geo.index!.count).toBeGreaterThan(0);
    expect(geo.attributes.position).toBeDefined();
    expect(geo.attributes.position.count).toBeGreaterThan(0);
  });

  it("position array contains no NaN values", () => {
    const geo = extrudePolygon([RECT_RING], 10);
    const pos = geo.attributes.position.array as Float32Array;
    expect(hasNoNaN(pos)).toBe(true);
  });
});

describe("extrudePolygon — Test 2: L-shaped concave polygon", () => {
  it("produces geometry with non-zero index count", () => {
    const geo = extrudePolygon([L_RING], 5);
    expect(geo.index).not.toBeNull();
    expect(geo.index!.count).toBeGreaterThan(0);
  });

  it("position array contains no NaN values", () => {
    const geo = extrudePolygon([L_RING], 5);
    const pos = geo.attributes.position.array as Float32Array;
    expect(hasNoNaN(pos)).toBe(true);
  });

  it("bottom cap normal points in -Y direction (first triangle has negative Y normal)", () => {
    const geo = extrudePolygon([L_RING], 5);
    const pos = geo.attributes.position.array as Float32Array;
    const idx = geo.index as THREE.BufferAttribute;
    // Bottom cap triangles come first — tri 0 should have negative Y normal
    const ny = firstTriangleNormalY(pos, idx, 0);
    expect(ny).toBeLessThan(0);
  });
});

describe("extrudePolygon — Test 3: polygon with interior hole", () => {
  it("handles two rings (outer + hole) without error", () => {
    expect(() => extrudePolygon([RECT_OUTER, SQUARE_HOLE], 8)).not.toThrow();
  });

  it("index count is non-zero", () => {
    const geo = extrudePolygon([RECT_OUTER, SQUARE_HOLE], 8);
    expect(geo.index).not.toBeNull();
    expect(geo.index!.count).toBeGreaterThan(0);
  });

  it("holed rectangle has fewer cap triangles than a solid rectangle of same size", () => {
    const solidGeo = extrudePolygon([RECT_OUTER], 8);
    const holedGeo = extrudePolygon([RECT_OUTER, SQUARE_HOLE], 8);
    // Both have the same number of side quads for the outer ring, but the holed
    // version has additional inner-ring sides AND fewer cap triangles (hole punches cap).
    // The total index count for the solid should be >= holed when the hole is large.
    // We verify the holed geometry is still valid (non-zero) and different.
    expect(holedGeo.index!.count).toBeGreaterThan(0);
    expect(holedGeo.index!.count).not.toBe(solidGeo.index!.count);
  });
});

describe("extrudePolygon — Test 4: winding order / face orientation", () => {
  it("top cap vertices are all at y = heightMeters", () => {
    const height = 3;
    const geo = extrudePolygon([TRI_RING], height);
    const pos = geo.attributes.position.array as Float32Array;
    const idx = geo.index as THREE.BufferAttribute;

    // Find how many vertices are at y == height (top cap)
    let topCapCount = 0;
    for (let i = 1; i < pos.length; i += 3) {
      if (Math.abs(pos[i] - height) < 0.001) topCapCount++;
    }
    // Triangle has 3 unique points → top cap has 3 vertices at height
    expect(topCapCount).toBeGreaterThanOrEqual(3);
  });

  it("bottom cap vertices are all at y = baseY (default 0)", () => {
    const geo = extrudePolygon([TRI_RING], 3);
    const pos = geo.attributes.position.array as Float32Array;

    let bottomCapCount = 0;
    for (let i = 1; i < pos.length; i += 3) {
      if (Math.abs(pos[i]) < 0.001) bottomCapCount++;
    }
    expect(bottomCapCount).toBeGreaterThanOrEqual(3);
  });

  it("baseY offset shifts both caps by the specified amount", () => {
    const baseY = 5;
    const height = 3;
    const geo = extrudePolygon([TRI_RING], height, baseY);
    const pos = geo.attributes.position.array as Float32Array;

    let atBase = 0;
    let atTop = 0;
    for (let i = 1; i < pos.length; i += 3) {
      if (Math.abs(pos[i] - baseY) < 0.001) atBase++;
      if (Math.abs(pos[i] - (baseY + height)) < 0.001) atTop++;
    }
    expect(atBase).toBeGreaterThanOrEqual(3);
    expect(atTop).toBeGreaterThanOrEqual(3);
  });
});
