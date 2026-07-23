import { describe, it, expect } from "vitest";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_GUARDS,
  getStageOrder,
  getBlockingStage,
  getStageLockReason,
} from "../stages";
import type { CadDraftParams } from "../cad-draft";

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

  it('STAGE_GUARDS["upload"] returns true when the user explicitly skipped CAD (P2-17)', () => {
    expect(STAGE_GUARDS["upload"]!({ cadSkipped: true })).toBe(true);
    // Skip wins even alongside a degenerate/absent footprint
    expect(STAGE_GUARDS["upload"]!({ cadSkipped: true, footprintPolygon: [] })).toBe(true);
  });

  it('STAGE_GUARDS["upload"] ignores a falsy cadSkipped', () => {
    expect(STAGE_GUARDS["upload"]!({ cadSkipped: false })).toBe(false);
  });

  it('STAGE_GUARDS["twin"] is a function returning true', () => {
    expect(typeof STAGE_GUARDS["twin"]).toBe("function");
    expect(STAGE_GUARDS["twin"]!()).toBe(true);
  });

  it('STAGE_GUARDS["report"] is undefined (terminal stage)', () => {
    expect(STAGE_GUARDS["report"]).toBeUndefined();
  });
});

// ─── P2-24 — CAD-first standalone mode ───────────────────────────────────────

const VALID_POLYGON: [number, number][][] = [[
  [-5, -5],
  [ 5, -5],
  [ 5,  5],
  [-5,  5],
]];

const VALID_PARAMS: CadDraftParams = { floors: 6, year: 1995, sigunguCd: "11680" };

describe("getStageOrder (P2-24)", () => {
  it("defaults to the ledger order (identical to STAGE_ORDER)", () => {
    expect(getStageOrder()).toEqual(STAGE_ORDER);
    expect(getStageOrder("ledger")).toEqual(["search", "upload", "twin", "report"]);
  });

  it("cad-first order is upload → params → twin → report", () => {
    expect(getStageOrder("cad-first")).toEqual(["upload", "params", "twin", "report"]);
  });
});

describe("STAGE_GUARDS in cad-first mode (P2-24)", () => {
  it("upload guard ignores cadSkipped — CAD is mandatory in cad-first", () => {
    expect(STAGE_GUARDS["upload"]!({ mode: "cad-first", cadSkipped: true })).toBe(false);
    expect(
      STAGE_GUARDS["upload"]!({ mode: "cad-first", footprintPolygon: VALID_POLYGON })
    ).toBe(true);
  });

  it("ledger mode still honors cadSkipped (P2-17 regression)", () => {
    expect(STAGE_GUARDS["upload"]!({ mode: "ledger", cadSkipped: true })).toBe(true);
  });

  it("params guard passes only with valid cadParams", () => {
    expect(typeof STAGE_GUARDS["params"]).toBe("function");
    expect(STAGE_GUARDS["params"]!({})).toBe(false);
    expect(STAGE_GUARDS["params"]!({ cadParams: VALID_PARAMS })).toBe(true);
    expect(
      STAGE_GUARDS["params"]!({ cadParams: { ...VALID_PARAMS, floors: 0 } })
    ).toBe(false);
    expect(
      STAGE_GUARDS["params"]!({ cadParams: { ...VALID_PARAMS, sigunguCd: "" } })
    ).toBe(false);
  });

  it("STAGE_LABELS covers the params stage", () => {
    expect(STAGE_LABELS["params"].ko).toBe("정보 입력");
    expect(typeof STAGE_LABELS["params"].en).toBe("string");
  });
});

describe("getBlockingStage in cad-first mode (P2-24)", () => {
  it("upload → twin is blocked at upload without a footprint", () => {
    expect(getBlockingStage("upload", "twin", { mode: "cad-first" })).toBe("upload");
  });

  it("upload → twin is blocked at params with a footprint but no params", () => {
    expect(
      getBlockingStage("upload", "twin", {
        mode: "cad-first",
        footprintPolygon: VALID_POLYGON,
      })
    ).toBe("params");
  });

  it("upload → report passes with footprint + valid params", () => {
    expect(
      getBlockingStage("upload", "report", {
        mode: "cad-first",
        footprintPolygon: VALID_POLYGON,
        cadParams: VALID_PARAMS,
      })
    ).toBeNull();
  });

  it("backward moves are never blocked", () => {
    expect(getBlockingStage("twin", "upload", { mode: "cad-first" })).toBeNull();
  });
});

describe("getStageLockReason (P2-24)", () => {
  it("cad-first upload reason never mentions the skip path", () => {
    const reason = getStageLockReason("upload", "cad-first");
    expect(reason).toBeDefined();
    expect(reason!.ko).not.toContain("CAD 없이");
    expect(reason!.en.toLowerCase()).not.toContain("without cad");
  });

  it("ledger upload reason still mentions both paths (P2-17 regression)", () => {
    const reason = getStageLockReason("upload", "ledger");
    expect(reason!.ko).toContain("CAD 없이 계속");
  });

  it("params stage has a lock reason", () => {
    expect(getStageLockReason("params", "cad-first")).toBeDefined();
  });
});
