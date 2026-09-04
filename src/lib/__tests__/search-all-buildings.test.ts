// src/lib/__tests__/search-all-buildings.test.ts
//
// The register ignores `mainPurpsCd`, so a use filter has to be matched
// client-side — and a client-side match only tells the truth if it has seen
// the whole 법정동. Measured on production 2026-09-04: 청운동 holds 358 rows,
// the API caps a page at 100 however many are requested (500 and 1000 both
// returned 100), and 서울청운초등학교 is row 344. Filtering 교육연구시설 over
// page 1 therefore reported zero matches while 21 existed.
//
// These tests pin the part that made that a lie: the sweep must reach the last
// page, and when it cannot it must say so rather than present a partial answer
// as complete.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchAllBuildings } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";

const TOTAL = 358;
const PAGE = 100;

interface StubRow {
  mgmBldrgstPk: string;
  bldNm: string;
  mainPurpsCd: string;
}

/** A row whose only interesting property is its use code and its position. */
function row(index: number): StubRow {
  return {
    mgmBldrgstPk: `pk-${index}`,
    bldNm: index === 344 ? "서울청운초등학교" : `건물 ${index}`,
    // Only the school carries the education use code, and it sits on page 4.
    mainPurpsCd: index === 344 ? "10000" : "01000",
  };
}

/** Serve 358 rows across 100-row pages, ignoring any larger numOfRows ask. */
function pagedFetch() {
  return vi.fn().mockImplementation((url: string) => {
    const pageNo = Number(new URL(url).searchParams.get("pageNo") ?? "1");
    const start = (pageNo - 1) * PAGE + 1;
    const items: StubRow[] = [];
    for (let i = start; i < start + PAGE && i <= TOTAL; i++) items.push(row(i));
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ items, totalCount: TOTAL, pageNo, numOfRows: PAGE }),
    });
  });
}

describe("searchAllBuildings — a client-side filter must see the whole district", () => {
  beforeEach(() => useAppStore.setState({ apiKey: "" }));
  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ apiKey: "" });
  });

  it("reaches the last page instead of stopping at the first", async () => {
    vi.stubGlobal("fetch", pagedFetch());

    const result = await searchAllBuildings({
      sigunguCd: "11110",
      bjdongCd: "10100",
    });

    expect(result.items).toHaveLength(TOTAL);
    expect(result.totalCount).toBe(TOTAL);
    expect(result.truncated).toBe(false);
  });

  it("finds a match that only exists on the last page — the 서울청운초등학교 regression", async () => {
    vi.stubGlobal("fetch", pagedFetch());

    const result = await searchAllBuildings({
      sigunguCd: "11110",
      bjdongCd: "10100",
    });
    const matches = result.items.filter((i) => i.mainPurpsCd === "10000");

    // Filtering page 1 alone found none of these.
    expect(matches).toHaveLength(1);
    expect(matches[0].bldNm).toBe("서울청운초등학교");
  });

  it("requests one page per 100 rows and no more", async () => {
    const fetchMock = pagedFetch();
    vi.stubGlobal("fetch", fetchMock);

    await searchAllBuildings({ sigunguCd: "11110", bjdongCd: "10100" });

    // ceil(358 / 100) = 4
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const pages = fetchMock.mock.calls.map((c) =>
      new URL(c[0] as string).searchParams.get("pageNo"),
    );
    expect(pages).toEqual(["1", "2", "3", "4"]);
  });

  it("reports truncation rather than passing off a partial sweep as complete", async () => {
    vi.stubGlobal("fetch", pagedFetch());

    const result = await searchAllBuildings(
      { sigunguCd: "11110", bjdongCd: "10100" },
      2, // cap below what the district needs
    );

    expect(result.items).toHaveLength(2 * PAGE);
    expect(result.truncated).toBe(true);
    // The caller still learns how big the district really is.
    expect(result.totalCount).toBe(TOTAL);
  });

  it("stops early on a short page without inventing further requests", async () => {
    // totalCount claims more than the server will actually serve.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const pageNo = Number(new URL(url).searchParams.get("pageNo") ?? "1");
      const items = pageNo === 1 ? [row(1)] : [];
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ items, totalCount: 500, pageNo, numOfRows: PAGE }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchAllBuildings({
      sigunguCd: "11110",
      bjdongCd: "10100",
    });

    // One row came back, so the loop must not keep asking for pages 3..5.
    expect(result.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
