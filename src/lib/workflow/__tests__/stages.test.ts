import { describe, it, expect } from "vitest";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_GUARDS,
} from "../stages";

describe("STAGE_ORDER", () => {
  it("has exactly 4 elements", () => {
    expect(STAGE_ORDER).toHaveLength(4);
  });

  it("contains the 4 expected stages in order", () => {
    expect(STAGE_ORDER).toEqual(["search", "upload", "twin", "report"]);
  });
});

describe("STAGE_LABELS", () => {
  it("maps each stage to an object with ko and en string keys", () => {
    for (const stage of STAGE_ORDER) {
      expect(STAGE_LABELS[stage]).toBeDefined();
      expect(typeof STAGE_LABELS[stage].ko).toBe("string");
      expect(typeof STAGE_LABELS[stage].en).toBe("string");
    }
  });

  it('STAGE_LABELS["search"].ko === "건물 검색"', () => {
    expect(STAGE_LABELS["search"].ko).toBe("건물 검색");
  });

  it('STAGE_LABELS["search"].en === "Search"', () => {
    expect(STAGE_LABELS["search"].en).toBe("Search");
  });

  it('STAGE_LABELS["upload"].ko === "도면 업로드"', () => {
    expect(STAGE_LABELS["upload"].ko).toBe("도면 업로드");
  });

  it('STAGE_LABELS["upload"].en === "Upload CAD"', () => {
    expect(STAGE_LABELS["upload"].en).toBe("Upload CAD");
  });

  it('STAGE_LABELS["twin"].en === "Twin"', () => {
    expect(STAGE_LABELS["twin"].en).toBe("Twin");
  });

  it('STAGE_LABELS["report"].en === "Report"', () => {
    expect(STAGE_LABELS["report"].en).toBe("Report");
  });
});

describe("STAGE_GUARDS", () => {
  it('STAGE_GUARDS["search"] is a function returning true', () => {
    expect(typeof STAGE_GUARDS["search"]).toBe("function");
    expect(STAGE_GUARDS["search"]!()).toBe(true);
  });

  it('STAGE_GUARDS["upload"] returns false without a footprintPolygon', () => {
    expect(typeof STAGE_GUARDS["upload"]).toBe("function");
    expect(STAGE_GUARDS["upload"]!()).toBe(false);
    expect(STAGE_GUARDS["upload"]!({})).toBe(false);
    expect(STAGE_GUARDS["upload"]!({ footprintPolygon: [] })).toBe(false);
  });

  it('STAGE_GUARDS["upload"] returns true when a polygon with >=3 vertices is supplied', () => {
    const polygon: [number, number][][] = [[
      [-5, -5],
      [ 5, -5],
      [ 5,  5],
      [-5,  5],
    ]];
    expect(STAGE_GUARDS["upload"]!({ footprintPolygon: polygon })).toBe(true);
  });

  it('STAGE_GUARDS["upload"] returns false for a degenerate polygon with <3 vertices', () => {
    const polygon: [number, number][][] = [[[0, 0], [1, 1]]];
    expect(STAGE_GUARDS["upload"]!({ footprintPolygon: polygon })).toBe(false);
  });

  it('STAGE_GUARDS["twin"] is a function returning true', () => {
    expect(typeof STAGE_GUARDS["twin"]).toBe("function");
    expect(STAGE_GUARDS["twin"]!()).toBe(true);
  });

  it('STAGE_GUARDS["report"] is undefined (terminal stage)', () => {
    expect(STAGE_GUARDS["report"]).toBeUndefined();
  });
});
