// src/lib/demo/__tests__/demo-building.test.ts
// Demo mode (데모모드): a visitor with NO API key must be able to open
// /building/demo and see a complete default building served from bundled
// fixtures — zero network calls, zero keys. The demo building rides the
// normal pipeline via sentinel params (sigunguCd/bjdongCd "00000") that no
// real 시군구/법정동 uses, intercepted at the apiFetch layer.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEMO_BUILDING_ID,
  DEMO_BUILDING_PK,
  DEMO_BUILDING_PARAMS,
  isDemoParams,
  decodeBuildingId,
} from "@/lib/constants";
import {
  DEMO_ADDRESS,
  DEMO_FOOTPRINT,
  getDemoResponse,
  getDemoFootprintResult,
  demoTitle,
  demoFloors,
} from "@/lib/demo/demo-building";
import { searchBuildings, getFloorInfo } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { BrFloorInfo } from "@/lib/types";

// ─────────────────────────────────────────────
// Routing: the reserved "demo" slug
// ─────────────────────────────────────────────

describe("demo building ID routing", () => {
  it("decodeBuildingId('demo') returns the demo sentinel params", () => {
    expect(decodeBuildingId(DEMO_BUILDING_ID)).toEqual(DEMO_BUILDING_PARAMS);
  });

  it("still decodes a real composite ID unchanged", () => {
    expect(decodeBuildingId("11680-10300-0-0012-0034")).toEqual({
      sigunguCd: "11680",
      bjdongCd: "10300",
      platGbCd: "0",
      bun: "0012",
      ji: "0034",
    });
  });

  it("isDemoParams matches the sentinel and rejects real districts", () => {
    expect(isDemoParams(DEMO_BUILDING_PARAMS)).toBe(true);
    // Extra props (numOfRows etc.) must not break detection
    expect(isDemoParams({ ...DEMO_BUILDING_PARAMS, numOfRows: 500 })).toBe(true);
    expect(isDemoParams({ sigunguCd: "11680", bjdongCd: "10300" })).toBe(false);
    // Both sentinel codes are required
    expect(isDemoParams({ sigunguCd: "00000", bjdongCd: "10300" })).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Fixture consistency — generated, so these guard the generator
// ─────────────────────────────────────────────

describe("demo fixture internal consistency", () => {
  it("serves every bldrgst endpoint with at least one item", () => {
    for (const path of [
      "/api/bldrgst/title",
      "/api/bldrgst/recap",
      "/api/bldrgst/floors",
      "/api/bldrgst/areas",
      "/api/bldrgst/basis",
      "/api/bldrgst/jijugu",
    ]) {
      const res = getDemoResponse(path);
      expect(res, `no demo response for ${path}`).not.toBeNull();
      expect(res!.items.length, `empty items for ${path}`).toBeGreaterThan(0);
      expect(res!.totalCount).toBe(res!.items.length);
    }
  });

  it("returns null for a non-bldrgst path", () => {
    expect(getDemoResponse("/api/energy/grade")).toBeNull();
  });

  it("floor records match the title's floor counts", () => {
    const above = demoFloors.filter((f) => f.flrNo > 0);
    const below = demoFloors.filter((f) => f.flrNo < 0);
    expect(above.length).toBe(demoTitle.grndFlrCnt);
    expect(below.length).toBe(demoTitle.ugrndFlrCnt);
    expect(demoFloors.length).toBe(
      demoTitle.grndFlrCnt + demoTitle.ugrndFlrCnt,
    );
  });

  it("basement floors follow the geometry pipeline's 지하 convention", () => {
    // building-geometry.ts detects basements via flrGbCdNm "지하" or flrNo < 0
    const below = demoFloors.filter((f: BrFloorInfo) => f.flrNo < 0);
    expect(below.length).toBeGreaterThan(0);
    for (const f of below) {
      expect(f.flrGbCdNm).toContain("지하");
    }
  });

  it("has no duplicate floor numbers", () => {
    const keys = demoFloors.map((f) => f.flrNo);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("floor areas sum to the title's 연면적 (totArea)", () => {
    const sum = demoFloors.reduce((s, f) => s + f.area, 0);
    expect(sum).toBeCloseTo(demoTitle.totArea, 1);
  });

  it("건폐율/용적률 are consistent with the areas", () => {
    const bcRat = (demoTitle.archArea / demoTitle.platArea) * 100;
    expect(demoTitle.bcRat).toBeCloseTo(bcRat, 1);

    const aboveGfa = demoFloors
      .filter((f) => f.flrNo > 0)
      .reduce((s, f) => s + f.area, 0);
    const vlRat = (aboveGfa / demoTitle.platArea) * 100;
    expect(demoTitle.vlRat).toBeCloseTo(vlRat, 1);
  });

  it("is a post-2000 building so the clean-texture era applies", () => {
    expect(Number(demoTitle.useAprDay.slice(0, 4))).toBeGreaterThanOrEqual(2000);
  });

  it("carries the demo PK so the UI can label sample data", () => {
    expect(demoTitle.mgmBldrgstPk).toBe(DEMO_BUILDING_PK);
  });
});

// ─────────────────────────────────────────────
// Footprint fixture — WGS84 rings of [lng, lat]
// ─────────────────────────────────────────────

describe("demo footprint", () => {
  it("is a closed WGS84 ring with enough vertices inside Korea", () => {
    expect(DEMO_FOOTPRINT.length).toBeGreaterThanOrEqual(1);
    const outer = DEMO_FOOTPRINT[0];
    expect(outer.length).toBeGreaterThanOrEqual(4);
    // Closed ring: first vertex repeated at the end (GeoJSON convention)
    expect(outer[0]).toEqual(outer[outer.length - 1]);
    for (const [lng, lat] of outer) {
      expect(lng).toBeGreaterThan(124);
      expect(lng).toBeLessThan(132);
      expect(lat).toBeGreaterThan(33);
      expect(lat).toBeLessThan(39);
    }
  });

  it("getDemoFootprintResult serves the demo address and ignores others", () => {
    expect(getDemoFootprintResult(DEMO_ADDRESS)).toEqual({
      polygon: DEMO_FOOTPRINT,
      error: null,
    });
    expect(getDemoFootprintResult("서울특별시 강남구 역삼동 999")).toBeNull();
    expect(getDemoFootprintResult(undefined)).toBeNull();
  });

  it("the demo title's address is the demo address so the page wires up", () => {
    expect(demoTitle.platPlcNm).toBe(DEMO_ADDRESS);
  });
});

// ─────────────────────────────────────────────
// apiFetch interception — no network, no key
// ─────────────────────────────────────────────

describe("api-client demo interception", () => {
  beforeEach(() => {
    useAppStore.setState({ apiKey: "" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ apiKey: "" });
  });

  it("serves the demo title without any fetch call or API key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchBuildings(DEMO_BUILDING_PARAMS);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.items[0]?.mgmBldrgstPk).toBe(DEMO_BUILDING_PK);
  });

  it("serves demo floors even with extra query params", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await getFloorInfo({ ...DEMO_BUILDING_PARAMS, numOfRows: 500 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.items.length).toBe(
      demoTitle.grndFlrCnt + demoTitle.ugrndFlrCnt,
    );
  });

  it("real params still hit the network", async () => {
    const body = { items: [], totalCount: 0, pageNo: 1, numOfRows: 20 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchBuildings({ sigunguCd: "11680", bjdongCd: "10300" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
