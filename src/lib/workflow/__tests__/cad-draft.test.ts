// P2-24 — CAD-first standalone workflow: synthetic draft PK + minimal-params
// title synthesis. Pure module, no React/store dependencies.
import { describe, it, expect } from "vitest";
import {
  CAD_DRAFT_PREFIX,
  makeCadDraftPk,
  isCadDraftPk,
  getWorkflowMode,
  isCadDraftParamsValid,
  ringAreaSqm,
  cadDraftTitle,
  type CadDraftParams,
} from "../cad-draft";

const PARAMS: CadDraftParams = { floors: 6, year: 1995, sigunguCd: "11680" };

describe("cad draft PK", () => {
  it("makeCadDraftPk returns a prefixed, unique id", () => {
    const a = makeCadDraftPk();
    const b = makeCadDraftPk();
    expect(a.startsWith(CAD_DRAFT_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThan(CAD_DRAFT_PREFIX.length);
    expect(a).not.toBe(b);
  });

  it("isCadDraftPk detects draft PKs and rejects ledger PKs / empties", () => {
    expect(isCadDraftPk(makeCadDraftPk())).toBe(true);
    expect(isCadDraftPk("cad-123")).toBe(true);
    expect(isCadDraftPk("11680-10300-0-0001-0000")).toBe(false);
    expect(isCadDraftPk("")).toBe(false);
    expect(isCadDraftPk(null)).toBe(false);
    expect(isCadDraftPk(undefined)).toBe(false);
  });

  it("getWorkflowMode derives cad-first from the prefix, ledger otherwise", () => {
    expect(getWorkflowMode("cad-abc")).toBe("cad-first");
    expect(getWorkflowMode("SOME_LEDGER_PK")).toBe("ledger");
    expect(getWorkflowMode(null)).toBe("ledger");
    expect(getWorkflowMode("")).toBe("ledger");
  });
});

describe("isCadDraftParamsValid", () => {
  it("accepts the minimal valid params", () => {
    expect(isCadDraftParamsValid(PARAMS)).toBe(true);
  });

  it("rejects missing / invalid floors", () => {
    expect(isCadDraftParamsValid(undefined)).toBe(false);
    expect(isCadDraftParamsValid({ ...PARAMS, floors: 0 })).toBe(false);
    expect(isCadDraftParamsValid({ ...PARAMS, floors: -1 })).toBe(false);
    expect(isCadDraftParamsValid({ ...PARAMS, floors: 2.5 })).toBe(false);
  });

  it("rejects out-of-range years", () => {
    expect(isCadDraftParamsValid({ ...PARAMS, year: 0 })).toBe(false);
    expect(isCadDraftParamsValid({ ...PARAMS, year: 1799 })).toBe(false);
    expect(isCadDraftParamsValid({ ...PARAMS, year: 2201 })).toBe(false);
  });

  it("rejects an empty region", () => {
    expect(isCadDraftParamsValid({ ...PARAMS, sigunguCd: "" })).toBe(false);
  });
});

describe("ringAreaSqm", () => {
  it("computes the shoelace area of a rectangle regardless of winding", () => {
    const ccw: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]];
    const cw = [...ccw].reverse() as [number, number][];
    expect(ringAreaSqm(ccw)).toBeCloseTo(80, 5);
    expect(ringAreaSqm(cw)).toBeCloseTo(80, 5);
  });

  it("returns 0 for degenerate rings", () => {
    expect(ringAreaSqm([])).toBe(0);
    expect(ringAreaSqm([[0, 0], [1, 1]])).toBe(0);
  });
});

describe("cadDraftTitle", () => {
  const title = cadDraftTitle("cad-test", PARAMS, 300);

  it("carries the draft pk and user-entered facts", () => {
    expect(title.mgmBldrgstPk).toBe("cad-test");
    expect(title.grndFlrCnt).toBe(6);
    expect(title.pmsDay).toBe("19950101");
    expect(title.sigunguCd).toBe("11680");
  });

  it("derives areas from the CAD footprint (never fabricates)", () => {
    expect(title.archArea).toBe(300);
    // Gross floor area = footprint area × floors (the P2-24 report fallback)
    expect(title.totArea).toBe(1800);
  });

  it("leaves every unknown ledger field at its explicit unavailable value (AFF-6)", () => {
    expect(title.bldNm).toBe("");
    expect(title.platPlcNm).toBe("");
    expect(title.mainPurpsCd).toBe("");
    expect(title.strctCd).toBe("");
    expect(title.heit).toBe(0);
    expect(title.platArea).toBe(0);
    expect(title.bcRat).toBe(0);
    expect(title.ugrndFlrCnt).toBe(0);
  });
});
