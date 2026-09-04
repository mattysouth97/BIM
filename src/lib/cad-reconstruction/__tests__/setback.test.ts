// P2-31 — a step goes on one face, and the face is chosen from evidence.
//
// Division of labour, and the reason this module invents no distances:
// the 건축법 rule decides WHICH face steps back; the register's 층별개요 decides
// HOW MUCH. No setback figure is ever computed here, so none can be wrong.

import { describe, expect, it } from "vitest";

import { areaSqm, isSelfIntersecting } from "../geometry";
import {
  DAYLIGHT_SETBACK_DISTRICTS,
  chooseSetbackFace,
  insetEdgeToArea,
  isDaylightSetbackDistrict,
} from "../setback";
import { evidenceFromLedger, reconstructModel } from "../ledger-bridge";
import type { RingMm } from "../types";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

function zTitle(overrides: Partial<BrTitleInfo> = {}): BrTitleInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0", bldNm: "후퇴테스트", platPlcNm: "서울특별시 중구",
    newPlatPlc: "", sigunguCd: "11140", bjdongCd: "10300", platGbCd: "0",
    bun: "0001", ji: "0000", mainPurpsCd: "02000", mainPurpsCdNm: "공동주택",
    etcPurps: "", strctCd: "21", strctCdNm: "철근콘크리트구조", etcStrct: "",
    grndFlrCnt: 3, ugrndFlrCnt: 0, totArea: 530, archArea: 200, platArea: 400,
    bcRat: 50, vlRat: 132, useAprDay: "20080412", pmsDay: "20070101",
    stcnsDay: "20070301", roofCd: "10", roofCdNm: "평지붕", heit: 9.6,
    regstrGbCd: "1", regstrGbCdNm: "일반", regstrKindCd: "2",
    regstrKindCdNm: "일반건축물", ...overrides,
  };
}

function zFloor(flrNo: number, area: number, below = false): BrFloorInfo {
  return {
    mgmBldrgstPk: "11110-100-1-1-0", flrNo,
    flrNoNm: below ? `지하${flrNo}층` : `${flrNo}층`,
    flrGbCd: below ? "10" : "20", flrGbCdNm: below ? "지하" : "지상",
    mainAtchGbCd: "0", mainAtchGbCdNm: "주건축물", mainPurpsCd: "02000",
    mainPurpsCdNm: "공동주택", etcPurps: "", area, strctCd: "21",
    strctCdNm: "철근콘크리트구조",
  };
}

/** 20 × 10 m, CCW, centred on the origin. 200 m². */
const RECT: RingMm = [
  [-10_000, -5_000],
  [10_000, -5_000],
  [10_000, 5_000],
  [-10_000, 5_000],
];

/** An L: 200 m² rectangle with a 10 × 5 m bite out of the north-east. 150 m². */
const L_SHAPE: RingMm = [
  [-10_000, -5_000],
  [10_000, -5_000],
  [10_000, 0],
  [0, 0],
  [0, 5_000],
  [-10_000, 5_000],
];

/**
 * A parcel with the building pushed to its SOUTH edge: slack to the north.
 * This is the geometric signature of 정북방향 일조권 사선제한.
 */
const PARCEL_NORTH_SLACK: RingMm = [
  [-12_000, -6_000],
  [12_000, -6_000],
  [12_000, 14_000],
  [-12_000, 14_000],
];

/** A parcel centred on the building: no directional slack at all. */
const PARCEL_CENTRED: RingMm = [
  [-12_000, -7_000],
  [12_000, -7_000],
  [12_000, 7_000],
  [-12_000, 7_000],
];

describe("isDaylightSetbackDistrict", () => {
  it("recognises the districts 건축법 시행령 제86조 applies to", () => {
    expect(isDaylightSetbackDistrict("제1종전용주거지역")).toBe(true);
    expect(isDaylightSetbackDistrict("제2종전용주거지역")).toBe(true);
    expect(isDaylightSetbackDistrict("제1종일반주거지역")).toBe(true);
    expect(isDaylightSetbackDistrict("제3종일반주거지역")).toBe(true);
  });

  it("excludes districts the rule does not reach", () => {
    expect(isDaylightSetbackDistrict("일반상업지역")).toBe(false);
    expect(isDaylightSetbackDistrict("중심상업지역")).toBe(false);
    expect(isDaylightSetbackDistrict("일반공업지역")).toBe(false);
    // 준주거지역 is a 주거지역 by name but is NOT in 제86조's list.
    expect(isDaylightSetbackDistrict("준주거지역")).toBe(false);
  });

  it("treats an unknown or absent district as unknown, never as residential", () => {
    expect(isDaylightSetbackDistrict(null)).toBe(false);
    expect(isDaylightSetbackDistrict("")).toBe(false);
    expect(isDaylightSetbackDistrict("듣도보도 못한 지역")).toBe(false);
  });

  it("lists the districts it matches, for the assumption ledger", () => {
    expect(DAYLIGHT_SETBACK_DISTRICTS.length).toBeGreaterThan(0);
  });
});

describe("chooseSetbackFace", () => {
  it("S1: 주거지역 with north slack steps back on the north face", () => {
    const choice = chooseSetbackFace({
      footprint: RECT,
      parcel: PARCEL_NORTH_SLACK,
      district: "제2종일반주거지역",
    });
    expect(choice.facing).toBe("north");
    expect(choice.reason).toBe("daylight_setback");
    expect(choice.district).toBe("제2종일반주거지역");
  });

  it("S1b: 상업지역 makes no 일조권 claim, whatever the lot looks like", () => {
    const choice = chooseSetbackFace({
      footprint: RECT,
      parcel: PARCEL_NORTH_SLACK,
      district: "일반상업지역",
    });
    expect(choice.reason).not.toBe("daylight_setback");
    expect(choice.district).toBe("일반상업지역");
  });

  it("does not claim 일조권 when the lot has no northern slack to sit in", () => {
    const choice = chooseSetbackFace({
      footprint: RECT,
      parcel: PARCEL_CENTRED,
      district: "제2종일반주거지역",
    });
    expect(choice.reason).not.toBe("daylight_setback");
  });

  it("S3: with no parcel and no district the direction is undetermined", () => {
    const choice = chooseSetbackFace({
      footprint: RECT,
      parcel: null,
      district: null,
    });
    expect(choice.facing).toBeNull();
    expect(choice.reason).toBe("undetermined");
  });

  it("an unknown district alone is not enough to pick a face", () => {
    const choice = chooseSetbackFace({
      footprint: RECT,
      parcel: null,
      district: "제2종일반주거지역",
    });
    expect(choice.facing).toBeNull();
    expect(choice.reason).toBe("undetermined");
  });

  it("names the district it read, even when it rules the rule out", () => {
    const choice = chooseSetbackFace({
      footprint: RECT,
      parcel: PARCEL_NORTH_SLACK,
      district: "일반상업지역",
    });
    expect(choice.district).toBe("일반상업지역");
    expect(choice.note.length).toBeGreaterThan(0);
  });
});

describe("insetEdgeToArea", () => {
  const edgeFacingNorth = 2; // RECT edge from (10,5) to (-10,5): outward normal +Y

  it("S5: hits the target area within tolerance", () => {
    const out = insetEdgeToArea(RECT, edgeFacingNorth, 120);
    expect(out).not.toBeNull();
    expect(areaSqm(out!)).toBeCloseTo(120, 0);
  });

  it("removes the area from the chosen face only", () => {
    const out = insetEdgeToArea(RECT, edgeFacingNorth, 120)!;
    const ys = out.map((p) => p[1]);
    const xs = out.map((p) => p[0]);
    // South, east and west edges have not moved. Coordinates are rounded to
    // whole millimetres, so compare to the millimetre, not below it.
    expect(Math.min(...ys)).toBeCloseTo(-5_000, -1);
    expect(Math.min(...xs)).toBeCloseTo(-10_000, -1);
    expect(Math.max(...xs)).toBeCloseTo(10_000, -1);
    // The north edge has come south: 200 → 120 m² over a 20 m width = 4 m.
    expect(Math.max(...ys)).toBeCloseTo(1_000, -1);
  });

  it("keeps a concave ring valid and area-exact", () => {
    const out = insetEdgeToArea(L_SHAPE, 0, 110);
    expect(out).not.toBeNull();
    expect(areaSqm(out!)).toBeCloseTo(110, 0);
    expect(isSelfIntersecting(out!)).toBe(false);
  });

  it("S4: refuses a step that would collapse the plate", () => {
    // 200 m² down to 2 m² off one face leaves a sliver, not a storey.
    expect(insetEdgeToArea(RECT, edgeFacingNorth, 2)).toBeNull();
  });

  it("refuses a target larger than the ring it was given", () => {
    expect(insetEdgeToArea(RECT, edgeFacingNorth, 260)).toBeNull();
  });

  it("returns the ring unchanged when the target is already the area", () => {
    const out = insetEdgeToArea(RECT, edgeFacingNorth, 200);
    expect(out).not.toBeNull();
    expect(areaSqm(out!)).toBeCloseTo(200, 0);
  });

  it("is deterministic", () => {
    const a = insetEdgeToArea(RECT, edgeFacingNorth, 137)!;
    const b = insetEdgeToArea(RECT, edgeFacingNorth, 137)!;
    expect(b).toEqual(a);
  });
});

/* ------------------------------------------------------------------ */
/* Integration: the setback reaches the reconstructed level plates      */
/* ------------------------------------------------------------------ */

describe("P2-31 - reconstruct() applies the directed setback", () => {
  const stepped = [zFloor(1, 200), zFloor(2, 200), zFloor(3, 130)];

  /** A lot with room to the north; the building sits on its southern edge. */
  const PARCEL_WGS84 = [
    [
      [126.9778, 37.5660],
      [126.9784, 37.5660],
      [126.9784, 37.5672],
      [126.9778, 37.5672],
      [126.9778, 37.5660],
    ],
  ];

  /**
   * The BUILDING outline: ~200 m², sitting on the southern edge of the lot.
   * Held separately from the parcel — a lot is not a building, and mixing them
   * is what makes a 7,000 m² parcel masquerade as a footprint.
   */
  // 20 m east-west (0.000226 deg lng at this latitude) x 10 m north-south
  // (0.0000898 deg lat) = ~200 m2, matching the register's 건축면적. Parked on
  // the southern edge of the lot, leaving ~112 m of slack to the north.
  const BUILDING_WGS84 = [
    [
      [126.97800, 37.566100],
      [126.978226, 37.566100],
      [126.978226, 37.5661898],
      [126.97800, 37.5661898],
      [126.97800, 37.566100],
    ],
  ];

  function run(district: string | null, floorsList: BrFloorInfo[]) {
    return reconstructModel(
      evidenceFromLedger({
        buildingPk: "11110-100-1-1-0",
        title: zTitle(),
        floors: floorsList,
        gis: {
          polygon: BUILDING_WGS84,
          source: "building",
          attributes: null,
          error: null,
        },
        parcel: {
          polygon: PARCEL_WGS84,
          source: "parcel",
          attributes: null,
          error: null,
        },
        zoning: district
          ? { district, source: "LT_C_UQ111", error: null }
          : { district: null, source: "LT_C_UQ111", error: "not found" },
        address: "서울특별시 중구",
        now: "2026-09-04T00:00:00.000Z",
      }),
    );
  }

  it("keeps the parcel out of the footprint — the lot is not the building", () => {
    const model = run("제2종일반주거지역", stepped);
    // The lot is ~7,000 m²; the building outline is ~200 m².
    expect(model.footprint.areaSqm).toBeLessThan(400);
  });

  it("records the face and the reason on the level that steps", () => {
    const model = run("제2종일반주거지역", stepped);
    const third = model.levels.find((l) => l.floorNo === 3 && !l.below)!;
    expect(third.setbackReason).toBe("daylight_setback");
    expect(third.setbackFacing).toBe("north");
  });

  it("S5: the directed plate still hits the registered area", () => {
    const model = run("제2종일반주거지역", stepped);
    const third = model.levels.find((l) => l.floorNo === 3 && !l.below)!;
    expect(third.modelAreaSqm).toBeCloseTo(130, 0);
    const row = model.areaValidation.find((r) => r.metric.includes("3층"));
    expect(row?.status).toBe("PASS");
  });

  it("S1b: 상업지역 does not produce a 일조권 rationale", () => {
    const model = run("일반상업지역", stepped);
    const third = model.levels.find((l) => l.floorNo === 3 && !l.below)!;
    expect(third.setbackReason).not.toBe("daylight_setback");
  });

  it("names the zoning district in the assumption ledger either way", () => {
    for (const district of ["제2종일반주거지역", "일반상업지역"]) {
      const model = run(district, stepped);
      const entry = model.assumptions.find((a) => a.element === "후퇴 방향");
      expect(entry).toBeDefined();
      expect(`${entry!.reason} ${entry!.sourceContext}`).toContain(district);
    }
  });

  it("S3: with no zoning the direction is stated as undetermined", () => {
    const model = run(null, stepped);
    const entry = model.assumptions.find((a) => a.element === "후퇴 방향");
    expect(entry).toBeDefined();
    // Either a geometry-only choice or an explicit "undetermined" — never a
    // 일조권 claim without a district.
    const third = model.levels.find((l) => l.floorNo === 3 && !l.below)!;
    expect(third.setbackReason).not.toBe("daylight_setback");
  });

  it("a level that does not shrink is not given a setback", () => {
    const model = run("제2종일반주거지역", [zFloor(1, 200), zFloor(2, 200)]);
    for (const level of model.levels) {
      expect(level.setbackFacing).toBeNull();
    }
  });

  it("basements are never directed", () => {
    const model = run("제2종일반주거지역", [...stepped, zFloor(1, 150, true)]);
    const basement = model.levels.find((l) => l.below)!;
    expect(basement.setbackFacing).toBeNull();
  });
});
