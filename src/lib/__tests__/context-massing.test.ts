// src/lib/__tests__/context-massing.test.ts
// P2-26 — unit tests for the pure context-massing module:
//   - resolveNeighborHeight: measured height / floors fallback / default constant
//   - point-in-polygon exclusion of subject building
//   - toLocalNeighbors: projection output shape

import { describe, it, expect } from "vitest";
import {
  resolveNeighborHeight,
  toLocalNeighbors,
  ESTIMATED_FLOOR_HEIGHT_M,
  DEFAULT_NEIGHBOR_HEIGHT_M,
} from "@/lib/context-massing";

// ---------------------------------------------------------------------------
// resolveNeighborHeight
// ---------------------------------------------------------------------------

describe("resolveNeighborHeight", () => {
  it("returns the measured height when it is a positive finite number", () => {
    expect(resolveNeighborHeight(15.6, null)).toBe(15.6);
    expect(resolveNeighborHeight(15.6, 4)).toBe(15.6);
  });

  it("falls back to groundFloors * ESTIMATED_FLOOR_HEIGHT_M when height is null", () => {
    expect(resolveNeighborHeight(null, 3)).toBe(3 * ESTIMATED_FLOOR_HEIGHT_M);
    expect(resolveNeighborHeight(null, 1)).toBe(ESTIMATED_FLOOR_HEIGHT_M);
  });

  it("uses DEFAULT_NEIGHBOR_HEIGHT_M when both height and groundFloors are null", () => {
    expect(resolveNeighborHeight(null, null)).toBe(DEFAULT_NEIGHBOR_HEIGHT_M);
  });

  it("exports ESTIMATED_FLOOR_HEIGHT_M = 3.3", () => {
    expect(ESTIMATED_FLOOR_HEIGHT_M).toBe(3.3);
  });

  it("exports DEFAULT_NEIGHBOR_HEIGHT_M = 6", () => {
    expect(DEFAULT_NEIGHBOR_HEIGHT_M).toBe(6);
  });

  it("treats zero groundFloors as unavailable → falls back to default", () => {
    // 0 floors is semantically unavailable (same as null)
    expect(resolveNeighborHeight(null, 0)).toBe(DEFAULT_NEIGHBOR_HEIGHT_M);
  });
});

// ---------------------------------------------------------------------------
// Point-in-polygon helper (indirectly via toLocalNeighbors exclusion)
// ---------------------------------------------------------------------------

// Subject building outer ring: a 0.01° × 0.01° square centered around 127, 37.
// Neighbors whose centroid falls inside are the subject itself — must be excluded.
const SUBJECT_OUTER_RING: [number, number][] = [
  [126.99, 36.99],
  [127.01, 36.99],
  [127.01, 37.01],
  [126.99, 37.01],
];

describe("toLocalNeighbors — subject building exclusion", () => {
  it("excludes a neighbor whose centroid is inside the subject outer ring", () => {
    const neighbors = [
      {
        pnu: "inside",
        // Outer ring centroid at [127.0, 37.0] — inside the subject square
        polygon: [[[127.0, 37.0], [127.001, 37.0], [127.001, 37.001], [127.0, 37.001]]],
        height: 10,
        groundFloors: 3,
      },
    ];

    const result = toLocalNeighbors(neighbors, 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result).toHaveLength(0);
  });

  it("keeps a neighbor whose centroid is outside the subject outer ring", () => {
    const neighbors = [
      {
        pnu: "outside",
        // Outer ring centroid clearly outside the subject
        polygon: [[[127.05, 37.05], [127.06, 37.05], [127.06, 37.06], [127.05, 37.06]]],
        height: 8,
        groundFloors: null,
      },
    ];

    const result = toLocalNeighbors(neighbors, 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result).toHaveLength(1);
  });

  it("handles a mix: excludes inside, keeps outside", () => {
    const neighbors = [
      {
        pnu: "inside",
        polygon: [[[127.0, 37.0], [127.001, 37.0], [127.001, 37.001], [127.0, 37.001]]],
        height: null,
        groundFloors: 2,
      },
      {
        pnu: "outside",
        polygon: [[[127.05, 37.05], [127.06, 37.05], [127.06, 37.06], [127.05, 37.06]]],
        height: 15,
        groundFloors: 4,
      },
    ];

    const result = toLocalNeighbors(neighbors, 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result).toHaveLength(1);
    // The kept neighbor used the measured height
    expect(result[0].height).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// toLocalNeighbors — projection output shape
// ---------------------------------------------------------------------------

describe("toLocalNeighbors — projection output shape", () => {
  it("returns array of { points: [number,number][], height: number }", () => {
    const neighbors = [
      {
        pnu: "n1",
        polygon: [[[127.05, 37.05], [127.06, 37.05], [127.06, 37.06], [127.05, 37.06]]],
        height: 20,
        groundFloors: 6,
      },
    ];

    const result = toLocalNeighbors(neighbors, 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result).toHaveLength(1);

    const item = result[0];
    expect(typeof item.height).toBe("number");
    expect(item.height).toBeGreaterThan(0);
    expect(Array.isArray(item.points)).toBe(true);
    expect(item.points.length).toBeGreaterThanOrEqual(3);
    // Each point is [number, number]
    for (const pt of item.points) {
      expect(pt).toHaveLength(2);
      expect(typeof pt[0]).toBe("number");
      expect(typeof pt[1]).toBe("number");
    }
  });

  it("projected points are in meters (reasonable scale for ~5km offset)", () => {
    // A ring centered ~5km east of the origin should have x ≈ 5000m
    const neighbors = [
      {
        pnu: "n1",
        polygon: [
          [
            [127.045, 37.0],
            [127.055, 37.0],
            [127.055, 37.01],
            [127.045, 37.01],
          ],
        ],
        height: 10,
        groundFloors: null,
      },
    ];

    const result = toLocalNeighbors(neighbors, 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result).toHaveLength(1);

    const xs = result[0].points.map((p) => p[0]);
    const minX = Math.min(...xs);
    // ~0.045° lng offset ≈ ~4000m east; check it's in the right ballpark (>1000m, <10000m)
    expect(minX).toBeGreaterThan(1000);
    expect(minX).toBeLessThan(10000);
  });

  it("uses DEFAULT_NEIGHBOR_HEIGHT_M when height and groundFloors are both null", () => {
    const neighbors = [
      {
        pnu: "n1",
        polygon: [[[127.05, 37.05], [127.06, 37.05], [127.06, 37.06], [127.05, 37.06]]],
        height: null,
        groundFloors: null,
      },
    ];

    const result = toLocalNeighbors(neighbors, 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result[0].height).toBe(DEFAULT_NEIGHBOR_HEIGHT_M);
  });

  it("returns empty array when all neighbors are excluded", () => {
    const neighbors = [
      {
        pnu: "inside",
        polygon: [[[127.0, 37.0], [127.001, 37.0], [127.001, 37.001], [127.0, 37.001]]],
        height: 10,
        groundFloors: 3,
      },
    ];
    const result = toLocalNeighbors(neighbors, 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    const result = toLocalNeighbors([], 127.0, 37.0, SUBJECT_OUTER_RING);
    expect(result).toHaveLength(0);
  });
});
