/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test-utils/render-with-query";

import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

import { CadRequestPanel } from "../cad-request-panel";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "11110-10300-0-0001-0001" }),
}));

const TITLE: BrTitleInfo = {
  mgmBldrgstPk: "11110-100-1-1-0",
  bldNm: "청운동새사람선교회",
  platPlcNm: "서울특별시 종로구 청운동 1-1",
  newPlatPlc: "",
  sigunguCd: "11110",
  bjdongCd: "10300",
  platGbCd: "0",
  bun: "0001",
  ji: "0001",
  mainPurpsCd: "14000",
  mainPurpsCdNm: "종교시설",
  etcPurps: "",
  strctCd: "21",
  strctCdNm: "철근콘크리트구조",
  etcStrct: "",
  grndFlrCnt: 3,
  ugrndFlrCnt: 1,
  totArea: 720,
  archArea: 200,
  platArea: 400,
  bcRat: 50,
  vlRat: 150,
  useAprDay: "19980412",
  pmsDay: "",
  stcnsDay: "",
  roofCd: "10",
  roofCdNm: "평지붕",
  heit: 11.4,
  regstrGbCd: "1",
  regstrGbCdNm: "일반",
  regstrKindCd: "2",
  regstrKindCdNm: "일반건축물",
};

function floorRow(flrNo: number, area: number, below = false): BrFloorInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0",
    flrNo,
    flrNoNm: below ? `지하${flrNo}층` : `${flrNo}층`,
    flrGbCd: below ? "10" : "20",
    flrGbCdNm: below ? "지하" : "지상",
    mainAtchGbCd: "0",
    mainAtchGbCdNm: "주건축물",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "종교시설",
    etcPurps: "",
    area,
    strctCd: "21",
    strctCdNm: "철근콘크리트구조",
  };
}

const list = <T,>(items: T[]) => ({
  items,
  totalCount: items.length,
  pageNo: 1,
  numOfRows: items.length,
});

vi.mock("@/hooks/use-composite-building", () => ({
  useCompositeBuilding: () => ({
    title: list([TITLE]),
    recap: list([]),
    floors: list([floorRow(-1, 180, true), floorRow(1, 200), floorRow(2, 200), floorRow(3, 140)]),
    areas: list([]),
    footprintData: { polygon: null, source: null, attributes: null, error: null },
    isLoading: false,
    isFootprintLoading: false,
    isError: false,
    errors: [],
  }),
}));

const originalFetch = globalThis.fetch;

describe("CadRequestPanel", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/cad/reconstruct") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { statement: string };
        // Mirrors the route's deterministic branch.
        const { parseClaimStatements } = await import("@/lib/cad-reconstruction");
        return new Response(
          JSON.stringify({
            success: true,
            reader: "deterministic",
            claims: parseClaimStatements(body.statement),
            unreadable: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ reader: "deterministic", model: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows what evidence it has before anything is requested", () => {
    renderWithQuery(<CadRequestPanel onUseDrawing={() => {}} />);
    expect(screen.getByText(/도면이 없나요/)).toBeTruthy();
    expect(screen.getByTestId("cad-request-prompt")).toBeTruthy();
    // The register answered two of its four endpoints in this fixture.
    expect(screen.getByText(/건축물대장 2\/4/)).toBeTruthy();
    expect(screen.getByText(/GIS 외곽 없음/)).toBeTruthy();
  });

  it("reconstructs from the register alone and reports the QA verdict", async () => {
    renderWithQuery(<CadRequestPanel onUseDrawing={() => {}} />);
    fireEvent.click(screen.getByTestId("cad-request-run"));

    await waitFor(() => expect(screen.getByTestId("cad-request-result")).toBeTruthy());
    expect(screen.getByText(/외곽선 D-INFERRED/)).toBeTruthy();
    expect(screen.getByText(/4 개 층/)).toBeTruthy();
    expect(screen.getByText(/0 FAIL/)).toBeTruthy();
  });

  it("reads the statement and surfaces each claim with its grade", async () => {
    renderWithQuery(<CadRequestPanel onUseDrawing={() => {}} />);
    fireEvent.change(screen.getByTestId("cad-request-prompt"), {
      target: { value: "정면 폭 20m 를 줄자로 실측했습니다. 깊이 10m 입니다." },
    });
    fireEvent.click(screen.getByTestId("cad-request-run"));

    await waitFor(() => expect(screen.getByTestId("cad-request-result")).toBeTruthy());
    expect(screen.getByText(/overall_width_m/)).toBeTruthy();
    expect(screen.getByText(/A-VERIFIED · “정면 폭 20m 를 줄자로 실측했습니다\.”/)).toBeTruthy();
  });

  it("hands a real DXF to the parent when the reconstruction is accepted", async () => {
    const onUseDrawing = vi.fn();
    renderWithQuery(<CadRequestPanel onUseDrawing={onUseDrawing} />);
    fireEvent.click(screen.getByTestId("cad-request-run"));

    await waitFor(() => expect(screen.getByTestId("cad-request-use")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cad-request-use"));

    expect(onUseDrawing).toHaveBeenCalledTimes(1);
    const [dxfText, fileName] = onUseDrawing.mock.calls[0];
    expect(dxfText).toContain("AC1015");
    expect(dxfText).toContain("BIM_OUTLINE");
    expect(fileName).toMatch(/\.dxf$/);
  });

  it("never presents the result as a measured drawing", async () => {
    renderWithQuery(<CadRequestPanel onUseDrawing={() => {}} />);
    expect(screen.getByText(/추정 현황 복원/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("cad-request-run"));
    await waitFor(() => expect(screen.getByTestId("cad-request-result")).toBeTruthy());
    expect(screen.getByText(/정밀도가 '추정'으로 기록됩니다/)).toBeTruthy();
  });
});
