import { describe, expect, it } from "vitest";

import {
  estimateIoU,
  reconcileOutlines,
  type OutlineCandidate,
} from "../outline-candidates";
import type { RingMm } from "../types";

function rect(x: number, y: number, w: number, h: number): RingMm {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function candidate(over: Partial<OutlineCandidate> & Pick<OutlineCandidate, "id">): OutlineCandidate {
  return {
    origin: "gis_building",
    sourceId: "SRC-GIS-BLDG",
    labelKo: "GIS 건물 외곽",
    ring: rect(0, 0, 20000, 10000),
    areaSqm: 200,
    grade: "B-OBSERVED",
    observed: true,
    siteOnly: false,
    method: "test",
    ...over,
  };
}

describe("estimateIoU", () => {
  it("is 1 for a ring against itself", () => {
    expect(estimateIoU(rect(0, 0, 10000, 10000), rect(0, 0, 10000, 10000))).toBeCloseTo(1, 2);
  });

  it("is 0 for disjoint rings", () => {
    expect(estimateIoU(rect(0, 0, 10000, 10000), rect(50000, 0, 10000, 10000))).toBe(0);
  });

  it("is about a third for two squares overlapping by half", () => {
    expect(estimateIoU(rect(0, 0, 10000, 10000), rect(5000, 0, 10000, 10000))).toBeCloseTo(
      1 / 3,
      1,
    );
  });

  it("is symmetric", () => {
    const a = rect(0, 0, 12000, 8000);
    const b = rect(3000, 1000, 12000, 8000);
    expect(estimateIoU(a, b)).toBeCloseTo(estimateIoU(b, a), 3);
  });
});

describe("reconcileOutlines — authority", () => {
  it("returns nothing when there is no candidate at all", () => {
    const result = reconcileOutlines([], {});
    expect(result.chosen).toBeNull();
    expect(result.conflicts).toEqual([]);
  });

  it("prefers an observed outline over a rectangle solved from area", () => {
    const observed = candidate({ id: "OUT-GIS" });
    const solved = candidate({
      id: "OUT-AREA",
      origin: "register_area",
      sourceId: "SRC-REG-TITLE",
      grade: "D-INFERRED",
      observed: false,
      ring: rect(0, 0, 18000, 11000),
      areaSqm: 198,
    });

    expect(reconcileOutlines([solved, observed], {}).chosen?.id).toBe("OUT-GIS");
  });

  it("NEVER adopts a parcel boundary as the building footprint", () => {
    // The regression that motivated this module: a 7,060 m² lot was being
    // reported as the building at B-OBSERVED because it was the only ring.
    const parcel = candidate({
      id: "OUT-PARCEL",
      origin: "gis_parcel",
      sourceId: "SRC-GIS-PARCEL",
      siteOnly: true,
      ring: rect(-20000, -20000, 100000, 70000),
      areaSqm: 7000,
    });
    const solved = candidate({
      id: "OUT-AREA",
      origin: "register_area",
      sourceId: "SRC-REG-TITLE",
      grade: "D-INFERRED",
      observed: false,
      areaSqm: 400,
      ring: rect(0, 0, 25000, 16000),
    });

    const result = reconcileOutlines([parcel, solved], { registeredFootprintSqm: 400 });
    expect(result.chosen?.id).toBe("OUT-AREA");
    expect(result.chosen?.siteOnly).toBe(false);
  });

  it("falls back to the solved rectangle when a parcel is the only ring", () => {
    const parcel = candidate({
      id: "OUT-PARCEL",
      origin: "gis_parcel",
      siteOnly: true,
      areaSqm: 7000,
      ring: rect(-20000, -20000, 100000, 70000),
    });
    expect(reconcileOutlines([parcel], {}).chosen).toBeNull();
  });
});

describe("reconcileOutlines — two observed sources", () => {
  const gis = candidate({ id: "OUT-GIS", ring: rect(0, 0, 20000, 10000), areaSqm: 200 });
  const osmAgreeing = candidate({
    id: "OUT-OSM",
    origin: "osm_building",
    sourceId: "SRC-OSM-BLDG",
    labelKo: "OpenStreetMap 건물 외곽",
    ring: rect(300, 200, 19600, 9700),
    areaSqm: 190.1,
  });
  const osmDisagreeing = candidate({
    id: "OUT-OSM",
    origin: "osm_building",
    sourceId: "SRC-OSM-BLDG",
    labelKo: "OpenStreetMap 건물 외곽",
    ring: rect(0, 0, 40000, 18000),
    areaSqm: 720,
  });

  it("records agreement and raises no conflict when the two outlines match", () => {
    const result = reconcileOutlines([gis, osmAgreeing], {});
    expect(result.conflicts).toEqual([]);
    expect(result.agreements).toHaveLength(1);
    expect(result.agreements[0].agrees).toBe(true);
    expect(result.agreements[0].iou).toBeGreaterThan(0.9);
  });

  it("raises a conflict when two observed outlines disagree, and keeps both", () => {
    const result = reconcileOutlines([gis, osmDisagreeing], {});
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolutionStatus).toBe("unresolved");
    // The rejected ring must survive into the conflict so it can be drawn on
    // X-CONFLICT rather than silently discarded.
    expect(result.conflicts[0].geometry).toBeDefined();
    expect(result.considered).toHaveLength(2);
  });

  it("breaks the tie with the register's own 건축면적", () => {
    const result = reconcileOutlines([gis, osmDisagreeing], {
      registeredFootprintSqm: 205,
    });
    expect(result.chosen?.id).toBe("OUT-GIS");

    const flipped = reconcileOutlines([gis, osmDisagreeing], {
      registeredFootprintSqm: 700,
    });
    expect(flipped.chosen?.id).toBe("OUT-OSM");
  });

  it("says in the rationale which source won and why", () => {
    const result = reconcileOutlines([gis, osmDisagreeing], {
      registeredFootprintSqm: 205,
    });
    expect(result.rationale).toContain("GIS");
    expect(result.rationale.length).toBeGreaterThan(20);
  });

  it("is deterministic regardless of input order", () => {
    const a = reconcileOutlines([gis, osmDisagreeing], { registeredFootprintSqm: 205 });
    const b = reconcileOutlines([osmDisagreeing, gis], { registeredFootprintSqm: 205 });
    expect(a.chosen?.id).toBe(b.chosen?.id);
    expect(a.conflicts).toHaveLength(b.conflicts.length);
  });
});
