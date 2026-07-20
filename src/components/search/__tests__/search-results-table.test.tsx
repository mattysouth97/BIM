// src/components/search/__tests__/search-results-table.test.tsx
// P1-07 (b) — search result rows must be keyboard- and screen-reader-operable.
// Enter/Space on a focused row navigates via the same handleRowClick path.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SearchResultsTable } from "../search-results-table";
import type { BrTitleInfo } from "@/lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function makeRow(overrides: Partial<BrTitleInfo> = {}): BrTitleInfo {
  return {
    mgmBldrgstPk: "pk1", bldNm: "테스트빌딩", platPlcNm: "서울시 중구",
    newPlatPlc: "세종대로 110", sigunguCd: "11110", bjdongCd: "10100",
    platGbCd: "0", bun: "0001", ji: "0000", mainPurpsCd: "14000",
    mainPurpsCdNm: "업무시설", etcPurps: "", strctCd: "11", strctCdNm: "철근콘크리트",
    etcStrct: "", grndFlrCnt: 5, ugrndFlrCnt: 1, totArea: 1200, archArea: 300,
    platArea: 400, bcRat: 50, vlRat: 240, useAprDay: "20050101", pmsDay: "20040101",
    stcnsDay: "20040601", roofCd: "1", roofCdNm: "평지붕", heit: 15,
    regstrGbCd: "1", regstrGbCdNm: "일반", regstrKindCd: "1", regstrKindCdNm: "일반건축물",
    ...overrides,
  };
}

describe("SearchResultsTable keyboard access (P1-07 b)", () => {
  beforeEach(() => push.mockReset());
  afterEach(cleanup);

  it("non-virtualized rows are focusable and navigate on Enter", () => {
    render(<SearchResultsTable data={[makeRow({ mgmBldrgstPk: "a" })]} />);
    const row = screen.getByRole("link");
    expect((row as HTMLElement).tabIndex).toBe(0);

    fireEvent.keyDown(row, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/building/11110-10100-0-0001-0000");
  });

  it("navigates on Space too", () => {
    render(<SearchResultsTable data={[makeRow()]} />);
    fireEvent.keyDown(screen.getByRole("link"), { key: " " });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("mouse click still navigates (regression)", () => {
    render(<SearchResultsTable data={[makeRow()]} />);
    fireEvent.click(screen.getByRole("link"));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("exposes an accessible name on each row", () => {
    render(<SearchResultsTable data={[makeRow({ bldNm: "테스트빌딩" })]} />);
    const row = screen.getByRole("link");
    expect(row.getAttribute("aria-label") ?? "").toContain("테스트빌딩");
  });

  it("applies the a11y helper to BOTH row branches (virtualized + plain)", () => {
    // The virtualizer renders zero rows under happy-dom (no measured height),
    // so assert at the source level that both branches spread rowA11yProps.
    const src = readFileSync(join(__dirname, "..", "search-results-table.tsx"), "utf-8");
    const spreads = src.match(/\{\.\.\.rowA11yProps\(row\.original\)\}/g) ?? [];
    expect(spreads.length).toBe(2);
  });
});
