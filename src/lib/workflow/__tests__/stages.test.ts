import { describe, it, expect } from "vitest";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_GUARDS,
} from "../stages";

describe("STAGE_ORDER", () => {
  it("has exactly 5 elements", () => {
    expect(STAGE_ORDER).toHaveLength(5);
  });

  it("contains the 5 expected stages in order", () => {
    expect(STAGE_ORDER).toEqual([
      "select",
      "assemble",
      "configure",
      "analyze",
      "export",
    ]);
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

  it('STAGE_LABELS["select"].ko === "건물 선택"', () => {
    expect(STAGE_LABELS["select"].ko).toBe("건물 선택");
  });

  it('STAGE_LABELS["select"].en === "Select Building"', () => {
    expect(STAGE_LABELS["select"].en).toBe("Select Building");
  });
});

describe("STAGE_GUARDS", () => {
  it('STAGE_GUARDS["select"] is a function returning true', () => {
    expect(typeof STAGE_GUARDS["select"]).toBe("function");
    expect(STAGE_GUARDS["select"]!()).toBe(true);
  });

  it('STAGE_GUARDS["assemble"] is a function returning true', () => {
    expect(typeof STAGE_GUARDS["assemble"]).toBe("function");
    expect(STAGE_GUARDS["assemble"]!()).toBe(true);
  });

  it('STAGE_GUARDS["configure"] is a function returning true', () => {
    expect(typeof STAGE_GUARDS["configure"]).toBe("function");
    expect(STAGE_GUARDS["configure"]!()).toBe(true);
  });

  it('STAGE_GUARDS["analyze"] is a function returning true', () => {
    expect(typeof STAGE_GUARDS["analyze"]).toBe("function");
    expect(STAGE_GUARDS["analyze"]!()).toBe(true);
  });

  it('STAGE_GUARDS["export"] is undefined (terminal stage)', () => {
    expect(STAGE_GUARDS["export"]).toBeUndefined();
  });
});
