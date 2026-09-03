// P2-29 — one ledger geometry producer.
//
// These tests pin the bridge in both directions: register + GIS in, a graded
// ReconstructionModel out, and from that model the two things the app consumes
// — the twin's recipe geometry and the traceable engine's boundary ring.

import { describe, expect, it } from "vitest";

import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

import { areaSqm } from "../geometry";
import {
  evidenceFromLedger,
  ledgerRingFromModel,
  provenancePatchForModel,
  reconstructModel,
  twinGeometryFromModel,
} from "../ledger-bridge";
import type { GisFootprintInput } from "../types";

const NOW = "2026-09-04T00:00:00.000Z";

/** Seoul City Hall — inside the projection's Korean bounds. */
const ORIGIN_LNG = 126.978;
const ORIGIN_LAT = 37.5665;
/** Degrees per metre at that latitude, close enough for fixture geometry. */
const DEG_PER_M_LAT = 1 / 111_320;
const DEG_PER_M_LNG = 1 / 88_300;

function lngLat(eastM: number, northM: number): [number, number] {
  return [ORIGIN_LNG + eastM * DEG_PER_M_LNG, ORIGIN_LAT + northM * DEG_PER_M_LAT];
}

/** A 20 × 10 m rectangle = 200 m², matching the fixture's 건축면적. */
function gisRectangle(): GisFootprintInput {
  return {
    polygon: [
      [lngLat(-10, -5), lngLat(10, -5), lngLat(10, 5), lngLat(-10, 5), lngLat(-10, -5)],
    ],
    source: "building",
    attributes: { height: null, groundFloors: null, undergroundFloors: null },
    error: null,
  };
}

/**
 * An L: a 20 × 10 rectangle with a 10 × 5 bite out of the north-east corner.
 * Area 150 m², bounding box 200 m² — the two must not be confused.
 */
function gisLShape(): GisFootprintInput {
  return {
    polygon: [
      [
        lngLat(-10, -5),
        lngLat(10, -5),
        lngLat(10, 0),
        lngLat(0, 0),
        lngLat(0, 5),
        lngLat(-10, 5),
        lngLat(-10, -5),
      ],
    ],
    source: "building",
    attributes: { height: null, groundFloors: null, undergroundFloors: null },
    error: null,
  };
}

function title(overrides: Partial<BrTitleInfo> = {}): BrTitleInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0",
    bldNm: "테스트빌딩",
    platPlcNm: "서울특별시 중구 태평로1가 31",
    newPlatPlc: "서울특별시 중구 세종대로 110",
    sigunguCd: "11140",
    bjdongCd: "10300",
    platGbCd: "0",
    bun: "0031",
    ji: "0000",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "업무시설",
    etcPurps: "",
    strctCd: "21",
    strctCdNm: "철근콘크리트구조",
    etcStrct: "",
    grndFlrCnt: 5,
    ugrndFlrCnt: 1,
    totArea: 1000,
    archArea: 200,
    platArea: 400,
    bcRat: 50,
    vlRat: 250,
    useAprDay: "20080412",
    pmsDay: "20070101",
    stcnsDay: "20070301",
    roofCd: "10",
    roofCdNm: "평지붕",
    heit: 17.5,
    regstrGbCd: "1",
    regstrGbCdNm: "일반",
    regstrKindCd: "2",
    regstrKindCdNm: "일반건축물",
    ...overrides,
  };
}

function floor(flrNo: number, area: number, below = false): BrFloorInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0",
    flrNo,
    flrNoNm: below ? `지하${flrNo}층` : `${flrNo}층`,
    flrGbCd: below ? "10" : "20",
    flrGbCdNm: below ? "지하" : "지상",
    mainAtchGbCd: "0",
    mainAtchGbCdNm: "주건축물",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "업무시설",
    etcPurps: "",
    area,
    strctCd: "21",
    strctCdNm: "철근콘크리트구조",
  };
}

function build(args: {
  title?: BrTitleInfo | null;
  floors?: BrFloorInfo[];
  gis?: GisFootprintInput | null;
}) {
  return reconstructModel(
    evidenceFromLedger({
      buildingPk: "11110-100-1-1-0",
      title: args.title === undefined ? title() : args.title,
      floors: args.floors ?? [],
      gis: args.gis ?? null,
      address: "서울특별시 중구 세종대로 110",
      now: NOW,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* S1 — an automatic, claims-free reconstruction                       */
/* ------------------------------------------------------------------ */

describe("S1 — reconstruction runs with no user claims", () => {
  it("carries no claims into the model", () => {
    const model = build({ gis: gisRectangle() });
    expect(model.claims).toEqual([]);
  });

  it("grades a GIS outline B-OBSERVED", () => {
    const model = build({ gis: gisRectangle() });
    expect(model.footprint.grade).toBe("B-OBSERVED");
    expect(model.blockers).toEqual([]);
  });

  it("solves 건축면적 into a D-INFERRED outline when GIS is silent", () => {
    const model = build({ gis: null });
    expect(model.footprint.grade).toBe("D-INFERRED");
    expect(model.blockers).toEqual([]);
    expect(model.footprint.areaSqm).toBeCloseTo(200, 0);
  });

  it("falls back to 연면적 ÷ 지상층수 when 건축면적 is a documented zero", () => {
    const model = build({ title: title({ archArea: 0 }), gis: null });
    // 1000 m² over 5 storeys — a calculation, graded as one.
    expect(model.footprint.areaSqm).toBeCloseTo(200, 0);
    expect(model.blockers).toEqual([]);
  });

  it("blocks when the register states no dimension at all and GIS is silent", () => {
    const model = build({
      title: title({ archArea: 0, totArea: 0, platArea: 0, bcRat: 0 }),
      gis: null,
    });
    expect(model.blockers.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same evidence", () => {
    const a = build({ gis: gisRectangle(), floors: [floor(1, 200)] });
    const b = build({ gis: gisRectangle(), floors: [floor(1, 200)] });
    expect(b.footprint.ring).toEqual(a.footprint.ring);
    expect(b.levels.map((l) => l.plate)).toEqual(a.levels.map((l) => l.plate));
  });
});

/* ------------------------------------------------------------------ */
/* S2 — the twin renders from the model                                */
/* ------------------------------------------------------------------ */

describe("S2 — twin geometry from the model", () => {
  it("returns the ring in metres, not millimetres", () => {
    const model = build({ gis: gisRectangle() });
    const twin = twinGeometryFromModel(model);
    expect(twin).not.toBeNull();
    const outer = twin!.footprintPolygon[0];
    // A 20 × 10 m rectangle: every coordinate is within ±10 m of the centre.
    for (const [x, z] of outer) {
      expect(Math.abs(x)).toBeLessThanOrEqual(11);
      expect(Math.abs(z)).toBeLessThanOrEqual(6);
    }
  });

  it("keeps the ring's own area, not its bounding box", () => {
    const model = build({ gis: gisLShape() });
    const twin = twinGeometryFromModel(model)!;
    // Shoelace over the returned metre ring.
    const outer = twin.footprintPolygon[0];
    let twice = 0;
    for (let i = 0; i < outer.length; i++) {
      const [x1, z1] = outer[i];
      const [x2, z2] = outer[(i + 1) % outer.length];
      twice += x1 * z2 - x2 * z1;
    }
    const area = Math.abs(twice) / 2;
    expect(area).toBeCloseTo(areaSqm(model.footprint.ring), 1);
    // The L is materially smaller than its 20 × 10 bounding box.
    expect(area).toBeLessThan(180);
    expect(twin.footprintWidthM * twin.footprintDepthM).toBeGreaterThan(area);
  });

  it("centres the ring on its bounding box, as the viewer does", () => {
    const model = build({ gis: gisLShape() });
    const outer = twinGeometryFromModel(model)!.footprintPolygon[0];
    const xs = outer.map((p) => p[0]);
    const zs = outer.map((p) => p[1]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 3);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(0, 3);
  });

  it("carries one level per registered storey, with heights", () => {
    const model = build({
      gis: gisRectangle(),
      floors: [floor(1, 200), floor(2, 200), floor(3, 160), floor(1, 180, true)],
    });
    const twin = twinGeometryFromModel(model)!;
    expect(twin.levels.filter((l) => !l.below)).toHaveLength(3);
    expect(twin.levels.filter((l) => l.below)).toHaveLength(1);
    for (const level of twin.levels) {
      expect(level.heightM).toBeGreaterThan(0);
      expect(level.plate[0].length).toBeGreaterThanOrEqual(3);
    }
    expect(twin.totalHeightM).toBeGreaterThan(0);
  });

  it("returns null when the model is blocked, rather than a placeholder", () => {
    const model = build({
      title: title({ archArea: 0, totArea: 0, platArea: 0, bcRat: 0 }),
      gis: null,
    });
    expect(twinGeometryFromModel(model)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* S3 — the engine reads the same ring                                 */
/* ------------------------------------------------------------------ */

describe("S3 — engine boundary from the model", () => {
  it("hands back an observed ring flagged as observed", () => {
    const model = build({ gis: gisRectangle() });
    const ring = ledgerRingFromModel(model);
    expect(ring).not.toBeNull();
    expect(ring!.observed).toBe(true);
    expect(ring!.ringM.length).toBeGreaterThanOrEqual(4);
  });

  it("flags a 건축면적-solved ring as not observed", () => {
    const model = build({ gis: null });
    const ring = ledgerRingFromModel(model);
    expect(ring!.observed).toBe(false);
  });

  it("hands the engine the same ring the twin renders", () => {
    const model = build({ gis: gisLShape() });
    const twin = twinGeometryFromModel(model)!;
    const ring = ledgerRingFromModel(model)!;
    expect(ring.ringM).toEqual(twin.footprintPolygon[0]);
  });

  it("returns null when the model is blocked", () => {
    const model = build({
      title: title({ archArea: 0, totArea: 0, platArea: 0, bcRat: 0 }),
      gis: null,
    });
    expect(ledgerRingFromModel(model)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* S5 — the four register endpoints fail independently                 */
/* ------------------------------------------------------------------ */

describe("S5 — partial register data still builds a building", () => {
  it("synthesises levels from the storey counts when 층별개요 is empty", () => {
    const model = build({ gis: gisRectangle(), floors: [] });
    expect(model.levels.filter((l) => !l.below)).toHaveLength(5);
    expect(model.levels.filter((l) => l.below)).toHaveLength(1);
    expect(twinGeometryFromModel(model)).not.toBeNull();
  });

  it("still resolves an outline when only the title arrived", () => {
    const model = build({ gis: null, floors: [] });
    expect(model.blockers).toEqual([]);
    expect(twinGeometryFromModel(model)).not.toBeNull();
  });

  it("does not treat a documented zero height as a measurement", () => {
    const model = build({ title: title({ heit: 0 }), gis: gisRectangle() });
    const twin = twinGeometryFromModel(model)!;
    // Height falls back to the era table rather than collapsing to zero.
    expect(twin.totalHeightM).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* S4 — provenance does not inflate                                    */
/* ------------------------------------------------------------------ */

describe("S4 — what an automatic reconstruction may claim", () => {
  it("records a solved outline as a reconstruction", () => {
    const twin = twinGeometryFromModel(build({ gis: null }));
    expect(provenancePatchForModel(twin, {})).toEqual({
      reconstructedFootprint: true,
    });
  });

  it("does not call a GIS trace a reconstruction", () => {
    const twin = twinGeometryFromModel(build({ gis: gisRectangle() }));
    expect(provenancePatchForModel(twin, {})).toEqual({
      reconstructedFootprint: false,
    });
  });

  it("never sets hasCadFootprint, whatever the outline", () => {
    for (const gis of [gisRectangle(), null]) {
      const twin = twinGeometryFromModel(build({ gis }));
      const patch = provenancePatchForModel(twin, {});
      expect(patch).not.toBeNull();
      expect(Object.keys(patch!)).toEqual(["reconstructedFootprint"]);
    }
  });

  it("leaves an uploaded CAD footprint alone", () => {
    const twin = twinGeometryFromModel(build({ gis: null }));
    expect(provenancePatchForModel(twin, { hasCadFootprint: true })).toBeNull();
  });

  it("claims nothing when the model is blocked", () => {
    const twin = twinGeometryFromModel(
      build({
        title: title({ archArea: 0, totArea: 0, platArea: 0, bcRat: 0 }),
        gis: null,
      }),
    );
    expect(provenancePatchForModel(twin, {})).toEqual({
      reconstructedFootprint: false,
    });
  });
});
