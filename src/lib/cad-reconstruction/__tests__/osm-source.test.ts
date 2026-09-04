import { describe, expect, it } from "vitest";

import { OSM_SOURCE_ID, osmOutlineRing, osmTagFacts } from "../osm-source";

describe("osmTagFacts — reads what OSM asserts, and no more", () => {
  it("reads storey counts, height, roof and name", () => {
    const facts = osmTagFacts({
      building: "yes",
      "building:levels": "6",
      "building:levels:underground": "2",
      height: "23.5",
      "roof:shape": "gabled",
      name: "서울특별시청",
      "building:material": "concrete",
    });

    expect(facts.storeysAbove).toBe(6);
    expect(facts.storeysBelow).toBe(2);
    expect(facts.heightM).toBeCloseTo(23.5, 2);
    expect(facts.roofForm).toBe("gable");
    expect(facts.name).toBe("서울특별시청");
    expect(facts.material).toBe("concrete");
  });

  it("accepts a height written with its unit", () => {
    expect(osmTagFacts({ height: "12 m" }).heightM).toBeCloseTo(12, 3);
    expect(osmTagFacts({ height: "12m" }).heightM).toBeCloseTo(12, 3);
  });

  it("prefers a Korean name when one is tagged", () => {
    expect(osmTagFacts({ name: "Seoul City Hall", "name:ko": "서울시청" }).name).toBe(
      "서울시청",
    );
  });

  it("maps roof shapes onto the vocabulary the reconstruction already speaks", () => {
    expect(osmTagFacts({ "roof:shape": "flat" }).roofForm).toBe("flat");
    expect(osmTagFacts({ "roof:shape": "hipped" }).roofForm).toBe("hip");
    expect(osmTagFacts({ "roof:shape": "skillion" }).roofForm).toBe("sloped");
    expect(osmTagFacts({ "roof:shape": "onion" }).roofForm).toBeNull();
  });

  it("returns nulls rather than guesses for an untagged building", () => {
    expect(osmTagFacts({ building: "yes" })).toEqual({
      storeysAbove: null,
      storeysBelow: null,
      heightM: null,
      roofForm: null,
      name: null,
      material: null,
    });
  });

  it("rejects junk instead of coercing it to a number", () => {
    const facts = osmTagFacts({
      "building:levels": "many",
      height: "tall",
      "building:levels:underground": "-3",
    });
    expect(facts.storeysAbove).toBeNull();
    expect(facts.heightM).toBeNull();
    expect(facts.storeysBelow).toBeNull();
  });

  it("treats a zero level count as absent, not as a real zero", () => {
    expect(osmTagFacts({ "building:levels": "0" }).storeysAbove).toBeNull();
  });

  it("reads a fractional storey count as absent — half a floor is a tagging error", () => {
    expect(osmTagFacts({ "building:levels": "3.5" }).storeysAbove).toBeNull();
  });
});

describe("osmOutlineRing", () => {
  const square = [
    [
      [126.9778, 37.5664],
      [126.979, 37.5664],
      [126.979, 37.5669],
      [126.9778, 37.5669],
      [126.9778, 37.5664],
    ],
  ];

  it("returns the outer ring as GeoJSON-order coordinates", () => {
    const ring = osmOutlineRing({
      polygon: square,
      osmType: "way",
      osmId: 1,
      tags: {},
      error: null,
    });
    expect(ring).not.toBeNull();
    expect(ring![0]).toEqual([126.9778, 37.5664]);
  });

  it("is null when OSM had nothing, errored, or returned a degenerate ring", () => {
    const base = { osmType: "way" as const, osmId: 1, tags: {}, error: null };
    expect(osmOutlineRing({ ...base, polygon: null })).toBeNull();
    expect(osmOutlineRing({ ...base, polygon: square, error: "upstream" })).toBeNull();
    expect(
      osmOutlineRing({ ...base, polygon: [[[126.9, 37.5], [126.91, 37.5]]] }),
    ).toBeNull();
  });
});

describe("OSM is a named source, not an anonymous one", () => {
  it("exposes a stable source id for the evidence register", () => {
    expect(OSM_SOURCE_ID).toBe("SRC-OSM-BLDG");
  });
});
