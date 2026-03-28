import { describe, it, expect } from "vitest";
import type { WallSegment } from "@/store/plan-store";
import {
  buildWallGraph,
  detectRooms,
  polygonArea,
  polygonCentroid,
  projectOntoWall,
} from "./room-detector";

// Helper to build a WallSegment
function wall(
  id: string,
  sx: number,
  sz: number,
  ex: number,
  ez: number
): WallSegment {
  return { id, start: [sx, sz], end: [ex, ez], thickness: 0.2, height: 3.0, floor: 0 };
}

// 4 walls forming a 5x5m closed rectangle
const rectWalls: WallSegment[] = [
  wall("w1", 0, 0, 5, 0),
  wall("w2", 5, 0, 5, 5),
  wall("w3", 5, 5, 0, 5),
  wall("w4", 0, 5, 0, 0),
];

// 3 walls forming open L-shape (no enclosure)
const lShapeWalls: WallSegment[] = [
  wall("l1", 0, 0, 5, 0),
  wall("l2", 5, 0, 5, 5),
  wall("l3", 0, 5, 0, 0),
];

// 6 walls forming two adjacent 5x5 rooms sharing one wall
const twoRoomWalls: WallSegment[] = [
  // Room 1: (0,0)-(5,0)-(5,5)-(0,5)
  wall("r1w1", 0, 0, 5, 0),
  wall("r1w2", 5, 0, 5, 5),
  wall("r1w3", 5, 5, 0, 5),
  wall("r1w4", 0, 5, 0, 0),
  // Room 2: (5,0)-(10,0)-(10,5)-(5,5) — shares wall at x=5
  wall("r2w1", 5, 0, 10, 0),
  wall("r2w2", 10, 0, 10, 5),
  wall("r2w3", 10, 5, 5, 5),
  // r1w2 is the shared wall (5,0)-(5,5)
];

describe("buildWallGraph", () => {
  it("rectangle: 4 walls → 4 vertices and 4 edges per vertex (bidirectional)", () => {
    const graph = buildWallGraph(rectWalls);
    expect(graph.vertices.size).toBe(4);
    // Each vertex connects to exactly 2 neighbors in a rectangle
    for (const [, neighbors] of graph.adjacency) {
      expect(neighbors.length).toBe(2);
    }
  });

  it("merges endpoints within 0.05m to the same vertex key", () => {
    // Walls with slightly off endpoints that should snap together
    const nearWalls: WallSegment[] = [
      wall("n1", 0, 0, 5.03, 0),     // endpoint at 5.03
      wall("n2", 5.01, 0, 5.01, 5),  // start at 5.01 (within 0.05)
      wall("n3", 5.01, 5, 0, 5),
      wall("n4", 0, 5, 0, 0),
    ];
    const graph = buildWallGraph(nearWalls);
    // Despite slight offsets, should merge to 4 vertices (not 5+)
    expect(graph.vertices.size).toBe(4);
  });

  it("3 open walls (L-shape): has vertices but adjacency is not fully cyclic", () => {
    const graph = buildWallGraph(lShapeWalls);
    // 4 distinct endpoints (not all the same)
    expect(graph.vertices.size).toBeGreaterThanOrEqual(3);
    // Some vertices only have 1 neighbor (open ends)
    const openEnds = Array.from(graph.adjacency.values()).filter((n) => n.length === 1);
    expect(openEnds.length).toBeGreaterThan(0);
  });
});

describe("polygonArea", () => {
  it("rectangle (0,0)-(5,0)-(5,5)-(0,5) → area = 25", () => {
    const pts: [number, number][] = [[0, 0], [5, 0], [5, 5], [0, 5]];
    expect(polygonArea(pts)).toBeCloseTo(25, 3);
  });

  it("unit square → area = 1", () => {
    const pts: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(polygonArea(pts)).toBeCloseTo(1, 3);
  });

  it("triangle → area = 0.5 * base * height", () => {
    const pts: [number, number][] = [[0, 0], [4, 0], [0, 3]];
    expect(polygonArea(pts)).toBeCloseTo(6, 3);
  });
});

describe("polygonCentroid", () => {
  it("rectangle (0,0)-(5,0)-(5,5)-(0,5) → centroid = [2.5, 2.5]", () => {
    const pts: [number, number][] = [[0, 0], [5, 0], [5, 5], [0, 5]];
    const c = polygonCentroid(pts);
    expect(c[0]).toBeCloseTo(2.5, 3);
    expect(c[1]).toBeCloseTo(2.5, 3);
  });

  it("unit square → centroid = [0.5, 0.5]", () => {
    const pts: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const c = polygonCentroid(pts);
    expect(c[0]).toBeCloseTo(0.5, 3);
    expect(c[1]).toBeCloseTo(0.5, 3);
  });
});

describe("projectOntoWall", () => {
  it("point (2.5, 1) onto wall (0,0)-(5,0) → t=0.5, dist=1.0", () => {
    const result = projectOntoWall(2.5, 1, 0, 0, 5, 0);
    expect(result.t).toBeCloseTo(0.5, 3);
    expect(result.dist).toBeCloseTo(1.0, 3);
    expect(result.wx).toBeCloseTo(2.5, 3);
    expect(result.wz).toBeCloseTo(0, 3);
  });

  it("point (-1, 0) onto wall (0,0)-(5,0) → t=0 (clamped), dist=1.0", () => {
    const result = projectOntoWall(-1, 0, 0, 0, 5, 0);
    expect(result.t).toBeCloseTo(0, 3);
    expect(result.dist).toBeCloseTo(1.0, 3);
    expect(result.wx).toBeCloseTo(0, 3);
    expect(result.wz).toBeCloseTo(0, 3);
  });

  it("point (6, 0) onto wall (0,0)-(5,0) → t=1 (clamped)", () => {
    const result = projectOntoWall(6, 0, 0, 0, 5, 0);
    expect(result.t).toBeCloseTo(1, 3);
  });

  it("point (2.5, 0) exactly on wall → dist = 0", () => {
    const result = projectOntoWall(2.5, 0, 0, 0, 5, 0);
    expect(result.dist).toBeCloseTo(0, 3);
  });
});

describe("detectRooms", () => {
  it("4-wall rectangle → returns exactly 1 room", () => {
    const graph = buildWallGraph(rectWalls);
    const rooms = detectRooms(graph);
    expect(rooms).toHaveLength(1);
  });

  it("4-wall rectangle room has area ~25 m²", () => {
    const graph = buildWallGraph(rectWalls);
    const rooms = detectRooms(graph);
    expect(rooms[0].area).toBeCloseTo(25, 0);
  });

  it("3 open walls (L-shape) → returns 0 rooms", () => {
    const graph = buildWallGraph(lShapeWalls);
    const rooms = detectRooms(graph);
    expect(rooms).toHaveLength(0);
  });

  it("two adjacent rooms → returns 2 rooms", () => {
    const graph = buildWallGraph(twoRoomWalls);
    const rooms = detectRooms(graph);
    expect(rooms).toHaveLength(2);
  });

  it("outer face (clockwise winding) is excluded from results", () => {
    const graph = buildWallGraph(rectWalls);
    const rooms = detectRooms(graph);
    // All returned rooms should have counter-clockwise (positive signed area)
    for (const room of rooms) {
      expect(room.area).toBeGreaterThan(0);
    }
  });
});
