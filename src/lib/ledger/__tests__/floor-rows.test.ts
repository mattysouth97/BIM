import { describe, expect, it } from "vitest";

import {
  ERA_FALLBACK,
  classifyEraExplicit,
  isBelowGradeRow,
  ledgerFloorHeightCategory,
  ledgerUseCategory,
  normalizeFloorRows,
} from "../floor-rows";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

function title(overrides: Partial<BrTitleInfo> = {}): BrTitleInfo {
  return { mgmBldrgstPk: "PK-1", ...overrides } as BrTitleInfo;
}

function floor(overrides: Partial<BrFloorInfo>): BrFloorInfo {
  return {
    mgmBldrgstPk: "PK-1",
    flrNo: 1,
    flrGbCd: "20",
    flrGbCdNm: "지상",
    area: 100,
    ...overrides,
  } as BrFloorInfo;
}

describe("normalizeFloorRows", () => {
  it("drops rows belonging to a different building register", () => {
    const rows = normalizeFloorRows(title(), [
      floor({ flrNo: 1 }),
      floor({ flrNo: 2, mgmBldrgstPk: "PK-OTHER" }),
    ]);

    expect(rows.map((row) => row.flrNo)).toEqual([1]);
  });

  it("keeps the largest-area row when one physical floor has several use rows", () => {
    const rows = normalizeFloorRows(title(), [
      floor({ flrNo: 3, area: 120, mainPurpsCdNm: "부속" }),
      floor({ flrNo: 3, area: 480, mainPurpsCdNm: "업무시설" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].area).toBe(480);
    expect(rows[0].mainPurpsCdNm).toBe("업무시설");
  });

  it("keeps 지하 and 지상 rows that share a floor number apart", () => {
    const rows = normalizeFloorRows(title(), [
      floor({ flrNo: 1, flrGbCd: "10", flrGbCdNm: "지하", area: 900 }),
      floor({ flrNo: 1, flrGbCd: "20", flrGbCdNm: "지상", area: 780 }),
    ]);

    expect(rows).toHaveLength(2);
  });

  it("skips rows whose floor number is not a finite number", () => {
    const rows = normalizeFloorRows(title(), [
      floor({ flrNo: Number.NaN as unknown as number }),
      floor({ flrNo: 2 }),
    ]);

    expect(rows.map((row) => row.flrNo)).toEqual([2]);
  });

  it("keeps every row when neither side carries a register key", () => {
    const rows = normalizeFloorRows(title({ mgmBldrgstPk: "" }), [
      floor({ flrNo: 1, mgmBldrgstPk: "" }),
      floor({ flrNo: 2, mgmBldrgstPk: "" }),
    ]);

    expect(rows).toHaveLength(2);
  });
});

describe("isBelowGradeRow", () => {
  it("detects 지하 by label and by negative floor number", () => {
    expect(isBelowGradeRow(floor({ flrGbCdNm: "지하", flrNo: 1 }))).toBe(true);
    expect(isBelowGradeRow(floor({ flrGbCdNm: "", flrNo: -2 }))).toBe(true);
    expect(isBelowGradeRow(floor({ flrGbCdNm: "지상", flrNo: 3 }))).toBe(false);
  });
});

describe("ledger use categories", () => {
  it("maps 주용도코드 onto the era-table keys", () => {
    expect(ledgerUseCategory("01000")).toBe("residential");
    expect(ledgerUseCategory("14000")).toBe("office");
    expect(ledgerUseCategory("17000")).toBe("factory");
    expect(ledgerUseCategory("07000")).toBe("retail");
    expect(ledgerUseCategory("99999")).toBe("default");
  });

  it("maps the coarser FLOOR_HEIGHTS keys", () => {
    expect(ledgerFloorHeightCategory("02000")).toBe("residential");
    expect(ledgerFloorHeightCategory("18000")).toBe("factory");
    expect(ledgerFloorHeightCategory("14000")).toBe("commercial");
  });
});

describe("classifyEraExplicit", () => {
  it("prefers 사용승인일 over 허가일", () => {
    const resolution = classifyEraExplicit({
      useAprDay: "20080315",
      pmsDay: "20050101",
    });

    expect(resolution).toMatchObject({
      era: "2000-2009",
      resolved: true,
      sourceField: "useAprDay",
      year: 2008,
    });
  });

  it("falls back to 허가일 when the approval date is unusable", () => {
    const resolution = classifyEraExplicit({ useAprDay: "", pmsDay: "19951120" });

    expect(resolution).toMatchObject({
      era: "1990-1999",
      resolved: true,
      sourceField: "pmsDay",
    });
  });

  it("reports an UNRESOLVED era rather than silently defaulting", () => {
    for (const input of [
      {},
      { useAprDay: "", pmsDay: "" },
      { useAprDay: "20", pmsDay: "abc" },
      { useAprDay: "notadate", pmsDay: undefined },
    ]) {
      const resolution = classifyEraExplicit(input);
      expect(resolution.resolved).toBe(false);
      expect(resolution.sourceField).toBeNull();
      expect(resolution.year).toBeNull();
      expect(resolution.era).toBe(ERA_FALLBACK);
    }
  });

  it("rejects years outside a plausible register range", () => {
    expect(classifyEraExplicit({ useAprDay: "17000101" }).resolved).toBe(false);
    expect(classifyEraExplicit({ useAprDay: "99990101" }).resolved).toBe(false);
  });

  it("classifies each era boundary from the approval year", () => {
    const cases: readonly [string, string][] = [
      ["19690101", "pre-1970"],
      ["19700101", "1970-1989"],
      ["19900101", "1990-1999"],
      ["20000101", "2000-2009"],
      ["20100101", "2010-2019"],
      ["20200101", "2020+"],
    ];
    for (const [date, era] of cases) {
      expect(classifyEraExplicit({ useAprDay: date }).era).toBe(era);
    }
  });
});
