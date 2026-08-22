import { describe, expect, it } from "vitest";

import {
  areSpacesAdjacent,
  calculateZoneVolume,
  mapPointOpeningToHost,
  orientedEdges,
  polygonArea,
  validatePolygon,
} from "../geometry";

describe("energy-diagnostics geometry", () => {
  it("calculates rectangular and concave areas exactly", () => {
    expect(polygonArea([[0, 0], [10, 0], [10, 8], [0, 8]])).toBe(80);
    expect(
      polygonArea([[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]]),
    ).toBe(300);
  });

  it("assigns clockwise-from-north azimuths to a CCW footprint", () => {
    const edges = orientedEdges([[0, 0], [10, 0], [10, 8], [0, 8]]);
    expect(edges.map((edge) => [edge.orientation, edge.outwardAzimuthDeg])).toEqual([
      ["south", 180],
      ["east", 90],
      ["north", 0],
      ["west", 270],
    ]);
  });

  it("detects shared interior boundaries and does not treat a corner touch as adjacency", () => {
    expect(
      areSpacesAdjacent(
        [[0, 0], [5, 0], [5, 5], [0, 5]],
        [[5, 0], [10, 0], [10, 5], [5, 5]],
      ),
    ).toBe(true);
    expect(
      areSpacesAdjacent(
        [[0, 0], [5, 0], [5, 5], [0, 5]],
        [[5, 5], [10, 5], [10, 10], [5, 10]],
      ),
    ).toBe(false);
  });

  it("flags self-intersecting polygons before engine mapping", () => {
    expect(validatePolygon([[0, 0], [10, 10], [0, 10], [10, 0]]).map((item) => item.code)).toContain(
      "self_intersection",
    );
  });

  it("maps an opening point only to a nearby host wall", () => {
    const hosts = [
      { id: "south-wall", start: [0, 0] as const, end: [10, 0] as const },
      { id: "north-wall", start: [0, 8] as const, end: [10, 8] as const },
    ];
    expect(mapPointOpeningToHost([4, 0.01], hosts, 0.05)).toBe("south-wall");
    expect(mapPointOpeningToHost([4, 4], hosts, 0.05)).toBeNull();
  });

  it("calculates zone volume and rejects impossible excluded volumes", () => {
    expect(calculateZoneVolume(80, 3)).toBe(240);
    expect(() => calculateZoneVolume(80, 3, 240)).toThrow(/smaller/);
  });
});
